import { corsHeaders } from "../_shared/cors.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { withErrorLogging } from "../_shared/middleware.ts"
import type {
  StopErrorCode,
  CommonErrorCode,
} from "../_shared/errorCodes.ts"

interface SeoulBusRouteItem {
  busRouteId: string
  busRouteAbrv: string
  busRouteNm: string
  busRouteType: string
  stBegin: string
  stEnd: string
}

interface SeoulBusRouteResponse {
  msgBody?: { itemList?: SeoulBusRouteItem[] }
}

export interface StopRoute {
  busRouteId: string
  routeName: string
  busRouteType: number | null
  startStation: string | null
  endStation: string | null
}

function busApiKey(): string {
  const key = Deno.env.get("SEOUL_BUS_API_KEY")
  if (!key) throw new AppError("SEOUL_BUS_API_KEY not configured", 500)
  return key
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "GET") throw new AppError("GET 요청만 허용됩니다", 405, "COMMON_METHOD_NOT_ALLOWED" satisfies CommonErrorCode)

    const arsId = new URL(req.url).searchParams.get("arsId")
    if (!arsId?.trim()) throw new AppError("arsId 파라미터가 필요합니다", 400, "STOP_QUERY_REQUIRED" satisfies StopErrorCode)

    const url = `http://ws.bus.go.kr/api/rest/stationinfo/getRouteByStation` +
      `?serviceKey=${busApiKey()}&arsId=${arsId}&resultType=json`

    const res = await fetch(url)
    if (!res.ok) throw new AppError("서울 버스 API 연결 실패", 502, "STOP_PROVIDER_ERROR" satisfies StopErrorCode)

    const data: SeoulBusRouteResponse = await res.json()
    const items = data?.msgBody?.itemList ?? []

    const seen = new Set<string>()
    const routes: StopRoute[] = items
      .map((item) => ({
        busRouteId: item.busRouteId,
        routeName: item.busRouteAbrv || item.busRouteNm,
        busRouteType: item.busRouteType ? Number(item.busRouteType) : null,
        startStation: item.stBegin || null,
        endStation: item.stEnd || null,
      }))
      .filter((r) => {
        if (seen.has(r.busRouteId)) return false
        seen.add(r.busRouteId)
        return true
      })

    return new Response(JSON.stringify(routes), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return errorResponse(e, "stop-routes")
  }
}

if (import.meta.main) Deno.serve(withErrorLogging(handler, "stop-routes"))
