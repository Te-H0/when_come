import { corsHeaders } from "../_shared/cors.ts"
import { authGuard } from "../_shared/auth.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { withErrorLogging } from "../_shared/middleware.ts"
import { logAnomaly } from "../_shared/anomaly.ts"
import {
  subwayStationInfo,
  searchSubwaySchedule,
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

// ─── 인접역 이름 추출 헬퍼 ──────────────────────────────────────────────────
// ODsay prevOBJ/nextOBJ 실제 구조: { station: [{ stationName, stationID, ... }] }
function stationRefName(ref: { station: Array<{ stationName: string }> } | undefined): string | null {
  return ref?.station?.[0]?.stationName ?? null
}

// ─── directions 파서 ─────────────────────────────────────────────────────────
// ODsay subwayStationInfo 응답은 두 가지 포맷이 확인됨:
//
// 포맷 A (wayList 배열): station.wayList[{ wayCode, prevOBJ, nextOBJ }]
//   - wayCode=1(상행/내선): nextOBJ.station[0].stationName = 해당 방향 다음 역
//   - wayCode=2(하행/외선): nextOBJ.station[0].stationName = 해당 방향 다음 역
//   - nextOBJ 없고 prevOBJ만 있는 경우(종점/일부 역): prevOBJ를 fallback
//   - wayList 파싱 후 0건이면 포맷 B로 추가 fallback
//
// 포맷 B (단일 prevOBJ/nextOBJ): station.prevOBJ, station.nextOBJ (배열 래퍼)
//   - wayCode 정보 없으므로 up/down 추정 불가 — up/down 순서로 2건 반환
function extractDirections(station: OdsaySubwayStationInfo): DirectionItem[] {
  const directions: DirectionItem[] = []

  // 포맷 A: wayList 있는 경우
  if (Array.isArray(station.wayList) && station.wayList.length > 0) {
    for (const way of station.wayList) {
      const updn = wayCodeToUpdn(way.wayCode)
      const nextName = stationRefName(way.nextOBJ)
      if (nextName) {
        // 정상: nextOBJ가 해당 방향으로 진행 시 다음 역
        directions.push({ updn, nextStop: nextName })
      } else {
        // fallback: nextOBJ 없고 prevOBJ만 있는 경우 (종점 인접역 등)
        const prevName = stationRefName(way.prevOBJ)
        if (prevName) directions.push({ updn, nextStop: prevName })
      }
    }
    // wayList가 있어도 방향을 하나도 추출 못한 경우 → 포맷 B로 추가 시도
    if (directions.length > 0) return directions
  }

  // 포맷 B: 단일 prevOBJ/nextOBJ (배열 래퍼 구조)
  // prevOBJ = 상행/내선 방향 인접역, nextOBJ = 하행/외선 방향 인접역
  // wayCode 없으므로: prevOBJ → up, nextOBJ → down 으로 할당
  const prevName = stationRefName(station.prevOBJ)
  if (prevName) directions.push({ updn: "up", nextStop: prevName })

  const nextName = stationRefName(station.nextOBJ)
  if (nextName) directions.push({ updn: "down", nextStop: nextName })

  return directions
}

// ─── schedule fallback에서 directions 추출 ──────────────────────────────────
// searchSubwaySchedule 응답에는 result 레벨에 prevOBJ/nextOBJ(인접역 배열 래퍼)가 포함됨.
// 이를 1차로 사용 — subwayStationInfo와 동일 구조이므로 stationRefName() 재사용.
// prevOBJ/nextOBJ 없는 경우에만 weekdaySchedule.up[0].endStationName으로 추가 fallback.
// 단, 순환선(2호선 등)은 endStationName이 편향적이므로 신뢰도 낮음.
async function extractDirectionsFromSchedule(stationId: string): Promise<DirectionItem[]> {
  const schedule = await searchSubwaySchedule(stationId)
  const directions: DirectionItem[] = []

  // 1차: schedule result 레벨 prevOBJ/nextOBJ (인접역)
  const prevName = stationRefName(schedule.prevOBJ)
  if (prevName) directions.push({ updn: "up", nextStop: prevName })

  const nextName = stationRefName(schedule.nextOBJ)
  if (nextName) directions.push({ updn: "down", nextStop: nextName })

  if (directions.length > 0) return directions

  // 2차 fallback: weekdaySchedule의 endStationName (순환선 등에서 부정확할 수 있음)
  const upEnd = schedule.up?.[0]?.endStationName
  if (upEnd) directions.push({ updn: "up", nextStop: upEnd })

  const downEnd = schedule.down?.[0]?.endStationName
  if (downEnd) directions.push({ updn: "down", nextStop: downEnd })

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

    // info가 null인 경우(ODsay invalid station 응답)도 schedule fallback을 시도한다.
    // ODsay searchStation이 인정한 stationId라도 subwayStationInfo가 invalid를 반환하는 케이스가 있음.
    if (info === null) {
      // schedule fallback으로 방향 정보 추출 시도
      const directions = await extractDirectionsFromSchedule(stationId)
      if (directions.length === 0) {
        // schedule도 빈 응답 → 진짜 invalid station
        throw new AppError("역 정보를 찾을 수 없습니다", 404)
      }
      // schedule에서 방향 추출 성공 — stationName/lineName/subwayCode는 null로 반환
      logAnomaly({
        source: "subway-station-directions",
        category: "pattern.subway_directions_info_null_schedule_fallback",
        detail: { stationId, directionsFromSchedule: directions.length },
      })
      const response: SubwayStationDirectionsResponse = {
        stationName: "",
        lineName: null,
        subwayCode: null,
        directions,
      }
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    let directions = extractDirections(info)

    // subwayStationInfo에서 directions 0건 → searchSubwaySchedule fallback
    if (directions.length === 0) {
      logAnomaly({
        source: "subway-station-directions",
        category: "pattern.subway_directions_schedule_fallback",
        detail: {
          stationId,
          stationName: info.stationName,
          hasWayList: Array.isArray(info.wayList),
          wayListLength: info.wayList?.length ?? 0,
          hasPrevOBJ: !!info.prevOBJ,
          hasNextOBJ: !!info.nextOBJ,
        },
      })
      directions = await extractDirectionsFromSchedule(stationId)
    }

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
