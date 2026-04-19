import { corsHeaders } from "../_shared/cors.ts"
import { AppError, errorResponse } from "../_shared/error.ts"

interface SeoulBusRouteItem {
  busRouteId: string
  busRouteAbrv: string
  stId: string
  stOrd: string
  busRouteNm: string
}

interface SeoulBusRouteResponse {
  msgBody?: { itemList?: SeoulBusRouteItem[] }
}

export interface StopRoute {
  odsayRouteId: string | null
  routeName: string
  stId: string
  busRouteId: string
  stationOrd: number
}

function busApiKey(): string {
  const key = Deno.env.get("SEOUL_BUS_API_KEY")
  if (!key) throw new AppError("SEOUL_BUS_API_KEY not configured", 500)
  return key
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "GET") throw new AppError("GET 요청만 허용됩니다", 405)

    const arsId = new URL(req.url).searchParams.get("arsId")
    if (!arsId?.trim()) throw new AppError("arsId 파라미터가 필요합니다", 400)

    const url = `http://ws.bus.go.kr/api/rest/stationinfo/getRouteByStation` +
      `?serviceKey=${busApiKey()}&arsId=${arsId}&resultType=json`

    const res = await fetch(url)
    if (!res.ok) throw new AppError("서울 버스 API 연결 실패", 502)

    const data: SeoulBusRouteResponse = await res.json()
    const items = data?.msgBody?.itemList ?? []

    const routes: StopRoute[] = items.map((item) => ({
      odsayRouteId: null,
      routeName: item.busRouteAbrv || item.busRouteNm,
      stId: item.stId,
      busRouteId: item.busRouteId,
      stationOrd: Number(item.stOrd),
    }))

    return new Response(JSON.stringify(routes), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

if (import.meta.main) Deno.serve(handler)
