import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { AppError, errorResponse, type ArrivalErrorCode } from "../_shared/error.ts"
import { withErrorLogging } from "../_shared/middleware.ts"
import { authGuard } from "../_shared/auth.ts"
import type { CommonErrorCode } from "../_shared/errorCodes.ts"
import { realtimeStation } from "../_shared/odsayClient.ts"
import {
  pickProvider,
  ArrivalQueryContext,
  BusArrivalResponse,
  BusArrivalItem,
  isSeoulBusResponse,
} from "../_shared/arrivalProvider.ts"
import { logAnomaly } from "../_shared/anomaly.ts"

function busApiKey(): string {
  const key = Deno.env.get("SEOUL_BUS_API_KEY")
  if (!key) throw new AppError("SEOUL_BUS_API_KEY not configured", 500)
  return key
}

function subwayApiKey(): string {
  const key = Deno.env.get("SEOUL_SUBWAY_API_KEY")
  if (!key) throw new AppError("SEOUL_SUBWAY_API_KEY not configured", 500)
  return key
}

// ─── 서울 버스 API 원시 응답 타입 (legacy 경로용) ──────────────────────────
interface SeoulBusArrivalItem {
  busRouteAbrv: string
  arrmsg1: string
  arrmsg2: string
  traTime1: string
  traTime2: string
}

interface SeoulBusApiResponse {
  msgBody?: {
    itemList?: SeoulBusArrivalItem[]
  }
}

function isSeoulBusApiResponse(val: unknown): val is SeoulBusApiResponse {
  return (
    typeof val === "object" &&
    val !== null &&
    "msgBody" in val
  )
}

// ─── legacy BusArrivalResponse (기존 FE 호환용) ───────────────────────────
export interface LegacyBusArrivalResponse {
  routeName: string
  arrmsg1: string
  arrmsg2: string
  arrivalSec1: number | null
  arrivalSec2: number | null
}

export interface SubwayArrivalItem {
  lineName: string
  direction: string
  arrmsg1: string
  arrmsg2: string
  updnLine: string
  displayMsg: string | null
  headsign: string | null
  /** 서울 지하철 API `btrainSttus` raw 그대로. "급행"|"ITX"|"특급"|"일반"|"" 또는 미지의 값. FE는 whitelist 매핑 후 표시. (2026-05-11~) */
  trainType: string | null
  /** 종착역명 (`bstatnNm`). `direction` 파싱 실패 시 fallback. */
  destinationName: string | null
  /** 도착 예정 초 (`barvlDt`). 정수. arrmsg1 정규식 우회용. */
  arrivalSeconds: number | null
  /** API 데이터 생성 시각 (`recptnDt` "YYYY-MM-DD HH:mm:ss" KST 가정). 지연 보정용. */
  dataTimestamp: string | null
  /** 막차 여부 (`lstcarAt` "1"==막차). */
  isLastTrain: boolean
}

// ─── 지하철 행선지(headsign) 추출 ────────────────────────────────────────────

/**
 * trainLineNm, arrmsg1에서 행선지를 추출한다. best-effort — 실패하면 null.
 *
 * 반환값은 **순수 역명** (예: "방화", "온수"). "행" 접미사를 포함하지 않는다.
 * FE가 표시 시점에 "행"을 붙여서 "방화행"으로 렌더링한다.
 *
 * 우선순위:
 * 1. trainLineNm의 "X행" 패턴에서 역명 캡처: /^([^\s-]+?)행/ → "방화", "온수"
 * 2. arrmsg1의 괄호 안 텍스트에서 "행" 제거 후 반환 → "온수", "장암"
 * 3. 둘 다 실패 → null + anomaly_logs 기록
 */
export function extractHeadsign(
  trainLineNm: string | null | undefined,
  arrmsg1: string,
  context?: { lineName?: string },
): string | null {
  // 1차: trainLineNm에서 "X행" 패턴의 역명 부분만 캡처 ("행" 제외)
  if (trainLineNm?.trim()) {
    const m = trainLineNm.match(/^([^\s-]+?)행/)
    if (m) return m[1]
  }

  // 2차: arrmsg1 괄호 안 텍스트에서 "행" 제거 후 순수 역명 반환
  const m2 = arrmsg1.match(/\(([^)]+)\)/)
  if (m2 && m2[1]) {
    const candidate = m2[1].trim()
    if (candidate.length > 0) {
      // "행" 접미사 제거 — FE에서 표시 시 붙임
      return candidate.endsWith("행") ? candidate.slice(0, -1) : candidate
    }
  }

  // 둘 다 실패 — anomaly_logs 기록 (fire-and-forget)
  logAnomaly({
    source: "arrival-info",
    category: "pattern.unparseable_subway_headsign",
    detail: {
      trainLineNm: trainLineNm ?? null,
      arrmsg1,
      lineName: context?.lineName ?? null,
    },
  })
  return null
}

/** arrmsg 정규화 결과 */
export interface NormalizeArrmsgResult {
  displayMsg: string | null
  /** arrmsg에서 괄호 부분을 제거한 순수 텍스트 */
  stripped: string
}

/**
 * arvlCd가 99이거나 코드 매핑 실패 시 arrmsg1 패턴으로 displayMsg를 보충한다.
 *
 * 매칭 패턴:
 * - "[N]번째 전역" → displayMsg = "N개역 전"
 * - "N분..." / "N초 후" → displayMsg = null (카운트다운 — FE 그대로)
 * - 매칭 실패 → displayMsg = null + anomaly_logs 기록
 */
export function normalizeArrmsg(
  arrmsg: string,
  context?: { arvlCd?: string; lineName?: string; trainLineNm?: string | null },
): NormalizeArrmsgResult {
  // 괄호 부분 제거한 stripped 먼저 계산
  const stripped = arrmsg.replace(/\([^)]*\)/g, "").trim()

  // "[N]번째 전역" 패턴
  const mPrev = arrmsg.match(/^\[(\d+)\]번째 전역/)
  if (mPrev) {
    return { displayMsg: `${mPrev[1]}개역 전`, stripped }
  }

  // "N분..." or "N초 후" 등 시간 카운트다운 패턴
  const mTime = arrmsg.match(/^(\d+)[분초]/)
  if (mTime) {
    return { displayMsg: null, stripped }
  }

  // 매칭 실패 — anomaly_logs 기록 (fire-and-forget)
  logAnomaly({
    source: "arrival-info",
    category: "pattern.unparseable_subway_arrmsg",
    detail: {
      arrmsg1: arrmsg,
      arvlCd: context?.arvlCd ?? null,
      lineName: context?.lineName ?? null,
      trainLineNm: context?.trainLineNm ?? null,
    },
  })
  return { displayMsg: null, stripped }
}

// ─── 서울 버스 도착정보 — getArrInfoByRoute (legacy) ────────────────────────
async function getBusArrival(
  stId: string,
  busRouteId: string,
  ord: string,
): Promise<LegacyBusArrivalResponse | null> {
  const url = `http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRoute` +
    `?ServiceKey=${busApiKey()}&stId=${stId}&busRouteId=${busRouteId}&ord=${ord}&resultType=json`

  const res = await fetch(url)
  if (!res.ok) throw new AppError(
    "잠시 후 다시 시도해 주세요.",
    502,
    "ARRIVAL_PROVIDER_ERROR" satisfies ArrivalErrorCode,
    `seoul-bus getArrInfoByRoute HTTP ${res.status}`,
  )

  const raw: unknown = await res.json()
  if (!isSeoulBusApiResponse(raw)) throw new AppError(
    "잠시 후 다시 시도해 주세요.",
    502,
    "ARRIVAL_PROVIDER_ERROR" satisfies ArrivalErrorCode,
    "seoul-bus getArrInfoByRoute 응답 형식 오류",
  )
  const item = raw?.msgBody?.itemList?.[0]
  if (!item) return null

  return {
    routeName: item.busRouteAbrv,
    arrmsg1: item.arrmsg1,
    arrmsg2: item.arrmsg2,
    arrivalSec1: parseArrivalSec(item.traTime1),
    arrivalSec2: parseArrivalSec(item.traTime2),
  }
}

// ─── arsId로 도착정보 조회 — getStationByUid (legacy) ───────────────────────
interface SeoulBusStationByUidItem {
  busRouteId: string
  busRouteAbrv: string
  arrmsg1: string
  arrmsg2: string
  traTime1: string
  traTime2: string
}

interface SeoulBusStationByUidResponse {
  msgBody?: { itemList?: SeoulBusStationByUidItem[] }
}

async function findBusArrivalByArsId(
  busRouteId: string,
  arsId: string,
): Promise<LegacyBusArrivalResponse | null> {
  const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid` +
    `?ServiceKey=${busApiKey()}&arsId=${arsId}&resultType=json`

  const res = await fetch(url)
  if (!res.ok) throw new AppError(
    "잠시 후 다시 시도해 주세요.",
    502,
    "ARRIVAL_PROVIDER_ERROR" satisfies ArrivalErrorCode,
    `seoul-bus getStationByUid HTTP ${res.status}`,
  )

  const raw: unknown = await res.json()
  if (!isSeoulBusResponse(raw)) throw new AppError(
    "잠시 후 다시 시도해 주세요.",
    502,
    "ARRIVAL_PROVIDER_ERROR" satisfies ArrivalErrorCode,
    "seoul-bus getStationByUid 응답 형식 오류",
  )
  const itemList = raw.msgBody?.itemList ?? []
  const match = itemList.find((item) => item.busRouteId === busRouteId)
  if (!match) return null

  return {
    routeName: match.busRouteAbrv,
    arrmsg1: match.arrmsg1,
    arrmsg2: match.arrmsg2,
    arrivalSec1: parseArrivalSec(match.traTime1),
    arrivalSec2: parseArrivalSec(match.traTime2),
  }
}

// ─── 서울 지하철 ─────────────────────────────────────────────────────────────
// 서울 지하철 실시간 도착 API 별칭 매핑.
// API가 정식 이름이 아닌 별칭으로만 색인하는 역을 등록 (예: "군자" → "군자(능동)").
// 향후 발견 시 추가. 키/값 모두 ODsay/사용자가 입력할 수 있는 형태 둘 다 등록 권장.
const SUBWAY_NAME_OVERRIDES: Record<string, string> = {
  "군자": "군자(능동)",
  "군자역": "군자(능동)",      // stop_name이 "역" 접미사 포함된 경우 1차에서 직접 처리
  "군자(능동)": "군자(능동)",
}

/** 알려진 별칭 매핑. 모르는 역은 원본 그대로 반환. */
export function applySubwayNameOverride(stationName: string): string {
  return SUBWAY_NAME_OVERRIDES[stationName] ?? stationName
}

/** 호선 표기 괄호("강남역 (2호선)")와 "역" 접미사 제거. 표시·검색 fallback용. */
export function stripSubwayNameDecorations(stationName: string): string {
  return stationName.replace(/\([^)]*\)/g, "").trim().replace(/역$/, "").trim()
}

export function arvlCdToDisplayMsg(arvlCd: string): string | null {
  const map: Record<string, string> = {
    "0": "진입중",
    "1": "도착",
    "2": "출발",
    "3": "전역 출발",
    "4": "전역 진입",
    "5": "전역 도착",
  }
  return map[arvlCd] ?? null
}

interface SeoulSubwayArrivalItem {
  subwayId: string
  trainLineNm: string
  arvlMsg2: string
  arvlMsg3: string
  arvlCd: string
  updnLine: string
  /** 열차 종류 — 공식 enum "급행"|"ITX"|"특급"|"일반"|"". 누락된 노선(코레일/공항철도 일부)에서는 빈 문자열 또는 비표준 값 가능. */
  btrainSttus?: string
  /** 종착역명. */
  bstatnNm?: string
  /** 도착 예정 초 (문자열 정수). */
  barvlDt?: string
  /** 데이터 생성 시각 "YYYY-MM-DD HH:mm:ss". */
  recptnDt?: string
  /** 막차 여부 "0"/"1". */
  lstcarAt?: string
}

/** 서울 지하철 `btrainSttus` 공식 enum (whitelist). 이 외 값은 anomaly 기록 후 raw 그대로 동봉. */
const KNOWN_TRAIN_TYPES = new Set(["급행", "ITX", "특급", "일반", ""])

function validateTrainType(
  raw: string | undefined,
  context: { lineName: string; stationName: string; direction: string },
): string | null {
  const value = (raw ?? "").trim()
  if (KNOWN_TRAIN_TYPES.has(value)) return value === "" ? null : value
  // 미지의 enum — fire-and-forget 로깅, raw는 그대로 보존
  logAnomaly({
    source: "arrival-info",
    category: "subway.unknown_train_type",
    detail: { raw, ...context },
  })
  return value
}

interface SeoulSubwayApiResponse {
  realtimeArrivalList?: SeoulSubwayArrivalItem[]
}

async function fetchSubwayArrivalRaw(name: string): Promise<SubwayArrivalItem[]> {
  const encoded = encodeURIComponent(name)
  const url =
    `http://swopenapi.seoul.go.kr/api/subway/${subwayApiKey()}/json/realtimeStationArrival/0/30/${encoded}`
  const res = await fetch(url)
  if (!res.ok) throw new AppError(
    "잠시 후 다시 시도해 주세요.",
    502,
    "ARRIVAL_PROVIDER_ERROR" satisfies ArrivalErrorCode,
    `seoul-subway realtimeStationArrival HTTP ${res.status}`,
  )
  const data: SeoulSubwayApiResponse = await res.json()
  const list = data?.realtimeArrivalList ?? []
  return list.map((item) => {
    // displayMsg: arvlCd 0~5 기존 매핑 우선. 실패 시 arrmsg1 패턴으로 보충.
    const baseDisplayMsg = arvlCdToDisplayMsg(item.arvlCd ?? "")
    const arrmsg1 = item.arvlMsg2
    const displayMsg = baseDisplayMsg !== null
      ? baseDisplayMsg
      : normalizeArrmsg(arrmsg1, {
        arvlCd: item.arvlCd,
        lineName: item.subwayId,
        trainLineNm: item.trainLineNm,
      }).displayMsg

    // headsign: trainLineNm 우선 → arrmsg1 괄호 fallback
    const headsign = extractHeadsign(item.trainLineNm, arrmsg1, { lineName: item.subwayId })

    // trainType: btrainSttus raw. 미지의 값이면 anomaly 기록 후 그대로 노출 (정보 손실 방지).
    const trainType = validateTrainType(item.btrainSttus, {
      lineName: item.subwayId,
      stationName: name,
      direction: item.trainLineNm ?? "",
    })

    // arrivalSeconds: barvlDt 정수 파싱. NaN/음수는 null.
    const barvlRaw = item.barvlDt
    const arrivalSecondsParsed = barvlRaw === undefined || barvlRaw === ""
      ? NaN
      : Number(barvlRaw)
    const arrivalSeconds = Number.isFinite(arrivalSecondsParsed) && arrivalSecondsParsed >= 0
      ? arrivalSecondsParsed
      : null

    return {
      lineName: item.subwayId,
      direction: item.trainLineNm,
      arrmsg1,
      arrmsg2: item.arvlMsg3,
      updnLine: item.updnLine,
      displayMsg,
      headsign,
      trainType,
      destinationName: item.bstatnNm?.trim() || null,
      arrivalSeconds,
      dataTimestamp: item.recptnDt?.trim() || null,
      isLastTrain: item.lstcarAt === "1",
    }
  })
}

/** (lineName, updnLine, arrmsg1, arrmsg2, direction) 5-tuple 조합 byte-identical 중복 제거.
 *  arrmsg2 포함 — FE dedupe와 정합. arrmsg2가 다르면 다른 차로 간주(보수적). */
function dedupeSubwayItems(items: SubwayArrivalItem[]): SubwayArrivalItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.lineName}|${item.updnLine}|${item.arrmsg1}|${item.arrmsg2}|${item.direction}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 지하철 도착정보 조회.
 *
 * expectedSubwayCode: 서울 지하철 API lineName 형식("1004" 등).
 * 전달 시 1차 응답에서 해당 코드 매칭이 0건이면 fallback을 추가로 시도하고
 * 1차 + 2차 결과를 merge(dedupe)하여 반환.
 * 이는 "서울역"처럼 API가 역명 변형마다 다른 노선을 반환하는 케이스 대응.
 * 미전달 시 기존 동작 유지 (0건일 때만 fallback).
 */
async function getSubwayArrival(
  stationName: string,
  expectedSubwayCode?: string | null,
): Promise<SubwayArrivalItem[]> {
  // 1차: OVERRIDES 적용한 명칭으로 호출
  const primary = applySubwayNameOverride(stationName)
  let primaryItems = await fetchSubwayArrivalRaw(primary)

  // fallback 필요 여부 판단
  const needsFallback = primaryItems.length === 0 ||
    (
      expectedSubwayCode != null &&
      !primaryItems.some((item) => item.lineName === expectedSubwayCode)
    )

  if (!needsFallback) return primaryItems

  // 2차: 괄호/역 제거 → 다시 OVERRIDES 한 번 더
  const stripped = stripSubwayNameDecorations(primary)
  const fallback = applySubwayNameOverride(stripped)
  if (fallback === primary) {
    // fallback 시도할 이름이 없음 — 1차 결과 그대로 반환
    if (primaryItems.length === 0) {
      console.warn(
        `[subway-arrival] no result after fallback: input="${stationName}" primary="${primary}" fallback="${fallback}"`,
      )
    }
    return primaryItems
  }

  const fallbackItems = await fetchSubwayArrivalRaw(fallback)

  // 1차가 완전히 비어있으면 2차만 반환
  if (primaryItems.length === 0) {
    if (fallbackItems.length === 0) {
      console.warn(
        `[subway-arrival] no result after fallback: input="${stationName}" primary="${primary}" fallback="${fallback}"`,
      )
    }
    return fallbackItems
  }

  // 1차에 expected code가 없어서 fallback을 추가로 호출한 경우 — merge + dedupe
  const merged = dedupeSubwayItems([...primaryItems, ...fallbackItems])
  return merged
}

function parseArrivalSec(val: unknown): number | null {
  const n = Number(val)
  return !isNaN(n) && n > 0 ? n : null
}

// ─── 환경변수 lazy 읽기 ────────────────────────────────────────────────────
function getSupabaseUrl(): string {
  const url = Deno.env.get("SUPABASE_URL")
  if (!url) throw new AppError("SUPABASE_URL not configured", 500)
  return url
}

function getSupabaseAnonKey(): string {
  const key = Deno.env.get("SUPABASE_ANON_KEY")
  if (!key) throw new AppError("SUPABASE_ANON_KEY not configured", 500)
  return key
}

// ─── DB 클라이언트 (stopId 기반 경로용) ────────────────────────────────────
function supabaseClient(authHeader: string) {
  return createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: authHeader } } },
  )
}

// ─── stop_routes 기반 provider → ctx 매핑 ────────────────────────────────────

/**
 * stop_routes.provider 값을 정규화.
 * migration 백필 전 null인 경우 odsay_route_id로 재추론.
 *
 * stopProvider: route_stops.provider — odsay_route_id가 3xxx~ 등 비표준 prefix를 가진
 * 경기 경계 지역 노선(광명사거리 12번, 27번 등)을 올바르게 gyeonggi로 승격하기 위해 사용.
 *
 * 안전망: stop_routes.provider='gyeonggi'인데 gbisStationId가 없으면
 * GyeonggiBusProvider.canHandle이 false → 조용히 스킵되는 버그 방어.
 * arsId 있으면 Seoul BIS로 강등 (서울 bbox 경기버스 케이스).
 * 이 분기는 저장 시 잘못 기록된 기존 데이터 + 마이그레이션 이후 엣지케이스 대응.
 */
function resolveStopRouteProvider(
  sr: StopRouteRow,
  stopProvider: "seoul" | "gyeonggi" | "odsay_fallback" | null,
  stopArsId: string | null,
  stopGbisStationId: string | null,
): "seoul" | "gyeonggi" | "odsay_fallback" {
  // 안전망: gyeonggi로 저장됐지만 gbis_station_id가 없는 경우 (서울 bbox 경기버스 잘못 저장)
  // arsId가 있으면 Seoul BIS로 강등하여 도착정보 조회 가능하게 함
  if (sr.provider === "gyeonggi" && !stopGbisStationId && stopArsId) {
    return "seoul"
  }

  if (sr.provider === "seoul" || sr.provider === "gyeonggi" || sr.provider === "odsay_fallback") {
    return sr.provider
  }
  // null (백필 전 기존 rows) — odsay_route_id 첫 자리로 재추론
  if (sr.odsay_route_id) {
    if (sr.odsay_route_id.startsWith("1")) return "seoul"
    if (sr.odsay_route_id.startsWith("2")) {
      // 같은 원칙: gbis_station_id 없으면 seoul
      if (!stopGbisStationId && stopArsId) return "seoul"
      return "gyeonggi"
    }
    // 3xxx~ 등 비표준: stop 자체가 gyeonggi면 경기로 승격
    if (stopProvider === "gyeonggi") return "gyeonggi"
  }
  return "odsay_fallback"
}

/**
 * 여러 provider가 혼재할 때 응답 provider 필드를 결정.
 * 경기 > 서울 > odsay_fallback 우선순위.
 */
function dominantProvider(
  providers: Set<"seoul" | "gyeonggi" | "odsay_fallback">,
): "seoul" | "gyeonggi" | "odsay_fallback" {
  if (providers.has("gyeonggi")) return "gyeonggi"
  if (providers.has("seoul")) return "seoul"
  return "odsay_fallback"
}

// ─── route_stop row → ArrivalQueryContext 변환 ──────────────────────────────
interface StopRouteRow {
  gbis_route_id: string | null
  gbis_sta_order: number | null
  provider: "seoul" | "gyeonggi" | "odsay_fallback" | null
  odsay_route_id: string | null
  subway_code: string | null
}

interface RouteStopRow {
  id: string
  route_id: string
  stop_type: "bus" | "subway"
  ars_id: string | null
  gbis_station_id: string | null
  provider: "seoul" | "gyeonggi" | "odsay_fallback" | null
  provider_fallback_reason: "unsupported_region" | "mapping_failed" | "verify_failed" | null
  odsay_stop_id: string | null
  stop_name: string | null
  direction_headsign?: string | null
  direction_updn?: string | null
  stop_routes?: StopRouteRow[]
}

function isRouteStopRow(val: unknown): val is RouteStopRow {
  if (typeof val !== "object" || val === null) return false
  const row = val as Record<string, unknown>

  // 필수 문자열 필드
  if (typeof row["id"] !== "string") return false
  if (typeof row["route_id"] !== "string") return false

  // stop_type 열거형 검증
  if (row["stop_type"] !== "bus" && row["stop_type"] !== "subway") return false

  // provider_fallback_reason nullable 허용 (마이그레이션 전 기존 rows 호환)

  // stop_routes 배열 검증 (존재하면 배열이어야 함)
  if (row["stop_routes"] !== undefined && row["stop_routes"] !== null) {
    if (!Array.isArray(row["stop_routes"])) return false
    for (const sr of row["stop_routes"] as unknown[]) {
      if (typeof sr !== "object" || sr === null) return false
      const srRow = sr as Record<string, unknown>
      if (!("gbis_route_id" in srRow) || !("gbis_sta_order" in srRow)) return false
      // provider는 nullable 허용 (기존 rows 백필 전 호환)
    }
  }

  return true
}

function buildBaseCtx(stop: RouteStopRow): Omit<ArrivalQueryContext, "gbisRouteId" | "gbisStaOrder"> {
  return {
    stopType: stop.stop_type,
    arsId: stop.ars_id,
    gbisStationId: stop.gbis_station_id,
    odsayStopId: stop.odsay_stop_id,
    stationName: stop.stop_name,
    subwayCode: null,
  }
}

// ─── favorite_stops row → RouteStopRow 변환 헬퍼 ─────────────────────────────

interface FavoriteStopRouteRow {
  gbis_route_id: string | null
  gbis_sta_order: number | null
  provider: "seoul" | "gyeonggi" | "odsay_fallback" | null
  odsay_route_id: string | null
  subway_code: string | null
}

interface FavoriteStopRow {
  id: string
  stop_type: "bus" | "subway"
  ars_id: string | null
  gbis_station_id: string | null
  provider: "seoul" | "gyeonggi" | "odsay_fallback" | null
  odsay_stop_id: string | null
  stop_name: string | null
  direction_headsign: string | null
  direction_updn: string | null
  direction_next_stop: string | null
  favorite_stop_routes: FavoriteStopRouteRow[]
}

function isFavoriteStopRow(val: unknown): val is FavoriteStopRow {
  if (typeof val !== "object" || val === null) return false
  const row = val as Record<string, unknown>
  if (typeof row["id"] !== "string") return false
  if (row["stop_type"] !== "bus" && row["stop_type"] !== "subway") return false
  if (!Array.isArray(row["favorite_stop_routes"])) return false
  return true
}

/** favorite_stops row를 RouteStopRow 형태로 변환 (provider aggregation 로직 재사용) */
function favStopToRouteStopRow(fav: FavoriteStopRow): RouteStopRow {
  return {
    id: fav.id,
    route_id: "",  // favorite_stops는 route_id 없음 — placeholder
    stop_type: fav.stop_type,
    ars_id: fav.ars_id,
    gbis_station_id: fav.gbis_station_id,
    provider: fav.provider,
    provider_fallback_reason: null,
    odsay_stop_id: fav.odsay_stop_id,
    stop_name: fav.stop_name,
    direction_headsign: fav.direction_headsign,
    direction_updn: fav.direction_updn,
    stop_routes: fav.favorite_stop_routes.map((r) => ({
      gbis_route_id: r.gbis_route_id,
      gbis_sta_order: r.gbis_sta_order,
      provider: r.provider,
      odsay_route_id: r.odsay_route_id,
      subway_code: r.subway_code,
    })),
  }
}

// ─── 신 경로: stop_routes.provider 기반 멀티 프로바이더 aggregation ──────────
async function fetchArrivalByStopId(
  stopId: string,
  req: Request,
): Promise<BusArrivalResponse> {
  const user = await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  // 1차: route_stops + stop_routes 조회 (권한 검증: routes.user_id = auth.uid())
  const { data: routeStop, error: routeStopErr } = await db
    .from("route_stops")
    .select(
      `id, route_id, stop_type, ars_id, gbis_station_id, provider, provider_fallback_reason,
       odsay_stop_id, stop_name,
       routes!inner(user_id),
       stop_routes(gbis_route_id, gbis_sta_order, provider, odsay_route_id, subway_code)`,
    )
    .eq("id", stopId)
    .eq("routes.user_id", user.id)
    .single()

  // 2차: route_stops에 없으면 favorite_stops 조회
  let stop: unknown
  if (routeStopErr || !routeStop) {
    const { data: favStop, error: favErr } = await db
      .from("favorite_stops")
      .select(
        `id, stop_type, ars_id, gbis_station_id, provider,
         odsay_stop_id, stop_name,
         direction_headsign, direction_updn, direction_next_stop,
         favorite_stop_routes(gbis_route_id, gbis_sta_order, provider, odsay_route_id, subway_code)`,
      )
      .eq("id", stopId)
      .single()

    if (favErr || !favStop) {
      throw new AppError(
        "경로를 찾을 수 없어요.",
        404,
        "ARRIVAL_STOP_NOT_FOUND" satisfies ArrivalErrorCode,
        `stopId=${stopId} not found in route_stops or favorite_stops`,
      )
    }

    if (!isFavoriteStopRow(favStop)) {
      throw new AppError(
        "DB row 형식 오류 (favorite_stops)",
        500,
        "ARRIVAL_DB_ROW_INVALID" satisfies ArrivalErrorCode,
      )
    }

    stop = favStopToRouteStopRow(favStop)
  } else {
    stop = routeStop
  }

  if (!isRouteStopRow(stop)) {
    throw new AppError(
      "DB row 형식 오류",
      500,
      "ARRIVAL_DB_ROW_INVALID" satisfies ArrivalErrorCode,
    )
  }

  const stopRow: RouteStopRow = stop
  const stopRoutes = stopRow.stop_routes ?? []
  const baseCtx = buildBaseCtx(stopRow)

  // 지하철 stop: subway_code를 stop_routes 첫 행에서 추출하여 정확도 향상
  if (stopRow.stop_type === "subway") {
    const stationName = stopRow.stop_name ?? ""
    if (!stationName) {
      throw new AppError(
        "지하철 정류장 이름이 없습니다",
        500,
        "ARRIVAL_DB_ROW_INVALID" satisfies ArrivalErrorCode,
      )
    }
    const subwayCode = stopRoutes[0]?.subway_code ?? null
    const items = await getSubwayArrival(stationName, subwayCode ?? undefined)
    return {
      items: items as unknown as BusArrivalItem[],
      provider: "seoul",
      fetchedAt: new Date().toISOString(),
    }
  }

  // stop_routes가 없으면 route_stops.provider로 단일 provider 호출 (legacy 호환)
  if (stopRoutes.length === 0) {
    const providerName = stopRow.provider ?? "seoul"
    if (providerName !== "seoul" && providerName !== "gyeonggi" && providerName !== "odsay_fallback") {
      throw new AppError(
        `알 수 없는 provider: ${providerName}`,
        502,
        "ARRIVAL_PROVIDER_ERROR" satisfies ArrivalErrorCode,
      )
    }

    // odsay_fallback이고 reason이 명시된 경우 → 즉시 422 반환 (ODsay 시도 없음)
    if (providerName === "odsay_fallback" && stopRow.provider_fallback_reason != null) {
      const reason = stopRow.provider_fallback_reason
      if (reason === "unsupported_region") {
        throw new AppError(
          "이 지역은 실시간 도착 정보를 지원하지 않아요.",
          422,
          "ARRIVAL_UNSUPPORTED_REGION" satisfies ArrivalErrorCode,
        )
      }
      if (reason === "mapping_failed") {
        throw new AppError(
          "도착 정보를 가져올 수 없어요. 경로를 다시 등록하면 더 정확해져요.",
          422,
          "ARRIVAL_MAPPING_FAILED" satisfies ArrivalErrorCode,
        )
      }
      if (reason === "verify_failed") {
        throw new AppError(
          "도착 정보 정확도가 낮아요. 경로를 다시 등록해 주세요.",
          422,
          "ARRIVAL_VERIFY_FAILED" satisfies ArrivalErrorCode,
        )
      }
    }

    const provider = pickProvider(providerName)
    const ctx: ArrivalQueryContext = { ...baseCtx, gbisRouteId: null, gbisStaOrder: null }
    if (!provider.canHandle(ctx)) {
      throw new AppError(
        `provider(${providerName})와 stop 정보가 불일치합니다`,
        502,
        "ARRIVAL_PROVIDER_ERROR" satisfies ArrivalErrorCode,
      )
    }
    return await provider.fetchArrivals(ctx)
  }

  // stop_routes별 provider 분류 (stop 자체 provider + ars_id + gbis_station_id를 hint로 전달)
  const seoulRoutes = stopRoutes.filter((sr) => resolveStopRouteProvider(sr, stopRow.provider, stopRow.ars_id, stopRow.gbis_station_id) === "seoul")
  const gyeonggiRoutes = stopRoutes.filter((sr) => resolveStopRouteProvider(sr, stopRow.provider, stopRow.ars_id, stopRow.gbis_station_id) === "gyeonggi")
  const odsayRoutes = stopRoutes.filter((sr) => resolveStopRouteProvider(sr, stopRow.provider, stopRow.ars_id, stopRow.gbis_station_id) === "odsay_fallback")

  const usedProviders = new Set<"seoul" | "gyeonggi" | "odsay_fallback">()
  const allItems: BusArrivalItem[] = []
  let lastFetchedAt = new Date().toISOString()

  // 각 provider별 도착 조회 병렬 실행
  const tasks: Promise<void>[] = []

  if (seoulRoutes.length > 0) {
    tasks.push(
      (async () => {
        const ctx: ArrivalQueryContext = {
          ...baseCtx,
          gbisRouteId: null,
          gbisStaOrder: null,
        }
        const seoulProvider = pickProvider("seoul")
        if (!seoulProvider.canHandle(ctx)) {
          console.warn(
            JSON.stringify({ level: "warn", event: "seoul-provider-cannot-handle", stopId }),
          )
          return
        }
        const result = await seoulProvider.fetchArrivals(ctx)
        allItems.push(...result.items)
        usedProviders.add("seoul")
        lastFetchedAt = result.fetchedAt
      })(),
    )
  }

  if (gyeonggiRoutes.length > 0) {
    tasks.push(
      (async () => {
        // 경기 provider는 gbisStationId 단위로 전체 조회 후 내부 필터링
        // 첫 번째 gyeonggi 노선의 gbis_route_id를 필터 키로 전달 (정류장에 경기 노선이 여럿이면 전체 반환)
        const firstGbisRoute = gyeonggiRoutes.find((sr) => sr.gbis_route_id != null)
        const ctx: ArrivalQueryContext = {
          ...baseCtx,
          gbisRouteId: gyeonggiRoutes.length === 1 ? (firstGbisRoute?.gbis_route_id ?? null) : null,
          gbisStaOrder: firstGbisRoute?.gbis_sta_order ?? null,
        }
        const gyeonggiProvider = pickProvider("gyeonggi")
        if (!gyeonggiProvider.canHandle(ctx)) {
          console.warn(
            JSON.stringify({ level: "warn", event: "gyeonggi-provider-cannot-handle", stopId }),
          )
          return
        }
        const result = await gyeonggiProvider.fetchArrivals(ctx)
        allItems.push(...result.items)
        usedProviders.add("gyeonggi")
        lastFetchedAt = result.fetchedAt
      })(),
    )
  }

  if (odsayRoutes.length > 0) {
    tasks.push(
      (async () => {
        const ctx: ArrivalQueryContext = {
          ...baseCtx,
          gbisRouteId: null,
          gbisStaOrder: null,
        }
        const odsayProvider = pickProvider("odsay_fallback")
        if (!odsayProvider.canHandle(ctx)) {
          console.warn(
            JSON.stringify({ level: "warn", event: "odsay-provider-cannot-handle", stopId }),
          )
          return
        }
        const result = await odsayProvider.fetchArrivals(ctx)
        allItems.push(...result.items)
        usedProviders.add("odsay_fallback")
        lastFetchedAt = result.fetchedAt
      })(),
    )
  }

  await Promise.all(tasks)

  return {
    items: allItems,
    provider: dominantProvider(usedProviders.size > 0 ? usedProviders : new Set(["seoul"])),
    fetchedAt: lastFetchedAt,
  }
}

// ─── 메인 핸들러 ────────────────────────────────────────────────────────────
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "GET") throw new AppError("GET 요청만 허용됩니다", 405, "COMMON_METHOD_NOT_ALLOWED" satisfies CommonErrorCode)

    const { searchParams } = new URL(req.url)
    const stopId = searchParams.get("stopId")
    const legacyType = searchParams.get("type")

    // ── 신 경로: ?stopId={uuid} ─────────────────────────────────────────────
    if (stopId) {
      const result = await fetchArrivalByStopId(stopId, req)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ── legacy 호환: ?type=bus ──────────────────────────────────────────────
    if (legacyType === "bus") {
      const busRouteId = searchParams.get("busRouteId")
      const stId = searchParams.get("stId")
      const ord = searchParams.get("ord")
      const arsId = searchParams.get("arsId")

      if (!busRouteId) {
        throw new AppError("bus 타입은 busRouteId 가 필요합니다", 400, "ARRIVAL_PARAMS_INVALID" satisfies ArrivalErrorCode)
      }

      let data: LegacyBusArrivalResponse | null

      if (stId && ord) {
        data = await getBusArrival(stId, busRouteId, ord)
      } else if (arsId) {
        data = await findBusArrivalByArsId(busRouteId, arsId)
      } else {
        throw new AppError("bus 타입은 stId+ord 또는 arsId 가 필요합니다", 400, "ARRIVAL_PARAMS_INVALID" satisfies ArrivalErrorCode)
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ── legacy 호환: ?type=subway ───────────────────────────────────────────
    if (legacyType === "subway") {
      const stationName = searchParams.get("stationName")
      if (!stationName) throw new AppError("subway 타입은 stationName 이 필요합니다", 400, "ARRIVAL_PARAMS_INVALID" satisfies ArrivalErrorCode)
      // subwayCode: /^10\d{2}$/ 형식만 유효. 잘못된 형식은 400 반환.
      const rawSubwayCode = searchParams.get("subwayCode")
      if (rawSubwayCode && !/^10\d{2}$/.test(rawSubwayCode)) {
        throw new AppError(
          "subwayCode 형식이 올바르지 않습니다 (예: '1002')",
          400,
          "ARRIVAL_SUBWAY_CODE_INVALID" satisfies ArrivalErrorCode,
        )
      }
      const subwayCode = rawSubwayCode ?? undefined
      const data = await getSubwayArrival(stationName, subwayCode)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ── legacy 호환: ?type=odsay ────────────────────────────────────────────
    if (legacyType === "odsay") {
      const stationId = searchParams.get("stationId")
      if (!stationId) throw new AppError("odsay 타입은 stationId 가 필요합니다", 400, "ARRIVAL_PARAMS_INVALID" satisfies ArrivalErrorCode)
      const data = await realtimeStation(stationId)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    throw new AppError("type 파라미터가 필요합니다 (bus | subway | odsay)", 400, "ARRIVAL_PARAMS_INVALID" satisfies ArrivalErrorCode)
  } catch (e) {
    return errorResponse(e, "arrival-info")
  }
}

if (import.meta.main) Deno.serve(withErrorLogging(handler, "arrival-info"))
