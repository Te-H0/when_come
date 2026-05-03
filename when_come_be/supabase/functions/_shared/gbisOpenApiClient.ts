import { AppError } from "./error.ts"

const GBIS_OPENAPI_BASE = "https://openapi.gg.go.kr/BusStation"

// ─── 환경변수 lazy 읽기 ────────────────────────────────────────────────────────
function openApiKey(): string {
  const key = Deno.env.get("GYEONGGI_OPENAPI_KEY")
  if (!key) throw new AppError("GYEONGGI_OPENAPI_KEY not configured", 500)
  return key
}

// ─── 응답 원시 타입 ─────────────────────────────────────────────────────────────
export interface GgBusStationRaw {
  STATION_ID: string
  STATION_NM_INFO: string
  STATION_MANAGE_NO?: string
  WGS84_LAT: number
  WGS84_LOGT: number
  SIGUN_NM?: string
  SIGUN_CD?: string
  STATION_DIV_NM?: string
  JURISD_INST_NM?: string
  LOCPLC_LOC?: string
}

/** `gbis_stations` 테이블에 upsert할 정형 타입 */
export interface GgBusStationRow {
  station_id: string
  station_name: string
  ars_no: string | null
  lat: number
  lng: number
  sigun_nm: string | null
  sigun_cd: string | null
  station_div_nm: string | null
  jurisd_inst_nm: string | null
  locplc_loc: string | null
}

interface GgOpenApiHead {
  LIST_TOTAL_COUNT?: number
  RESULT?: { CODE: string; MESSAGE: string }
  API_VERSION?: string
}

interface GgOpenApiResponse {
  BusStation: [
    { head: GgOpenApiHead[] },
    { row?: GgBusStationRaw[] },
  ]
}

// ─── 타입 가드 ──────────────────────────────────────────────────────────────────
function isGgOpenApiResponse(val: unknown): val is GgOpenApiResponse {
  if (typeof val !== "object" || val === null) return false
  const obj = val as Record<string, unknown>
  const busStation = obj["BusStation"]
  if (!Array.isArray(busStation) || busStation.length < 2) return false
  const firstElem = busStation[0]
  if (typeof firstElem !== "object" || firstElem === null) return false
  const head = (firstElem as Record<string, unknown>)["head"]
  if (!Array.isArray(head) || head.length === 0) return false
  // head 첫 요소가 객체인지 확인
  if (typeof head[0] !== "object" || head[0] === null) return false
  const secondElem = busStation[1]
  if (typeof secondElem !== "object" || secondElem === null) return false
  return true
}

// ─── 응답 파싱 헬퍼 ─────────────────────────────────────────────────────────────

/**
 * 응답에서 CODE를 추출한다.
 * INFO-000: 정상, INFO-200: 데이터 없음, 그 외: 에러
 */
function extractCode(response: GgOpenApiResponse): string {
  const head = response.BusStation[0].head
  for (const item of head) {
    if (item.RESULT) return item.RESULT.CODE
  }
  // RESULT 필드 없으면 정상으로 간주 (일부 경기도 API 응답이 RESULT 생략)
  console.warn(JSON.stringify({ level: "warn", event: "gg-openapi-no-result-field", head }))
  return "INFO-000"
}

function extractTotalCount(response: GgOpenApiResponse): number {
  const head = response.BusStation[0].head
  for (const item of head) {
    if (item.LIST_TOTAL_COUNT !== undefined) return item.LIST_TOTAL_COUNT
  }
  return 0
}

function extractRows(response: GgOpenApiResponse): GgBusStationRaw[] {
  return response.BusStation[1]?.row ?? []
}

function mapRawToRow(raw: GgBusStationRaw): GgBusStationRow {
  return {
    station_id: String(raw.STATION_ID),
    station_name: raw.STATION_NM_INFO,
    ars_no: raw.STATION_MANAGE_NO ?? null,
    lat: Number(raw.WGS84_LAT),
    lng: Number(raw.WGS84_LOGT),
    sigun_nm: raw.SIGUN_NM ?? null,
    sigun_cd: raw.SIGUN_CD ?? null,
    station_div_nm: raw.STATION_DIV_NM ?? null,
    jurisd_inst_nm: raw.JURISD_INST_NM ?? null,
    locplc_loc: raw.LOCPLC_LOC ?? null,
  }
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────────

/**
 * 경기도 정류소현황 OpenAPI 공통 페이징 호출.
 * sigunNm을 전달하면 SIGUN_NM 필터 적용, 없으면 전체 조회.
 */
async function fetchBusStationsPage(
  pIndex: number,
  pSize: number,
  sigunNm?: string,
): Promise<{ rows: GgBusStationRow[]; totalCount: number; code: string }> {
  const key = openApiKey()
  const url = new URL(GBIS_OPENAPI_BASE)
  url.searchParams.set("KEY", key)
  url.searchParams.set("Type", "json")
  url.searchParams.set("pIndex", String(pIndex))
  url.searchParams.set("pSize", String(pSize))
  if (sigunNm !== undefined) {
    url.searchParams.set("SIGUN_NM", sigunNm)
  }

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new AppError(`경기도 OpenAPI 연결 실패 (HTTP ${res.status})`, 502)
  }

  const data: unknown = await res.json()
  if (!isGgOpenApiResponse(data)) {
    throw new AppError("경기도 OpenAPI 응답 형식 오류", 502)
  }

  const code = extractCode(data)
  if (code === "INFO-200") {
    return { rows: [], totalCount: 0, code }
  }
  if (code !== "INFO-000") {
    throw new AppError(`경기도 OpenAPI 오류: ${code}`, 502)
  }

  const totalCount = extractTotalCount(data)
  const rows = extractRows(data).map(mapRawToRow)
  return { rows, totalCount, code }
}

// ─── 공개 함수 ───────────────────────────────────────────────────────────────────

/**
 * 경기도 정류소현황 OpenAPI — 시군 지정 페이징 다운로드.
 *
 * @param sigunNm 시군명 필터 (예: "광명시")
 * @param pIndex  페이지 번호 (1-based)
 * @param pSize   페이지 크기 (기본 100)
 * @returns { rows, totalCount, code }
 */
export async function fetchBusStationsBySigun(
  sigunNm: string,
  pIndex: number = 1,
  pSize: number = 100,
): Promise<{ rows: GgBusStationRow[]; totalCount: number; code: string }> {
  return fetchBusStationsPage(pIndex, pSize, sigunNm)
}

/**
 * 경기도 정류소현황 OpenAPI — SIGUN_NM 미지정 전체 페이징.
 * 운영 환경에서는 시군별 분할 호출(`fetchBusStationsBySigun`)을 권장하지만,
 * 단순 전체 다운로드 시 사용 가능.
 */
export async function fetchBusStationsAll(
  pIndex: number = 1,
  pSize: number = 100,
): Promise<{ rows: GgBusStationRow[]; totalCount: number; code: string }> {
  return fetchBusStationsPage(pIndex, pSize)
}
