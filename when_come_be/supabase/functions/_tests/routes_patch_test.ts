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
const USER_ID = "user-123"
const ROUTE_ID = "550e8400-e29b-41d4-a716-446655440000"

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

function mockDbPatchRoute(found = true) {
  return found ? jsonResponse([{ id: ROUTE_ID }]) : jsonResponse([])
}

function mockDbRouteExists() {
  return jsonResponse({ id: ROUTE_ID })
}

function mockDbRouteNotFound() {
  return new Response("", { status: 406 })
}

function mockDbDeleteStops() {
  return jsonResponse([], 200)
}

function mockDbInsertStops() {
  return jsonResponse([{ id: "stop-uuid-1", sequence: 1, step_group: 1 }], 201)
}

function mockDbInsertStopRoutes() {
  return jsonResponse([], 201)
}

// ─── PATCH /routes/:id — active 토글 ─────────────────────────────────────────

supabaseTest("routes PATCH — active=false로 비활성화할 수 있다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbPatchRoute(true) },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
          body: { active: false },
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.ok, true)
      },
    )
  )
})

supabaseTest("routes PATCH — active=true로 재활성화할 수 있다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbPatchRoute(true) },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
          body: { active: true },
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.ok, true)
      },
    )
  )
})

// ─── PATCH /routes/:id — displayOrder 변경 ────────────────────────────────────

supabaseTest("routes PATCH — displayOrder 단일 변경이 정상 처리된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbPatchRoute(true) },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
          body: { displayOrder: 2 },
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.ok, true)
      },
    )
  )
})

// ─── PATCH /routes/:id — name 변경 ────────────────────────────────────────────

supabaseTest("routes PATCH — name 단일 변경이 정상 처리된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbPatchRoute(true) },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
          body: { name: "출근길(수정)" },
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.ok, true)
      },
    )
  )
})

supabaseTest("routes PATCH — name이 빈 문자열이면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(USER_ID), async () => {
      const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
        body: { name: "" },
      }))
      assertEquals(res.status, 400)
    })
  )
})

// ─── PATCH /routes/:id — 수정할 필드 없으면 400 ──────────────────────────────

supabaseTest("routes PATCH — 수정할 필드 없으면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(USER_ID), async () => {
      const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
        body: {},
      }))
      assertEquals(res.status, 400)
    })
  )
})

// ─── PATCH /routes/:id — 없는 route ──────────────────────────────────────────

supabaseTest("routes PATCH — 없는 route는 404를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbPatchRoute(false) },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("PATCH", "/non-existent-id", {
          body: { active: false },
        }))
        assertEquals(res.status, 404)
      },
    )
  )
})

// ─── PATCH /routes/:id — 인증 검증 ───────────────────────────────────────────

supabaseTest("routes PATCH — 인증 없으면 401을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthFailure(), async () => {
      const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
        auth: false,
        body: { active: false },
      }))
      assertEquals(res.status, 401)
    })
  )
})

// ─── PATCH /routes/:id — stops 전체 교체 ─────────────────────────────────────

supabaseTest("routes PATCH — stops 전체 교체가 정상 처리된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        {
          match: "/rest/v1/routes",
          response: () => mockDbRouteExists(),
        },
        {
          match: "route_stops",
          response: (_url, init) => {
            if (init?.method === "DELETE") return mockDbDeleteStops()
            return mockDbInsertStops()
          },
        },
        { match: "stop_routes", response: () => mockDbInsertStopRoutes() },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
          body: {
            stops: [{
              odsayStopId: "106186",
              stopName: "강남역",
              stopType: "subway",
              sequence: 1,
              stepGroup: 1,
              stopRoutes: [],
            }],
          },
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.ok, true)
      },
    )
  )
})

supabaseTest("routes PATCH — stops 빈 배열이면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(USER_ID), async () => {
      const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
        body: { stops: [] },
      }))
      assertEquals(res.status, 400)
    })
  )
})

// ─── 기존 PATCH 동작 회귀 없음 (active 토글 — 기존 is_active 아님) ─────────────

supabaseTest("routes PATCH — active 필드가 boolean이 아니면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(USER_ID), async () => {
      const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
        body: { active: "yes" },
      }))
      assertEquals(res.status, 400)
    })
  )
})

// ─── PATCH stops — gyeonggi provider stops 교체 시 GBIS 매핑 ─────────────────

supabaseTest("routes PATCH — gyeonggi provider stops 교체 시 GBIS 매핑이 수행된다", async () => {
  const GBIS_STATION_ID = "234000191"
  const GBIS_ROUTE_ID = "234000061"

  await withEnv(
    {
      ...ENV,
      SUPABASE_URL: TEST_ENV.SUPABASE_URL,
      SUPABASE_ANON_KEY: TEST_ENV.SUPABASE_ANON_KEY,
      // GBIS mock은 fetch 레벨에서 처리
    },
    () =>
      withMockFetch(
        multiMockFetch([
          { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
          // route 존재 확인
          { match: "/rest/v1/routes", response: () => mockDbRouteExists() },
          // gbis_stations 조회 (resolveStopProvider 내부) — gyeonggi 매핑 성공
          {
            match: "gbis_stations",
            response: () =>
              jsonResponse([
                {
                  station_id: GBIS_STATION_ID,
                  station_name: "광명사거리",
                  x: 126.8628,
                  y: 37.4912,
                  sigun_nm: "광명시",
                },
              ]),
          },
          // GBIS 노선 목록 조회 (mapGbisRoutes 내부)
          {
            match: "getBusRouteListv2",
            response: () =>
              jsonResponse({
                response: {
                  msgBody: {
                    busRouteList: [
                      {
                        routeId: GBIS_ROUTE_ID,
                        routeName: "96",
                        routeTypeName: "일반버스",
                        staOrder: 10,
                      },
                    ],
                  },
                },
              }),
          },
          // route_stops DELETE
          {
            match: "route_stops",
            response: (_url: string, init?: RequestInit) => {
              if (init?.method === "DELETE") return mockDbDeleteStops()
              return mockDbInsertStops()
            },
          },
          // stop_routes INSERT
          { match: "stop_routes", response: () => mockDbInsertStopRoutes() },
        ]),
        async () => {
          const res = await handler(makeRouteRequest("PATCH", `/${ROUTE_ID}`, {
            body: {
              stops: [{
                odsayStopId: "87103",
                stopName: "광명사거리",
                stopType: "bus",
                sequence: 1,
                stepGroup: 1,
                lat: 37.4912,
                lng: 126.8628,
                stopRoutes: [{
                  odsayRouteId: "234000061",  // 2xxx → gyeonggi
                  routeName: "96",
                  busType: 6,
                }],
              }],
            },
          }))
          assertEquals(res.status, 200)
          const body = await res.json()
          assertEquals(body.ok, true)
        },
      ),
  )
})
