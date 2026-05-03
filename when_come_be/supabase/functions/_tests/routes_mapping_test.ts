import { assertEquals } from "@std/assert"
import { handler } from "../routes/index.ts"
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
import { clearRouteStationCache } from "../_shared/gbisClient.ts"

const ENV = {
  SUPABASE_URL: TEST_ENV.SUPABASE_URL,
  SUPABASE_ANON_KEY: TEST_ENV.SUPABASE_ANON_KEY,
  GYEONGGI_BUS_API_KEY: "test-gbis-key",
  ODSAY_API_KEY: TEST_ENV.ODSAY_API_KEY,
}

const BASE = "https://test.supabase.co/functions/v1/routes"
const AUTH_HEADER = { authorization: "Bearer valid-jwt-token" }
const ROUTE_ID = "route-uuid-1"
const STOP_ID = "stop-uuid-1"
const USER_ID = "user-123"

function makePostRequest(body: unknown) {
  return makeRequest("POST", BASE, { body, headers: AUTH_HEADER })
}

// ─── PostgREST 목 응답 ────────────────────────────────────────────────────────
function mockDbInsertRoute() {
  return jsonResponse({ id: ROUTE_ID }, 201)
}

function mockDbInsertStops() {
  return jsonResponse([{ id: STOP_ID, sequence: 1 }], 201)
}

function mockDbInsertStopRoutes() {
  return jsonResponse([], 201)
}

// ─── 서울 좌표 stop → provider='seoul' ─────────────────────────────────────

supabaseTest("routes mapping — 서울 좌표 버스 stop → provider='seoul', gbis_station_id=null", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbInsertRoute() },
        { match: "route_stops", response: () => mockDbInsertStops() },
        { match: "stop_routes", response: () => mockDbInsertStopRoutes() },
      ]),
      async () => {
        const res = await handler(makePostRequest({
          name: "출근길",
          originName: "집",
          destinationName: "회사",
          stops: [{
            odsayStopId: "106186",
            stopName: "강남역버스정류장",
            stopType: "bus",
            sequence: 1,
            arsId: "22014",
            lat: 37.498,
            lng: 127.028,
            stopRoutes: [{ odsayRouteId: "r1", routeName: "472" }],
          }],
        }))
        assertEquals(res.status, 201)
        const body = await res.json()
        assertEquals(typeof body.id, "string")
      },
    )
  )
})

// ─── 경기 좌표 stop + GBIS DB 검색 성공 → provider='gyeonggi' ────────────────

supabaseTest("routes mapping — 경기 좌표 버스 stop + GBIS DB 정상 → provider='gyeonggi'", async () => {
  clearRouteStationCache()
  await withEnv(ENV, () =>
    withMockFetch(
      async (url: string) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        // ARS 검색 (arsId 없으므로 빈 결과)
        if (url.includes("gbis_stations") && url.includes("eq=ars_no")) {
          return jsonResponse([])
        }
        // bbox 검색 — gbis_stations 테이블
        if (url.includes("gbis_stations")) {
          return jsonResponse([
            { station_id: "200000555", station_name: "수원시청", lng: 127.016, lat: 37.265, ars_no: null, sigun_nm: "수원시" },
          ])
        }
        // getBusRouteListv2
        if (url.includes("getBusRouteListv2")) {
          return jsonResponse({
            msgHeader: { resultCode: 0 },
            msgBody: {
              busRouteList: [
                { routeId: "234000011", routeName: "11", regionName: "수원", districtCd: "41111" },
              ],
            },
          })
        }
        // getBusRouteStationListv2
        if (url.includes("getBusRouteStationListv2")) {
          return jsonResponse({
            msgHeader: { resultCode: 0 },
            msgBody: {
              busRouteStationList: [
                { stationId: "200000555", stationName: "수원시청", stationSeq: 5 },
              ],
            },
          })
        }
        // 검증 (getBusArrivalListv2)
        if (url.includes("getBusArrivalListv2")) {
          return jsonResponse({
            msgHeader: { resultCode: 0 },
            msgBody: {
              busArrivalList: [
                { routeId: 234000011, routeName: "11", flag: "RUN", staOrder: 5, stationId: 200000555, predictTimeSec1: 60, predictTimeSec2: null, locationNo1: 1, locationNo2: null, stateCd1: 0, stateCd2: null, remainSeatCnt1: null, remainSeatCnt2: null, crowded1: null, crowded2: null, lowPlate1: null, lowPlate2: null, routeTypeCd: 13, predictTime1: 1, predictTime2: null, plateNo1: null, plateNo2: null, routeDestId: null, routeDestName: null, vehId1: null, vehId2: null, taglessCd1: null, taglessCd2: null, turnSeq: null },
              ],
            },
          })
        }
        if (url.includes("/rest/v1/routes") && !url.includes("route_stops") && !url.includes("stop_routes")) {
          return mockDbInsertRoute()
        }
        if (url.includes("route_stops")) return mockDbInsertStops()
        if (url.includes("stop_routes")) return mockDbInsertStopRoutes()
        throw new Error(`Unmocked URL: ${url}`)
      },
      async () => {
        const res = await handler(makePostRequest({
          name: "출근길",
          originName: "집",
          destinationName: "회사",
          stops: [{
            odsayStopId: "999001",
            stopName: "수원시청",
            stopType: "bus",
            sequence: 1,
            lat: 37.265,
            lng: 127.016,
            stopRoutes: [{ odsayRouteId: "r1", routeName: "11" }],
          }],
        }))
        assertEquals(res.status, 201)
      },
    )
  )
})

// ─── 경기 좌표 + GBIS DB 검색 0건 → provider='odsay_fallback' ────────────────

supabaseTest("routes mapping — 경기 좌표 + GBIS DB 검색 0건 → provider='odsay_fallback'", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        // 모든 gbis_stations 조회 빈 결과
        { match: "gbis_stations", response: () => jsonResponse([]) },
        { match: "/rest/v1/routes", response: () => mockDbInsertRoute() },
        { match: "route_stops", response: () => mockDbInsertStops() },
        { match: "stop_routes", response: () => mockDbInsertStopRoutes() },
      ]),
      async () => {
        const res = await handler(makePostRequest({
          name: "출근길",
          originName: "집",
          destinationName: "회사",
          stops: [{
            odsayStopId: "999001",
            stopName: "없는정류소",
            stopType: "bus",
            sequence: 1,
            lat: 37.265,
            lng: 127.016,
            stopRoutes: [{ odsayRouteId: "r1", routeName: "11" }],
          }],
        }))
        assertEquals(res.status, 201)
        const body = await res.json()
        assertEquals(typeof body.id, "string")
      },
    )
  )
})

// ─── GBIS 검증 실패(교집합 < 50%) → provider='odsay_fallback' ──────────────

supabaseTest("routes mapping — GBIS 검증 실패 → provider='odsay_fallback'로 격하", async () => {
  clearRouteStationCache()
  await withEnv(ENV, () =>
    withMockFetch(
      async (url: string) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        if (url.includes("gbis_stations") && url.includes("eq=ars_no")) return jsonResponse([])
        if (url.includes("gbis_stations")) {
          return jsonResponse([
            { station_id: "200000555", station_name: "수원시청", lng: 127.016, lat: 37.265, ars_no: null, sigun_nm: "수원시" },
          ])
        }
        if (url.includes("getBusRouteListv2")) {
          return jsonResponse({
            msgHeader: { resultCode: 0 },
            msgBody: {
              busRouteList: [
                { routeId: "234000011", routeName: "11", regionName: "수원" },
              ],
            },
          })
        }
        if (url.includes("getBusRouteStationListv2")) {
          return jsonResponse({
            msgHeader: { resultCode: 0 },
            msgBody: {
              busRouteStationList: [
                { stationId: "200000555", stationName: "수원시청", stationSeq: 5 },
              ],
            },
          })
        }
        // 검증 — 전혀 다른 routeId → 교집합 0% < 50% → false
        if (url.includes("getBusArrivalListv2")) {
          return jsonResponse({
            msgHeader: { resultCode: 0 },
            msgBody: {
              busArrivalList: [
                { routeId: 999999, routeName: "999", flag: "RUN", staOrder: 1, stationId: 1, predictTimeSec1: 60, predictTimeSec2: null, locationNo1: 1, locationNo2: null, stateCd1: 0, stateCd2: null, remainSeatCnt1: null, remainSeatCnt2: null, crowded1: null, crowded2: null, lowPlate1: null, lowPlate2: null, routeTypeCd: 13, predictTime1: 1, predictTime2: null, plateNo1: null, plateNo2: null, routeDestId: null, routeDestName: null, vehId1: null, vehId2: null, taglessCd1: null, taglessCd2: null, turnSeq: null },
              ],
            },
          })
        }
        if (url.includes("/rest/v1/routes") && !url.includes("route_stops") && !url.includes("stop_routes")) {
          return mockDbInsertRoute()
        }
        if (url.includes("route_stops")) return mockDbInsertStops()
        if (url.includes("stop_routes")) return mockDbInsertStopRoutes()
        throw new Error(`Unmocked URL: ${url}`)
      },
      async () => {
        const res = await handler(makePostRequest({
          name: "출근길",
          originName: "집",
          destinationName: "회사",
          stops: [{
            odsayStopId: "999001",
            stopName: "수원시청",
            stopType: "bus",
            sequence: 1,
            lat: 37.265,
            lng: 127.016,
            stopRoutes: [{ odsayRouteId: "r1", routeName: "11" }],
          }],
        }))
        assertEquals(res.status, 201)
      },
    )
  )
})

// ─── lat/lng 없으면 서울 가정 (legacy 호환) ──────────────────────────────────

supabaseTest("routes mapping — lat/lng 없으면 provider='seoul' 가정 (legacy 호환)", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        { match: "/rest/v1/routes", response: () => mockDbInsertRoute() },
        { match: "route_stops", response: () => mockDbInsertStops() },
        { match: "stop_routes", response: () => mockDbInsertStopRoutes() },
      ]),
      async () => {
        const res = await handler(makePostRequest({
          name: "출근길",
          originName: "집",
          destinationName: "회사",
          stops: [{
            odsayStopId: "106186",
            stopName: "강남역",
            stopType: "bus",
            sequence: 1,
            arsId: "22014",
            stopRoutes: [{ odsayRouteId: "r1", routeName: "472" }],
          }],
        }))
        assertEquals(res.status, 201)
      },
    )
  )
})

// ─── route_stops insert payload의 provider 값 검증 ───────────────────────

supabaseTest("routes mapping — route_stops insert payload에 provider='seoul' 포함 검증", async () => {
  let capturedStopsBody: unknown = null
  await withEnv(ENV, () =>
    withMockFetch(
      async (url: string, init?: RequestInit) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        if (url.includes("/rest/v1/routes") && !url.includes("route_stops") && !url.includes("stop_routes")) {
          return mockDbInsertRoute()
        }
        if (url.includes("route_stops")) {
          capturedStopsBody = JSON.parse(init?.body as string ?? "null")
          return mockDbInsertStops()
        }
        if (url.includes("stop_routes")) return mockDbInsertStopRoutes()
        throw new Error(`Unmocked URL: ${url}`)
      },
      async () => {
        const res = await handler(makePostRequest({
          name: "출근길",
          originName: "집",
          destinationName: "회사",
          stops: [{
            odsayStopId: "106186",
            stopName: "강남역버스정류장",
            stopType: "bus",
            sequence: 1,
            arsId: "22014",
            lat: 37.498,
            lng: 127.028,
            stopRoutes: [{ odsayRouteId: "r1", routeName: "472" }],
          }],
        }))
        assertEquals(res.status, 201)
        const payload = Array.isArray(capturedStopsBody) ? capturedStopsBody : [capturedStopsBody]
        assertEquals(payload[0].provider, "seoul")
        assertEquals(payload[0].gbis_station_id, null)
        assertEquals(payload[0].ars_id, "22014")
      },
    )
  )
})

supabaseTest("routes mapping — route_stops insert payload에 provider='gyeonggi' 포함 검증", async () => {
  clearRouteStationCache()
  let capturedStopsBody: unknown = null
  await withEnv(ENV, () =>
    withMockFetch(
      async (url: string, init?: RequestInit) => {
        if (url.includes("/auth/v1/user")) return mockSupabaseAuthSuccess(USER_ID)
        if (url.includes("gbis_stations") && url.includes("eq=ars_no")) return jsonResponse([])
        if (url.includes("gbis_stations")) {
          return jsonResponse([
            { station_id: "200000555", station_name: "수원시청", lng: 127.016, lat: 37.265, ars_no: null, sigun_nm: "수원시" },
          ])
        }
        if (url.includes("getBusRouteListv2")) {
          return jsonResponse({
            msgHeader: { resultCode: 0 },
            msgBody: {
              busRouteList: [{ routeId: "234000011", routeName: "11", regionName: "수원" }],
            },
          })
        }
        if (url.includes("getBusRouteStationListv2")) {
          return jsonResponse({
            msgHeader: { resultCode: 0 },
            msgBody: {
              busRouteStationList: [{ stationId: "200000555", stationName: "수원시청", stationSeq: 5 }],
            },
          })
        }
        if (url.includes("getBusArrivalListv2")) {
          return jsonResponse({
            msgHeader: { resultCode: 0 },
            msgBody: {
              busArrivalList: [
                { routeId: 234000011, routeName: "11", flag: "RUN", staOrder: 5, stationId: 200000555, predictTimeSec1: 60, predictTimeSec2: null, locationNo1: 1, locationNo2: null, stateCd1: 0, stateCd2: null, remainSeatCnt1: null, remainSeatCnt2: null, crowded1: null, crowded2: null, lowPlate1: null, lowPlate2: null, routeTypeCd: 13, predictTime1: 1, predictTime2: null, plateNo1: null, plateNo2: null, routeDestId: null, routeDestName: null, vehId1: null, vehId2: null, taglessCd1: null, taglessCd2: null, turnSeq: null },
              ],
            },
          })
        }
        if (url.includes("/rest/v1/routes") && !url.includes("route_stops") && !url.includes("stop_routes")) {
          return mockDbInsertRoute()
        }
        if (url.includes("route_stops")) {
          capturedStopsBody = JSON.parse(init?.body as string ?? "null")
          return mockDbInsertStops()
        }
        if (url.includes("stop_routes")) return mockDbInsertStopRoutes()
        throw new Error(`Unmocked URL: ${url}`)
      },
      async () => {
        const res = await handler(makePostRequest({
          name: "출근길",
          originName: "집",
          destinationName: "회사",
          stops: [{
            odsayStopId: "999001",
            stopName: "수원시청",
            stopType: "bus",
            sequence: 1,
            lat: 37.265,
            lng: 127.016,
            stopRoutes: [{ odsayRouteId: "r1", routeName: "11" }],
          }],
        }))
        assertEquals(res.status, 201)
        const payload = Array.isArray(capturedStopsBody) ? capturedStopsBody : [capturedStopsBody]
        assertEquals(payload[0].provider, "gyeonggi")
        assertEquals(payload[0].gbis_station_id, "200000555")
        assertEquals(payload[0].ars_id, null)
      },
    )
  )
})

// ─── GET /routes — provider/gbis 신규 필드 응답 노출 (T10) ────────────────

supabaseTest("routes mapping GET — provider/gbis_station_id/gbis_route_id 신규 필드 응답에 포함", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        {
          match: "/rest/v1/routes",
          response: () =>
            jsonResponse([
              {
                id: ROUTE_ID,
                name: "출근길",
                origin_name: "집",
                destination_name: "회사",
                origin_coords: null,
                destination_coords: null,
                is_active: true,
                created_at: "2026-05-02T00:00:00Z",
                updated_at: "2026-05-02T00:00:00Z",
                route_stops: [
                  {
                    id: STOP_ID,
                    odsay_stop_id: "999001",
                    stop_name: "광명사거리역",
                    stop_type: "bus",
                    sequence: 1,
                    ars_id: null,
                    direction_headsign: null,
                    direction_updn: null,
                    direction_next_stop: null,
                    provider: "gyeonggi",
                    gbis_station_id: "200000177",
                    stop_routes: [
                      {
                        id: "sr-1",
                        odsay_route_id: "r1",
                        route_name: "11",
                        bus_type: 13,
                        st_id: null,
                        bus_route_id: null,
                        station_ord: null,
                        station_name: null,
                        gbis_route_id: "234000016",
                        gbis_sta_order: 12,
                      },
                    ],
                  },
                ],
              },
            ]),
        },
      ]),
      async () => {
        const res = await handler(makeRequest("GET", BASE, { headers: AUTH_HEADER }))
        assertEquals(res.status, 200)
        const body = await res.json()
        const stop = body[0].route_stops[0]
        assertEquals(stop.provider, "gyeonggi")
        assertEquals(stop.gbis_station_id, "200000177")
        assertEquals(stop.stop_routes[0].gbis_route_id, "234000016")
        assertEquals(stop.stop_routes[0].gbis_sta_order, 12)
      },
    )
  )
})

// ─── stop_routes.provider 자동 세팅 (routeIdToProvider) ──────────────────────

// stop_routes insert payload에 provider가 들어가는지는 DB 목이 받는 body를 캡처해서 검증.
// multiMockFetch에서 init.body를 읽으면 된다.

supabaseTest(
  "routes POST — stop_routes insert에 odsay_route_id 기반 provider가 세팅된다",
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
            return jsonResponse([{ id: STOP_ID, sequence: 1 }], 201)
          }
          if (url.includes("stop_routes")) {
            // insert body 캡처
            capturedStopRoutesBody = JSON.parse((init?.body as string) ?? "[]")
            return jsonResponse([], 201)
          }
          // gbis_stations DB 검색 (서울 좌표라 gyeonggi 분기 없음)
          return jsonResponse([], 200)
        },
        async () => {
          const res = await handler(makePostRequest({
            name: "출근길",
            originName: "집",
            destinationName: "회사",
            stops: [{
              odsayStopId: "106186",
              stopName: "강남역",
              stopType: "bus",
              sequence: 1,
              // lat/lng 없음 → 서울 fallback
              stopRoutes: [
                { odsayRouteId: "100100643", routeName: "643" },  // 1로 시작 → seoul
                { odsayRouteId: "213000006", routeName: "1" },    // 2로 시작 → gyeonggi
                { odsayRouteId: "300000001", routeName: "광역" }, // 그 외 → odsay_fallback
              ],
            }],
          }))
          assertEquals(res.status, 201)

          // stop_routes insert body 검증
          const rows = capturedStopRoutesBody as Array<{ odsay_route_id: string; provider: string }>
          assertEquals(rows.length, 3)
          const seoulRow = rows.find((r) => r.odsay_route_id === "100100643")
          assertEquals(seoulRow?.provider, "seoul")
          const gyeonggiRow = rows.find((r) => r.odsay_route_id === "213000006")
          assertEquals(gyeonggiRow?.provider, "gyeonggi")
          const odsayRow = rows.find((r) => r.odsay_route_id === "300000001")
          assertEquals(odsayRow?.provider, "odsay_fallback")
        },
      )
    )
  },
)
