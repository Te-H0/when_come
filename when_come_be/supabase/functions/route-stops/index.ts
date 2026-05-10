import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { authGuard } from "../_shared/auth.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { withErrorLogging } from "../_shared/middleware.ts"
import type {
  RouteStopErrorCode,
  CommonErrorCode,
} from "../_shared/errorCodes.ts"

// ─── 요청 DTO ──────────────────────────────────────────────────────────────
interface UpdateRouteStopRequest {
  alias?: string | null
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

// ─── alias 정규화 ─────────────────────────────────────────────────────────────
function normalizeAlias(alias?: string | null): string | null {
  if (alias == null) return null
  const trimmed = alias.trim()
  return trimmed.length === 0 ? null : trimmed
}

// ─── PATCH /route-stops/:id ──────────────────────────────────────────────────
async function patchRouteStop(req: Request, id: string) {
  await authGuard(req)
  const db = supabaseClient(req.headers.get("Authorization")!)

  let body: UpdateRouteStopRequest
  try {
    body = await req.json()
  } catch {
    throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400, "COMMON_INVALID_JSON" satisfies CommonErrorCode)
  }

  const alias = normalizeAlias(body.alias)
  if (alias != null && alias.length > 20) {
    throw new AppError("별명은 20자 이내여야 합니다", 400, "ROUTE_STOP_ALIAS_TOO_LONG" satisfies RouteStopErrorCode)
  }

  // route_stop 존재 확인 (RLS: 부모 routes.user_id = auth.uid() 검증)
  const { data: existing, error: findErr } = await db
    .from("route_stops")
    .select("id, route_id, routes!inner(user_id)")
    .eq("id", id)
    .single()

  if (findErr || !existing) throw new AppError("정류장을 찾을 수 없습니다", 404, "ROUTE_STOP_NOT_FOUND" satisfies RouteStopErrorCode)

  // alias 업데이트
  const { data: updated, error: updateErr } = await db
    .from("route_stops")
    .update({ alias })
    .eq("id", id)
    .select(`
      id, route_id, step_group, sequence,
      odsay_stop_id, stop_name, stop_type, ars_id,
      direction_headsign, direction_updn, direction_next_stop,
      provider, gbis_station_id, alias,
      stop_routes (
        id, odsay_route_id, route_name, bus_type,
        st_id, bus_route_id, station_ord, station_name,
        gbis_route_id, gbis_sta_order, provider
      )
    `)
    .single()

  if (updateErr || !updated) throw new AppError("정류장 수정 실패", 500, "ROUTE_STOP_UPDATE_FAILED" satisfies RouteStopErrorCode)
  return updated
}

// ─── URL 라우팅 ───────────────────────────────────────────────────────────────
function extractRouteStopId(pathname: string): string | undefined {
  const match = pathname.match(/\/route-stops\/([^/?#]+)/)
  return match?.[1]
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const id = extractRouteStopId(new URL(req.url).pathname)

    if (req.method === "PATCH" && id) {
      const data = await patchRouteStop(req, id)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    throw new AppError("지원하지 않는 요청입니다", 405, "COMMON_METHOD_NOT_ALLOWED" satisfies CommonErrorCode)
  } catch (e) {
    return errorResponse(e, "route-stops")
  }
}

if (import.meta.main) Deno.serve(withErrorLogging(handler, "route-stops"))
