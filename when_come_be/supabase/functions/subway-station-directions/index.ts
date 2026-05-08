import { corsHeaders } from "../_shared/cors.ts"
import { authGuard } from "../_shared/auth.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { withErrorLogging } from "../_shared/middleware.ts"
import {
  subwayStationInfo,
  odsaySubwayTypeToSubwayCode,
  type OdsaySubwayStationInfo,
} from "../_shared/odsayClient.ts"

// ─── 응답 타입 ──────────────────────────────────────────────────────────────

interface DirectionItem {
  updn: "up" | "down"
  nextStop: string
}

interface SubwayStationDirectionsResponse {
  stationName: string
  lineName: string | null
  subwayCode: string | null
  directions: DirectionItem[]
}

// ─── wayCode → updn 변환 ────────────────────────────────────────────────────
// ODsay wayCode: 1 = 상행/내선, 2 = 하행/외선
function wayCodeToUpdn(wayCode: number): "up" | "down" {
  return wayCode === 1 ? "up" : "down"
}

// ─── directions 파서 ─────────────────────────────────────────────────────────
// ODsay subwayStationInfo 응답은 두 가지 포맷이 확인됨:
//
// 포맷 A (wayList 배열): station.wayList[{ wayCode, prevOBJ, nextOBJ }]
//   - wayCode=1(상행/내선): nextOBJ = 해당 방향 다음 역
//   - wayCode=2(하행/외선): nextOBJ = 해당 방향 다음 역
//   - nextOBJ 없고 prevOBJ만 있는 경우(종점/일부 역): prevOBJ를 해당 way 방향 역으로 fallback
//   - wayList 파싱 후 0건이면 포맷 B로 추가 fallback
//
// 포맷 B (단일 prevOBJ/nextOBJ): station.prevOBJ, station.nextOBJ
//   - wayCode 정보 없으므로 up/down 추정 불가 — up/down 순서로 2건 반환
function extractDirections(station: OdsaySubwayStationInfo): DirectionItem[] {
  const directions: DirectionItem[] = []

  // 포맷 A: wayList 있는 경우
  if (Array.isArray(station.wayList) && station.wayList.length > 0) {
    for (const way of station.wayList) {
      const updn = wayCodeToUpdn(way.wayCode)
      if (way.nextOBJ?.stationName) {
        // 정상: nextOBJ가 해당 방향으로 진행 시 다음 역
        directions.push({ updn, nextStop: way.nextOBJ.stationName })
      } else if (way.prevOBJ?.stationName) {
        // fallback: nextOBJ 없고 prevOBJ만 있는 경우 (종점 인접역 등)
        directions.push({ updn, nextStop: way.prevOBJ.stationName })
      }
    }
    // wayList가 있어도 방향을 하나도 추출 못한 경우 → 포맷 B로 추가 시도
    if (directions.length > 0) return directions
  }

  // 포맷 B: 단일 prevOBJ/nextOBJ
  // prevOBJ = 역방향 기준 이전 역, nextOBJ = 진행 방향 다음 역
  // wayCode 없으므로: prevOBJ → up, nextOBJ → down 으로 할당
  if (station.prevOBJ?.stationName) {
    directions.push({ updn: "up", nextStop: station.prevOBJ.stationName })
  }
  if (station.nextOBJ?.stationName) {
    directions.push({ updn: "down", nextStop: station.nextOBJ.stationName })
  }

  return directions
}

// ─── 핸들러 ─────────────────────────────────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "GET") throw new AppError("GET 요청만 허용됩니다", 405)

    await authGuard(req)

    const { searchParams } = new URL(req.url)
    const stationId = searchParams.get("stationId")?.trim()
    if (!stationId) throw new AppError("stationId 파라미터가 필요합니다", 400)

    const info = await subwayStationInfo(stationId)

    if (!info) {
      throw new AppError("역 정보를 찾을 수 없습니다", 404)
    }

    const directions = extractDirections(info)

    const response: SubwayStationDirectionsResponse = {
      stationName: info.stationName,
      lineName: info.laneName ?? null,
      subwayCode: info.subwayCode != null
        ? (odsaySubwayTypeToSubwayCode(info.subwayCode) ?? null)
        : null,
      directions,
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return errorResponse(e, "subway-station-directions")
  }
}

if (import.meta.main) Deno.serve(withErrorLogging(handler, "subway-station-directions"))
