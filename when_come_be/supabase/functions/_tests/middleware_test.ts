/**
 * middleware.ts + anomaly.ts + error.ts(source 인자) 통합 테스트
 *
 * 커버리지:
 * - 정상 응답 → logAnomaly 호출 X
 * - AppError 4xx (code 없음) → logAnomaly 호출 X
 * - AppError 5xx → logAnomaly 호출 1회 (errorResponse 내부)
 * - AppError 4xx + business code → logAnomaly 호출 1회 (errorResponse 내부)
 * - 일반 Error (unhandled) → logAnomaly 호출 1회 (middleware catch)
 * - INSERT 실패해도 응답 정상 반환 (메인 로직 차단 X)
 * - withErrorLogging: 핸들러가 정상 반환하면 그대로 통과
 * - withErrorLogging: 핸들러가 throw하면 500 반환
 */

import { assertEquals } from "@std/assert"
import { withEnv, makeRequest, TEST_ENV, supabaseTest } from "./helpers.ts"

// ─── 목 헬퍼 ──────────────────────────────────────────────────────────────────

function mockInsertSuccess(): Response {
  return new Response(JSON.stringify([{ id: "test-uuid" }]), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  })
}

function mockInsertFailure(): Response {
  return new Response(JSON.stringify({ message: "DB error" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  })
}

/** anomaly_logs INSERT URL만 추적하는 spy fetch */
function makeSpyFetch(
  calls: { url: string; body: unknown }[],
  responseFactory: () => Response,
) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.includes("anomaly_logs")) {
      const body = init?.body ? JSON.parse(init.body as string) : null
      calls.push({ url, body })
    }
    return responseFactory()
  }
}

// ─── errorResponse(e, source) 로깅 정책 테스트 ────────────────────────────────

Deno.test("errorResponse — source 없으면 logAnomaly 호출 X (기존 호환)", async () => {
  const { errorResponse, AppError } = await import("../_shared/error.ts")

  const calls: { url: string; body: unknown }[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = makeSpyFetch(calls, mockInsertSuccess) as typeof fetch

  try {
    await withEnv(TEST_ENV, async () => {
      const res = errorResponse(new AppError("서버 오류", 500))
      assertEquals(res.status, 500)
    })
    await new Promise((r) => setTimeout(r, 50))
    assertEquals(calls.length, 0, "source 없으면 logAnomaly 호출 안 함")
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test("errorResponse — AppError 4xx (code 없음) → logAnomaly 호출 X", async () => {
  const { errorResponse, AppError } = await import("../_shared/error.ts")

  const calls: { url: string; body: unknown }[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = makeSpyFetch(calls, mockInsertSuccess) as typeof fetch

  try {
    await withEnv(TEST_ENV, async () => {
      const res = errorResponse(new AppError("잘못된 요청", 400), "test-source")
      assertEquals(res.status, 400)
    })
    await new Promise((r) => setTimeout(r, 50))
    assertEquals(calls.length, 0, "4xx (code 없음)은 기록 안 함")
  } finally {
    globalThis.fetch = originalFetch
  }
})

// Supabase 클라이언트를 초기화하는 테스트는 supabaseTest 사용 (interval leak 방지)
supabaseTest("errorResponse — AppError 5xx → logAnomaly 호출 1회", async () => {
  const { errorResponse, AppError } = await import("../_shared/error.ts")

  const calls: { url: string; body: unknown }[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = makeSpyFetch(calls, mockInsertSuccess) as typeof fetch

  try {
    await withEnv(TEST_ENV, async () => {
      const res = errorResponse(new AppError("DB 연결 실패", 502), "arrival-info")
      assertEquals(res.status, 502)
    })
    await new Promise((r) => setTimeout(r, 100))
    assertEquals(calls.length, 1, "5xx는 logAnomaly 호출 1회")
    const inserted = calls[0].body as Record<string, unknown>
    assertEquals(inserted.source, "arrival-info")
    assertEquals(typeof inserted.category, "string")
    assertEquals((inserted.category as string).startsWith("error."), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

supabaseTest("errorResponse — AppError 4xx + business code → logAnomaly 호출 1회", async () => {
  const { errorResponse, AppError } = await import("../_shared/error.ts")

  const calls: { url: string; body: unknown }[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = makeSpyFetch(calls, mockInsertSuccess) as typeof fetch

  try {
    await withEnv(TEST_ENV, async () => {
      const res = errorResponse(
        new AppError("도착 정보 없음", 422, "ARRIVAL_UNSUPPORTED_REGION"),
        "arrival-info",
      )
      assertEquals(res.status, 422)
    })
    await new Promise((r) => setTimeout(r, 100))
    assertEquals(calls.length, 1, "4xx + business code는 logAnomaly 호출 1회")
    const inserted = calls[0].body as Record<string, unknown>
    assertEquals(inserted.category, "error.business.ARRIVAL_UNSUPPORTED_REGION")
  } finally {
    globalThis.fetch = originalFetch
  }
})

supabaseTest("errorResponse — INSERT 실패해도 응답 정상 반환 (메인 로직 차단 X)", async () => {
  const { errorResponse, AppError } = await import("../_shared/error.ts")

  const originalFetch = globalThis.fetch
  globalThis.fetch = makeSpyFetch([], mockInsertFailure) as typeof fetch

  try {
    await withEnv(TEST_ENV, async () => {
      const res = errorResponse(new AppError("서버 오류", 503), "routes")
      assertEquals(res.status, 503, "INSERT 실패해도 원래 에러 응답 반환")
    })
    await new Promise((r) => setTimeout(r, 100))
    // 예외 없이 도달 = 통과
  } finally {
    globalThis.fetch = originalFetch
  }
})

// ─── withErrorLogging 미들웨어 테스트 ─────────────────────────────────────────

Deno.test("withErrorLogging — 핸들러 정상 응답은 그대로 통과", async () => {
  const { withErrorLogging } = await import("../_shared/middleware.ts")

  const handler = async (_req: Request) =>
    new Response(JSON.stringify({ ok: true }), { status: 200 })

  const wrapped = withErrorLogging(handler, "test-fn")
  const res = await wrapped(makeRequest("GET", "https://example.com/test"))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.ok, true)
})

Deno.test("withErrorLogging — OPTIONS preflight는 그대로 통과", async () => {
  const { withErrorLogging } = await import("../_shared/middleware.ts")

  const handler = async (_req: Request) =>
    new Response("ok", { status: 200 })

  const wrapped = withErrorLogging(handler, "test-fn")
  const res = await wrapped(makeRequest("OPTIONS", "https://example.com/test"))
  assertEquals(res.status, 200)
})

supabaseTest("withErrorLogging — 핸들러가 throw하면 500 반환 + logAnomaly 1회", async () => {
  const { withErrorLogging } = await import("../_shared/middleware.ts")

  const calls: { url: string; body: unknown }[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = makeSpyFetch(calls, mockInsertSuccess) as typeof fetch

  try {
    const handler = async (_req: Request): Promise<Response> => {
      throw new Error("예상치 못한 런타임 에러")
    }

    const wrapped = withErrorLogging(handler, "search-stops")
    const res = await withEnv(TEST_ENV, () =>
      wrapped(makeRequest("GET", "https://example.com/search-stops?q=test"))
    )
    assertEquals(res.status, 500)
    const body = await res.json()
    assertEquals(body.error, "INTERNAL_SERVER_ERROR")

    await new Promise((r) => setTimeout(r, 100))
    assertEquals(calls.length, 1, "unhandled throw → logAnomaly 1회")
    const inserted = calls[0].body as Record<string, unknown>
    assertEquals(inserted.source, "search-stops")
    assertEquals(inserted.category, "error.unhandled")
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test("withErrorLogging — 핸들러 내부 try/catch가 errorResponse 반환하면 미들웨어 catch 미도달", async () => {
  const { withErrorLogging } = await import("../_shared/middleware.ts")
  const { errorResponse, AppError } = await import("../_shared/error.ts")

  const calls: { url: string; body: unknown }[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = makeSpyFetch(calls, mockInsertSuccess) as typeof fetch

  try {
    const handler = async (_req: Request): Promise<Response> => {
      try {
        throw new AppError("잘못된 파라미터", 400)
      } catch (e) {
        return errorResponse(e, "search-stops") // 핸들러 내부에서 처리
      }
    }

    const wrapped = withErrorLogging(handler, "search-stops")
    const res = await wrapped(makeRequest("GET", "https://example.com/search-stops"))
    // 핸들러가 Response를 반환했으므로 미들웨어 catch는 도달 안 함
    assertEquals(res.status, 400)
    await new Promise((r) => setTimeout(r, 50))
    // 4xx (code 없음)이므로 logAnomaly 호출 X
    assertEquals(calls.length, 0, "4xx (code 없음) 내부 처리 → logAnomaly 호출 X")
  } finally {
    globalThis.fetch = originalFetch
  }
})
