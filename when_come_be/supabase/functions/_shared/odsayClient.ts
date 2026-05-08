import { AppError } from "./error.ts"

const ODSAY_BASE_URL = "https://api.odsay.com/v1/api"

function apiKey(): string {
  const key = Deno.env.get("ODSAY_API_KEY")
  if (!key) throw new AppError("ODSAY_API_KEY not configured", 500)
  return encodeURIComponent(key)
}

async function odsayFetch(path: string): Promise<unknown> {
  // URI 플랫폼 키는 Referer 헤더로 도메인 인증
  const res = await fetch(`${ODSAY_BASE_URL}${path}`, {
    headers: { Referer: "https://kifxccvqofsdyonbhmnc.supabase.co" },
  })
  if (!res.ok) throw new AppError("ODsay 연결 실패", 502)

  const data = await res.json()

  // ODsay 에러는 배열 형태: { "error": [{ "code": "...", "message": "..." }] }
  if (data.error) {
    const err = Array.isArray(data.error) ? data.error[0] : data.error
    const code = String(err.code ?? err.errorCode ?? "")
    if (code === "-98" || code === "-99") return null
    if (code === "-8") throw new AppError("ODsay: 파라미터 형식 오류", 400)
    if (code === "-9") throw new AppError("ODsay: 필수 파라미터 누락", 400)
    throw new AppError(`ODsay 오류 [${code}]${err.message ? `: ${err.message}` : ""}`, 502)
  }
  return data.result
}

// ─── 타입 가드 — as 단언 대신 구조 검사 ────────────────────────
function hasStation(val: unknown): val is { station: OdsayStation[] } {
  return val !== null && typeof val === "object" && "station" in val &&
    Array.isArray((val as Record<string, unknown>)["station"])
}

function hasReal(val: unknown): val is { real: OdsayArrival[] } {
  return val !== null && typeof val === "object" && "real" in val &&
    Array.isArray((val as Record<string, unknown>)["real"])
}

function hasPath(val: unknown): val is { path: OdsayPath[] } {
  return val !== null && typeof val === "object" && "path" in val &&
    Array.isArray((val as Record<string, unknown>)["path"])
}

// ─── ODsay subwayCode(호선 번호) → 서울 지하철 API subwayId 형식 변환 ──────
// ODsay stationClass=2 응답의 type 필드는 호선 코드 (1=1호선, 2=2호선 ... 9=9호선,
// 21=신분당선, 22=경의중앙선, 23=수인분당선, 26=공항철도, 27=경강선, 29=서해선, 30=신림선, 31=GTX-A)
// 서울 지하철 API 형식: "1001"~"1009", "1021", "1022", "1023", "1026", "1027", "1029", "1030", "1031"
const ODSAY_SUBWAY_CODE_MAP: Record<number, string> = {
  1: "1001", 2: "1002", 3: "1003", 4: "1004", 5: "1005",
  6: "1006", 7: "1007", 8: "1008", 9: "1009",
  21: "1021", 22: "1022", 23: "1023", 26: "1026",
  27: "1027", 29: "1029", 30: "1030", 31: "1031",
}

export function odsaySubwayTypeToSubwayCode(odsayType: number): string | null {
  return ODSAY_SUBWAY_CODE_MAP[odsayType] ?? null
}

// ─── 도메인 타입 ────────────────────────────────────────────────
export interface OdsayStation {
  stationID: number
  stationName: string
  x: number
  y: number
  type: number    // 버스: 버스 노선 타입, 지하철: 호선 코드 (1=1호선, 4=4호선 등)
  stationClass?: number  // 1: 버스정류장, 2: 지하철역 (includeSubway=true 호출 시 포함)
  arsID: string
  laneName?: string      // 지하철 호선명 (예: "수도권 1호선") — stationClass=2 응답에만 포함
  laneCity?: string      // 지역명 (예: "수도권")
}

export interface OdsayArrival {
  routeID: string
  routeName: string
  arrivalTime1: number
  arrivalTime2: number | null
  type: number    // 1: 버스, 2: 지하철
}

export interface OdsayLane {
  // 버스
  busNo?: string
  busID?: string
  busLocalBlID?: string   // 서울 버스 API busRouteId
  type?: number
  // 지하철
  name?: string
  subwayCode?: number
  subwayExCode?: number
}

export interface OdsayStationRoute {
  busNo: string
  busID: string
  busLocalBlID: string  // 서울 버스 API busRouteId
  stID: string          // 서울 버스 API stId
  stationOrd: number    // 서울 버스 API ord
  type: number
}

function hasStationRoutes(val: unknown): val is { lane: OdsayStationRoute[] } {
  return val !== null && typeof val === "object" && "lane" in val &&
    Array.isArray((val as Record<string, unknown>)["lane"])
}

export interface OdsaySubPath {
  trafficType: number   // 1: 지하철, 2: 버스, 3: 도보
  sectionTime: number
  startName?: string
  startID?: number      // ODsay 정류장 ID
  startArsID?: string   // 서울 버스 ARS 번호
  endName?: string
  endID?: number
  endArsID?: string
  way?: string          // 노선 종점역명 (지하철 only)
  wayCode?: number      // 1=상행/내선, 2=하행/외선 (지하철 only)
  lane?: OdsayLane[]
}

export interface OdsayPathInfo {
  totalTime?: number
  totalWalk?: number
  totalDistance?: number
  payment?: number
  busTransitCount?: number
  subwayTransitCount?: number
  totalStationCount?: number
  firstStartStation?: string
  lastEndStation?: string
}

export interface OdsayPath {
  pathType: number
  info: OdsayPathInfo
  subPath: OdsaySubPath[]
}

// ─── API 함수 ───────────────────────────────────────────────────

/**
 * ODsay searchStation: stationClass 미지정 시 버스만 반환하는 실제 동작 quirk가 있음.
 * 이름 검색(isNameSearch=true)일 때는 버스(1) + 지하철(2) 두 번 병렬 호출 후 merge.
 * ARS 번호 검색은 버스 정류장 대상이므로 단일 호출 유지.
 */
export async function searchStation(
  query: string,
  { includeSubway = false }: { includeSubway?: boolean } = {},
): Promise<OdsayStation[]> {
  if (!includeSubway) {
    const result = await odsayFetch(
      `/searchStation?lang=0&stationName=${encodeURIComponent(query)}&apiKey=${apiKey()}`,
    )
    return hasStation(result) ? result.station : []
  }

  // 버스(stationClass=1) + 지하철(stationClass=2) 병렬 호출
  const [busResult, subwayResult] = await Promise.all([
    odsayFetch(
      `/searchStation?lang=0&stationName=${encodeURIComponent(query)}&stationClass=1&apiKey=${apiKey()}`,
    ),
    odsayFetch(
      `/searchStation?lang=0&stationName=${encodeURIComponent(query)}&stationClass=2&apiKey=${apiKey()}`,
    ),
  ])

  const busStations = hasStation(busResult) ? busResult.station : []
  const subwayStations = hasStation(subwayResult) ? subwayResult.station : []
  return [...busStations, ...subwayStations]
}

export async function realtimeStation(stationId: string): Promise<OdsayArrival[]> {
  const result = await odsayFetch(
    `/realtimeStation?lang=0&stationID=${stationId}&apiKey=${apiKey()}`,
  )
  return hasReal(result) ? result.real : []
}

export async function stationInfo(stationId: string): Promise<OdsayStationRoute[]> {
  const result = await odsayFetch(
    `/stationInfo?stationID=${stationId}&apiKey=${apiKey()}`,
  )
  return hasStationRoutes(result) ? result.lane : []
}

export async function searchPubTransPath(
  sx: number, sy: number, ex: number, ey: number,
): Promise<OdsayPath[]> {
  const result = await odsayFetch(
    `/searchPubTransPathT?SX=${sx}&SY=${sy}&EX=${ex}&EY=${ey}&apiKey=${apiKey()}`,
  )
  return hasPath(result) ? result.path : []
}

// ─── subwayStationInfo 타입 ─────────────────────────────────────

export interface OdsaySubwayWayItem {
  wayCode: number         // 1: 상행/내선, 2: 하행/외선
  wayName?: string        // 종점역명
  prevOBJ?: { stationID: number; stationName: string }
  nextOBJ?: { stationID: number; stationName: string }
}

export interface OdsaySubwayStationInfo {
  stationID: number
  stationName: string
  laneName?: string
  laneCity?: string
  subwayCode?: number
  // wayList 포맷: 방향별 배열 (일부 역/호선)
  wayList?: OdsaySubwayWayItem[]
  // 단일 포맷: prevOBJ/nextOBJ가 직접 존재 (일부 포맷)
  prevOBJ?: { stationID: number; stationName: string }
  nextOBJ?: { stationID: number; stationName: string }
}

function hasSubwayStationInfo(val: unknown): val is { station: OdsaySubwayStationInfo[] } {
  return val !== null && typeof val === "object" && "station" in val &&
    Array.isArray((val as Record<string, unknown>)["station"])
}

/**
 * ODsay subwayStationInfo: 지하철역 상세 정보 (인접역, 호선명 등)
 * result.station[0]에 단일 역 정보가 반환된다.
 * 결과 없음(-98/-99)은 null 반환.
 */
export async function subwayStationInfo(stationId: string): Promise<OdsaySubwayStationInfo | null> {
  const result = await odsayFetch(
    `/subwayStationInfo?stationID=${stationId}&apiKey=${apiKey()}`,
  )
  if (!hasSubwayStationInfo(result)) return null
  return result.station[0] ?? null
}
