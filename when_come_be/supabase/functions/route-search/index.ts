import { corsHeaders } from "../_shared/cors.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { searchPubTransPath } from "../_shared/odsayClient.ts"

// ─── 요청/응답 DTO ──────────────────────────────────────────────
interface RouteSearchRequest {
  startX: number
  startY: number
  endX: number
  endY: number
}

interface RouteSegmentLine {
  routeName: string
  busRouteId: string | null
  subwayCode: number | null
}

interface RouteSegment {
  type: "subway" | "bus"
  sectionMinutes: number
  startName: string
  endName: string
  lines: RouteSegmentLine[]
}

interface RouteSearchResult {
  id: string
  totalMinutes: number
  transferCount: number
  segments: RouteSegment[]
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "POST") throw new AppError("POST 요청만 허용됩니다", 405)

    let body: RouteSearchRequest
    try {
      body = await req.json()
    } catch {
      throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400)
    }

    const { startX, startY, endX, endY } = body

    if (!startX || !startY || !endX || !endY) {
      throw new AppError("startX, startY, endX, endY 가 모두 필요합니다", 400)
    }

    const paths = await searchPubTransPath(startX, startY, endX, endY)

    const results: RouteSearchResult[] = paths.map((path, i) => ({
      id: String(i),
      totalMinutes: path.info.totalTime,
      transferCount: path.info.transferCount,
      segments: path.subPath
        .filter((sub) => sub.trafficType !== 3)
        .map((sub): RouteSegment => ({
          type: sub.trafficType === 1 ? "subway" : "bus",
          sectionMinutes: sub.sectionTime,
          startName: sub.startName ?? "",
          endName: sub.endName ?? "",
          lines: sub.lane?.map((l): RouteSegmentLine => ({
            routeName: l.name ?? l.busNo ?? "",
            busRouteId: l.busLocalBlID ?? null,
            subwayCode: l.subwayCode ?? null,
          })) ?? [],
        })),
    }))

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

if (import.meta.main) Deno.serve(handler)
