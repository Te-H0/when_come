import { corsHeaders } from "../_shared/cors.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { realtimeStation } from "../_shared/odsayClient.ts"

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

// ─── 서울 버스 API 원시 응답 타입 ──────────────────────────────
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

interface SeoulBusRouteStationItem {
  stationNm: string
  stId: string
  arsId: string
  seq: string
}

interface SeoulBusRouteStationApiResponse {
  msgBody?: {
    itemList?: SeoulBusRouteStationItem[]
  }
}

// ─── 서울 지하철 API 원시 응답 타입 ────────────────────────────
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

// ─── 응답 DTO ──────────────────────────────────────────────────
export interface BusArrivalResponse {
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

// ─── 서울 버스 도착정보 — getArrInfoByRoute ───────────────────
async function getBusArrival(
  stId: string,
  busRouteId: string,
  ord: string,
): Promise<BusArrivalResponse | null> {
  const url = `http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRoute` +
    `?serviceKey=${busApiKey()}&stId=${stId}&busRouteId=${busRouteId}&ord=${ord}&resultType=json`

  const res = await fetch(url)
  if (!res.ok) throw new AppError("서울 버스 API 도착정보 조회 실패", 502)

  const data: SeoulBusApiResponse = await res.json()
  const item = data?.msgBody?.itemList?.[0]
  if (!item) return null

  return {
    routeName: item.busRouteAbrv,
    arrmsg1: item.arrmsg1,
    arrmsg2: item.arrmsg2,
    arrivalSec1: parseArrivalSec(item.traTime1),
    arrivalSec2: parseArrivalSec(item.traTime2),
  }
}

// ─── busRouteId + 정류장명으로 stId / ord 조회 ────────────────
async function resolveStationFromRoute(
  busRouteId: string,
  stationName: string,
): Promise<{ stId: string; ord: string } | null> {
  const url = `http://ws.bus.go.kr/api/rest/busRouteInfo/getRouteAllStaionList` +
    `?serviceKey=${busApiKey()}&busRouteId=${busRouteId}&resultType=json`

  const res = await fetch(url)
  if (!res.ok) throw new AppError("서울 버스 API 노선 정류장 조회 실패", 502)

  const data: SeoulBusRouteStationApiResponse = await res.json()
  const items = data?.msgBody?.itemList ?? []
  const match = items.find((item) => item.stationNm === stationName)
  if (!match) return null
  return { stId: match.stId, ord: match.seq }
}

// ─── 서울 지하철 실시간 도착정보 — realtimeStationArrival ──────
async function getSubwayArrival(stationName: string): Promise<SubwayArrivalItem[]> {
  const encoded = encodeURIComponent(stationName)
  const url = `http://swopenapi.seoul.go.kr/api/subway/${subwayApiKey()}/json/realtimeStationArrival/0/10/${encoded}`

  const res = await fetch(url)
  if (!res.ok) throw new AppError("서울 지하철 API 연결 실패", 502)

  const data: SeoulSubwayApiResponse = await res.json()

  return (data?.realtimeArrivalList ?? []).map((item) => ({
    lineName: item.subwayId,
    direction: item.trainLineNm,
    arrmsg1: item.arvlMsg2,
    arrmsg2: item.arvlMsg3,
    updnLine: item.updnLine,
  }))
}

function parseArrivalSec(val: unknown): number | null {
  const n = Number(val)
  return !isNaN(n) && n > 0 ? n : null
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "GET") throw new AppError("GET 요청만 허용됩니다", 405)

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")

    if (type === "bus") {
      const busRouteId = searchParams.get("busRouteId")
      const stId = searchParams.get("stId")
      const ord = searchParams.get("ord")
      const stationName = searchParams.get("stationName")

      if (!busRouteId) {
        throw new AppError("bus 타입은 busRouteId 가 필요합니다", 400)
      }

      let resolvedStId = stId
      let resolvedOrd = ord

      if (!resolvedStId || !resolvedOrd) {
        if (!stationName) {
          throw new AppError("bus 타입은 stId+ord 또는 stationName 이 필요합니다", 400)
        }
        const found = await resolveStationFromRoute(busRouteId, stationName)
        if (!found) throw new AppError("해당 노선에서 정류장을 찾을 수 없습니다", 404)
        resolvedStId = found.stId
        resolvedOrd = found.ord
      }

      const data = await getBusArrival(resolvedStId, busRouteId, resolvedOrd)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (type === "subway") {
      const stationName = searchParams.get("stationName")
      if (!stationName) throw new AppError("subway 타입은 stationName 이 필요합니다", 400)
      const data = await getSubwayArrival(stationName)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (type === "odsay") {
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
