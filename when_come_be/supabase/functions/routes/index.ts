import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { authGuard } from "../_shared/auth.ts"
import { AppError, errorResponse } from "../_shared/error.ts"

// ─── 요청 DTO ──────────────────────────────────────────────────
interface StopRouteInput {
  odsayRouteId: string
  routeName: string
  stId?: string
  busRouteId?: string
  stationOrd?: number
  stationName?: string
}

interface RouteStopInput {
  odsayStopId: string
  stopName: string
  stopType: "bus" | "subway"
  sequence: number
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

// ─── 응답 DTO ──────────────────────────────────────────────────
interface CreateRouteResponse {
  id: string
}

interface DeleteRouteResponse {
  ok: true
}

interface PatchRouteResponse {
  ok: true
}

// ─── DB 클라이언트 ─────────────────────────────────────────────
// ANON_KEY + 사용자 JWT → RLS가 auth.uid() = user_id 를 직접 검증
function supabaseClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  )
}

// ─── GET /routes — 내 경로 목록 ────────────────────────────────
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
        id, odsay_stop_id, stop_name, stop_type, sequence,
        stop_routes (
          id, odsay_route_id, route_name,
          st_id, bus_route_id, station_ord, station_name
        )
      )
    `)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(50) // 사용자당 최대 50개

  if (error) throw new AppError("경로 조회 실패", 500)

  // route_stops는 sequence 오름차순 정렬 보장
  data?.forEach((route) => {
    route.route_stops?.sort(
      (a: { sequence: number }, b: { sequence: number }) => a.sequence - b.sequence,
    )
  })

  return data
}

// ─── POST /routes — 경로 저장 ──────────────────────────────────
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

  // 2. route_stops 생성
  const stopsPayload = stops.map((s) => ({
    route_id: route.id,
    odsay_stop_id: s.odsayStopId,
    stop_name: s.stopName,
    stop_type: s.stopType,
    sequence: s.sequence,
  }))

  const { data: insertedStops, error: stopsErr } = await db
    .from("route_stops")
    .insert(stopsPayload)
    .select("id, sequence")

  if (stopsErr || !insertedStops) throw new AppError("정류장 저장 실패", 500)

  // 3. stop_routes 생성
  const stopRoutePayload = insertedStops.flatMap((inserted) => {
    const original = stops.find((s) => s.sequence === inserted.sequence)
    return (original?.stopRoutes ?? []).map((sr) => ({
      stop_id: inserted.id,
      odsay_route_id: sr.odsayRouteId,
      route_name: sr.routeName,
      st_id: sr.stId ?? null,
      bus_route_id: sr.busRouteId ?? null,
      station_ord: sr.stationOrd ?? null,
      station_name: sr.stationName ?? null,
    }))
  })

  if (stopRoutePayload.length > 0) {
    const { error: srErr } = await db.from("stop_routes").insert(stopRoutePayload)
    if (srErr) throw new AppError("노선 저장 실패", 500)
  }

  return { id: route.id }
}

// ─── DELETE /routes/:id — 경로 삭제 (soft delete) ─────────────
async function deleteRoute(req: Request, id: string): Promise<DeleteRouteResponse> {
  const user = await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  const { data, error } = await db
    .from("routes")
    .update({ is_active: false })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")

  if (error) throw new AppError("경로 삭제 실패", 500)
  if (!data || data.length === 0) throw new AppError("경로를 찾을 수 없습니다", 404)
  return { ok: true }
}

// ─── PATCH /routes/:id — is_active 토글 ───────────────────────
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

// ─── URL 라우팅 ────────────────────────────────────────────────
// /routes 또는 /functions/v1/routes/:id 양쪽 경로 패턴 지원
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
