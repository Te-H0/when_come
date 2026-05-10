import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { authGuard } from "../_shared/auth.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { withErrorLogging } from "../_shared/middleware.ts"
import { resolveStopProvider, mapGbisRoutes } from "../_shared/regionMapper.ts"
import type { GbisStationCandidate } from "../_shared/gbisClient.ts"
import type {
  RouteErrorCode,
  CommonErrorCode,
} from "../_shared/errorCodes.ts"

// ─── 요청 DTO ──────────────────────────────────────────────────────────────
interface StopRouteInput {
  odsayRouteId: string
  routeName: string
  busType?: number | null
  stId?: string | null
  busRouteId?: string | null
  stationOrd?: number | null
  stationName?: string | null
  // 신규 (FE hint 또는 BE 매핑 결과)
  gbisRouteId?: string | null
  gbisStaOrder?: number | null
  subwayCode?: string | null
}

interface RouteStopInput {
  odsayStopId: string
  stopName: string
  stopType: "bus" | "subway"
  sequence: number
  stepGroup: number             // 1-based 논리 스텝 번호
  arsId?: string | null
  directionHeadsign?: string | null
  directionUpdn?: string | null
  directionNextStop?: string | null
  // 신규 (FE는 lat/lng만 보내면 BE가 매핑)
  lat?: number | null    // ODsay y
  lng?: number | null    // ODsay x
  provider?: "seoul" | "gyeonggi" | "odsay_fallback" | null  // hint
  gbisStationId?: string | null                               // hint
  stopRoutes: StopRouteInput[]
}

interface CreateRouteRequest {
  name: string
  originName: string
  destinationName: string
  originCoords?: { lat: number; lng: number }
  destinationCoords?: { lat: number; lng: number }
  stops: RouteStopInput[]
}

// ─── 응답 DTO ──────────────────────────────────────────────────────────────
interface CreateRouteResponse {
  id: string
}

interface DeleteRouteResponse {
  ok: true
}

interface PatchRouteResponse {
  ok: true
}

// ─── PATCH 요청 DTO ─────────────────────────────────────────────────────────
interface UpdateRouteRequest {
  name?: string
  displayOrder?: number
  active?: boolean
  stops?: RouteStopInput[]
}

// ─── 노선 ID → provider 추론 ──────────────────────────────────────────────────
/**
 * ODsay 노선 ID 첫 자리로 provider를 결정한다.
 * 관찰 기반 패턴: 1xxx... → 서울, 2xxx... → 경기(GBIS), 그 외 → ODsay fallback.
 *
 * 한계: 경기도 일부 노선(마을버스, 일반버스)은 ODsay에서 3xxx, 5xxx 등의 ID를 가질 수 있다.
 * 이 경우 stopProvider(정류장 단위 provider)를 우선 참고해야 한다.
 * resolveStopRouteProvider() 참조.
 */
function routeIdToProvider(id: string): "seoul" | "gyeonggi" | "odsay_fallback" {
  if (id.startsWith("1")) return "seoul"
  if (id.startsWith("2")) return "gyeonggi"
  return "odsay_fallback"
}

/**
 * stop_routes.provider 최종 결정.
 * routeIdToProvider()가 odsay_fallback을 반환하더라도
 * 정류장 자체가 gyeonggi provider로 확정된 경우 해당 노선도 gyeonggi로 처리한다.
 * (광명사거리 등 경기 경계 지역 마을/일반버스 — ODsay ID가 2xxx 아닌 경우 커버)
 *
 * ADR-002 D3-supplement: busType===6(경기버스)이면 route ID prefix보다 busType 우선 — 무조건 gyeonggi.
 */
function resolveStopRouteProviderOnSave(
  odsayRouteId: string,
  stopProvider: "seoul" | "gyeonggi" | "odsay_fallback",
  busType?: number | null,
): "seoul" | "gyeonggi" | "odsay_fallback" {
  // busType===6(경기버스): route ID 패턴보다 우선 → 무조건 gyeonggi
  if (busType === 6) return "gyeonggi"

  const byRouteId = routeIdToProvider(odsayRouteId)
  // 1xxx → 서울: route ID 기반 결과 사용 (경기 정류장에 서울버스 공존 가능)
  if (byRouteId === "seoul") return "seoul"
  // 2xxx → 경기: route ID 기반 결과 사용
  if (byRouteId === "gyeonggi") return "gyeonggi"
  // 그 외(3xxx~): stopProvider가 gyeonggi면 경기로 승격
  if (stopProvider === "gyeonggi") return "gyeonggi"
  return byRouteId
}

// ─── 환경변수 lazy 읽기 ───────────────────────────────────────────────────────
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

// ─── DB 클라이언트 ─────────────────────────────────────────────────────────
function supabaseClient(authHeader: string) {
  return createClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    { global: { headers: { Authorization: authHeader } } },
  )
}

// ─── provider 결정 (T9: 서버 측 자동 매핑) ────────────────────────────────
async function resolveStopWithProvider(
  db: ReturnType<typeof supabaseClient>,
  stop: RouteStopInput,
): Promise<{
  provider: "seoul" | "gyeonggi" | "odsay_fallback"
  fallbackReason?: "unsupported_region" | "mapping_failed" | "verify_failed" | null
  arsId: string | null
  gbisStationId: string | null
  gbisStationSigunNm: string | null
  odsayStopId: string | null
}> {
  // lat/lng 없으면 서울 가정 (legacy 호환)
  if (stop.lat == null || stop.lng == null) {
    return {
      provider: "seoul",
      fallbackReason: null,
      arsId: stop.arsId ?? null,
      gbisStationId: null,
      gbisStationSigunNm: null,
      odsayStopId: stop.odsayStopId,
    }
  }

  const resolved = await resolveStopProvider(
    db,
    {
      stationID: stop.odsayStopId,
      stationName: stop.stopName,
      x: stop.lng,    // ODsay x = 경도
      y: stop.lat,    // ODsay y = 위도
      arsID: stop.arsId ?? null,
      stopType: stop.stopType,
    },
    stop.stopRoutes,
  )

  return resolved
}

// ─── GET /routes — 내 경로 목록 (T10: 신규 필드 포함) ──────────────────────
async function listRoutes(req: Request) {
  const user = await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  const { data, error } = await db
    .from("routes")
    .select(`
      id, name, origin_name, destination_name,
      origin_coords, destination_coords, is_active,
      active, display_order,
      created_at, updated_at,
      route_stops (
        id, step_group, odsay_stop_id, stop_name, stop_type, sequence, ars_id,
        direction_headsign, direction_updn, direction_next_stop,
        provider, gbis_station_id, alias,
        stop_routes (
          id, odsay_route_id, route_name, bus_type,
          st_id, bus_route_id, station_ord, station_name,
          gbis_route_id, gbis_sta_order, provider, subway_code
        )
      )
    `)
    .eq("user_id", user.id)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) throw new AppError("경로 조회 실패", 500, "ROUTE_QUERY_FAILED" satisfies RouteErrorCode)

  data?.forEach((route) => {
    route.route_stops?.sort(
      (a: { step_group: number; sequence: number }, b: { step_group: number; sequence: number }) =>
        a.step_group - b.step_group || a.sequence - b.sequence,
    )
  })

  return data
}

// ─── POST /routes — 경로 저장 (T9: 자동 매핑 포함) ─────────────────────────
async function createRoute(req: Request): Promise<CreateRouteResponse> {
  const user = await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  let body: CreateRouteRequest
  try {
    body = await req.json()
  } catch {
    throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400, "COMMON_INVALID_JSON" satisfies CommonErrorCode)
  }

  const { name, originName, destinationName, originCoords, destinationCoords, stops } = body

  if (!name?.trim() || !originName?.trim() || !destinationName?.trim()) {
    throw new AppError("name, originName, destinationName 이 필요합니다", 400, "ROUTE_NAME_REQUIRED" satisfies RouteErrorCode)
  }
  if (!stops || stops.length === 0) {
    throw new AppError("정류장이 최소 1개 이상 필요합니다", 400, "ROUTE_STOPS_REQUIRED" satisfies RouteErrorCode)
  }
  for (const s of stops) {
    if (s.stopType !== "bus" && s.stopType !== "subway") {
      throw new AppError(`stopType은 'bus' 또는 'subway' 여야 합니다: ${s.stopType}`, 400, "ROUTE_INVALID_STOP_TYPE" satisfies RouteErrorCode)
    }
    if (!s.stepGroup || s.stepGroup < 1) {
      throw new AppError(`stepGroup은 1 이상의 정수여야 합니다: ${s.stepGroup}`, 400, "ROUTE_INVALID_STEP_GROUP" satisfies RouteErrorCode)
    }
  }

  // stepGroup 단위 검증
  const groupMap = new Map<number, RouteStopInput[]>()
  for (const s of stops) {
    const group = groupMap.get(s.stepGroup) ?? []
    group.push(s)
    groupMap.set(s.stepGroup, group)
  }
  for (const [group, members] of groupMap) {
    if (members.length > 2) {
      throw new AppError(`한 스텝당 최대 2개 정류장입니다 (stepGroup=${group})`, 400, "ROUTE_STEP_GROUP_OVERFLOW" satisfies RouteErrorCode)
    }
    const types = new Set(members.map((m) => m.stopType))
    if (types.size > 1) {
      throw new AppError(`같은 스텝의 정류장은 동일한 타입이어야 합니다 (stepGroup=${group})`, 400, "ROUTE_STOP_TYPE_MIXED" satisfies RouteErrorCode)
    }
  }

  // 1. routes 생성
  const { data: route, error: routeErr } = await db
    .from("routes")
    .insert({
      user_id: user.id,
      name: name.trim(),
      origin_name: originName.trim(),
      destination_name: destinationName.trim(),
      origin_coords: originCoords ?? null,
      destination_coords: destinationCoords ?? null,
    })
    .select("id")
    .single()

  if (routeErr || !route) throw new AppError("경로 저장 실패", 500, "ROUTE_PERSIST_FAILED" satisfies RouteErrorCode)

  // 2. 각 stop에 대해 provider 결정 (T9 자동 매핑)
  const resolvedStops = await Promise.all(
    stops.map(async (s) => {
      try {
        const resolved = await resolveStopWithProvider(db, s)
        return { stop: s, resolved }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(
          JSON.stringify({ level: "warn", event: "resolve-stop-failed", stopName: s.stopName, error: msg }),
        )
        // 실패 시 서울 fallback
        return {
          stop: s,
          resolved: {
            provider: "seoul" as const,
            fallbackReason: null,
            arsId: s.arsId ?? null,
            gbisStationId: null,
            gbisStationSigunNm: null,
            odsayStopId: s.odsayStopId,
          },
        }
      }
    }),
  )

  // 3. route_stops 생성
  const stopsPayload = resolvedStops.map(({ stop, resolved }) => ({
    route_id: route.id,
    step_group: stop.stepGroup,
    odsay_stop_id: stop.odsayStopId,
    stop_name: stop.stopName,
    stop_type: stop.stopType,
    sequence: stop.sequence,
    ars_id: resolved.arsId,
    direction_headsign: stop.directionHeadsign ?? null,
    direction_updn:
      stop.directionUpdn === "up" || stop.directionUpdn === "down" ? stop.directionUpdn : null,
    direction_next_stop: stop.directionNextStop ?? null,
    provider: resolved.provider,
    gbis_station_id: resolved.gbisStationId,
    provider_fallback_reason: resolved.fallbackReason ?? null,
  }))

  const { data: insertedStops, error: stopsErr } = await db
    .from("route_stops")
    .insert(stopsPayload)
    .select("id, sequence, step_group")

  if (stopsErr || !insertedStops) throw new AppError(`정류장 저장 실패: ${stopsErr?.message ?? "no data"}`, 500, "ROUTE_STOPS_PERSIST_FAILED" satisfies RouteErrorCode)

  // 4. stop_routes 생성 (gbis_route_id, gbis_sta_order 포함)
  const stopRoutePayloads = await Promise.all(
    insertedStops.map(async (inserted) => {
      const found = resolvedStops.find(
        (r) => r.stop.stepGroup === inserted.step_group && r.stop.sequence === inserted.sequence,
      )
      if (!found) {
        throw new AppError("정류장 매핑 불일치 — sequence가 일치하는 stop을 찾을 수 없습니다", 500, "ROUTE_STOP_MAPPING_MISMATCH" satisfies RouteErrorCode)
      }
      const { stop, resolved } = found
      const baseRoutes = stop.stopRoutes ?? []

      // gyeonggi provider이면 GBIS 노선 매핑 시도
      let mappedRoutes = baseRoutes.map((sr) => ({
        ...sr,
        gbisRouteId: sr.gbisRouteId ?? null,
        gbisStaOrder: sr.gbisStaOrder ?? null,
      }))

      if (resolved.provider === "gyeonggi" && resolved.gbisStationId) {
        try {
          // mapGbisRoutes는 GbisStationCandidate를 받는다.
          // resolved.gbisStationSigunNm은 resolveStopProvider가 DB row에서 읽은 실제 값이므로
          // regionName 필터가 정확하게 동작한다 (null 전달 시 필터 스킵으로 API 호출량 폭발 방지).
          const stationCandidate: GbisStationCandidate = {
            stationId: resolved.gbisStationId,
            stationName: found.stop.stopName,
            x: found.stop.lng ?? 0,
            y: found.stop.lat ?? 0,
            sigunNm: resolved.gbisStationSigunNm,  // DB row에서 읽은 실제 sigunNm
          }
          mappedRoutes = await mapGbisRoutes(stationCandidate, baseRoutes)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.warn(
            JSON.stringify({ level: "warn", event: "gbis-route-map-failed", error: msg }),
          )
        }
      }

      return mappedRoutes.map((sr) => ({
        stop_id: inserted.id,
        odsay_route_id: sr.odsayRouteId,
        route_name: sr.routeName,
        bus_type: sr.busType ?? null,
        st_id: sr.stId ?? null,
        bus_route_id: sr.busRouteId ?? null,
        station_ord: sr.stationOrd ?? null,
        station_name: sr.stationName ?? null,
        gbis_route_id: sr.gbisRouteId ?? null,
        gbis_sta_order: sr.gbisStaOrder ?? null,
        provider: resolveStopRouteProviderOnSave(sr.odsayRouteId, resolved.provider, sr.busType),
        subway_code: sr.subwayCode ?? null,
      }))
    }),
  )

  const flatStopRoutePayload = stopRoutePayloads.flat()
  if (flatStopRoutePayload.length > 0) {
    const { error: srErr } = await db.from("stop_routes").insert(flatStopRoutePayload)
    if (srErr) throw new AppError("노선 저장 실패", 500, "ROUTE_STOP_ROUTES_PERSIST_FAILED" satisfies RouteErrorCode)
  }

  return { id: route.id }
}

// ─── DELETE /routes/:id ──────────────────────────────────────────────────────
async function deleteRoute(req: Request, id: string): Promise<DeleteRouteResponse> {
  const user = await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  const { data, error } = await db
    .from("routes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")

  if (error) throw new AppError("경로 삭제 실패", 500, "ROUTE_DELETE_FAILED" satisfies RouteErrorCode)
  if (!data || data.length === 0) throw new AppError("경로를 찾을 수 없습니다", 404, "ROUTE_NOT_FOUND" satisfies RouteErrorCode)
  return { ok: true }
}

// ─── PATCH /routes/:id ───────────────────────────────────────────────────────
async function patchRoute(req: Request, id: string): Promise<PatchRouteResponse> {
  const user = await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  let body: UpdateRouteRequest
  try {
    body = await req.json()
  } catch {
    throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400, "COMMON_INVALID_JSON" satisfies CommonErrorCode)
  }

  // stops 전체 교체 — 기존 PUT 동작 위임
  if (body.stops !== undefined) {
    // stops 교체는 PUT 동작과 동일: route_stops + stop_routes 재생성
    // 간단화: stops 있으면 기존 createRoute 로직을 재사용하지 않고
    // 직접 DELETE + INSERT 처리
    const { stops } = body

    if (!Array.isArray(stops) || stops.length === 0) {
      throw new AppError("stops는 1개 이상의 배열이어야 합니다", 400, "ROUTE_STOPS_REQUIRED" satisfies RouteErrorCode)
    }

    // 기존 route 존재 확인
    const { data: routeRow, error: routeErr } = await db
      .from("routes")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (routeErr || !routeRow) throw new AppError("경로를 찾을 수 없습니다", 404, "ROUTE_NOT_FOUND" satisfies RouteErrorCode)

    // 기존 route_stops 삭제 (cascade로 stop_routes 자동 삭제)
    const { error: delErr } = await db
      .from("route_stops")
      .delete()
      .eq("route_id", id)

    if (delErr) throw new AppError("기존 정류장 삭제 실패", 500, "ROUTE_STOPS_PERSIST_FAILED" satisfies RouteErrorCode)

    // provider 결정 후 route_stops INSERT
    const resolvedStops = await Promise.all(
      stops.map(async (s) => {
        try {
          const resolved = await resolveStopWithProvider(db, s)
          return { stop: s, resolved }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.warn(
            JSON.stringify({ level: "warn", event: "resolve-stop-failed-patch", stopName: s.stopName, error: msg }),
          )
          return {
            stop: s,
            resolved: {
              provider: "seoul" as const,
              fallbackReason: null,
              arsId: s.arsId ?? null,
              gbisStationId: null,
              gbisStationSigunNm: null,
              odsayStopId: s.odsayStopId,
            },
          }
        }
      }),
    )

    const stopsPayload = resolvedStops.map(({ stop, resolved }) => ({
      route_id: id,
      step_group: stop.stepGroup,
      odsay_stop_id: stop.odsayStopId,
      stop_name: stop.stopName,
      stop_type: stop.stopType,
      sequence: stop.sequence,
      ars_id: resolved.arsId,
      direction_headsign: stop.directionHeadsign ?? null,
      direction_updn:
        stop.directionUpdn === "up" || stop.directionUpdn === "down" ? stop.directionUpdn : null,
      direction_next_stop: stop.directionNextStop ?? null,
      provider: resolved.provider,
      gbis_station_id: resolved.gbisStationId,
      provider_fallback_reason: resolved.fallbackReason ?? null,
    }))

    const { data: insertedStops, error: stopsErr } = await db
      .from("route_stops")
      .insert(stopsPayload)
      .select("id, sequence, step_group")

    if (stopsErr || !insertedStops) throw new AppError(`정류장 저장 실패: ${stopsErr?.message ?? "no data"}`, 500, "ROUTE_STOPS_PERSIST_FAILED" satisfies RouteErrorCode)

    // stop_routes INSERT (GBIS 매핑 포함 — POST createRoute와 동일 로직)
    const stopRoutePayloads = await Promise.all(
      insertedStops.map(async (inserted) => {
        const found = resolvedStops.find(
          (r) => r.stop.stepGroup === inserted.step_group && r.stop.sequence === inserted.sequence,
        )
        if (!found) throw new AppError("정류장 매핑 불일치", 500, "ROUTE_STOP_MAPPING_MISMATCH" satisfies RouteErrorCode)
        const { stop, resolved } = found
        const baseRoutes = stop.stopRoutes ?? []

        // gyeonggi provider이면 GBIS 노선 매핑 시도
        let mappedRoutes = baseRoutes.map((sr) => ({
          ...sr,
          gbisRouteId: sr.gbisRouteId ?? null,
          gbisStaOrder: sr.gbisStaOrder ?? null,
        }))

        if (resolved.provider === "gyeonggi" && resolved.gbisStationId) {
          try {
            const stationCandidate: GbisStationCandidate = {
              stationId: resolved.gbisStationId,
              stationName: found.stop.stopName,
              x: found.stop.lng ?? 0,
              y: found.stop.lat ?? 0,
              sigunNm: resolved.gbisStationSigunNm,
            }
            mappedRoutes = await mapGbisRoutes(stationCandidate, baseRoutes)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            console.warn(
              JSON.stringify({ level: "warn", event: "gbis-route-map-failed-patch", error: msg }),
            )
          }
        }

        return mappedRoutes.map((sr) => ({
          stop_id: inserted.id,
          odsay_route_id: sr.odsayRouteId,
          route_name: sr.routeName,
          bus_type: sr.busType ?? null,
          st_id: sr.stId ?? null,
          bus_route_id: sr.busRouteId ?? null,
          station_ord: sr.stationOrd ?? null,
          station_name: sr.stationName ?? null,
          gbis_route_id: sr.gbisRouteId ?? null,
          gbis_sta_order: sr.gbisStaOrder ?? null,
          provider: resolveStopRouteProviderOnSave(sr.odsayRouteId, resolved.provider, sr.busType),
          subway_code: sr.subwayCode ?? null,
        }))
      }),
    )

    const flat = stopRoutePayloads.flat()
    if (flat.length > 0) {
      const { error: srErr } = await db.from("stop_routes").insert(flat)
      if (srErr) throw new AppError("노선 저장 실패", 500, "ROUTE_STOP_ROUTES_PERSIST_FAILED" satisfies RouteErrorCode)
    }

    return { ok: true }
  }

  // 단순 필드 업데이트 (name / displayOrder / active)
  const updatePayload: Record<string, unknown> = {}

  if (body.name !== undefined) {
    if (!body.name.trim()) throw new AppError("name이 비어 있습니다", 400, "ROUTE_NAME_EMPTY" satisfies RouteErrorCode)
    updatePayload.name = body.name.trim()
  }
  if (body.displayOrder !== undefined) {
    if (body.displayOrder < 0) throw new AppError("displayOrder는 0 이상이어야 합니다", 400, "ROUTE_DISPLAY_ORDER_NEGATIVE" satisfies RouteErrorCode)
    updatePayload.display_order = body.displayOrder
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") throw new AppError("active는 boolean이어야 합니다", 400, "ROUTE_ACTIVE_INVALID" satisfies RouteErrorCode)
    updatePayload.active = body.active
  }

  if (Object.keys(updatePayload).length === 0) {
    throw new AppError("수정할 필드가 없습니다", 400, "ROUTE_PATCH_NO_FIELDS" satisfies RouteErrorCode)
  }

  const { data, error } = await db
    .from("routes")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")

  if (error) throw new AppError("경로 수정 실패", 500, "ROUTE_UPDATE_FAILED" satisfies RouteErrorCode)
  if (!data || data.length === 0) throw new AppError("경로를 찾을 수 없습니다", 404, "ROUTE_NOT_FOUND" satisfies RouteErrorCode)
  return { ok: true }
}

// ─── URL 라우팅 ───────────────────────────────────────────────────────────────
function extractRouteId(pathname: string): string | undefined {
  const match = pathname.match(/\/routes\/([^/?#]+)/)
  return match?.[1]
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const id = extractRouteId(new URL(req.url).pathname)

    if (req.method === "GET" && !id) {
      const data = await listRoutes(req)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (req.method === "POST" && !id) {
      const data = await createRoute(req)
      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (req.method === "PATCH" && id) {
      const data = await patchRoute(req, id)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (req.method === "DELETE" && id) {
      const data = await deleteRoute(req, id)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    throw new AppError("지원하지 않는 요청입니다", 405, "COMMON_METHOD_NOT_ALLOWED" satisfies CommonErrorCode)
  } catch (e) {
    return errorResponse(e, "routes")
  }
}

if (import.meta.main) Deno.serve(withErrorLogging(handler, "routes"))
