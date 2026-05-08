import { assertEquals } from "@std/assert"
import { handler } from "../route-stops/index.ts"
import {
  withMockFetch,
  withEnv,
  jsonResponse,
  makeRequest,
  multiMockFetch,
  mockSupabaseAuthSuccess,
  mockSupabaseAuthFailure,
  supabaseTest,
  TEST_ENV,
} from "./helpers.ts"

const ENV = {
  SUPABASE_URL: TEST_ENV.SUPABASE_URL,
  SUPABASE_ANON_KEY: TEST_ENV.SUPABASE_ANON_KEY,
}

const BASE = "https://test.supabase.co/functions/v1/route-stops"
const AUTH_HEADER = { authorization: "Bearer valid-jwt-token" }
const USER_ID = "user-123"
const STOP_ID = "stop-uuid-1"

function makeReq(
  method: string,
  path = "",
  options?: { body?: unknown; auth?: boolean },
) {
  return makeRequest(method, `${BASE}${path}`, {
    body: options?.body,
    headers: options?.auth !== false ? AUTH_HEADER : {},
  })
}

function mockRouteStopExisting(found = true) {
  if (!found) return new Response("", { status: 406 })
  return jsonResponse({
    id: STOP_ID,
    route_id: "route-1",
    routes: { user_id: USER_ID },
  })
}

function mockRouteStopUpdated(alias: string | null = null) {
  return jsonResponse({
    id: STOP_ID,
    route_id: "route-1",
    step_group: 1,
    sequence: 1,
    odsay_stop_id: "106186",
    stop_name: "강남역",
    stop_type: "bus",
    ars_id: "23156",
    direction_headsign: null,
    direction_updn: null,
    direction_next_stop: null,
    provider: "seoul",
    gbis_station_id: null,
    alias,
    stop_routes: [],
  })
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

Deno.test("route-stops PATCH — OPTIONS는 200을 반환한다", async () => {
  const res = await handler(makeRequest("OPTIONS", BASE))
  assertEquals(res.status, 200)
})

// ─── 인증 검증 ────────────────────────────────────────────────────────────────

supabaseTest("route-stops PATCH — Authorization 없으면 401을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthFailure(), async () => {
      const res = await handler(makeReq("PATCH", `/${STOP_ID}`, {
        auth: false,
        body: { alias: "테스트" },
      }))
      assertEquals(res.status, 401)
    })
  )
})

// ─── PATCH /route-stops/:id ───────────────────────────────────────────────────

supabaseTest("route-stops PATCH — alias 변경이 정상 처리된다", async () => {
  let routeStopCallCount = 0

  await withEnv(ENV, () =>
    withMockFetch(
      async (url) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        if (url.includes("/rest/v1/route_stops")) {
          routeStopCallCount++
          // 1st = SELECT existence, 2nd = PATCH with select (returns updated row)
          if (routeStopCallCount === 2) return mockRouteStopUpdated("회사 앞")
          return mockRouteStopExisting()
        }
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        const res = await handler(makeReq("PATCH", `/${STOP_ID}`, {
          body: { alias: "회사 앞" },
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.alias, "회사 앞")
        assertEquals(body.stop_name, "강남역")
      },
    )
  )
})

supabaseTest("route-stops PATCH — alias null로 변경이 정상 처리된다", async () => {
  let callCount = 0

  await withEnv(ENV, () =>
    withMockFetch(
      async (url) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        if (url.includes("/rest/v1/route_stops")) {
          callCount++
          if (callCount === 2) return mockRouteStopUpdated(null)
          return mockRouteStopExisting()
        }
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        const res = await handler(makeReq("PATCH", `/${STOP_ID}`, {
          body: { alias: null },
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.alias, null)
      },
    )
  )
})

supabaseTest("route-stops PATCH — alias 빈 문자열은 null로 정규화된다", async () => {
  let callCount = 0

  await withEnv(ENV, () =>
    withMockFetch(
      async (url) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        if (url.includes("/rest/v1/route_stops")) {
          callCount++
          if (callCount === 2) return mockRouteStopUpdated(null)
          return mockRouteStopExisting()
        }
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        const res = await handler(makeReq("PATCH", `/${STOP_ID}`, {
          body: { alias: "   " },
        }))
        // alias가 정규화되어 null → 응답에서 확인
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.alias, null)
      },
    )
  )
})

supabaseTest("route-stops PATCH — 없는 id면 404를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/route_stops", response: () => mockRouteStopExisting(false) },
      ]),
      async () => {
        const res = await handler(makeReq("PATCH", "/non-existent-id", {
          body: { alias: "테스트" },
        }))
        assertEquals(res.status, 404)
      },
    )
  )
})

// ─── RLS 격리 케이스 ─────────────────────────────────────────────────────────

supabaseTest("route-stops PATCH — 다른 사용자의 stop 수정 시도 시 404를 반환한다", async () => {
  // RLS가 다른 user_id 행을 숨기면 SELECT 결과가 0건 → 406 → BE가 404 반환
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess("other-user-id") },
        { match: "/rest/v1/route_stops", response: () => mockRouteStopExisting(false) },
      ]),
      async () => {
        const res = await handler(makeReq("PATCH", `/${STOP_ID}`, {
          body: { alias: "침입 시도" },
        }))
        assertEquals(res.status, 404)
      },
    )
  )
})

// ─── 유효성 검사 케이스 ─────────────────────────────────────────────────────────

supabaseTest("route-stops PATCH — alias 21자 초과 시 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(USER_ID), async () => {
      const res = await handler(makeReq("PATCH", `/${STOP_ID}`, {
        body: { alias: "a".repeat(21) },
      }))
      assertEquals(res.status, 400)
    })
  )
})

// ─── 지원하지 않는 메서드 ───────────────────────────────────────────────────────

supabaseTest("route-stops GET — 405를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(USER_ID), async () => {
      const res = await handler(makeReq("GET"))
      assertEquals(res.status, 405)
    })
  )
})
