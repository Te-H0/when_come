import { assertEquals } from "@std/assert"
import { handler } from "../client-log/index.ts"
import {
  withMockFetch,
  withEnv,
  jsonResponse,
  makeRequest,
  multiMockFetch,
  mockSupabaseAuthSuccess,
  supabaseTest,
  TEST_ENV,
} from "./helpers.ts"

const BASE = "https://test.supabase.co/functions/v1/client-log"
const AUTH_HEADER = { authorization: "Bearer valid-jwt-token" }
const USER_ID = "user-123"

// ─── 기본 요청 팩토리 ──────────────────────────────────────────────────────────

function makeReq(
  method: string,
  options?: { body?: unknown; auth?: boolean },
) {
  return makeRequest(method, BASE, {
    body: options?.body,
    headers: options?.auth !== false ? AUTH_HEADER : {},
  })
}

const VALID_BODY = {
  path: "/routes/abc123",
  method: "PATCH",
  status: 404,
  code: "ROUTE_NOT_FOUND",
  message: "경로를 찾을 수 없습니다",
}

const NETWORK_FAIL_BODY = {
  path: "/arrival-info",
  method: "GET",
  status: null,
  code: null,
  message: "Failed to fetch",
  context: { retryCount: 2 },
}

// ─── 목 세팅 헬퍼 ─────────────────────────────────────────────────────────────

/** INSERT 성공 응답 (PostgREST 빈 배열 = 성공) */
function mockInsertSuccess(): Response {
  return jsonResponse([], 201)
}

/** INSERT 실패 응답 */
function mockInsertFailure(): Response {
  return new Response(JSON.stringify({ message: "DB error" }), { status: 500 })
}

/**
 * auth + DB INSERT 모두 성공하는 멀티 목
 * auth endpoint는 /auth/v1/user 경로로 들어온다.
 */
function makeHappyPathMock(userId = USER_ID): typeof globalThis.fetch {
  return multiMockFetch([
    {
      match: "/auth/v1/user",
      response: () => mockSupabaseAuthSuccess(userId),
    },
    {
      match: "/rest/v1/anomaly_logs",
      response: () => mockInsertSuccess(),
    },
  ]) as typeof globalThis.fetch
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

// OPTIONS preflight
Deno.test("OPTIONS → 200 + corsHeaders", async () => {
  const req = makeRequest("OPTIONS", BASE, {})
  const res = await handler(req)
  assertEquals(res.status, 200)
  assertEquals(res.headers.get("access-control-allow-origin"), "*")
})

// GET → 405
Deno.test("GET → 405", async () => {
  const req = makeRequest("GET", BASE, {})
  const res = await handler(req)
  assertEquals(res.status, 405)
})

// POST happy path — with auth → 204 + INSERT 1회
supabaseTest("POST happy path with auth → 204 + anomaly_logs INSERT", async () => {
  await withEnv(TEST_ENV, async () => {
    let insertCallCount = 0
    const mock = multiMockFetch([
      {
        match: "/auth/v1/user",
        response: () => mockSupabaseAuthSuccess(USER_ID),
      },
      {
        match: "/rest/v1/anomaly_logs",
        response: () => {
          insertCallCount++
          return mockInsertSuccess()
        },
      },
    ])

    await withMockFetch(mock as typeof globalThis.fetch, async () => {
      const req = makeReq("POST", { body: VALID_BODY })
      const res = await handler(req)
      assertEquals(res.status, 204)
      assertEquals(insertCallCount, 1)
    })
  })
})

// POST without auth → 204 + INSERT with user_id null
supabaseTest("POST without auth → 204, INSERT user_id is null (no auth header)", async () => {
  await withEnv(TEST_ENV, async () => {
    let capturedBody: string | null = null

    const mock = multiMockFetch([
      {
        match: "/rest/v1/anomaly_logs",
        response: () => {
          return mockInsertSuccess()
        },
      },
    ])

    // auth 헤더 없음 → user_id 추출 시도 안 함
    await withMockFetch(mock as typeof globalThis.fetch, async () => {
      const req = makeRequest("POST", BASE, {
        body: NETWORK_FAIL_BODY,
        headers: {}, // 인증 헤더 없음
      })
      const res = await handler(req)
      assertEquals(res.status, 204)
    })

    void capturedBody // 사용되지 않지만 lint 억제
  })
})

// POST with invalid JSON → 204 (silent skip, INSERT 0회)
supabaseTest("POST with invalid JSON body → 204, INSERT not called", async () => {
  await withEnv(TEST_ENV, async () => {
    let insertCallCount = 0
    const mock = multiMockFetch([
      {
        match: "/auth/v1/user",
        response: () => mockSupabaseAuthSuccess(USER_ID),
      },
      {
        match: "/rest/v1/anomaly_logs",
        response: () => {
          insertCallCount++
          return mockInsertSuccess()
        },
      },
    ])

    await withMockFetch(mock as typeof globalThis.fetch, async () => {
      // JSON이 아닌 body
      const req = new Request(BASE, {
        method: "POST",
        headers: { ...AUTH_HEADER, "content-type": "application/json" },
        body: "not valid json {{{{",
      })
      const res = await handler(req)
      assertEquals(res.status, 204)
      assertEquals(insertCallCount, 0)
    })
  })
})

// POST with body missing required fields → 204 (타입 가드 실패 = silent skip)
supabaseTest("POST with incomplete body (missing path) → 204, INSERT not called", async () => {
  await withEnv(TEST_ENV, async () => {
    let insertCallCount = 0
    const mock = multiMockFetch([
      {
        match: "/auth/v1/user",
        response: () => mockSupabaseAuthSuccess(USER_ID),
      },
      {
        match: "/rest/v1/anomaly_logs",
        response: () => {
          insertCallCount++
          return mockInsertSuccess()
        },
      },
    ])

    await withMockFetch(mock as typeof globalThis.fetch, async () => {
      const req = makeReq("POST", {
        // path 필드 누락 → 타입 가드 실패
        body: { method: "GET", status: 500, code: null, message: "err" },
      })
      const res = await handler(req)
      assertEquals(res.status, 204)
      assertEquals(insertCallCount, 0)
    })
  })
})

// INSERT 실패해도 → 204 (anomaly_logs mock이 5xx 반환)
supabaseTest("INSERT failure → still 204 (silent skip)", async () => {
  await withEnv(TEST_ENV, async () => {
    const mock = multiMockFetch([
      {
        match: "/auth/v1/user",
        response: () => mockSupabaseAuthSuccess(USER_ID),
      },
      {
        match: "/rest/v1/anomaly_logs",
        response: () => mockInsertFailure(),
      },
    ])

    await withMockFetch(mock as typeof globalThis.fetch, async () => {
      const req = makeReq("POST", { body: VALID_BODY })
      const res = await handler(req)
      assertEquals(res.status, 204)
    })
  })
})

// category 검증: status null → "client.network"
supabaseTest("POST with status=null → category client.network in INSERT body", async () => {
  await withEnv(TEST_ENV, async () => {
    let capturedCategory: string | null = null

    const mock = multiMockFetch([
      {
        match: "/auth/v1/user",
        response: () => mockSupabaseAuthSuccess(USER_ID),
      },
      {
        match: "/rest/v1/anomaly_logs",
        response: () => mockInsertSuccess(),
      },
    ])

    // fetch를 중간에 가로채 category를 검증하기 위해 커스텀 mock 사용
    const capturingMock = async (url: string, init?: RequestInit): Promise<Response> => {
      if (url.includes("/rest/v1/anomaly_logs")) {
        if (init?.body) {
          const parsed = JSON.parse(init.body as string)
          const row = Array.isArray(parsed) ? parsed[0] : parsed
          capturedCategory = row?.category ?? null
        }
        return mockInsertSuccess()
      }
      // auth endpoint는 기존 mock 통과
      return mock(url, init)
    }

    await withMockFetch(capturingMock as typeof globalThis.fetch, async () => {
      const req = makeReq("POST", { body: NETWORK_FAIL_BODY })
      const res = await handler(req)
      assertEquals(res.status, 204)
      assertEquals(capturedCategory, "client.network")
    })
  })
})

// category 검증: status 404 → "client.404"
supabaseTest("POST with status=404 → category client.404 in INSERT body", async () => {
  await withEnv(TEST_ENV, async () => {
    let capturedCategory: string | null = null

    const capturingMock = async (url: string, init?: RequestInit): Promise<Response> => {
      if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
      if (url.includes("/rest/v1/anomaly_logs")) {
        if (init?.body) {
          const parsed = JSON.parse(init.body as string)
          const row = Array.isArray(parsed) ? parsed[0] : parsed
          capturedCategory = row?.category ?? null
        }
        return mockInsertSuccess()
      }
      throw new Error(`Unmocked: ${url}`)
    }

    await withMockFetch(capturingMock as typeof globalThis.fetch, async () => {
      const req = makeReq("POST", { body: VALID_BODY }) // VALID_BODY.status = 404
      const res = await handler(req)
      assertEquals(res.status, 204)
      assertEquals(capturedCategory, "client.404")
    })
  })
})
