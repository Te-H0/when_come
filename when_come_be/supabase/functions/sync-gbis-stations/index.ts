import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { withErrorLogging } from "../_shared/middleware.ts"
import { fetchBusStationsBySigun, GgBusStationRow } from "../_shared/gbisOpenApiClient.ts"
import type {
  SyncErrorCode,
  CommonErrorCode,
} from "../_shared/errorCodes.ts"

// ─── 경기도 31개 시군 목록 ──────────────────────────────────────────────────
const GYEONGGI_SIGUN_LIST = [
  "수원시", "고양시", "용인시", "성남시", "부천시", "안산시", "화성시",
  "남양주시", "안양시", "평택시", "시흥시", "파주시", "의정부시", "김포시",
  "광주시", "광명시", "군포시", "하남시", "오산시", "양주시", "이천시",
  "구리시", "안성시", "포천시", "의왕시", "양평군", "여주시", "동두천시",
  "가평군", "과천시", "연천군",
]

// ─── 상수 ─────────────────────────────────────────────────────────────────────
const MAX_PAGES = 200         // 무한루프 안전 상한 (1 시군 최대 200 * pSize rows)
const DEFAULT_PSIZE = 100
const MIN_PSIZE = 1
const MAX_PSIZE = 1000

// ─── 요청 DTO ──────────────────────────────────────────────────────────────
interface SyncGbisStationsRequest {
  sigun_nm?: string
  sigun_nm_in?: string[]
  pSize?: number
  dryRun?: boolean
}

// ─── 응답 DTO ──────────────────────────────────────────────────────────────
interface SyncError {
  sigun: string
  page?: number
  message: string
  code?: string
}

interface SyncGbisStationsResponse {
  ok: true
  synced: number
  sigun: Record<string, number>
  errors: SyncError[]
  dryRun: boolean
  startedAt: string
  finishedAt: string
  durationMs: number
}

// ─── 환경변수 lazy 읽기 ────────────────────────────────────────────────────────
function getSupabaseUrl(): string {
  const url = Deno.env.get("SUPABASE_URL")
  if (!url) throw new AppError("SUPABASE_URL not configured", 500)
  return url
}

function getServiceRoleKey(): string {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!key) throw new AppError("SUPABASE_SERVICE_ROLE_KEY not configured", 500)
  return key
}

// ─── Service Role 인증 검증 ──────────────────────────────────────────────────
/**
 * Authorization 헤더에서 Bearer 토큰 추출 후 service role key와 비교.
 * GitHub Actions에서만 호출되므로 service role key 직접 비교.
 */
function verifyServiceRole(req: Request): void {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AppError("service role key가 필요합니다", 403, "SYNC_FORBIDDEN" satisfies SyncErrorCode)
  }
  const token = authHeader.slice(7)
  const serviceKey = getServiceRoleKey()
  if (token !== serviceKey) {
    throw new AppError("service role key가 일치하지 않습니다", 403, "SYNC_FORBIDDEN" satisfies SyncErrorCode)
  }
}

// ─── Supabase 클라이언트 (service role — upsert 권한 필요) ──────────────────
function serviceRoleClient() {
  return createClient(
    getSupabaseUrl(),
    getServiceRoleKey(),
    { auth: { persistSession: false } },
  )
}

// ─── upsert 헬퍼 ─────────────────────────────────────────────────────────────
async function upsertChunk(
  db: ReturnType<typeof serviceRoleClient>,
  rows: GgBusStationRow[],
  syncedAt: string,   // sync 시작 시각 — 청크 간 일관된 timestamp
): Promise<void> {
  const payload = rows.map((r) => ({
    station_id: r.station_id,
    station_name: r.station_name,
    ars_no: r.ars_no,
    lat: r.lat,
    lng: r.lng,
    sigun_nm: r.sigun_nm,
    sigun_cd: r.sigun_cd,
    station_div_nm: r.station_div_nm,
    jurisd_inst_nm: r.jurisd_inst_nm,
    locplc_loc: r.locplc_loc,
    synced_at: syncedAt,
  }))

  const { error } = await db
    .from("gbis_stations")
    .upsert(payload, { onConflict: "station_id" })

  if (error) {
    throw new AppError(`gbis_stations upsert 실패: ${error.message}`, 500, "SYNC_PERSIST_FAILED" satisfies SyncErrorCode)
  }
}

// ─── 단일 시군 처리 ──────────────────────────────────────────────────────────
async function processSigun(
  db: ReturnType<typeof serviceRoleClient>,
  sigunNm: string,
  pSize: number,
  dryRun: boolean,
  syncedAt: string,   // sync 시작 시각 — 청크 간 일관된 timestamp
): Promise<{ count: number; errors: SyncError[] }> {
  const errors: SyncError[] = []
  let totalSynced = 0
  let pIndex = 1
  let totalCount: number | null = null

  while (pIndex <= MAX_PAGES) {
    try {
      const { rows, totalCount: tc, code } = await fetchBusStationsBySigun(sigunNm, pIndex, pSize)

      // INFO-200: 데이터 없음 → 이 시군 종료
      if (code === "INFO-200") {
        break
      }

      // 첫 페이지에서 totalCount 설정
      if (totalCount === null) {
        totalCount = tc
      }

      if (rows.length === 0) break

      if (!dryRun) {
        await upsertChunk(db, rows, syncedAt)
      }

      totalSynced += rows.length
      console.log(
        JSON.stringify({ level: "info", event: "sync-sigun-page", sigunNm, pIndex, rows: rows.length }),
      )

      // 페이징 종료 판정: 누적 >= totalCount 또는 마지막 페이지
      if (totalCount !== null && totalSynced >= totalCount) break
      if (rows.length < pSize) break

      pIndex++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // AppError(500)은 upsert 실패 → 즉시 throw
      if (e instanceof AppError && e.status === 500) throw e

      errors.push({ sigun: sigunNm, page: pIndex, message: msg, code: "EXTERNAL_API" })
      console.warn(
        JSON.stringify({ level: "warn", event: "sync-sigun-page-failed", sigunNm, pIndex, error: msg }),
      )
      break
    }
  }

  // MAX_PAGES 상한 도달 시 경고 기록
  if (pIndex > MAX_PAGES) {
    const warnMsg = `MAX_PAGES(${MAX_PAGES}) 상한 도달 — 조기 종료`
    errors.push({ sigun: sigunNm, page: pIndex, message: warnMsg, code: "MAX_PAGES_EXCEEDED" })
    console.warn(
      JSON.stringify({ level: "warn", event: "sync-sigun-max-pages", sigunNm, pIndex }),
    )
  }

  return { count: totalSynced, errors }
}

// ─── 핸들러 ──────────────────────────────────────────────────────────────────
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "POST") {
      throw new AppError("POST 요청만 허용됩니다", 405, "COMMON_METHOD_NOT_ALLOWED" satisfies CommonErrorCode)
    }

    // 인증 검증
    verifyServiceRole(req)

    // body 파싱
    let body: SyncGbisStationsRequest = {}
    try {
      const text = await req.text()
      if (text.trim()) {
        body = JSON.parse(text)
      }
    } catch {
      throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400, "COMMON_INVALID_JSON" satisfies CommonErrorCode)
    }

    // 입력 검증: sigun_nm
    if (body.sigun_nm !== undefined && typeof body.sigun_nm !== "string") {
      throw new AppError("sigun_nm은 문자열이어야 합니다", 400, "SYNC_PARAMS_INVALID" satisfies SyncErrorCode)
    }
    if (body.sigun_nm !== undefined && body.sigun_nm.trim() === "") {
      throw new AppError("sigun_nm이 빈 문자열입니다", 400, "SYNC_PARAMS_INVALID" satisfies SyncErrorCode)
    }

    // 입력 검증: pSize
    let pSize = DEFAULT_PSIZE
    if (body.pSize !== undefined) {
      if (typeof body.pSize !== "number" || !Number.isInteger(body.pSize)) {
        throw new AppError("pSize는 정수여야 합니다", 400, "SYNC_PARAMS_INVALID" satisfies SyncErrorCode)
      }
      if (body.pSize < MIN_PSIZE || body.pSize > MAX_PSIZE) {
        throw new AppError(`pSize는 ${MIN_PSIZE}~${MAX_PSIZE} 범위여야 합니다`, 400, "SYNC_PARAMS_INVALID" satisfies SyncErrorCode)
      }
      pSize = body.pSize
    }

    // 입력 검증: sigun_nm_in
    if (body.sigun_nm_in !== undefined) {
      if (!Array.isArray(body.sigun_nm_in)) {
        throw new AppError("sigun_nm_in은 배열이어야 합니다", 400, "SYNC_PARAMS_INVALID" satisfies SyncErrorCode)
      }
      if (body.sigun_nm_in.length === 0) {
        throw new AppError("sigun_nm_in이 빈 배열입니다", 400, "SYNC_PARAMS_INVALID" satisfies SyncErrorCode)
      }
      for (const nm of body.sigun_nm_in) {
        if (typeof nm !== "string") {
          throw new AppError("sigun_nm_in 각 요소는 문자열이어야 합니다", 400, "SYNC_PARAMS_INVALID" satisfies SyncErrorCode)
        }
        if (nm.length < 1 || nm.length > 50) {
          throw new AppError(`sigun_nm_in 요소 길이는 1~50자여야 합니다: "${nm}"`, 400, "SYNC_PARAMS_INVALID" satisfies SyncErrorCode)
        }
        if (!GYEONGGI_SIGUN_LIST.includes(nm)) {
          throw new AppError(`알 수 없는 경기도 시군명입니다: "${nm}"`, 400, "SYNC_PARAMS_INVALID" satisfies SyncErrorCode)
        }
      }
    }

    const dryRun = body.dryRun ?? false

    // 시군 목록 결정
    let sigunList: string[]
    if (body.sigun_nm) {
      sigunList = [body.sigun_nm]
    } else if (body.sigun_nm_in && body.sigun_nm_in.length > 0) {
      sigunList = body.sigun_nm_in
    } else {
      sigunList = GYEONGGI_SIGUN_LIST
    }

    const db = serviceRoleClient()
    const startedAt = new Date().toISOString()
    const startMs = Date.now()

    let totalSynced = 0
    const sigunCounts: Record<string, number> = {}
    const allErrors: SyncError[] = []

    for (const sigunNm of sigunList) {
      try {
        const { count, errors } = await processSigun(db, sigunNm, pSize, dryRun, startedAt)
        totalSynced += count
        sigunCounts[sigunNm] = count
        allErrors.push(...errors)

        console.log(
          JSON.stringify({ level: "info", event: "sync-sigun-done", sigunNm, count }),
        )
      } catch (e) {
        // upsert 실패(500)는 전체 실패로 즉시 throw
        if (e instanceof AppError && e.status === 500) throw e

        const msg = e instanceof Error ? e.message : String(e)
        allErrors.push({ sigun: sigunNm, message: msg, code: "EXTERNAL_API" })
        console.warn(
          JSON.stringify({ level: "warn", event: "sync-sigun-failed", sigunNm, error: msg }),
        )
      }
    }

    const finishedAt = new Date().toISOString()
    const durationMs = Date.now() - startMs

    const response: SyncGbisStationsResponse = {
      ok: true,
      synced: totalSynced,
      sigun: sigunCounts,
      errors: allErrors,
      dryRun,
      startedAt,
      finishedAt,
      durationMs,
    }

    console.log(
      JSON.stringify({ level: "info", event: "sync-complete", synced: totalSynced, errors: allErrors.length, durationMs }),
    )

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return errorResponse(e, "sync-gbis-stations")
  }
}

if (import.meta.main) Deno.serve(withErrorLogging(handler, "sync-gbis-stations"))
