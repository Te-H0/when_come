import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { AppError, errorResponse, type ArrivalErrorCode } from "../_shared/error.ts"
import { authGuard } from "../_shared/auth.ts"
import { realtimeStation } from "../_shared/odsayClient.ts"
import {
  pickProvider,
  ArrivalQueryContext,
  BusArrivalResponse,
  BusArrivalItem,
  isSeoulBusResponse,
} from "../_shared/arrivalProvider.ts"

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

interface SeoulSubwayArrivalItem {
  subwayId: string
  trainLineNm: string
  arvlMsg2: string
  arvlMsg3: string
  updnLine: string
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
  return list.map((item) => ({
    lineName: item.subwayId,
    direction: item.trainLineNm,
    arrmsg1: item.arvlMsg2,
    arrmsg2: item.arvlMsg3,
    updnLine: item.updnLine,
  }))
}

async function getSubwayArrival(stationName: string): Promise<SubwayArrivalItem[]> {
  // 1차: OVERRIDES 적용한 명칭으로 호출
  const primary = applySubwayNameOverride(stationName)
  let items = await fetchSubwayArrivalRaw(primary)
  if (items.length > 0) return items

  // 2차: 괄호/역 제거 → 다시 OVERRIDES 한 번 더
  const stripped = stripSubwayNameDecorations(primary)
  const fallback = applySubwayNameOverride(stripped)
  if (fallback !== primary) {
    items = await fetchSubwayArrivalRaw(fallback)
    if (items.length > 0) return items
  }

  // 모든 fallback 실패 — 메트릭용 warn 로그
  // 운영 모니터링으로 새 별칭 케이스 발견 시 SUBWAY_NAME_OVERRIDES에 추가
  console.warn(
    `[subway-arrival] no result after fallback: input="${stationName}" primary="${primary}" fallback="${fallback}"`,
  )
  return []
}

function parseArrivalSec(val: unknown): number | null {
  const n = Number(val)
  return !isNaN(n) && n > 0 ? n : null
}

// ─── DB 클라이언트 (stopId 기반 경로용) ────────────────────────────────────
function supabaseClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
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
 */
function resolveStopRouteProvider(
  sr: StopRouteRow,
  stopProvider: "seoul" | "gyeonggi" | "odsay_fallback" | null,
): "seoul" | "gyeonggi" | "odsay_fallback" {
  if (sr.provider === "seoul" || sr.provider === "gyeonggi" || sr.provider === "odsay_fallback") {
    return sr.provider
  }
  // null (백필 전 기존 rows) — odsay_route_id 첫 자리로 재추론
  if (sr.odsay_route_id) {
    if (sr.odsay_route_id.startsWith("1")) return "seoul"
    if (sr.odsay_route_id.startsWith("2")) return "gyeonggi"
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

// ─── 신 경로: stop_routes.provider 기반 멀티 프로바이더 aggregation ──────────
async function fetchArrivalByStopId(
  stopId: string,
  req: Request,
): Promise<BusArrivalResponse> {
  const user = await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  // route_stops + stop_routes 조회 (권한 검증: routes.user_id = auth.uid())
  // stop_routes.provider + odsay_route_id 포함 — 노선 단위 분기 판단에 사용
  const { data: stop, error } = await db
    .from("route_stops")
    .select(
      `id, route_id, stop_type, ars_id, gbis_station_id, provider, provider_fallback_reason,
       odsay_stop_id, stop_name,
       routes!inner(user_id),
       stop_routes(gbis_route_id, gbis_sta_order, provider, odsay_route_id)`,
    )
    .eq("id", stopId)
    .eq("routes.user_id", user.id)
    .single()

  if (error || !stop) {
    throw new AppError(
      "경로를 찾을 수 없어요.",
      404,
      "ARRIVAL_STOP_NOT_FOUND" satisfies ArrivalErrorCode,
      `route_stops.id=${stopId} not found or not owned by user`,
    )
  }

  if (!isRouteStopRow(stop)) {
    throw new AppError("DB row 형식 오류", 500)
  }

  const stopRow: RouteStopRow = stop
  const stopRoutes = stopRow.stop_routes ?? []
  const baseCtx = buildBaseCtx(stopRow)

  // stop_routes가 없으면 route_stops.provider로 단일 provider 호출 (legacy 호환)
  if (stopRoutes.length === 0) {
    const providerName = stopRow.provider ?? "seoul"
    if (providerName !== "seoul" && providerName !== "gyeonggi" && providerName !== "odsay_fallback") {
      throw new AppError(`알 수 없는 provider: ${providerName}`, 502)
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
      throw new AppError(`provider(${providerName})와 stop 정보가 불일치합니다`, 502)
    }
    return await provider.fetchArrivals(ctx)
  }

  // stop_routes별 provider 분류 (stop 자체 provider를 hint로 전달)
  const seoulRoutes = stopRoutes.filter((sr) => resolveStopRouteProvider(sr, stopRow.provider) === "seoul")
  const gyeonggiRoutes = stopRoutes.filter((sr) => resolveStopRouteProvider(sr, stopRow.provider) === "gyeonggi")
  const odsayRoutes = stopRoutes.filter((sr) => resolveStopRouteProvider(sr, stopRow.provider) === "odsay_fallback")

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
    if (req.method !== "GET") throw new AppError("GET 요청만 허용됩니다", 405)

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
        throw new AppError("bus 타입은 busRouteId 가 필요합니다", 400)
      }

      let data: LegacyBusArrivalResponse | null

      if (stId && ord) {
        data = await getBusArrival(stId, busRouteId, ord)
      } else if (arsId) {
        data = await findBusArrivalByArsId(busRouteId, arsId)
      } else {
        throw new AppError("bus 타입은 stId+ord 또는 arsId 가 필요합니다", 400)
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ── legacy 호환: ?type=subway ───────────────────────────────────────────
    if (legacyType === "subway") {
      const stationName = searchParams.get("stationName")
      if (!stationName) throw new AppError("subway 타입은 stationName 이 필요합니다", 400)
      const data = await getSubwayArrival(stationName)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ── legacy 호환: ?type=odsay ────────────────────────────────────────────
    if (legacyType === "odsay") {
      const stationId = searchParams.get("stationId")
      if (!stationId) throw new AppError("odsay 타입은 stationId 가 필요합니다", 400)
      const data = await realtimeStation(stationId)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    throw new AppError("type 파라미터가 필요합니다 (bus | subway | odsay)", 400)
  } catch (e) {
    return errorResponse(e)
  }
}

if (import.meta.main) Deno.serve(handler)
