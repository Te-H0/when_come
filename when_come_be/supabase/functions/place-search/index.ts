import { corsHeaders } from "../_shared/cors.ts"
import { AppError, errorResponse } from "../_shared/error.ts"

interface NaverLocalItem {
  title: string
  address: string
  roadAddress: string
  mapx: string
  mapy: string
}

interface NaverLocalResponse {
  total: number
  items: NaverLocalItem[]
}

export interface PlaceResult {
  name: string
  address: string
  x: string
  y: string
}

function searchClientId(): string {
  const key = Deno.env.get("NAVER_SEARCH_CLIENT_ID")
  if (!key) throw new AppError("NAVER_SEARCH_CLIENT_ID not configured", 500)
  return key
}

function searchClientSecret(): string {
  const key = Deno.env.get("NAVER_SEARCH_CLIENT_SECRET")
  if (!key) throw new AppError("NAVER_SEARCH_CLIENT_SECRET not configured", 500)
  return key
}

// 네이버 Local Search의 mapx/mapy는 카텍(KTM) 좌표계 — WGS84로 변환
function katecToWgs84(mx: number, my: number): { x: string; y: string } {
  const x = (mx / 1e7).toFixed(7)
  const y = (my / 1e7).toFixed(7)
  return { x, y }
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "")
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "GET") throw new AppError("GET 요청만 허용됩니다", 405)

    const q = new URL(req.url).searchParams.get("q")
    if (!q?.trim()) throw new AppError("q 파라미터가 필요합니다", 400)

    const res = await fetch(
      `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=5`,
      {
        headers: {
          "X-Naver-Client-Id": searchClientId(),
          "X-Naver-Client-Secret": searchClientSecret(),
        },
      }
    )

    if (!res.ok) throw new AppError("네이버 장소 검색 API 오류", 502)

    const data = await res.json() as NaverLocalResponse
    const results: PlaceResult[] = data.items.map((item) => {
      const { x, y } = katecToWgs84(Number(item.mapx), Number(item.mapy))
      return {
        name: stripHtml(item.title),
        address: item.roadAddress || item.address,
        x,
        y,
      }
    })

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

if (import.meta.main) Deno.serve(handler)
