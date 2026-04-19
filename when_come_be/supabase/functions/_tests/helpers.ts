/**
 * 테스트 헬퍼: fetch 목킹 + env 스텁
 */

export type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** fetch를 임시 교체하고 테스트 후 복원 */
export async function withMockFetch(
  mockFn: FetchHandler,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch
  globalThis.fetch = mockFn as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
}

/** 패턴 기반 멀티 fetch 목 */
export function multiMockFetch(
  routes: Array<{ match: string | RegExp; response: () => Response }>,
): FetchHandler {
  return async (url: string) => {
    for (const route of routes) {
      const matched = typeof route.match === "string"
        ? url.includes(route.match)
        : route.match.test(url)
      if (matched) return route.response()
    }
    throw new Error(`Unmocked fetch URL: ${url}`)
  }
}

/** Deno.env.get 을 테스트 중 덮어쓰기 */
export function withEnv(
  env: Record<string, string>,
  fn: () => Promise<void>,
): Promise<void> {
  const original = Deno.env.get.bind(Deno.env)
  // @ts-ignore — 테스트 전용 스텁
  Deno.env.get = (key: string) => env[key] ?? original(key)
  return fn().finally(() => {
    // @ts-ignore
    Deno.env.get = original
  })
}

export function makeRequest(
  method: string,
  url: string,
  options?: { body?: unknown; headers?: Record<string, string> },
): Request {
  const init: RequestInit = { method, headers: options?.headers ?? {} }
  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body)
    ;(init.headers as Record<string, string>)["content-type"] = "application/json"
  }
  return new Request(url, init)
}

export const TEST_ENV = {
  ODSAY_API_KEY: "test-odsay-key",
  SEOUL_BUS_API_KEY: "test-bus-key",
  SEOUL_SUBWAY_API_KEY: "test-subway-key",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
}

// Supabase auth.getUser 응답 목 — PostgREST/Auth raw HTTP 포맷
export function mockSupabaseAuthSuccess(userId = "user-123") {
  // Supabase Auth GET /auth/v1/user 실제 응답 구조
  return jsonResponse({
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: null,
    app_metadata: { provider: "anonymous" },
    user_metadata: {},
  })
}

export function mockSupabaseAuthFailure() {
  return new Response(JSON.stringify({ msg: "Invalid JWT", hint: "" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Deno.test 옵션 헬퍼 — Supabase 클라이언트가 내부적으로 시작하는
 * auth 토큰 갱신 타이머/interval 누수를 테스트에서 무시하기 위한 옵션
 */
export function supabaseTest(
  name: string,
  fn: () => Promise<void>,
) {
  Deno.test({
    name,
    sanitizeOps: false,       // Supabase 내부 비동기 ops 무시
    sanitizeResources: false, // Supabase 내부 타이머/소켓 무시
    fn,
  })
}
