/**
 * 버그 픽스 테스트: 서울 bbox 정류장의 경기버스 도착정보 "도착 정보 없음" 수정 검증
 *
 * 수정 원칙: stop_routes.provider는 실제 호출될 API를 정확히 반영한다.
 * - stopProvider='gyeonggi'(GBIS 정류소 찾음) → 경기버스는 'gyeonggi'
 * - stopProvider='seoul'(서울 bbox, GBIS 못 찾음) → 모든 노선은 'seoul'
 *   (Seoul BIS getStationByUid가 경기버스 도착정보도 같이 반환)
 * - stopProvider='odsay_fallback' → 모든 노선은 'odsay_fallback'
 */

import { assertEquals, assertNotEquals } from "@std/assert"
import { handler as routesHandler } from "../routes/index.ts"
import { handler as arrivalHandler } from "../arrival-info/index.ts"
import { handler as favoriteHandler } from "../favorite-stops/index.ts"
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

const ROUTES_BASE = "https://test.supabase.co/functions/v1/routes"
const ARRIVAL_BASE = "https://test.supabase.co/functions/v1/arrival-info"
const FAVORITES_BASE = "https://test.supabase.co/functions/v1/favorite-stops"
const AUTH_HEADER = { authorization: "Bearer valid-jwt-token" }
const USER_ID = "user-123"
const ROUTE_ID = "route-uuid-1"
const STOP_ID = "stop-uuid-1"

// ─── 저장 시점 (routes POST) ─────────────────────────────────────────────────

supabaseTest(
  "provider fix — 서울 bbox + 경기버스 노선(2xxx) → stop_routes.provider='seoul'로 저장",
  async () => {
    let capturedStopRoutesBody: unknown = null

    await withEnv(ENV, () =>
      withMockFetch(
        async (url: string, init?: RequestInit) => {
          if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
          if (url.includes("/rest/v1/routes") && !url.includes("route_stops")) {
            return jsonResponse({ id: ROUTE_ID }, 201)
          }
          if (url.includes("route_stops")) {
            return jsonResponse([{ id: STOP_ID, sequence: 1, step_group: 1 }], 201)
          }
          if (url.includes("stop_routes")) {
            capturedStopRoutesBody = JSON.parse((init?.body as string) ?? "[]")
            return jsonResponse([], 201)
          }
          return jsonResponse([], 200)
        },
        async () => {
          // lat: 37.48 (서울 bbox) — 현대아파트.개봉중앙시장 유사 케이스
          const res = await routesHandler(
            makeRequest("POST", ROUTES_BASE, {
              body: {
                name: "출근길",
                stops: [{
                  odsayStopId: "17209",
                  stopName: "현대아파트.개봉중앙시장",
                  stopType: "bus",
                  sequence: 1,
                  stepGroup: 1,
                  arsId: "17209",
                  lat: 37.480,   // 서울 bbox
                  lng: 126.850,
                  stopRoutes: [
                    { odsayRouteId: "200000001", routeName: "1", busType: 6 },    // 경기버스
                    { odsayRouteId: "200000011", routeName: "11", busType: 6 },   // 경기버스
                    { odsayRouteId: "200000022", routeName: "22", busType: 6 },   // 경기버스
                  ],
                }],
              },
              headers: AUTH_HEADER,
            })
          )
          assertEquals(res.status, 201)

          const rows = capturedStopRoutesBody as Array<{ odsay_route_id: string; provider: string }>
          assertEquals(rows.length, 3)
          // stopProvider='seoul'이므로 경기버스도 모두 'seoul'로 저장
          for (const row of rows) {
            assertEquals(
              row.provider,
              "seoul",
              `odsay_route_id=${row.odsay_route_id}는 'seoul'이어야 함 (서울 bbox + 경기버스)`,
            )
          }
        },
      )
    )
  },
)

supabaseTest(
  "provider fix — 경기 좌표 + GBIS 정류소 찾음 + 경기버스 → stop_routes.provider='gyeonggi'",
  async () => {
    let capturedStopRoutesBody: unknown = null
    const { clearRouteStationCache } = await import("../_shared/gbisClient.ts")
    clearRouteStationCache()

    await withEnv(ENV, () =>
      withMockFetch(
        async (url: string, init?: RequestInit) => {
          if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
          if (url.includes("gbis_stations") && url.includes("eq=ars_no")) return jsonResponse([])
          if (url.includes("gbis_stations")) {
            return jsonResponse([
              { station_id: "200000555", station_name: "수원터미널", lng: 127.016, lat: 37.265, ars_no: null, sigun_nm: "수원시" },
            ])
          }
          if (url.includes("getBusRouteListv2")) {
            return jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: { busRouteList: [{ routeId: "234000011", routeName: "11", regionName: "수원" }] },
            })
          }
          if (url.includes("getBusRouteStationListv2")) {
            return jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: { busRouteStationList: [{ stationId: "200000555", stationName: "수원터미널", stationSeq: 5 }] },
            })
          }
          if (url.includes("getBusArrivalListv2")) {
            return jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busArrivalList: [{
                  routeId: 234000011, routeName: "11", flag: "RUN", staOrder: 5, stationId: 200000555,
                  predictTimeSec1: 60, predictTimeSec2: null, locationNo1: 1, locationNo2: null,
                  stateCd1: 0, stateCd2: null, remainSeatCnt1: null, remainSeatCnt2: null,
                  crowded1: null, crowded2: null, lowPlate1: null, lowPlate2: null,
                  routeTypeCd: 13, predictTime1: 1, predictTime2: null,
                  plateNo1: null, plateNo2: null, routeDestId: null, routeDestName: null,
                  vehId1: null, vehId2: null, taglessCd1: null, taglessCd2: null, turnSeq: null,
                }],
              },
            })
          }
          if (url.includes("/rest/v1/routes") && !url.includes("route_stops")) return jsonResponse({ id: ROUTE_ID }, 201)
          if (url.includes("route_stops")) return jsonResponse([{ id: STOP_ID, sequence: 1, step_group: 1 }], 201)
          if (url.includes("stop_routes")) {
            capturedStopRoutesBody = JSON.parse((init?.body as string) ?? "[]")
            return jsonResponse([], 201)
          }
          throw new Error(`Unmocked URL: ${url}`)
        },
        async () => {
          const res = await routesHandler(
            makeRequest("POST", ROUTES_BASE, {
              body: {
                name: "경기 경로",
                stops: [{
                  odsayStopId: "999001",
                  stopName: "수원터미널",
                  stopType: "bus",
                  sequence: 1,
                  stepGroup: 1,
                  lat: 37.265,   // 경기 bbox
                  lng: 127.016,
                  stopRoutes: [
                    { odsayRouteId: "200000011", routeName: "11", busType: 6 },  // 경기버스
                  ],
                }],
              },
              headers: AUTH_HEADER,
            })
          )
          assertEquals(res.status, 201)

          const rows = capturedStopRoutesBody as Array<{ odsay_route_id: string; provider: string }>
          assertEquals(rows.length, 1)
          // stopProvider='gyeonggi'(GBIS 찾음) + 경기버스 → 'gyeonggi'
          assertEquals(rows[0].provider, "gyeonggi")
        },
      )
    )
  },
)

supabaseTest(
  "provider fix — odsay_fallback stop → 모든 노선 'odsay_fallback'",
  async () => {
    let capturedStopRoutesBody: unknown = null

    await withEnv(ENV, () =>
      withMockFetch(
        async (url: string, init?: RequestInit) => {
          if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
          // GBIS DB 조회 빈 결과 (경기 bbox이지만 GBIS 못 찾음 → odsay_fallback)
          if (url.includes("gbis_stations")) return jsonResponse([])
          if (url.includes("/rest/v1/routes") && !url.includes("route_stops")) return jsonResponse({ id: ROUTE_ID }, 201)
          if (url.includes("route_stops")) return jsonResponse([{ id: STOP_ID, sequence: 1, step_group: 1 }], 201)
          if (url.includes("stop_routes")) {
            capturedStopRoutesBody = JSON.parse((init?.body as string) ?? "[]")
            return jsonResponse([], 201)
          }
          throw new Error(`Unmocked URL: ${url}`)
        },
        async () => {
          const res = await routesHandler(
            makeRequest("POST", ROUTES_BASE, {
              body: {
                name: "지방 경로",
                stops: [{
                  odsayStopId: "999999",
                  stopName: "지방정류소",
                  stopType: "bus",
                  sequence: 1,
                  stepGroup: 1,
                  lat: 37.265,   // 경기 bbox이지만 GBIS 없음 → odsay_fallback
                  lng: 127.016,
                  stopRoutes: [
                    { odsayRouteId: "200000011", routeName: "11", busType: 6 },
                    { odsayRouteId: "100100643", routeName: "643" },
                  ],
                }],
              },
              headers: AUTH_HEADER,
            })
          )
          assertEquals(res.status, 201)

          const rows = capturedStopRoutesBody as Array<{ odsay_route_id: string; provider: string }>
          assertEquals(rows.length, 2)
          // stopProvider='odsay_fallback' → 모든 노선 'odsay_fallback'
          for (const row of rows) {
            assertEquals(row.provider, "odsay_fallback")
          }
        },
      )
    )
  },
)

// ─── 런타임 안전망 (arrival-info resolveStopRouteProvider) ──────────────────

supabaseTest(
  "provider fix — arrival-info: stop_routes.provider='gyeonggi' + gbis_station_id=NULL + ars_id 있음 → Seoul BIS 호출",
  async () => {
    await withEnv(ENV, () =>
      withMockFetch(
        multiMockFetch([
          { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
          {
            match: "/rest/v1/route_stops",
            response: () =>
              jsonResponse({
                id: STOP_ID,
                route_id: "route-1",
                stop_type: "bus",
                ars_id: "17209",          // arsId 있음 — Seoul BIS 가능
                gbis_station_id: null,    // GBIS 없음 — 서울 bbox 정류장
                provider: "seoul",
                odsay_stop_id: "17209",
                stop_name: "현대아파트.개봉중앙시장",
                routes: { user_id: USER_ID },
                stop_routes: [
                  // 잘못 저장된 'gyeonggi' — 안전망이 'seoul'로 강등해야 함
                  { gbis_route_id: null, gbis_sta_order: null, provider: "gyeonggi", odsay_route_id: "200000001", subway_code: null },
                  { gbis_route_id: null, gbis_sta_order: null, provider: "gyeonggi", odsay_route_id: "200000011", subway_code: null },
                ],
              }),
          },
          // Seoul BIS가 호출되어야 함 (ws.bus.go.kr)
          {
            match: "ws.bus.go.kr",
            response: () =>
              jsonResponse({
                msgBody: {
                  itemList: [
                    { busRouteId: "200000001", busRouteAbrv: "1", arrmsg1: "3분후[2번째 전]", arrmsg2: "15분후[8번째 전]", traTime1: "180", traTime2: "900" },
                    { busRouteId: "200000011", busRouteAbrv: "11", arrmsg1: "7분후[4번째 전]", arrmsg2: "20분후[12번째 전]", traTime1: "420", traTime2: "1200" },
                  ],
                },
              }),
          },
        ]),
        async () => {
          const res = await arrivalHandler(
            makeRequest("GET", `${ARRIVAL_BASE}?stopId=${STOP_ID}`, { headers: AUTH_HEADER }),
          )
          assertEquals(res.status, 200)
          const body = await res.json()
          // 안전망이 gyeonggi → seoul로 강등하여 Seoul BIS 호출 → 도착정보 있음
          assertEquals(body.provider, "seoul")
          assertEquals(body.items.length, 2)
          const route1 = body.items.find((i: { busRouteAbrv: string }) => i.busRouteAbrv === "1")
          assertEquals(route1 !== undefined, true)
          const route11 = body.items.find((i: { busRouteAbrv: string }) => i.busRouteAbrv === "11")
          assertEquals(route11 !== undefined, true)
        },
      )
    )
  },
)

supabaseTest(
  "provider fix — arrival-info: stop_routes.provider='gyeonggi' + gbis_station_id 있음 → GBIS 호출 (정상 경기 케이스)",
  async () => {
    await withEnv(ENV, () =>
      withMockFetch(
        multiMockFetch([
          { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
          {
            match: "/rest/v1/route_stops",
            response: () =>
              jsonResponse({
                id: STOP_ID,
                route_id: "route-1",
                stop_type: "bus",
                ars_id: null,
                gbis_station_id: "200000555",  // GBIS 있음 — 정상 경기 정류장
                provider: "gyeonggi",
                odsay_stop_id: "999001",
                stop_name: "수원터미널",
                routes: { user_id: USER_ID },
                stop_routes: [
                  { gbis_route_id: "234000011", gbis_sta_order: 5, provider: "gyeonggi", odsay_route_id: "200000011", subway_code: null },
                ],
              }),
          },
          // GBIS 호출되어야 함 (apis.data.go.kr)
          {
            match: "apis.data.go.kr",
            response: () =>
              jsonResponse({
                msgHeader: { resultCode: 0 },
                msgBody: {
                  busArrivalList: [{
                    stationId: 200000555, routeId: 234000011, routeName: "11", staOrder: 5,
                    predictTimeSec1: 180, predictTimeSec2: null, locationNo1: 2, locationNo2: null,
                    flag: "RUN", stateCd1: 0, stateCd2: null,
                    remainSeatCnt1: -1, remainSeatCnt2: null,
                    crowded1: null, crowded2: null, lowPlate1: null, lowPlate2: null,
                    routeTypeCd: 13, predictTime1: 3, predictTime2: null,
                    plateNo1: null, plateNo2: null, routeDestId: null, routeDestName: null,
                    vehId1: null, vehId2: null, taglessCd1: null, taglessCd2: null, turnSeq: null,
                  }],
                },
              }),
          },
        ]),
        async () => {
          const res = await arrivalHandler(
            makeRequest("GET", `${ARRIVAL_BASE}?stopId=${STOP_ID}`, { headers: AUTH_HEADER }),
          )
          assertEquals(res.status, 200)
          const body = await res.json()
          // gbis_station_id 있으므로 안전망 미동작 → GBIS 정상 호출
          assertEquals(body.provider, "gyeonggi")
          assertEquals(body.items.length, 1)
          assertEquals(body.items[0].busRouteAbrv, "11")
        },
      )
    )
  },
)

// ─── favorite-stops POST: 저장 시 provider 결정 검증 ─────────────────────────

supabaseTest(
  "provider fix — favorite-stops POST: 서울 bbox + 경기버스 → favorite_stop_routes.provider='seoul'",
  async () => {
    let capturedRoutesBody: unknown = null

    await withEnv(ENV, () =>
      withMockFetch(
        async (url: string, init?: RequestInit) => {
          if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
          // 서울 bbox → gbis_stations 빈 결과
          if (url.includes("gbis_stations")) return jsonResponse([])
          if (url.includes("favorite_stop_routes")) {
            if ((init?.method ?? "GET") === "POST") {
              capturedRoutesBody = JSON.parse((init?.body as string) ?? "[]")
              return jsonResponse([], 201)
            }
            // fetchFavoriteStop 내 join 응답
            return jsonResponse([], 200)
          }
          if (url.includes("favorite_stops")) {
            if ((init?.method ?? "GET") === "POST") {
              return jsonResponse({ id: "fav-1" }, 201)
            }
            // display_order 조회 (maybeSingle) — select=display_order 패턴
            if (url.includes("select=display_order")) {
              return jsonResponse(null, 200)
            }
            // fetchFavoriteStop SELECT (single) — 최소 필드만 반환
            return jsonResponse({
              id: "fav-1",
              user_id: USER_ID,
              odsay_stop_id: "17209",
              stop_name: "현대아파트.개봉중앙시장",
              stop_type: "bus",
              ars_id: "17209",
              lat: 37.480,
              lng: 126.850,
              direction_headsign: null,
              direction_updn: null,
              direction_next_stop: null,
              provider: "seoul",
              gbis_station_id: null,
              alias: null,
              display_order: 0,
              created_at: "2026-05-12T00:00:00Z",
              updated_at: "2026-05-12T00:00:00Z",
              favorite_stop_routes: [],
            })
          }
          return jsonResponse([], 200)
        },
        async () => {
          const res = await favoriteHandler(
            makeRequest("POST", FAVORITES_BASE, {
              body: {
                odsayStopId: "17209",
                stopName: "현대아파트.개봉중앙시장",
                stopType: "bus",
                arsId: "17209",
                lat: 37.480,
                lng: 126.850,
                routes: [
                  { odsayRouteId: "200000001", routeName: "1", busType: 6 },
                  { odsayRouteId: "200000011", routeName: "11", busType: 6 },
                ],
              },
              headers: AUTH_HEADER,
            })
          )
          // favorite_stop_routes INSERT가 반드시 호출됐는지 확인
          assertNotEquals(capturedRoutesBody, null)
          const rows = capturedRoutesBody as Array<{ odsay_route_id: string; provider: string }>
          for (const row of rows) {
            assertEquals(
              row.provider,
              "seoul",
              `odsay_route_id=${row.odsay_route_id}는 'seoul'이어야 함 (서울 bbox)`,
            )
          }
          assertEquals(res.status, 201)
        },
      )
    )
  },
)
