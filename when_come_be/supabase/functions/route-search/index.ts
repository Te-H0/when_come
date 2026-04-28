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
  busType: number | null   // ODsay 버스 노선 타입 (1:간선 2:지선 3:순환 4:광역 5:공항 6:마을)
  subwayCode: string | null  // 서울 지하철 API subwayId 형식 ("1002" = 2호선)
}

// ODsay subwayCode → 서울 지하철 API subwayId 매핑
const SUBWAY_CODE_MAP: Record<number, string> = {
  1: "1001", 2: "1002", 3: "1003", 4: "1004", 5: "1005",
  6: "1006", 7: "1007", 8: "1008", 9: "1009",
  21: "1065", // 공항철도
  22: "1063", // 경의중앙선
  23: "1067", // 경춘선
  24: "1071", // 에버라인
  25: "1075", // 수인분당선
  26: "1077", // 신분당선
  29: "1092", // 우이신설선
  31: "1081", // 경강선
  32: "1093", // 서해선
}

function toSeoulSubwayId(code: number | undefined): string | null {
  if (code == null) return null
  return SUBWAY_CODE_MAP[code] ?? null
}

interface RouteSegment {
  type: "subway" | "bus"
  sectionMinutes: number
  startName: string
  startOdsayId: number | null
  startArsId: string | null
  endName: string
  endOdsayId: number | null
  endArsId: string | null
  way: string | null        // 노선 종점역명 (지하철 only, 버스는 항상 null)
  wayCode: 1 | 2 | null    // 1=상행/내선, 2=하행/외선 (지하철 only, 버스는 항상 null)
  lines: RouteSegmentLine[]
}

interface RouteSearchResult {
  id: string
  pathType: number | null
  totalMinutes: number | null
  totalWalkMeters: number | null
  totalDistanceMeters: number | null
  paymentWon: number | null
  busTransferCount: number | null
  subwayTransferCount: number | null
  totalTransferCount: number | null
  totalStationCount: number | null
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

    const results: RouteSearchResult[] = paths.map((path, i) => {
      const busTransferCount = path.info.busTransitCount ?? null
      const subwayTransferCount = path.info.subwayTransitCount ?? null
      const totalTransferCount =
        busTransferCount !== null || subwayTransferCount !== null
          ? (busTransferCount ?? 0) + (subwayTransferCount ?? 0)
          : 0

      return {
        id: String(i),
        pathType: path.pathType ?? null,
        totalMinutes: path.info.totalTime ?? null,
        totalWalkMeters: path.info.totalWalk ?? null,
        totalDistanceMeters: path.info.totalDistance ?? null,
        paymentWon: path.info.payment ?? null,
        busTransferCount,
        subwayTransferCount,
        totalTransferCount,
        totalStationCount: path.info.totalStationCount ?? null,
        segments: path.subPath
        .filter((sub) => sub.trafficType !== 3)
        .map((sub): RouteSegment => {
          const isSubway = sub.trafficType === 1
          return {
            type: isSubway ? "subway" : "bus",
            sectionMinutes: sub.sectionTime,
            startName: sub.startName ?? "",
            startOdsayId: sub.startID ?? null,
            startArsId: sub.startArsID || null,
            endName: sub.endName ?? "",
            endOdsayId: sub.endID ?? null,
            endArsId: sub.endArsID || null,
            way: isSubway ? (sub.way ?? null) : null,
            wayCode: isSubway
              ? (sub.wayCode === 1 || sub.wayCode === 2 ? sub.wayCode : null)
              : null,
            lines: sub.lane?.map((l): RouteSegmentLine => ({
              routeName: l.name ?? l.busNo ?? "",
              busRouteId: l.busLocalBlID ?? null,
              busType: l.type ?? null,
              subwayCode: toSeoulSubwayId(l.subwayCode),
            })) ?? [],
          }
        }),
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
