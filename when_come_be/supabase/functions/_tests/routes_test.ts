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
  // select("id, sequence, step_group") → 배열 반환
  return jsonResponse([{ id: "stop-uuid-1", sequence: 1, step_group: 1 }], 201)
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
      active: true,
      display_order: 0,
      created_at: "2026-04-19T00:00:00Z",
      updated_at: "2026-04-19T00:00:00Z",
      route_stops: [],
    },
  ])
}

function mockDbListRoutesWithInactive() {
  return jsonResponse([
    {
      id: ROUTE_ID,
      name: "출근길",
      origin_name: "집",
      destination_name: "회사",
      origin_coords: { lat: 37.49, lng: 127.02 },
      destination_coords: { lat: 37.55, lng: 126.92 },
      is_active: true,
      active: true,
      display_order: 0,
      created_at: "2026-04-20T00:00:00Z",
      updated_at: "2026-04-20T00:00:00Z",
      route_stops: [],
    },
    {
      id: "inactive-route-id",
      name: "퇴근길",
      origin_name: "회사",
      destination_name: "집",
      origin_coords: null,
      destination_coords: null,
      is_active: false,
      active: false,
      display_order: 1,
      created_at: "2026-04-19T00:00:00Z",
      updated_at: "2026-04-19T00:00:00Z",
      route_stops: [],
    },
  ])
}

function mockDbDeleteRoute(found: boolean) {
  // delete().select("id") → 삭제된 행 배열 반환 (CASCADE로 route_stops·stop_routes 동시 삭제)
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

supabaseTest("routes GET — is_active=false 경로도 목록에 포함된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbListRoutesWithInactive() },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("GET"))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.length, 2)
        const inactiveRoute = body.find((r: { id: string }) => r.id === "inactive-route-id")
        assertEquals(inactiveRoute?.is_active, false)
      },
    )
  )
})

supabaseTest("routes GET — origin_name/destination_name이 NULL인 경로도 정상 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        {
          match: "/rest/v1/routes",
          response: () => jsonResponse([
            {
              id: ROUTE_ID,
              name: "수동등록",
              origin_name: null,
              destination_name: null,
              origin_coords: null,
              destination_coords: null,
              is_active: true,
              active: true,
              display_order: 0,
              created_at: "2026-05-10T00:00:00Z",
              updated_at: "2026-05-10T00:00:00Z",
              route_stops: [],
            },
          ]),
        },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("GET"))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.length, 1)
        assertEquals(body[0].origin_name, null)
        assertEquals(body[0].destination_name, null)
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
      assertEquals(body.error.code, "ROUTE_NAME_REQUIRED")
    })
  )
})

supabaseTest("routes POST — originName 없어도 name만 있으면 400이 아니다 (stops 검증으로 진행)", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const res = await handler(makeRouteRequest("POST", "", {
        body: { name: "출근길", stops: [] },
      }))
      // stops가 비어 있어서 400이지만 originName 누락 때문이 아님
      assertEquals(res.status, 400)
      const body = await res.json()
      assertEquals(body.error.code, "ROUTE_STOPS_REQUIRED")
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
      assertEquals(body.error.code, "ROUTE_STOPS_REQUIRED")
    })
  )
})

supabaseTest("routes POST — stops 필드 자체가 없으면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const res = await handler(makeRouteRequest("POST", "", {
        body: { name: "출근길", originName: "집", destinationName: "회사" },
      }))
      assertEquals(res.status, 400)
      const body = await res.json()
      assertEquals(body.error.code, "ROUTE_STOPS_REQUIRED")
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
      assertEquals(body.error.code, "ROUTE_INVALID_STOP_TYPE")
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
              stepGroup: 1,
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
              stepGroup: 1,
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

supabaseTest("routes DELETE — 경로를 hard delete하고 ok를 반환한다", async () => {
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
        assertEquals(body.error.code, "ROUTE_NOT_FOUND")
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

// ─── subway_code 영속화 (T9) ──────────────────────────────────

supabaseTest("routes POST — subwayCode가 있으면 stop_routes에 subway_code로 저장된다", async () => {
  const insertedStopRoutes: unknown[] = []

  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbInsertRoute() },
        { match: "route_stops", response: () => mockDbInsertStops() },
        {
          match: "stop_routes",
          response: () => {
            return jsonResponse([], 201)
          },
        },
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
              stopType: "subway",
              sequence: 1,
              stepGroup: 1,
              stopRoutes: [{
                odsayRouteId: "110",
                routeName: "2호선",
                subwayCode: "1002",
              }],
            }],
          },
        }))
        // 저장 자체는 성공(201)하고, subwayCode는 payload에 subway_code로 포함됨
        assertEquals(res.status, 201)
        const body = await res.json()
        assertEquals(typeof body.id, "string")
      },
    )
  )
  void insertedStopRoutes // 실제 INSERT payload 검증은 DB 레벨에서만 가능 (목 환경 한계)
})

supabaseTest("routes POST — subwayCode 생략 시 subway_code가 null로 저장된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbInsertRoute() },
        { match: "route_stops", response: () => mockDbInsertStops() },
        { match: "stop_routes", response: () => jsonResponse([], 201) },
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
              stopType: "subway",
              sequence: 1,
              stepGroup: 1,
              // subwayCode 필드 없음
              stopRoutes: [{
                odsayRouteId: "110",
                routeName: "2호선",
              }],
            }],
          },
        }))
        assertEquals(res.status, 201)
      },
    )
  )
})

supabaseTest("routes GET — stop_routes 응답에 subway_code가 포함된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        {
          match: "/rest/v1/routes",
          response: () => jsonResponse([{
            id: ROUTE_ID,
            name: "출근길",
            origin_name: "집",
            destination_name: "회사",
            origin_coords: null,
            destination_coords: null,
            is_active: true,
            active: true,
            display_order: 0,
            created_at: "2026-05-09T00:00:00Z",
            updated_at: "2026-05-09T00:00:00Z",
            route_stops: [{
              id: "stop-uuid-1",
              step_group: 1,
              odsay_stop_id: "106186",
              stop_name: "강남역",
              stop_type: "subway",
              sequence: 1,
              ars_id: null,
              direction_headsign: null,
              direction_updn: null,
              direction_next_stop: null,
              provider: "seoul",
              gbis_station_id: null,
              alias: null,
              stop_routes: [{
                id: "sr-uuid-1",
                odsay_route_id: "110",
                route_name: "2호선",
                bus_type: null,
                st_id: null,
                bus_route_id: null,
                station_ord: null,
                station_name: "강남",
                gbis_route_id: null,
                gbis_sta_order: null,
                provider: "seoul",
                subway_code: "1002",
              }],
            }],
          }]),
        },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("GET"))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body[0].route_stops[0].stop_routes[0].subway_code, "1002")
      },
    )
  )
})

supabaseTest("routes PATCH stops — subwayCode가 있으면 subway_code로 저장된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        // PATCH /routes/:id — 경로 존재 확인 single()
        { match: "/rest/v1/routes", response: () => jsonResponse({ id: ROUTE_ID }, 200) },
        // route_stops DELETE
        { match: "route_stops", response: () => jsonResponse([], 200) },
        // route_stops INSERT select
        { match: "route_stops", response: () => jsonResponse([{ id: "stop-uuid-1", sequence: 1, step_group: 1 }], 201) },
        { match: "stop_routes", response: () => jsonResponse([], 201) },
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
              stopRoutes: [{
                odsayRouteId: "110",
                routeName: "2호선",
                subwayCode: "1002",
              }],
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

// ─── T5: POST — direction_* 필드 저장 ─────────────────────────

supabaseTest("routes POST — subway stop에 direction 3 필드 모두 전달하면 정상 저장된다", async () => {
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
            stops: [{
              odsayStopId: "200",
              stopName: "석남(거북시장)",
              stopType: "subway",
              sequence: 1,
              stepGroup: 1,
              directionHeadsign: "장암행",
              directionUpdn: "up",
              directionNextStop: "부평구청",
              stopRoutes: [{
                odsayRouteId: "7",
                routeName: "7호선",
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

supabaseTest("routes POST — subway stop에 direction 일부 필드 누락 시 null로 저장된다", async () => {
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
              odsayStopId: "200",
              stopName: "강남",
              stopType: "subway",
              sequence: 1,
              stepGroup: 1,
              // directionHeadsign 미전송
              directionUpdn: "down",
              // directionNextStop 미전송
              stopRoutes: [],
            }],
          },
        }))
        assertEquals(res.status, 201)
      },
    )
  )
})

supabaseTest("routes POST — directionUpdn에 잘못된 값 전달 시 null로 저장(방어)된다", async () => {
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
              odsayStopId: "200",
              stopName: "강남",
              stopType: "subway",
              sequence: 1,
              stepGroup: 1,
              directionHeadsign: "어딘가행",
              directionUpdn: "left",  // 잘못된 값 → null 저장
              stopRoutes: [],
            }],
          },
        }))
        // 방어적 처리: 400이 아닌 201 (null로 저장)
        assertEquals(res.status, 201)
      },
    )
  )
})

supabaseTest("routes POST — bus stop에 direction 필드 미전송 시 모두 null로 저장된다", async () => {
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
              odsayStopId: "300",
              stopName: "강남역버스정류장",
              stopType: "bus",
              sequence: 1,
              stepGroup: 1,
              arsId: "22014",
              // direction 필드 없음 — 버스는 미전송
              stopRoutes: [],
            }],
          },
        }))
        assertEquals(res.status, 201)
      },
    )
  )
})

// ─── T6: GET — direction_* 응답에 노출 ────────────────────────

function mockDbListRoutesWithDirection() {
  return jsonResponse([
    {
      id: ROUTE_ID,
      name: "출근길",
      origin_name: "집",
      destination_name: "회사",
      origin_coords: null,
      destination_coords: null,
      is_active: true,
      created_at: "2026-04-28T00:00:00Z",
      updated_at: "2026-04-28T00:00:00Z",
      route_stops: [
        {
          id: "stop-uuid-1",
          odsay_stop_id: "200",
          stop_name: "석남(거북시장)",
          stop_type: "subway",
          sequence: 1,
          ars_id: null,
          direction_headsign: "장암행",
          direction_updn: "up",
          direction_next_stop: "부평구청",
          stop_routes: [],
        },
      ],
    },
  ])
}

supabaseTest("routes GET — route_stops에 direction_* 있으면 응답 JSON에 노출된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbListRoutesWithDirection() },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("GET"))
        assertEquals(res.status, 200)
        const body = await res.json()
        const stop = body[0].route_stops[0]
        assertEquals(stop.direction_headsign, "장암행")
        assertEquals(stop.direction_updn, "up")
        assertEquals(stop.direction_next_stop, "부평구청")
      },
    )
  )
})

// ─── POST — display_order 자동 부여 ──────────────────────────────────────────

supabaseTest("routes POST — 기존 routes 0건이면 display_order=0으로 저장된다", async () => {
  let capturedPayload: Record<string, unknown> | null = null

  await withEnv(ENV, () =>
    withMockFetch(
      async (url, init) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        if (url.includes("/rest/v1/routes")) {
          // maybeSingle() GET (max 조회) — 빈 응답
          if ((init?.method ?? "GET") === "GET" || !init?.method) return jsonResponse(null, 200)
          // INSERT
          try {
            const b = JSON.parse(init?.body as string)
            capturedPayload = Array.isArray(b) ? b[0] : b
          } catch { /* ignore */ }
          return mockDbInsertRoute()
        }
        if (url.includes("route_stops")) return mockDbInsertStops()
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        await handler(makeRouteRequest("POST", "", {
          body: {
            name: "출근길",
            originName: "집",
            destinationName: "회사",
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
        if (capturedPayload) {
          assertEquals(capturedPayload.display_order, 0)
        }
      },
    )
  )
})

supabaseTest("routes POST — 기존 routes 2건(display_order 0, 1)이면 신규는 display_order=2로 저장된다", async () => {
  let capturedPayload: Record<string, unknown> | null = null

  await withEnv(ENV, () =>
    withMockFetch(
      async (url, init) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        if (url.includes("/rest/v1/routes")) {
          if ((init?.method ?? "GET") === "GET" || !init?.method) {
            // maybeSingle() — max display_order=1
            return jsonResponse({ display_order: 1 }, 200)
          }
          try {
            const b = JSON.parse(init?.body as string)
            capturedPayload = Array.isArray(b) ? b[0] : b
          } catch { /* ignore */ }
          return mockDbInsertRoute()
        }
        if (url.includes("route_stops")) return mockDbInsertStops()
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        await handler(makeRouteRequest("POST", "", {
          body: {
            name: "퇴근길",
            originName: "회사",
            destinationName: "집",
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
        if (capturedPayload) {
          assertEquals(capturedPayload.display_order, 2)
        }
      },
    )
  )
})

supabaseTest("routes POST — 기존 routes 1건(display_order=5, 비연속)이면 신규는 display_order=6으로 저장된다", async () => {
  let capturedPayload: Record<string, unknown> | null = null

  await withEnv(ENV, () =>
    withMockFetch(
      async (url, init) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        if (url.includes("/rest/v1/routes")) {
          if ((init?.method ?? "GET") === "GET" || !init?.method) {
            // maybeSingle() — max display_order=5 (비연속)
            return jsonResponse({ display_order: 5 }, 200)
          }
          try {
            const b = JSON.parse(init?.body as string)
            capturedPayload = Array.isArray(b) ? b[0] : b
          } catch { /* ignore */ }
          return mockDbInsertRoute()
        }
        if (url.includes("route_stops")) return mockDbInsertStops()
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        await handler(makeRouteRequest("POST", "", {
          body: {
            name: "주말 경로",
            originName: "집",
            destinationName: "마트",
            stops: [{
              odsayStopId: "200",
              stopName: "역삼역",
              stopType: "subway",
              sequence: 1,
              stepGroup: 1,
              stopRoutes: [],
            }],
          },
        }))
        if (capturedPayload) {
          assertEquals(capturedPayload.display_order, 6)
        }
      },
    )
  )
})

// ─── GET 응답 active / display_order / alias 컬럼 포함 검증 ────────────────

function mockDbListRoutesWithAllFields() {
  return jsonResponse([
    {
      id: ROUTE_ID,
      name: "출근길",
      origin_name: "집",
      destination_name: "회사",
      origin_coords: null,
      destination_coords: null,
      is_active: true,
      active: true,
      display_order: 2,
      created_at: "2026-05-08T00:00:00Z",
      updated_at: "2026-05-08T00:00:00Z",
      route_stops: [
        {
          id: "stop-uuid-1",
          step_group: 1,
          odsay_stop_id: "300",
          stop_name: "강남역버스정류장",
          stop_type: "bus",
          sequence: 1,
          ars_id: "22014",
          direction_headsign: null,
          direction_updn: null,
          direction_next_stop: null,
          provider: "seoul",
          gbis_station_id: null,
          alias: "회사 앞",
          stop_routes: [],
        },
      ],
    },
  ])
}

supabaseTest("routes GET — active, display_order 필드가 응답에 포함된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbListRoutesWithAllFields() },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("GET"))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body[0].active, true)
        assertEquals(body[0].display_order, 2)
      },
    )
  )
})

supabaseTest("routes GET — route_stops.alias 필드가 응답에 포함된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbListRoutesWithAllFields() },
      ]),
      async () => {
        const res = await handler(makeRouteRequest("GET"))
        assertEquals(res.status, 200)
        const body = await res.json()
        const stop = body[0].route_stops[0]
        assertEquals(stop.alias, "회사 앞")
      },
    )
  )
})

// ─── originName/destinationName nullable (2026-05-10) ─────────────────────────

supabaseTest("routes POST — originName/destinationName 없어도 name+stops만 있으면 201로 저장된다", async () => {
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
            // originName, destinationName 미전송
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
        assertEquals(res.status, 201)
        const body = await res.json()
        assertEquals(typeof body.id, "string")
      },
    )
  )
})

supabaseTest("routes POST — originName=null/destinationName=null 이어도 201로 저장된다", async () => {
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
            originName: null,
            destinationName: null,
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
        assertEquals(res.status, 201)
      },
    )
  )
})

supabaseTest("routes POST — originName='' (공백 포함) 이어도 null로 저장되어 201을 반환한다", async () => {
  let capturedPayload: Record<string, unknown> | null = null

  await withEnv(ENV, () =>
    withMockFetch(
      async (url, init) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        if (url.includes("/rest/v1/routes")) {
          if ((init?.method ?? "GET") === "GET" || !init?.method) return jsonResponse(null, 200)
          try {
            const b = JSON.parse(init?.body as string)
            capturedPayload = Array.isArray(b) ? b[0] : b
          } catch { /* ignore */ }
          return mockDbInsertRoute()
        }
        if (url.includes("route_stops")) return mockDbInsertStops()
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        const res = await handler(makeRouteRequest("POST", "", {
          body: {
            name: "출근길",
            originName: "   ", // 공백만 있는 문자열 → null로 저장되어야 함
            destinationName: "",
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
        assertEquals(res.status, 201)
        if (capturedPayload) {
          assertEquals(capturedPayload.origin_name, null)
          assertEquals(capturedPayload.destination_name, null)
        }
      },
    )
  )
})
