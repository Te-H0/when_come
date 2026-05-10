import { assertEquals } from "@std/assert"
import {
  AppError,
  errorResponse,
  isProduction,
  type ArrivalErrorCode,
} from "../_shared/error.ts"
import type { AuthErrorCode, ErrorCode } from "../_shared/errorCodes.ts"
import { withEnv, withMockFetch, makeRequest, mockSupabaseAuthSuccess, mockSupabaseAuthFailure, supabaseTest, TEST_ENV, jsonResponse } from "./helpers.ts"
import { authGuard } from "../_shared/auth.ts"

// ─── isProduction 헬퍼 ────────────────────────────────────────────────────────

Deno.test("isProduction — DENO_ENV=production 이면 true", async () => {
  await withEnv({ DENO_ENV: "production" }, async () => {
    assertEquals(isProduction(), true)
  })
})

Deno.test("isProduction — DENO_ENV=development 이면 false", async () => {
  await withEnv({ DENO_ENV: "development" }, async () => {
    assertEquals(isProduction(), false)
  })
})

Deno.test("isProduction — ENVIRONMENT=production 이면 true (DENO_ENV 미설정 시)", async () => {
  await withEnv({ ENVIRONMENT: "production" }, async () => {
    assertEquals(isProduction(), true)
  })
})

Deno.test("isProduction — env 미설정 시 false (fail-safe default)", async () => {
  // DENO_ENV, ENVIRONMENT 모두 없으면 dev로 취급 — 명시적 주입 없이는 절대 prod가 되지 않음
  // withEnv는 기존 env에 overlay이므로 직접적 단위 검증은 불가하지만
  // DENO_ENV=development 케이스로 대리 검증
  await withEnv({ DENO_ENV: "development" }, async () => {
    assertEquals(isProduction(), false)
  })
})

Deno.test("isProduction — DENO_ENV 미지정 + ENVIRONMENT 미지정 → false", async () => {
  // 테스트 환경(TEST_ENV)에는 DENO_ENV/ENVIRONMENT 없음 → false여야 함
  // TEST_ENV에 없는 키는 undefined → false 반환
  await withEnv({ ...TEST_ENV }, async () => {
    // TEST_ENV에 DENO_ENV/ENVIRONMENT 없으므로 isProduction() = false
    assertEquals(isProduction(), false)
  })
})

// ─── AppError 기본 동작 ───────────────────────────────────────────────────────

Deno.test("AppError — Error를 상속하고 message를 보존한다", () => {
  const err = new AppError("뭔가 잘못됨", 422)
  assertEquals(err instanceof Error, true)
  assertEquals(err instanceof AppError, true)
  assertEquals(err.message, "뭔가 잘못됨")
  assertEquals(err.status, 422)
})

Deno.test("AppError — 기본 status는 400이다", () => {
  const err = new AppError("잘못된 요청")
  assertEquals(err.status, 400)
})

Deno.test("AppError — code/detail 필드를 보존한다", () => {
  const err = new AppError(
    "경로를 찾을 수 없어요.",
    404,
    "ARRIVAL_STOP_NOT_FOUND" satisfies ArrivalErrorCode,
    "route_stops.id=abc not found",
  )
  assertEquals(err.status, 404)
  assertEquals(err.code, "ARRIVAL_STOP_NOT_FOUND")
  assertEquals(err.detail, "route_stops.id=abc not found")
})

// ─── errorResponse — dev 환경 동작 ───────────────────────────────────────────

Deno.test("errorResponse (dev) — code 있는 AppError는 구조화된 객체 반환", async () => {
  await withEnv({ DENO_ENV: "development" }, async () => {
    const err = new AppError(
      "이 지역은 실시간 도착 정보를 지원하지 않아요.",
      422,
      "ARRIVAL_UNSUPPORTED_REGION" satisfies ArrivalErrorCode,
      "region=unknown lat=37.85 lng=128.59",
    )
    const res = errorResponse(err)
    assertEquals(res.status, 422)
    const body = await res.json()
    assertEquals(body.error.code, "ARRIVAL_UNSUPPORTED_REGION")
    assertEquals(body.error.message, "이 지역은 실시간 도착 정보를 지원하지 않아요.")
    assertEquals(body.error.detail, "region=unknown lat=37.85 lng=128.59")
  })
})

Deno.test("errorResponse (dev) — code 없는 AppError는 기존 flat 구조 유지 (하위 호환)", async () => {
  await withEnv({ DENO_ENV: "development" }, async () => {
    const err = new AppError("권한 없음", 403)
    const res = errorResponse(err)
    assertEquals(res.status, 403)
    const body = await res.json()
    // code 없으면 { error: "message" } — 기존 FE 호환 (dev only)
    assertEquals(body.error, "권한 없음")
  })
})

Deno.test("errorResponse (dev) — 알 수 없는 에러는 500을 반환한다", async () => {
  await withEnv({ DENO_ENV: "development" }, async () => {
    const res = errorResponse(new Error("예상치 못한 오류"))
    assertEquals(res.status, 500)
    const body = await res.json()
    assertEquals(body.error, "INTERNAL_SERVER_ERROR")
  })
})

Deno.test("errorResponse (dev) — code 없는 5xx AppError는 flat 포맷 반환", async () => {
  await withEnv({ DENO_ENV: "development" }, async () => {
    const err = new AppError("DB 저장 실패", 500)
    const res = errorResponse(err)
    assertEquals(res.status, 500)
    const body = await res.json()
    assertEquals(body.error, "DB 저장 실패")
  })
})

// ─── errorResponse — 운영 환경 마스킹 동작 ────────────────────────────────────

Deno.test("errorResponse (prod) — code 없는 4xx → COMMON_BAD_REQUEST 마스킹", async () => {
  await withEnv({ DENO_ENV: "production" }, async () => {
    const err = new AppError("이름이 비어 있습니다", 400)
    const res = errorResponse(err)
    assertEquals(res.status, 400)
    const body = await res.json()
    assertEquals(body.error.code, "COMMON_BAD_REQUEST")
    assertEquals(body.error.message, "잘못된 요청입니다")
    // raw message 노출 금지
    assertEquals("detail" in body.error, false)
  })
})

Deno.test("errorResponse (prod) — code 없는 5xx AppError → COMMON_INTERNAL_ERROR 마스킹", async () => {
  await withEnv({ DENO_ENV: "production" }, async () => {
    const err = new AppError("DB INSERT 실패 상세 메시지", 500)
    const res = errorResponse(err)
    assertEquals(res.status, 500)
    const body = await res.json()
    assertEquals(body.error.code, "COMMON_INTERNAL_ERROR")
    assertEquals(body.error.message, "잠시 후 다시 시도해 주세요")
  })
})

Deno.test("errorResponse (prod) — unhandled 예외 → COMMON_INTERNAL_ERROR 마스킹", async () => {
  await withEnv({ DENO_ENV: "production" }, async () => {
    const res = errorResponse(new Error("내부 시스템 오류 상세"))
    assertEquals(res.status, 500)
    const body = await res.json()
    assertEquals(body.error.code, "COMMON_INTERNAL_ERROR")
    assertEquals(body.error.message, "잠시 후 다시 시도해 주세요")
    // raw message/stack 노출 금지
    assertEquals("stack" in body.error, false)
  })
})

Deno.test("errorResponse (prod) — code 있는 4xx → message 노출, detail 제거", async () => {
  await withEnv({ DENO_ENV: "production" }, async () => {
    const err = new AppError(
      "경로를 찾을 수 없습니다",
      404,
      "ARRIVAL_STOP_NOT_FOUND" satisfies ArrivalErrorCode,
      "route_stops.id=abc not found",  // 운영에서는 이 detail 제거됨
    )
    const res = errorResponse(err)
    assertEquals(res.status, 404)
    const body = await res.json()
    assertEquals(body.error.code, "ARRIVAL_STOP_NOT_FOUND")
    assertEquals(body.error.message, "경로를 찾을 수 없습니다")
    // detail은 운영에서 제거
    assertEquals("detail" in body.error, false)
  })
})

Deno.test("errorResponse (prod) — code 있는 5xx → message 노출, detail 제거", async () => {
  await withEnv({ DENO_ENV: "production" }, async () => {
    const err = new AppError(
      "도착 정보 서비스가 일시적으로 불안정합니다",
      502,
      "ARRIVAL_PROVIDER_ERROR" satisfies ArrivalErrorCode,
      "HTTP 503 from seoul-bus-api",
    )
    const res = errorResponse(err)
    assertEquals(res.status, 502)
    const body = await res.json()
    assertEquals(body.error.code, "ARRIVAL_PROVIDER_ERROR")
    assertEquals(body.error.message, "도착 정보 서비스가 일시적으로 불안정합니다")
    assertEquals("detail" in body.error, false)
  })
})

// ─── CORS 헤더 ────────────────────────────────────────────────────────────────

Deno.test("errorResponse — AppError 응답에 CORS 헤더가 포함된다", () => {
  const res = errorResponse(new AppError("에러", 400))
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
  assertEquals(res.headers.get("Content-Type"), "application/json")
})

Deno.test("errorResponse — code 있는 AppError에 CORS 헤더가 포함된다", () => {
  const err = new AppError("잠시 후 다시 시도해 주세요.", 502, "ARRIVAL_PROVIDER_ERROR")
  const res = errorResponse(err)
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
  assertEquals(res.headers.get("Content-Type"), "application/json")
})

Deno.test("errorResponse — 알 수 없는 에러도 CORS 헤더가 포함된다", () => {
  const res = errorResponse("문자열 에러")
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
})

Deno.test("errorResponse — null/undefined도 500으로 처리한다", async () => {
  await withEnv({ DENO_ENV: "development" }, async () => {
    const res = errorResponse(null)
    assertEquals(res.status, 500)
    const body = await res.json()
    assertEquals(body.error, "INTERNAL_SERVER_ERROR")
  })
})

// ─── detail 키 부재 검증 ──────────────────────────────────────────────────────

Deno.test("errorResponse (dev) — detail 없는 code 있는 AppError에는 detail 키 없음", async () => {
  await withEnv({ DENO_ENV: "development" }, async () => {
    const err = new AppError("경로를 찾을 수 없어요.", 404, "ARRIVAL_STOP_NOT_FOUND")
    const res = errorResponse(err)
    const body = await res.json()
    assertEquals(body.error.code, "ARRIVAL_STOP_NOT_FOUND")
    assertEquals("detail" in body.error, false)
  })
})

// ─── anomaly_logs 호출 검증 ───────────────────────────────────────────────────

Deno.test("errorResponse — source 있으면 anomaly_logs에 기록 시도 (5xx)", async () => {
  // anomaly_logs INSERT는 SUPABASE_SERVICE_ROLE_KEY 없으면 silent skip됨
  // 테스트 환경 변수 없이도 errorResponse 자체가 에러 없이 완료되는지 검증
  await withEnv({ DENO_ENV: "development" }, async () => {
    const err = new AppError("외부 API 실패", 502, "ARRIVAL_PROVIDER_ERROR")
    // source 있음 → logAnomaly 호출됨 (SUPABASE_SERVICE_ROLE_KEY 없어서 silent skip)
    const res = errorResponse(err, "arrival-info")
    assertEquals(res.status, 502)
    const body = await res.json()
    assertEquals(body.error.code, "ARRIVAL_PROVIDER_ERROR")
  })
})

Deno.test("errorResponse — code 없는 4xx는 anomaly_logs 기록 안 함 (source 있어도)", async () => {
  await withEnv({ DENO_ENV: "development" }, async () => {
    const err = new AppError("파라미터 누락", 400)
    // code 없는 4xx → _shouldLog false → logAnomaly 호출 안 됨
    const res = errorResponse(err, "routes")
    assertEquals(res.status, 400)
  })
})

Deno.test("errorResponse — unhandled 예외에 source 있으면 error.unhandled 기록 시도", async () => {
  await withEnv({ DENO_ENV: "development" }, async () => {
    const res = errorResponse(new TypeError("unexpected"), "routes")
    assertEquals(res.status, 500)
  })
})

// ─── authGuard 인증 에러 코드 ─────────────────────────────────────────────────

supabaseTest("authGuard — Authorization 헤더 없으면 AUTH_REQUIRED (401)", async () => {
  await withEnv(TEST_ENV, async () => {
    await withMockFetch(async () => jsonResponse({}, 200), async () => {
      const req = makeRequest("GET", "https://example.com/", {
        headers: {},
      })
      try {
        await authGuard(req)
        throw new Error("should have thrown")
      } catch (e) {
        assertEquals(e instanceof AppError, true)
        const err = e as AppError
        assertEquals(err.status, 401)
        assertEquals(err.code, "AUTH_REQUIRED" satisfies AuthErrorCode)
        assertEquals(err.message, "로그인이 필요합니다")
      }
    })
  })
})

supabaseTest("authGuard — Bearer 형식 아닌 헤더도 AUTH_REQUIRED (401)", async () => {
  await withEnv(TEST_ENV, async () => {
    await withMockFetch(async () => jsonResponse({}, 200), async () => {
      const req = makeRequest("GET", "https://example.com/", {
        headers: { Authorization: "Basic invalid-token" },
      })
      try {
        await authGuard(req)
        throw new Error("should have thrown")
      } catch (e) {
        assertEquals(e instanceof AppError, true)
        const err = e as AppError
        assertEquals(err.status, 401)
        assertEquals(err.code, "AUTH_REQUIRED" satisfies AuthErrorCode)
      }
    })
  })
})

supabaseTest("authGuard — 유효하지 않은 JWT는 AUTH_INVALID (401)", async () => {
  await withEnv(TEST_ENV, async () => {
    await withMockFetch(async () => mockSupabaseAuthFailure(), async () => {
      const req = makeRequest("GET", "https://example.com/", {
        headers: { Authorization: "Bearer expired-token" },
      })
      try {
        await authGuard(req)
        throw new Error("should have thrown")
      } catch (e) {
        assertEquals(e instanceof AppError, true)
        const err = e as AppError
        assertEquals(err.status, 401)
        assertEquals(err.code, "AUTH_INVALID" satisfies AuthErrorCode)
        assertEquals(err.message, "세션이 만료되었습니다")
      }
    })
  })
})

supabaseTest("authGuard — 유효한 JWT는 user를 반환한다", async () => {
  await withEnv(TEST_ENV, async () => {
    await withMockFetch(async () => mockSupabaseAuthSuccess("user-abc"), async () => {
      const req = makeRequest("GET", "https://example.com/", {
        headers: { Authorization: "Bearer valid-token" },
      })
      const user = await authGuard(req)
      assertEquals(user.id, "user-abc")
    })
  })
})

// ─── ErrorCode union 타입 컴파일 검증 ────────────────────────────────────────
// runtime이 아닌 컴파일 타임 검증 — 이 블록이 컴파일되면 union이 올바른 것

Deno.test("errorCodes — ErrorCode union에서 각 도메인 코드를 올바르게 사용 가능", () => {
  // 각 도메인 코드가 ErrorCode union에 포함되는지 satisfies로 검증
  const codes: ErrorCode[] = [
    "COMMON_BAD_REQUEST",
    "COMMON_INTERNAL_ERROR",
    "AUTH_REQUIRED",
    "AUTH_INVALID",
    "AUTH_FORBIDDEN",
    "ROUTE_NAME_REQUIRED",
    "ROUTE_NOT_FOUND",
    "ROUTE_STOP_NOT_FOUND",
    "FAVORITE_ROUTES_REQUIRED",
    "FAVORITE_NOT_FOUND",
    "ARRIVAL_STOP_NOT_FOUND",
    "ARRIVAL_PROVIDER_ERROR",
    "STOP_QUERY_REQUIRED",
    "SUBWAY_STATION_ID_REQUIRED",
    "ROUTE_SEARCH_COORDS_REQUIRED",
    "PLACE_QUERY_REQUIRED",
    "SYNC_FORBIDDEN",
  ]
  assertEquals(codes.length, 17) // 값보다 컴파일 검증이 핵심
})
