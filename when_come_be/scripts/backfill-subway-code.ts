/**
 * subway_code 백필 스크립트
 *
 * 용도: stop_routes / favorite_stop_routes 중 subway_code IS NULL인 지하철 노선 row에
 *       ODsay searchStation 결과로 subway_code를 채운다.
 *
 * 실행:
 *   deno run --allow-net --allow-env scripts/backfill-subway-code.ts > backfill.sql 2> failed.txt
 *
 * 환경변수:
 *   SUPABASE_URL              — Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role JWT (RLS 우회)
 *   ODSAY_API_KEY             — ODsay API 키
 */

import { odsaySubwayTypeToSubwayCode } from "../supabase/functions/_shared/odsayClient.ts"

// ─── 환경변수 검증 ────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const val = Deno.env.get(key)
  if (!val) {
    console.error(`[ERROR] 환경변수 ${key}가 설정되지 않았습니다.`)
    Deno.exit(1)
  }
  return val
}

const SUPABASE_URL = requireEnv("SUPABASE_URL")
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
const ODSAY_API_KEY = requireEnv("ODSAY_API_KEY")

const ODSAY_BASE_URL = "https://api.odsay.com/v1/api"

// ─── DB 헬퍼 ─────────────────────────────────────────────────────────────────

async function dbQuery<T>(sql: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/run_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "apikey": SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DB 쿼리 실패 (${res.status}): ${text}`)
  }

  return res.json() as Promise<T[]>
}

// ─── ODsay searchStation ──────────────────────────────────────────────────────

interface OdsayStationItem {
  stationID: number
  stationName: string
  type: number       // 호선 코드 (1=1호선, 2=2호선, ...)
  stationClass?: number
  laneName?: string  // "수도권 2호선" 등
}

async function searchOdsayStation(
  query: string,
): Promise<OdsayStationItem[]> {
  await new Promise((r) => setTimeout(r, 200))  // rate limit 방어

  const url =
    `${ODSAY_BASE_URL}/searchStation?lang=0&stationName=${encodeURIComponent(query)}&stationClass=2&apiKey=${encodeURIComponent(ODSAY_API_KEY)}`

  const res = await fetch(url, {
    headers: { Referer: "https://kifxccvqofsdyonbhmnc.supabase.co" },
  })

  if (!res.ok) {
    throw new Error(`ODsay HTTP 오류 ${res.status}`)
  }

  const data = await res.json()

  if (data.error) {
    const err = Array.isArray(data.error) ? data.error[0] : data.error
    const code = String(err.code ?? err.errorCode ?? "")
    if (code === "-98" || code === "-99") return []
    throw new Error(`ODsay 에러 [${code}]: ${err.message ?? ""}`)
  }

  const result = data.result
  if (
    !result || typeof result !== "object" || !("station" in result) ||
    !Array.isArray(result.station)
  ) {
    return []
  }

  return result.station as OdsayStationItem[]
}

// ─── 노선명 → subwayCode 매칭 ────────────────────────────────────────────────

/**
 * ODsay searchStation 결과 중 routeName과 laneName이 매칭되는 항목의 subwayCode를 반환한다.
 * laneName 예: "수도권 2호선", routeName 예: "2호선"
 * 매칭 우선순위: laneName에 routeName 포함 → type으로 변환
 */
function resolveSubwayCode(
  stations: OdsayStationItem[],
  routeName: string,
): string | null {
  // 숫자 호선 추출 (예: "2호선" → "2", "신분당선" → null)
  const lineNumMatch = routeName.match(/^(\d+)호선$/)

  for (const station of stations) {
    if (station.stationClass !== 2) continue

    // laneName 기반 매칭 (예: "수도권 2호선" ⊇ "2호선")
    if (station.laneName && station.laneName.includes(routeName)) {
      const code = odsaySubwayTypeToSubwayCode(station.type)
      if (code) return code
    }

    // 숫자 호선 매칭 (예: type=2 → "1002", routeName="2호선")
    if (lineNumMatch) {
      const lineNum = parseInt(lineNumMatch[1], 10)
      if (station.type === lineNum) {
        const code = odsaySubwayTypeToSubwayCode(station.type)
        if (code) return code
      }
    }
  }

  return null
}

// ─── 대상 row 타입 ────────────────────────────────────────────────────────────

interface TargetRow {
  row_id: string
  route_name: string
  stop_name: string
  odsay_stop_id: string | null
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  // 단계 1: 대상 row 조회
  const stopRoutesQuery = `
    SELECT sr.id AS row_id, sr.route_name, rs.stop_name, rs.odsay_stop_id
    FROM stop_routes sr
    JOIN route_stops rs ON rs.id = sr.stop_id
    WHERE rs.stop_type = 'subway' AND sr.subway_code IS NULL
  `

  const favStopRoutesQuery = `
    SELECT fsr.id AS row_id, fsr.route_name, fs.stop_name, fs.odsay_stop_id
    FROM favorite_stop_routes fsr
    JOIN favorite_stops fs ON fs.id = fsr.favorite_stop_id
    WHERE fs.stop_type = 'subway' AND fsr.subway_code IS NULL
  `

  let stopRouteRows: TargetRow[] = []
  let favStopRouteRows: TargetRow[] = []

  try {
    stopRouteRows = await dbQuery<TargetRow>(stopRoutesQuery)
    console.error(`[INFO] stop_routes 대상: ${stopRouteRows.length}행`)
  } catch (e) {
    console.error(`[ERROR] stop_routes 조회 실패: ${e instanceof Error ? e.message : e}`)
    Deno.exit(1)
  }

  try {
    favStopRouteRows = await dbQuery<TargetRow>(favStopRoutesQuery)
    console.error(`[INFO] favorite_stop_routes 대상: ${favStopRouteRows.length}행`)
  } catch (e) {
    console.error(`[ERROR] favorite_stop_routes 조회 실패: ${e instanceof Error ? e.message : e}`)
    Deno.exit(1)
  }

  // 단계 2: unique stop별 ODsay 조회 캐시
  const subwayCodeCache = new Map<string, OdsayStationItem[]>()  // stopName → stations

  async function getStations(stopName: string): Promise<OdsayStationItem[]> {
    if (subwayCodeCache.has(stopName)) {
      return subwayCodeCache.get(stopName)!
    }
    try {
      // ODsay에는 보통 "역" 없이 등록 — "역" 제거 시도도 병렬로
      const baseQuery = stopName.endsWith("역") ? stopName.slice(0, -1) : stopName
      const stations = await searchOdsayStation(baseQuery)
      subwayCodeCache.set(stopName, stations)
      return stations
    } catch (e) {
      console.error(
        `[WARN] ODsay 조회 실패 (${stopName}): ${e instanceof Error ? e.message : e}`,
      )
      subwayCodeCache.set(stopName, [])
      return []
    }
  }

  // 단계 3: stop_routes 처리
  for (const row of stopRouteRows) {
    const stations = await getStations(row.stop_name)
    const subwayCode = resolveSubwayCode(stations, row.route_name)

    if (subwayCode) {
      console.log(`UPDATE stop_routes SET subway_code = '${subwayCode}' WHERE id = '${row.row_id}';`)
    } else {
      console.error(
        `[FAILED] stop_routes id=${row.row_id} stop_name=${row.stop_name} route_name=${row.route_name}`,
      )
    }
  }

  // 단계 4: favorite_stop_routes 처리
  for (const row of favStopRouteRows) {
    const stations = await getStations(row.stop_name)
    const subwayCode = resolveSubwayCode(stations, row.route_name)

    if (subwayCode) {
      console.log(
        `UPDATE favorite_stop_routes SET subway_code = '${subwayCode}' WHERE id = '${row.row_id}';`,
      )
    } else {
      console.error(
        `[FAILED] favorite_stop_routes id=${row.row_id} stop_name=${row.stop_name} route_name=${row.route_name}`,
      )
    }
  }

  console.error(`[INFO] 완료. stdout에 UPDATE SQL이 출력되었습니다.`)
}

main()
