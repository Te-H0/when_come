import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2"
import { AppError } from "./error.ts"

const GBIS_BASE_URL = "https://apis.data.go.kr/6410000"

// ─── 환경변수 lazy 읽기 (모듈 최상위 금지) ─────────────────────────────────
function gbisApiKey(): string {
  const key = Deno.env.get("GYEONGGI_BUS_API_KEY")
  if (!key) throw new AppError("GYEONGGI_BUS_API_KEY not configured", 500)
  return key
}

// ─── 외부 API 원시 응답 타입 ────────────────────────────────────────────────
export interface GbisArrivalRaw {
  stationId: number
  routeId: number
  routeName: string
  staOrder: number
  predictTime1: number | null
  predictTime2: number | null
  predictTimeSec1: number | null
  predictTimeSec2: number | null
  locationNo1: number | null
  locationNo2: number | null
  plateNo1: string | null
  plateNo2: string | null
  lowPlate1: number | null
  lowPlate2: number | null
  remainSeatCnt1: number | null
  remainSeatCnt2: number | null
  crowded1: number | null
  crowded2: number | null
  stateCd1: number | null
  stateCd2: number | null
  flag: string
  routeDestId: number | null
  routeDestName: string | null
  routeTypeCd: number | null
  vehId1: number | null
  vehId2: number | null
  taglessCd1: number | null
  taglessCd2: number | null
  turnSeq: number | null
}

/** gbis_stations 테이블 row 타입 (searchGbisStation DB 결과) */
export interface GbisStationCandidate {
  stationId: string
  stationName: string
  x: number   // lng
  y: number   // lat
  arsNo?: string | null
  sigunNm?: string | null
}

/** getBusRouteListv2 응답 row */
export interface GbisRouteCandidate {
  routeId: string
  routeName: string
  routeTypeCd?: number | null
  routeTypeName?: string | null
  startStationId?: string | null
  startStationName?: string | null
  endStationId?: string | null
  endStationName?: string | null
  regionName?: string | null
  districtCd?: string | null
  adminName?: string | null
}

/** getBusRouteStationListv2 응답 row */
export interface GbisRouteStation {
  stationId: string
  stationName: string
  stationSeq: number
  mobileNo?: string | null
  x?: number | null
  y?: number | null
  regionName?: string | null
  districtCd?: string | null
  centerYn?: string | null
  turnSeq?: number | null
  turnYn?: string | null
  adminName?: string | null
}

export interface GbisRouteAtStation {
  routeId: string
  routeName: string
  staOrder: number
}

interface GbisMsgHeader {
  resultCode: number
  resultMessage?: string
}

interface GbisArrivalListResponse {
  msgHeader: GbisMsgHeader
  msgBody?: {
    busArrivalList?: GbisArrivalRaw[]
  }
}

interface GbisArrivalItemResponse {
  msgHeader: GbisMsgHeader
  msgBody?: {
    busArrivalItem?: GbisArrivalRaw
  }
}

interface GbisRouteListResponse {
  msgHeader: GbisMsgHeader
  msgBody?: {
    busRouteList?: Array<{
      routeId: string | number
      routeName: string
      routeTypeCd?: number | null
      routeTypeName?: string | null
      startStationId?: string | null
      startStationName?: string | null
      endStationId?: string | null
      endStationName?: string | null
      regionName?: string | null
      districtCd?: string | null
      adminName?: string | null
    }>
  }
}

interface GbisRouteStationListResponse {
  msgHeader: GbisMsgHeader
  msgBody?: {
    busRouteStationList?: Array<{
      stationId: string | number
      stationName: string
      stationSeq: number
      mobileNo?: string | null
      x?: number | null
      y?: number | null
      regionName?: string | null
      districtCd?: string | null
      centerYn?: string | null
      turnSeq?: number | null
      turnYn?: string | null
      adminName?: string | null
    }>
  }
}

// ─── 타입 가드 (as 단언 금지) ───────────────────────────────────────────────

function isMsgHeaderResponse(val: unknown): val is { msgHeader: GbisMsgHeader; msgBody?: unknown } {
  if (typeof val !== "object" || val === null) return false
  const obj = val as Record<string, unknown>
  if (!("msgHeader" in obj)) return false
  const header = obj["msgHeader"]
  if (typeof header !== "object" || header === null) return false
  if (typeof (header as Record<string, unknown>)["resultCode"] !== "number") return false
  return true
}

function isGbisArrivalListResponse(val: unknown): val is GbisArrivalListResponse {
  return isMsgHeaderResponse(val)
}

function isGbisArrivalItemResponse(val: unknown): val is GbisArrivalItemResponse {
  return isMsgHeaderResponse(val)
}

function isGbisRouteListResponse(val: unknown): val is GbisRouteListResponse {
  return isMsgHeaderResponse(val)
}

function isGbisRouteStationListResponse(val: unknown): val is GbisRouteStationListResponse {
  return isMsgHeaderResponse(val)
}

// ─── resultCode 에러 처리 ────────────────────────────────────────────────────
// resultCode=4: 결과 없음 → 호출자에서 빈 배열/null로 처리
// resultCode=8/20/21/22: 인증/한도 오류 → 502
function handleResultCode(resultCode: number, context: string): void {
  if (resultCode === 0 || resultCode === 4) return
  if (resultCode === 8 || resultCode === 20 || resultCode === 21 || resultCode === 22) {
    console.error(JSON.stringify({ level: "error", event: "gbis-auth-limit-error", resultCode, context }))
    throw new AppError(`GBIS API 인증/한도 오류 (resultCode=${resultCode})`, 502)
  }
  console.error(JSON.stringify({ level: "error", event: "gbis-api-error", resultCode, context }))
  throw new AppError(`GBIS API 오류 (resultCode=${resultCode})`, 502)
}

// ─── API 호출 ─────────────────────────────────────────────────────────────
async function gbisFetch(path: string): Promise<unknown> {
  const url = `${GBIS_BASE_URL}${path}&format=json`
  const res = await fetch(url)
  if (!res.ok) {
    throw new AppError(`GBIS API 연결 실패 (HTTP ${res.status})`, 502)
  }
  return res.json()
}

// ─── 5분 메모리 캐시 (getBusRouteStationListv2) ──────────────────────────────
interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const routeStationCache = new Map<string, CacheEntry<GbisRouteStation[]>>()
const ROUTE_STATION_CACHE_TTL_MS = 5 * 60 * 1000 // 5분

// ─── 공개 함수 ───────────────────────────────────────────────────────────────

/**
 * 정류소 단위 일괄 도착정보 조회.
 * resultCode=4 (결과 없음) → 빈 배열 반환.
 */
export async function getGbisBusArrivalList(stationId: string): Promise<GbisArrivalRaw[]> {
  const key = gbisApiKey()
  const raw = await gbisFetch(
    `/busarrivalservice/v2/getBusArrivalListv2?serviceKey=${encodeURIComponent(key)}&stationId=${stationId}`,
  )
  if (!isGbisArrivalListResponse(raw)) {
    throw new AppError("GBIS 도착 응답 형식 오류", 502)
  }
  const resultCode = raw.msgHeader.resultCode
  if (resultCode === 4) return []
  handleResultCode(resultCode, "getBusArrivalListv2")
  return raw.msgBody?.busArrivalList ?? []
}

/**
 * 노선·정류소 단위 단일 도착정보 조회.
 * resultCode=4 → null 반환.
 */
export async function getGbisBusArrivalItem(
  stationId: string,
  routeId: string,
  staOrder: number,
): Promise<GbisArrivalRaw | null> {
  const key = gbisApiKey()
  const raw = await gbisFetch(
    `/busarrivalservice/v2/getBusArrivalItemv2?serviceKey=${encodeURIComponent(key)}&stationId=${stationId}&routeId=${routeId}&staOrder=${staOrder}`,
  )
  if (!isGbisArrivalItemResponse(raw)) {
    throw new AppError("GBIS 단일 도착 응답 형식 오류", 502)
  }
  const resultCode = raw.msgHeader.resultCode
  if (resultCode === 4) return null
  handleResultCode(resultCode, "getBusArrivalItemv2")
  return raw.msgBody?.busArrivalItem ?? null
}

/**
 * GBIS 정류소 검색 — 자체 DB(`gbis_stations`) 검색으로 교체 (v2).
 * 외부 API `getBusStationListByName` 호출 → DB 검색으로 전환.
 *
 * @param db    Supabase 클라이언트 (service role 또는 anon)
 * @param name  정류소명 (부분 일치 지원)
 */
export async function searchGbisStation(
  db: SupabaseClient,
  name: string,
): Promise<GbisStationCandidate[]> {
  const { data, error } = await db
    .from("gbis_stations")
    .select("station_id, station_name, lng, lat, ars_no, sigun_nm")
    .ilike("station_name", `%${name}%`)
    .limit(50)

  if (error) {
    console.error(JSON.stringify({ level: "error", event: "gbis-station-db-search-failed", error: error.message }))
    throw new AppError("GBIS 정류소 DB 검색 실패", 502)
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    stationId: String(row["station_id"]),
    stationName: String(row["station_name"]),
    x: Number(row["lng"]),
    y: Number(row["lat"]),
    arsNo: (row["ars_no"] as string | null) ?? null,
    sigunNm: (row["sigun_nm"] as string | null) ?? null,
  }))
}

/**
 * ARS 번호로 gbis_stations에서 단일 정류소 조회.
 */
export async function searchGbisStationByArs(
  db: SupabaseClient,
  arsNo: string,
): Promise<GbisStationCandidate[]> {
  const { data, error } = await db
    .from("gbis_stations")
    .select("station_id, station_name, lng, lat, ars_no, sigun_nm")
    .eq("ars_no", arsNo)
    .limit(10)

  if (error) {
    console.error(JSON.stringify({ level: "error", event: "gbis-station-ars-search-failed", error: error.message }))
    throw new AppError("GBIS 정류소 ARS 검색 실패", 502)
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    stationId: String(row["station_id"]),
    stationName: String(row["station_name"]),
    x: Number(row["lng"]),
    y: Number(row["lat"]),
    arsNo: (row["ars_no"] as string | null) ?? null,
    sigunNm: (row["sigun_nm"] as string | null) ?? null,
  }))
}

/**
 * 좌표 bbox 범위 내 gbis_stations 조회.
 * bbox 사전 필터 후 호출자에서 Haversine 정렬.
 */
export async function searchGbisStationByBbox(
  db: SupabaseClient,
  lat: number,
  lng: number,
  deltaDeg: number = 0.01,
): Promise<GbisStationCandidate[]> {
  const { data, error } = await db
    .from("gbis_stations")
    .select("station_id, station_name, lng, lat, ars_no, sigun_nm")
    .gte("lat", lat - deltaDeg)
    .lte("lat", lat + deltaDeg)
    .gte("lng", lng - deltaDeg * 1.2)
    .lte("lng", lng + deltaDeg * 1.2)
    .limit(200)

  if (error) {
    console.error(JSON.stringify({ level: "error", event: "gbis-station-bbox-search-failed", error: error.message }))
    throw new AppError("GBIS 정류소 좌표 검색 실패", 502)
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    stationId: String(row["station_id"]),
    stationName: String(row["station_name"]),
    x: Number(row["lng"]),
    y: Number(row["lat"]),
    arsNo: (row["ars_no"] as string | null) ?? null,
    sigunNm: (row["sigun_nm"] as string | null) ?? null,
  }))
}

/**
 * 노선번호로 GBIS 노선 목록 검색 (busrouteservice/v2 확정 명세).
 * resultCode=4 → 빈 배열 반환.
 */
export async function searchGbisRoute(
  keyword: string,
): Promise<GbisRouteCandidate[]> {
  const key = gbisApiKey()
  const raw = await gbisFetch(
    `/busrouteservice/v2/getBusRouteListv2?serviceKey=${encodeURIComponent(key)}&keyword=${encodeURIComponent(keyword)}`,
  )
  if (!isGbisRouteListResponse(raw)) {
    throw new AppError("GBIS 노선 검색 응답 형식 오류", 502)
  }
  const resultCode = raw.msgHeader.resultCode
  if (resultCode === 4) return []
  handleResultCode(resultCode, "getBusRouteListv2")
  return (raw.msgBody?.busRouteList ?? []).map((r) => ({
    routeId: String(r.routeId),
    routeName: r.routeName,
    routeTypeCd: r.routeTypeCd ?? null,
    routeTypeName: r.routeTypeName ?? null,
    startStationId: r.startStationId ?? null,
    startStationName: r.startStationName ?? null,
    endStationId: r.endStationId ?? null,
    endStationName: r.endStationName ?? null,
    regionName: r.regionName ?? null,
    districtCd: r.districtCd ?? null,
    adminName: r.adminName ?? null,
  }))
}

/**
 * 노선의 경유 정류소 목록 조회 (busrouteservice/v2 확정 명세).
 * 5분 메모리 캐시 적용 — 같은 routeId 중복 호출 시 fetch 1회.
 * resultCode=4 → 빈 배열 반환.
 */
export async function getBusRouteStationList(routeId: string): Promise<GbisRouteStation[]> {
  // 캐시 확인
  const cached = routeStationCache.get(routeId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const key = gbisApiKey()
  const raw = await gbisFetch(
    `/busrouteservice/v2/getBusRouteStationListv2?serviceKey=${encodeURIComponent(key)}&routeId=${encodeURIComponent(routeId)}`,
  )
  if (!isGbisRouteStationListResponse(raw)) {
    throw new AppError("GBIS 노선 정류소 응답 형식 오류", 502)
  }
  const resultCode = raw.msgHeader.resultCode
  if (resultCode === 4) return []
  handleResultCode(resultCode, "getBusRouteStationListv2")

  const result: GbisRouteStation[] = (raw.msgBody?.busRouteStationList ?? []).map((s) => ({
    stationId: String(s.stationId),
    stationName: s.stationName,
    stationSeq: s.stationSeq,
    mobileNo: s.mobileNo ?? null,
    x: s.x ?? null,
    y: s.y ?? null,
    regionName: s.regionName ?? null,
    districtCd: s.districtCd ?? null,
    centerYn: s.centerYn ?? null,
    turnSeq: s.turnSeq ?? null,
    turnYn: s.turnYn ?? null,
    adminName: s.adminName ?? null,
  }))

  // 캐시 저장
  routeStationCache.set(routeId, {
    data: result,
    expiresAt: Date.now() + ROUTE_STATION_CACHE_TTL_MS,
  })

  return result
}

// 테스트 용도: 캐시 초기화
export function clearRouteStationCache(): void {
  routeStationCache.clear()
}
