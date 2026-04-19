import { assertEquals } from "@std/assert"
import { handler } from "../routes/index.ts"
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

const BASE = "https://test.supabase.co/functions/v1/routes"
const AUTH_HEADER = { authorization: "Bearer valid-jwt-token" }

const ROUTE_ID = "550e8400-e29b-41d4-a716-446655440000"
const USER_ID = "660e8400-e29b-41d4-a716-446655440001"

function makeRouteRequest(
  method: string,
  path = "",
  options?: { body?: unknown; auth?: boolean },
) {
  return makeRequest(method, `${BASE}${path}`, {
    body: options?.body,
    headers: options?.auth !== false ? AUTH_HEADER : {},
  })
}

// ─── PostgREST 포맷 목 응답 ────────────────────────────────────
// Supabase JS SDK는 내부적으로 PostgREST HTTP 응답을 직접 파싱함.
// { data, error } SDK 래퍼가 아닌 raw PostgREST JSON을 반환해야 함.

function mockDbInsertRoute() {
  // single() — Accept: application/vnd.pgrst.object+json → 단일 객체 반환
  return jsonResponse({ id: ROUTE_ID }, 201)
}

function mockDbInsertStops() {
  // select("id, sequence") → 배열 반환
  return jsonResponse([{ id: "stop-uuid-1", sequence: 1 }], 201)
}

function mockDbInsertStopRoutes() {
  // no select → 빈 배열 반환
  return jsonResponse([], 201)
}

function mockDbListRoutes() {
  return jsonResponse([
    {
      id: ROUTE_ID,
      name: "출근길",
      origin_name: "집",
      destination_name: "회사",
      origin_coords: { lat: 37.49, lng: 127.02 },
      destination_coords: { lat: 37.55, lng: 126.92 },
      is_active: true,
      created_at: "2026-04-19T00:00:00Z",
      updated_at: "2026-04-19T00:00:00Z",
      route_stops: [],
    },
  ])
}

function mockDbDeleteRoute(found: boolean) {
  // update().select("id") → 수정된 행 배열 반환
  return found ? jsonResponse([{ id: ROUTE_ID }]) : jsonResponse([])
}

// ─── CORS ────────────────────────────────────────────────────

Deno.test("routes — OPTIONS는 200을 반환한다", async () => {
  const res = await handler(makeRequest("OPTIONS", BASE))
  assertEquals(res.status, 200)
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
  assertEquals(res.headers.get("Access-Control-Allow-Methods")?.includes("DELETE"), true)
})

// ─── 인증 검증 ────────────────────────────────────────────────

supabaseTest("routes GET — Authorization 헤더 없으면 401을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthFailure(), async () => {
      const res = await handler(makeRouteRequest("GET", "", { auth: false }))
      assertEquals(res.status, 401)
    })
  )
})

supabaseTest("routes POST — 유효하지 않은 JWT는 401을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthFailure(), async () => {
      const res = await handler(makeRouteRequest("POST", "", {
        body: { name: "출근길", originName: "집", destinationName: "회사", stops: [] },
      }))
      assertEquals(res.status, 401)
    })
  )
})

supabaseTest("routes DELETE — 인증 없으면 401을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthFailure(), async () => {
      const res = await handler(makeRouteRequest("DELETE", `/${ROUTE_ID}`, { auth: false }))
      assertEquals(res.status, 401)
    })
  )
})

// ─── GET /routes ──────────────────────────────────────────────

supabaseTest("routes GET — 내 경로 목록을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbListRoutes() },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("GET"))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.length, 1)
        assertEquals(body[0].name, "출근길")
        assertEquals(body[0].origin_name, "집")
      },
    )
  )
})

// ─── POST /routes 검증 ────────────────────────────────────────

supabaseTest("routes POST — name 없으면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const res = await handler(makeRouteRequest("POST", "", {
        body: { originName: "집", destinationName: "회사", stops: [{}] },
      }))
      assertEquals(res.status, 400)
      const body = await res.json()
      assertEquals(body.error, "name, originName, destinationName 이 필요합니다")
    })
  )
})

supabaseTest("routes POST — originName 없으면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const res = await handler(makeRouteRequest("POST", "", {
        body: { name: "출근길", destinationName: "회사", stops: [{}] },
      }))
      assertEquals(res.status, 400)
    })
  )
})

supabaseTest("routes POST — stops 빈 배열이면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const res = await handler(makeRouteRequest("POST", "", {
        body: { name: "출근길", originName: "집", destinationName: "회사", stops: [] },
      }))
      assertEquals(res.status, 400)
      const body = await res.json()
      assertEquals(body.error, "stops 가 필요합니다")
    })
  )
})

supabaseTest("routes POST — stopType이 유효하지 않으면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const res = await handler(makeRouteRequest("POST", "", {
        body: {
          name: "출근길",
          originName: "집",
          destinationName: "회사",
          stops: [{
            odsayStopId: "1",
            stopName: "역",
            stopType: "tram",
            sequence: 1,
            stopRoutes: [],
          }],
        },
      }))
      assertEquals(res.status, 400)
      const body = await res.json()
      assertEquals(body.error.includes("stopType"), true)
    })
  )
})

supabaseTest("routes POST — name이 공백만 있으면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const res = await handler(makeRouteRequest("POST", "", {
        body: {
          name: "   ",
          originName: "집",
          destinationName: "회사",
          stops: [{ stopType: "bus", sequence: 1, stopRoutes: [] }],
        },
      }))
      assertEquals(res.status, 400)
    })
  )
})

// ─── POST /routes 정상 동작 ───────────────────────────────────

supabaseTest("routes POST — 경로를 정상 저장하고 201과 id를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbInsertRoute() },
        { match: "route_stops", response: () => mockDbInsertStops() },
        { match: "stop_routes", response: () => mockDbInsertStopRoutes() },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("POST", "", {
          body: {
            name: "출근길",
            originName: "집",
            destinationName: "회사",
            originCoords: { lat: 37.49, lng: 127.02 },
            stops: [{
              odsayStopId: "106186",
              stopName: "강남역",
              stopType: "subway",
              sequence: 1,
              stopRoutes: [{
                odsayRouteId: "110",
                routeName: "2호선",
                stationName: "강남",
              }],
            }],
          },
        }))
        assertEquals(res.status, 201)
        const body = await res.json()
        assertEquals(typeof body.id, "string")
      },
    )
  )
})

supabaseTest("routes POST — stopRoutes가 없어도 정상 저장된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbInsertRoute() },
        { match: "route_stops", response: () => mockDbInsertStops() },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("POST", "", {
          body: {
            name: "출근길",
            originName: "집",
            destinationName: "회사",
            stops: [{
              odsayStopId: "106186",
              stopName: "강남역",
              stopType: "bus",
              sequence: 1,
              stopRoutes: [],
            }],
          },
        }))
        assertEquals(res.status, 201)
      },
    )
  )
})

// ─── DELETE /routes/:id ───────────────────────────────────────

supabaseTest("routes DELETE — 경로를 soft delete하고 ok를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbDeleteRoute(true) },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("DELETE", `/${ROUTE_ID}`))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.ok, true)
      },
    )
  )
})

supabaseTest("routes DELETE — 존재하지 않는 경로는 404를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbDeleteRoute(false) },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("DELETE", "/non-existent-id"))
        assertEquals(res.status, 404)
        const body = await res.json()
        assertEquals(body.error, "경로를 찾을 수 없습니다")
      },
    )
  )
})

// ─── URL 라우팅 ────────────────────────────────────────────────

supabaseTest("routes — /functions/v1/routes/:id 경로 패턴도 id를 인식한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbDeleteRoute(true) },
      ]),
      async () => {
        // Supabase 실제 URL 패턴
        const req = makeRequest("DELETE",
          `https://test.supabase.co/functions/v1/routes/${ROUTE_ID}`,
          { headers: AUTH_HEADER },
        )
        const res = await handler(req)
        assertEquals(res.status, 200)
      },
    )
  )
})

supabaseTest("routes — id 없이 DELETE하면 405를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const res = await handler(makeRouteRequest("DELETE"))
      assertEquals(res.status, 405)
    })
  )
})

supabaseTest("routes — 지원하지 않는 메서드(PUT)는 405를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const res = await handler(makeRouteRequest("PUT", "", { body: {} }))
      assertEquals(res.status, 405)
    })
  )
})
