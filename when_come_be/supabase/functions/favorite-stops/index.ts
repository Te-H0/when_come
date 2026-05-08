import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { authGuard } from "../_shared/auth.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { withErrorLogging } from "../_shared/middleware.ts"
import { resolveStopProvider } from "../_shared/regionMapper.ts"

// ─── 요청 DTO ──────────────────────────────────────────────────────────────

interface FavoriteStopRouteInput {
  odsayRouteId: string
  routeName: string
  busType?: number | null
  stId?: string | null
  busRouteId?: string | null
  stationOrd?: number | null
  stationName?: string | null
  gbisRouteId?: string | null
  gbisStaOrder?: number | null
}

interface CreateFavoriteStopRequest {
  odsayStopId: string
  stopName: string
  stopType: "bus" | "subway"
  arsId?: string | null
  lat?: number | null
  lng?: number | null
  directionHeadsign?: string | null
  directionUpdn?: "up" | "down" | null
  directionNextStop?: string | null
  alias?: string | null
  routes: FavoriteStopRouteInput[]
}

interface UpdateFavoriteStopRequest {
  alias?: string | null
  displayOrder?: number
  routes?: FavoriteStopRouteInput[]
}

// ─── 노선 ID → provider 추론 ─────────────────────────────────────────────────
function routeIdToProvider(id: string): "seoul" | "gyeonggi" | "odsay_fallback" {
  if (id.startsWith("1")) return "seoul"
  if (id.startsWith("2")) return "gyeonggi"
  return "odsay_fallback"
}

// ─── alias 정규화 ─────────────────────────────────────────────────────────────
function normalizeAlias(alias?: string | null): string | null {
  if (alias == null) return null
  const trimmed = alias.trim()
  return trimmed.length === 0 ? null : trimmed
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

// ─── FavoriteStop 조회 헬퍼 (단건 + favorite_stop_routes JOIN) ────────────────
async function fetchFavoriteStop(
  db: ReturnType<typeof supabaseClient>,
  id: string,
) {
  const { data, error } = await db
    .from("favorite_stops")
    .select(`
      id, user_id, odsay_stop_id, stop_name, stop_type, ars_id, lat, lng,
      direction_headsign, direction_updn, direction_next_stop,
      provider, gbis_station_id, alias, display_order,
      created_at, updated_at,
      favorite_stop_routes (
        id, favorite_stop_id, odsay_route_id, route_name, bus_type,
        st_id, bus_route_id, station_ord, station_name,
        gbis_route_id, gbis_sta_order, provider
      )
    `)
    .eq("id", id)
    .single()

  if (error || !data) return null
  return data
}

// ─── GET /favorite-stops ─────────────────────────────────────────────────────
async function listFavoriteStops(req: Request) {
  await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  const { data, error } = await db
    .from("favorite_stops")
    .select(`
      id, user_id, odsay_stop_id, stop_name, stop_type, ars_id, lat, lng,
      direction_headsign, direction_updn, direction_next_stop,
      provider, gbis_station_id, alias, display_order,
      created_at, updated_at,
      favorite_stop_routes (
        id, favorite_stop_id, odsay_route_id, route_name, bus_type,
        st_id, bus_route_id, station_ord, station_name,
        gbis_route_id, gbis_sta_order, provider
      )
    `)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200)

  if (error) throw new AppError("즐겨찾기 조회 실패", 500)
  return data ?? []
}

// ─── POST /favorite-stops ────────────────────────────────────────────────────
async function createFavoriteStop(req: Request) {
  const user = await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  let body: CreateFavoriteStopRequest
  try {
    body = await req.json()
  } catch {
    throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400)
  }

  // D5: 노선 0개 reject
  if (!body.routes || body.routes.length === 0) {
    throw new AppError(
      "노선을 1개 이상 선택해 주세요.",
      400,
      "FAVORITE_ROUTES_REQUIRED",
    )
  }

  const { odsayStopId, stopName, stopType } = body
  if (!odsayStopId?.trim()) throw new AppError("odsayStopId가 필요합니다", 400)
  if (!stopName?.trim()) throw new AppError("stopName이 필요합니다", 400)
  if (stopType !== "bus" && stopType !== "subway") {
    throw new AppError("stopType은 'bus' 또는 'subway' 여야 합니다", 400)
  }

  const alias = normalizeAlias(body.alias)
  if (alias != null && alias.length > 20) {
    throw new AppError("별명은 20자 이내여야 합니다", 400)
  }

  // provider 자동 매핑 (좌표 기반)
  let provider: "seoul" | "gyeonggi" | "odsay_fallback" = "seoul"
  let gbisStationId: string | null = null
  let resolvedArsId: string | null = body.arsId ?? null

  if (body.lat != null && body.lng != null) {
    try {
      const resolved = await resolveStopProvider(
        db,
        {
          stationID: odsayStopId,
          stationName: stopName,
          x: body.lng,
          y: body.lat,
          arsID: body.arsId ?? null,
          stopType,
        },
        body.routes,
      )
      provider = resolved.provider
      gbisStationId = resolved.gbisStationId
      resolvedArsId = resolved.arsId
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(JSON.stringify({ level: "warn", event: "resolve-stop-failed", stopName, error: msg }))
      // 서울 fallback 유지
    }
  }

  // display_order: 현 사용자 max + 1
  const { data: maxRow } = await db
    .from("favorite_stops")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)

  const maxOrder: number = Array.isArray(maxRow) && maxRow.length > 0
    ? (maxRow[0].display_order ?? 0)
    : -1
  const displayOrder = maxOrder + 1

  // favorite_stops INSERT
  const { data: inserted, error: insertErr } = await db
    .from("favorite_stops")
    .insert({
      user_id: user.id,
      odsay_stop_id: odsayStopId,
      stop_name: stopName.trim(),
      stop_type: stopType,
      ars_id: resolvedArsId,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      direction_headsign: body.directionHeadsign ?? null,
      direction_updn:
        body.directionUpdn === "up" || body.directionUpdn === "down"
          ? body.directionUpdn
          : null,
      direction_next_stop: body.directionNextStop ?? null,
      provider,
      gbis_station_id: gbisStationId,
      alias,
      display_order: displayOrder,
    })
    .select("id")
    .single()

  if (insertErr || !inserted) throw new AppError("즐겨찾기 저장 실패", 500)

  // favorite_stop_routes bulk INSERT
  const routePayloads = body.routes.map((r, idx) => ({
    favorite_stop_id: inserted.id,
    odsay_route_id: r.odsayRouteId,
    route_name: r.routeName,
    bus_type: r.busType ?? null,
    st_id: r.stId ?? null,
    bus_route_id: r.busRouteId ?? null,
    station_ord: r.stationOrd ?? null,
    station_name: r.stationName ?? null,
    gbis_route_id: r.gbisRouteId ?? null,
    gbis_sta_order: r.gbisStaOrder ?? null,
    provider: routeIdToProvider(r.odsayRouteId),
    display_order: idx,
  }))

  const { error: routeErr } = await db
    .from("favorite_stop_routes")
    .insert(routePayloads)

  if (routeErr) {
    // 롤백: favorite_stops 삭제
    await db.from("favorite_stops").delete().eq("id", inserted.id)
    throw new AppError("노선 저장 실패", 500)
  }

  const result = await fetchFavoriteStop(db, inserted.id)
  if (!result) throw new AppError("생성 후 조회 실패", 500)
  return result
}

// ─── PATCH /favorite-stops/:id ───────────────────────────────────────────────
async function updateFavoriteStop(req: Request, id: string) {
  await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  let body: UpdateFavoriteStopRequest
  try {
    body = await req.json()
  } catch {
    throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400)
  }

  // 본인 row 존재 확인
  const { data: existing, error: findErr } = await db
    .from("favorite_stops")
    .select("id")
    .eq("id", id)
    .single()

  if (findErr || !existing) throw new AppError("즐겨찾기를 찾을 수 없습니다", 404)

  // D5: routes 빈 배열 reject
  if (body.routes !== undefined && body.routes.length === 0) {
    throw new AppError(
      "노선을 1개 이상 선택해 주세요. 즐겨찾기를 삭제하려면 DELETE를 사용하세요.",
      400,
      "FAVORITE_ROUTES_REQUIRED",
    )
  }

  // 업데이트 payload 구성
  const updatePayload: Record<string, unknown> = {}
  if (body.alias !== undefined) {
    const alias = normalizeAlias(body.alias)
    if (alias != null && alias.length > 20) {
      throw new AppError("별명은 20자 이내여야 합니다", 400)
    }
    updatePayload.alias = alias
  }
  if (body.displayOrder !== undefined) {
    if (body.displayOrder < 0) throw new AppError("displayOrder는 0 이상이어야 합니다", 400)
    updatePayload.display_order = body.displayOrder
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateErr } = await db
      .from("favorite_stops")
      .update(updatePayload)
      .eq("id", id)

    if (updateErr) throw new AppError("즐겨찾기 수정 실패", 500)
  }

  // routes 전체 교체 (트랜잭션 에뮬: delete → insert)
  if (body.routes !== undefined) {
    const { error: delErr } = await db
      .from("favorite_stop_routes")
      .delete()
      .eq("favorite_stop_id", id)

    if (delErr) throw new AppError("노선 삭제 실패", 500)

    const routePayloads = body.routes.map((r, idx) => ({
      favorite_stop_id: id,
      odsay_route_id: r.odsayRouteId,
      route_name: r.routeName,
      bus_type: r.busType ?? null,
      st_id: r.stId ?? null,
      bus_route_id: r.busRouteId ?? null,
      station_ord: r.stationOrd ?? null,
      station_name: r.stationName ?? null,
      gbis_route_id: r.gbisRouteId ?? null,
      gbis_sta_order: r.gbisStaOrder ?? null,
      provider: routeIdToProvider(r.odsayRouteId),
      display_order: idx,
    }))

    const { error: insertErr } = await db
      .from("favorite_stop_routes")
      .insert(routePayloads)

    if (insertErr) throw new AppError("노선 재저장 실패", 500)
  }

  const result = await fetchFavoriteStop(db, id)
  if (!result) throw new AppError("수정 후 조회 실패", 500)
  return result
}

// ─── DELETE /favorite-stops/:id ──────────────────────────────────────────────
async function deleteFavoriteStop(req: Request, id: string) {
  await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  const { data, error } = await db
    .from("favorite_stops")
    .delete()
    .eq("id", id)
    .select("id")

  if (error) throw new AppError("즐겨찾기 삭제 실패", 500)
  if (!data || data.length === 0) throw new AppError("즐겨찾기를 찾을 수 없습니다", 404)
}

// ─── URL 라우팅 ───────────────────────────────────────────────────────────────
function extractFavoriteId(pathname: string): string | undefined {
  const match = pathname.match(/\/favorite-stops\/([^/?#]+)/)
  return match?.[1]
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const id = extractFavoriteId(new URL(req.url).pathname)

    if (req.method === "GET" && !id) {
      const data = await listFavoriteStops(req)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (req.method === "POST" && !id) {
      const data = await createFavoriteStop(req)
      return new Response(JSON.stringify(data), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (req.method === "PATCH" && id) {
      const data = await updateFavoriteStop(req, id)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (req.method === "DELETE" && id) {
      await deleteFavoriteStop(req, id)
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    throw new AppError("지원하지 않는 요청입니다", 405)
  } catch (e) {
    return errorResponse(e, "favorite-stops")
  }
}

if (import.meta.main) Deno.serve(withErrorLogging(handler, "favorite-stops"))
