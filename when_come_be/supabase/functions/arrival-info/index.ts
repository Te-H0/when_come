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
    `?ServiceKey=${busApiKey()}&stId=${stId}&busRouteId=${busRouteId}&ord=${ord}&resultType=json`

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

// ─── arsId로 도착정보 조회 — getStationByUid 단일 호출 ─────────
async function findBusArrivalByArsId(
  busRouteId: string,
  arsId: string,
): Promise<BusArrivalResponse | null> {
  const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid` +
    `?ServiceKey=${busApiKey()}&arsId=${arsId}&resultType=json`

  const res = await fetch(url)
  if (!res.ok) throw new AppError("서울 버스 API 정류장 조회 실패", 502)

  const data: SeoulBusStationByUidResponse = await res.json()
  const match = (data?.msgBody?.itemList ?? []).find((item) => item.busRouteId === busRouteId)
  if (!match) return null

  return {
    routeName: match.busRouteAbrv,
    arrmsg1: match.arrmsg1,
    arrmsg2: match.arrmsg2,
    arrivalSec1: parseArrivalSec(match.traTime1),
    arrivalSec2: parseArrivalSec(match.traTime2),
  }
}

// ─── 서울 지하철 실시간 도착정보 — realtimeStationArrival ──────
// 서울 지하철 API quirk:
// - 끝의 "역" 접미사와 ODsay가 붙이는 "(별칭)" 부분은 받지 않음
// - 정규식으로 못 잡는 예외 케이스는 OVERRIDES에 명시 (발견 시 추가)
const SUBWAY_NAME_OVERRIDES: Record<string, string> = {}

export function normalizeSubwayStationName(stationName: string): string {
  if (stationName in SUBWAY_NAME_OVERRIDES) return SUBWAY_NAME_OVERRIDES[stationName]
  return stationName.replace(/\([^)]*\)/g, '').replace(/역$/, '').trim()
}

async function getSubwayArrival(stationName: string): Promise<SubwayArrivalItem[]> {
  const normalized = normalizeSubwayStationName(stationName)
  const encoded = encodeURIComponent(normalized)
  const url = `http://swopenapi.seoul.go.kr/api/subway/${subwayApiKey()}/json/realtimeStationArrival/0/10/${encoded}`

  const res = await fetch(url)
  if (!res.ok) throw new AppError("서울 지하철 API 연결 실패", 502)

  const data: SeoulSubwayApiResponse = await res.json()
  const list = data?.realtimeArrivalList ?? []

  if (list.length === 0) {
    console.warn(`[subway-arrival] empty result: input="${stationName}" normalized="${normalized}"`)
  }

  return list.map((item) => ({
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
      const arsId = searchParams.get("arsId")

      if (!busRouteId) {
        throw new AppError("bus 타입은 busRouteId 가 필요합니다", 400)
      }

      let data: BusArrivalResponse | null

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
