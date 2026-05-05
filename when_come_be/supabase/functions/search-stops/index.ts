import { corsHeaders } from "../_shared/cors.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { searchStation, type OdsayStation } from "../_shared/odsayClient.ts"

// ─── 서울 버스 API: getStationByUid 응답 타입 ───────────────────────────────
interface SeoulBusStationByUidItem {
  stNm: string   // 정류장명
  arsId: string  // ARS 번호
}

interface SeoulBusStationByUidResponse {
  msgBody?: { itemList?: SeoulBusStationByUidItem[] }
}

function isSeoulBusStationByUidResponse(val: unknown): val is SeoulBusStationByUidResponse {
  return typeof val === "object" && val !== null && "msgBody" in val
}

function seoulBusApiKey(): string {
  const key = Deno.env.get("SEOUL_BUS_API_KEY")
  if (!key) throw new AppError("SEOUL_BUS_API_KEY not configured", 500)
  return key
}

// ─── ARS 번호로 서울버스 API 정류장 조회 ────────────────────────────────────
async function fetchStationNameByArsId(arsId: string): Promise<string | null> {
  const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid` +
    `?ServiceKey=${seoulBusApiKey()}&arsId=${arsId}&resultType=json`

  const res = await fetch(url)
  if (!res.ok) return null  // 서울버스 API 실패 → fallback

  const raw: unknown = await res.json()
  if (!isSeoulBusStationByUidResponse(raw)) return null

  const item = raw.msgBody?.itemList?.[0]
  return item?.stNm ?? null
}

// ─── ARS 번호 검색: 서울버스 → ODsay 이름 검색 → arsId 매칭 ──────────────────
async function searchByArsId(arsId: string): Promise<OdsayStation[]> {
  const stNm = await fetchStationNameByArsId(arsId).catch(() => null)

  // 서울버스 API 실패 또는 결과 없음 → 이름 검색 fallback
  const query = stNm ?? arsId
  const stations = await searchStation(query)

  if (!stNm) return stations  // fallback: 이름 없으면 ODsay 결과 그대로

  // arsId 일치 항목 우선, 없으면 이름 일치 항목 반환
  const arsMatch = stations.filter((s) => s.arsID === arsId)
  if (arsMatch.length > 0) return arsMatch

  return stations.filter((s) => s.stationName === stNm)
}

// ─── 핸들러 ─────────────────────────────────────────────────────────────────
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "GET") throw new AppError("GET 요청만 허용됩니다", 405)

    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()
    if (!q) throw new AppError("q 파라미터가 필요합니다", 400)

    // 4~6자리 숫자이면 ARS 번호 검색, 아니면 기존 이름 검색
    const isArsId = /^\d{4,6}$/.test(q)
    const stations = isArsId ? await searchByArsId(q) : await searchStation(q)

    const data = stations.map((s) => ({
      id: String(s.stationID),
      name: s.stationName,
      type: s.type === 2 ? "subway" : "bus",
      lat: s.y,
      lng: s.x,
      arsId: s.arsID || null,
    }))

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

if (import.meta.main) Deno.serve(handler)
