import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { authGuard } from "../_shared/auth.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { resolveStopProvider, mapGbisRoutes } from "../_shared/regionMapper.ts"
import type { GbisStationCandidate } from "../_shared/gbisClient.ts"

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

// ─── 노선 ID → provider 추론 ──────────────────────────────────────────────────
/**
 * ODsay 노선 ID 첫 자리로 provider를 결정한다.
 * 관찰 기반 패턴: 1xxx... → 서울, 2xxx... → 경기(GBIS), 그 외 → ODsay fallback.
 */
function routeIdToProvider(id: string): "seoul" | "gyeonggi" | "odsay_fallback" {
  if (id.startsWith("1")) return "seoul"
  if (id.startsWith("2")) return "gyeonggi"
  return "odsay_fallback"
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
  arsId: string | null
  gbisStationId: string | null
  gbisStationSigunNm: string | null
  odsayStopId: string | null
}> {
  // lat/lng 없으면 서울 가정 (legacy 호환)
  if (stop.lat == null || stop.lng == null) {
    return {
      provider: "seoul",
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
      created_at, updated_at,
      route_stops (
        id, step_group, odsay_stop_id, stop_name, stop_type, sequence, ars_id,
        direction_headsign, direction_updn, direction_next_stop,
        provider, gbis_station_id,
        stop_routes (
          id, odsay_route_id, route_name, bus_type,
          st_id, bus_route_id, station_ord, station_name,
          gbis_route_id, gbis_sta_order, provider
        )
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) throw new AppError("경로 조회 실패", 500)

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
    throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400)
  }

  const { name, originName, destinationName, originCoords, destinationCoords, stops } = body

  if (!name?.trim() || !originName?.trim() || !destinationName?.trim()) {
    throw new AppError("name, originName, destinationName 이 필요합니다", 400)
  }
  if (!stops || stops.length === 0) {
    throw new AppError("stops 가 필요합니다", 400)
  }
  for (const s of stops) {
    if (s.stopType !== "bus" && s.stopType !== "subway") {
      throw new AppError(`stopType은 'bus' 또는 'subway' 여야 합니다: ${s.stopType}`, 400)
    }
    if (!s.stepGroup || s.stepGroup < 1) {
      throw new AppError(`stepGroup은 1 이상의 정수여야 합니다: ${s.stepGroup}`, 400)
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
      throw new AppError(`한 스텝당 최대 2개 정류장입니다 (stepGroup=${group})`, 400)
    }
    const types = new Set(members.map((m) => m.stopType))
    if (types.size > 1) {
      throw new AppError(`같은 스텝의 정류장은 동일한 타입이어야 합니다 (stepGroup=${group})`, 400)
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

  if (routeErr || !route) throw new AppError("경로 저장 실패", 500)

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
  }))

  const { data: insertedStops, error: stopsErr } = await db
    .from("route_stops")
    .insert(stopsPayload)
    .select("id, sequence, step_group")

  if (stopsErr || !insertedStops) throw new AppError(`정류장 저장 실패: ${stopsErr?.message ?? "no data"}`, 500)

  // 4. stop_routes 생성 (gbis_route_id, gbis_sta_order 포함)
  const stopRoutePayloads = await Promise.all(
    insertedStops.map(async (inserted) => {
      const found = resolvedStops.find(
        (r) => r.stop.stepGroup === inserted.step_group && r.stop.sequence === inserted.sequence,
      )
      if (!found) {
        throw new AppError("정류장 매핑 불일치 — sequence가 일치하는 stop을 찾을 수 없습니다", 500)
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
        provider: routeIdToProvider(sr.odsayRouteId),
      }))
    }),
  )

  const flatStopRoutePayload = stopRoutePayloads.flat()
  if (flatStopRoutePayload.length > 0) {
    const { error: srErr } = await db.from("stop_routes").insert(flatStopRoutePayload)
    if (srErr) throw new AppError("노선 저장 실패", 500)
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

  if (error) throw new AppError("경로 삭제 실패", 500)
  if (!data || data.length === 0) throw new AppError("경로를 찾을 수 없습니다", 404)
  return { ok: true }
}

// ─── PATCH /routes/:id ───────────────────────────────────────────────────────
async function patchRoute(req: Request, id: string): Promise<PatchRouteResponse> {
  const user = await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  let body: { is_active?: boolean }
  try {
    body = await req.json()
  } catch {
    throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400)
  }

  if (typeof body.is_active !== "boolean") {
    throw new AppError("is_active(boolean) 이 필요합니다", 400)
  }

  const { data, error } = await db
    .from("routes")
    .update({ is_active: body.is_active })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")

  if (error) throw new AppError("경로 수정 실패", 500)
  if (!data || data.length === 0) throw new AppError("경로를 찾을 수 없습니다", 404)
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

    throw new AppError("지원하지 않는 요청입니다", 405)
  } catch (e) {
    return errorResponse(e)
  }
}

if (import.meta.main) Deno.serve(handler)
