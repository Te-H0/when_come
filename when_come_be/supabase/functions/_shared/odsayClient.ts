import { AppError } from "./error.ts"

const ODSAY_BASE_URL = "https://api.odsay.com/v1/api"

function apiKey(): string {
  const key = Deno.env.get("ODSAY_API_KEY")
  if (!key) throw new AppError("ODSAY_API_KEY not configured", 500)
  return encodeURIComponent(key)
}

async function odsayFetch(path: string): Promise<unknown> {
  // URI 플랫폼 키는 Referer 헤더로 도메인 인증
  const res = await fetch(`${ODSAY_BASE_URL}${path}`, {
    headers: { Referer: "https://kifxccvqofsdyonbhmnc.supabase.co" },
  })
  if (!res.ok) throw new AppError("ODsay 연결 실패", 502)

  const data = await res.json()

  // ODsay 에러는 배열 형태: { "error": [{ "code": "...", "message": "..." }] }
  if (data.error) {
    const err = Array.isArray(data.error) ? data.error[0] : data.error
    const code = String(err.code ?? err.errorCode ?? "")
    if (code === "-98" || code === "-99") return null
    if (code === "-8") throw new AppError("ODsay: 파라미터 형식 오류", 400)
    if (code === "-9") throw new AppError("ODsay: 필수 파라미터 누락", 400)
    throw new AppError(`ODsay 오류 [${code}]: ${err.message ?? ""}`, 502)
  }
  return data.result
}

// ─── 타입 가드 — as 단언 대신 구조 검사 ────────────────────────
function hasStation(val: unknown): val is { station: OdsayStation[] } {
  return val !== null && typeof val === "object" && "station" in val &&
    Array.isArray((val as Record<string, unknown>)["station"])
}

function hasReal(val: unknown): val is { real: OdsayArrival[] } {
  return val !== null && typeof val === "object" && "real" in val &&
    Array.isArray((val as Record<string, unknown>)["real"])
}

function hasPath(val: unknown): val is { path: OdsayPath[] } {
  return val !== null && typeof val === "object" && "path" in val &&
    Array.isArray((val as Record<string, unknown>)["path"])
}

// ─── 도메인 타입 ────────────────────────────────────────────────
export interface OdsayStation {
  stationID: number
  stationName: string
  x: number
  y: number
  type: number    // 1: 버스, 2: 지하철
  arsID: string
}

export interface OdsayArrival {
  routeID: string
  routeName: string
  arrivalTime1: number
  arrivalTime2: number | null
  type: number    // 1: 버스, 2: 지하철
}

export interface OdsayLane {
  // 버스
  busNo?: string
  busID?: string
  busLocalBlID?: string   // 서울 버스 API busRouteId
  type?: number
  // 지하철
  name?: string
  subwayCode?: number
  subwayExCode?: number
}

export interface OdsaySubPath {
  trafficType: number   // 1: 지하철, 2: 버스, 3: 도보
  sectionTime: number
  startName?: string
  endName?: string
  lane?: OdsayLane[]
}

export interface OdsayPath {
  pathType: number
  info: { totalTime: number; transferCount: number }
  subPath: OdsaySubPath[]
}

// ─── API 함수 ───────────────────────────────────────────────────
export async function searchStation(query: string): Promise<OdsayStation[]> {
  const result = await odsayFetch(
    `/searchStation?lang=0&stationName=${encodeURIComponent(query)}&apiKey=${apiKey()}`,
  )
  return hasStation(result) ? result.station : []
}

export async function realtimeStation(stationId: string): Promise<OdsayArrival[]> {
  const result = await odsayFetch(
    `/realtimeStation?lang=0&stationID=${stationId}&apiKey=${apiKey()}`,
  )
  return hasReal(result) ? result.real : []
}

export async function searchPubTransPath(
  sx: number, sy: number, ex: number, ey: number,
): Promise<OdsayPath[]> {
  const result = await odsayFetch(
    `/searchPubTransPathT?SX=${sx}&SY=${sy}&EX=${ex}&EY=${ey}&apiKey=${apiKey()}`,
  )
  return hasPath(result) ? result.path : []
}
