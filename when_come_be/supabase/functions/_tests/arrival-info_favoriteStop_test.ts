/**
 * arrival-info: favorite_stops lookup 테스트 (T10)
 * - stopId가 favorite_stops를 가리키는 케이스 → 정상 응답
 * - stopId가 둘 다 없는 케이스 → 404 ARRIVAL_STOP_NOT_FOUND
 * - route_stops 케이스 회귀 없음 (기존 테스트에서 검증)
 */

import { assertEquals } from "@std/assert"
import { handler } from "../arrival-info/index.ts"
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

const ENV = {
  SUPABASE_URL: TEST_ENV.SUPABASE_URL,
  SUPABASE_ANON_KEY: TEST_ENV.SUPABASE_ANON_KEY,
  SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY,
  GYEONGGI_BUS_API_KEY: "test-gbis-key",
  ODSAY_API_KEY: TEST_ENV.ODSAY_API_KEY,
}

const BASE = "https://test.supabase.co/functions/v1/arrival-info"
const AUTH_HEADER = { authorization: "Bearer valid-jwt-token" }
const USER_ID = "user-123"
const FAV_STOP_ID = "fav-stop-uuid-1"

function makeArrivalRequest(params: string, options?: { auth?: boolean }) {
  return makeRequest("GET", `${BASE}?${params}`, {
    headers: options?.auth !== false ? AUTH_HEADER : {},
  })
}

// route_stops PostgREST single() 404 응답 (PGRST116)
function mockRouteStopsNotFound() {
  return new Response(
    JSON.stringify({ code: "PGRST116", message: "Not found" }),
    { status: 406, headers: { "Content-Type": "application/json" } },
  )
}

// favorite_stops PostgREST single() 404 응답
function mockFavStopsNotFound() {
  return new Response(
    JSON.stringify({ code: "PGRST116", message: "Not found" }),
    { status: 406, headers: { "Content-Type": "application/json" } },
  )
}

// ─── favorite_stops uuid로 도착 조회 (서울 provider) ────────────────────────

supabaseTest("arrival-info favoriteStop — stopId가 favorite_stops(서울 provider) → 정상 응답", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        // 1차: route_stops → 미발견
        { match: "/rest/v1/route_stops", response: () => mockRouteStopsNotFound() },
        // 2차: favorite_stops → 발견
        {
          match: "/rest/v1/favorite_stops",
          response: () =>
            jsonResponse({
              id: FAV_STOP_ID,
              stop_type: "bus",
              ars_id: "17243",
              gbis_station_id: null,
              provider: "seoul",
              odsay_stop_id: "106186",
              stop_name: "강남역",
              favorite_stop_routes: [],
            }),
        },
        // 서울 버스 API 도착정보
        {
          match: "ws.bus.go.kr",
          response: () =>
            jsonResponse({
              msgBody: {
                itemList: [
                  {
                    busRouteId: "100100643",
                    busRouteAbrv: "643",
                    arrmsg1: "5분후[3번째 전]",
                    arrmsg2: "18분후[10번째 전]",
                    traTime1: "300",
                    traTime2: "1080",
                  },
                ],
              },
            }),
        },
      ]),
      async () => {
        const res = await handler(makeArrivalRequest(`stopId=${FAV_STOP_ID}`))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.provider, "seoul")
        assertEquals(body.items.length, 1)
        assertEquals(body.items[0].busRouteAbrv, "643")
        assertEquals(typeof body.fetchedAt, "string")
      },
    )
  )
})

// ─── favorite_stops uuid로 도착 조회 (경기 provider) ────────────────────────

supabaseTest("arrival-info favoriteStop — stopId가 favorite_stops(경기 provider) → 정상 응답", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/route_stops", response: () => mockRouteStopsNotFound() },
        {
          match: "/rest/v1/favorite_stops",
          response: () =>
            jsonResponse({
              id: FAV_STOP_ID,
              stop_type: "bus",
              ars_id: null,
              gbis_station_id: "200000177",
              provider: "gyeonggi",
              odsay_stop_id: "999001",
              stop_name: "광명사거리역",
              favorite_stop_routes: [],
            }),
        },
        {
          match: "apis.data.go.kr",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busArrivalList: [
                  {
                    stationId: 200000177,
                    routeId: 234000016,
                    routeName: "11",
                    staOrder: 12,
                    predictTimeSec1: 180,
                    predictTimeSec2: 720,
                    locationNo1: 2,
                    locationNo2: 8,
                    flag: "RUN",
                    stateCd1: 0,
                    stateCd2: 0,
                    remainSeatCnt1: -1,
                    remainSeatCnt2: -1,
                    crowded1: 2,
                    crowded2: null,
                    lowPlate1: 1,
                    lowPlate2: null,
                    routeTypeCd: 13,
                    predictTime1: 3,
                    predictTime2: 12,
                    plateNo1: null,
                    plateNo2: null,
                    routeDestId: null,
                    routeDestName: null,
                    vehId1: null,
                    vehId2: null,
                    taglessCd1: null,
                    taglessCd2: null,
                    turnSeq: null,
                  },
                ],
              },
            }),
        },
      ]),
      async () => {
        const res = await handler(makeArrivalRequest(`stopId=${FAV_STOP_ID}`))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.provider, "gyeonggi")
        assertEquals(body.items.length, 1)
        assertEquals(body.items[0].arrmsg1, "3분후[2번째 전]")
      },
    )
  )
})

// ─── stopId가 route_stops, favorite_stops 모두에 없는 케이스 → 404 ──────────

supabaseTest("arrival-info favoriteStop — route_stops, favorite_stops 모두 미발견 → 404 ARRIVAL_STOP_NOT_FOUND", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/route_stops", response: () => mockRouteStopsNotFound() },
        { match: "/rest/v1/favorite_stops", response: () => mockFavStopsNotFound() },
      ]),
      async () => {
        const res = await handler(makeArrivalRequest(`stopId=totally-unknown-uuid`))
        assertEquals(res.status, 404)
        const body = await res.json()
        assertEquals(body.error.code, "ARRIVAL_STOP_NOT_FOUND")
      },
    )
  )
})

// ─── route_stops에 있는 케이스 — favorite_stops 조회하지 않음 (회귀) ──────────

supabaseTest("arrival-info favoriteStop — route_stops에 있으면 favorite_stops 조회 없이 처리된다 (회귀)", async () => {
  let favStopQueriedCount = 0

  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        {
          match: "/rest/v1/route_stops",
          response: () =>
            jsonResponse({
              id: "route-stop-uuid",
              route_id: "route-1",
              stop_type: "bus",
              ars_id: "17243",
              gbis_station_id: null,
              provider: "seoul",
              odsay_stop_id: "106186",
              stop_name: "강남역",
              routes: { user_id: USER_ID },
              stop_routes: [],
            }),
        },
        {
          match: "/rest/v1/favorite_stops",
          response: () => {
            favStopQueriedCount++
            return mockFavStopsNotFound()
          },
        },
        {
          match: "ws.bus.go.kr",
          response: () =>
            jsonResponse({
              msgBody: {
                itemList: [
                  {
                    busRouteId: "100100643",
                    busRouteAbrv: "643",
                    arrmsg1: "5분후",
                    arrmsg2: "15분후",
                    traTime1: "300",
                    traTime2: "900",
                  },
                ],
              },
            }),
        },
      ]),
      async () => {
        const res = await handler(makeArrivalRequest("stopId=route-stop-uuid"))
        assertEquals(res.status, 200)
        // favorite_stops가 쿼리되지 않아야 함
        assertEquals(favStopQueriedCount, 0)
      },
    )
  )
})
