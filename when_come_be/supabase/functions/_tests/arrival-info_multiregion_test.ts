import { assertEquals } from "@std/assert"
import { handler } from "../arrival-info/index.ts"
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
  SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY,
  GYEONGGI_BUS_API_KEY: "test-gbis-key",
  ODSAY_API_KEY: TEST_ENV.ODSAY_API_KEY,
}

const BASE = "https://test.supabase.co/functions/v1/arrival-info"
const AUTH_HEADER = { authorization: "Bearer valid-jwt-token" }
const USER_ID = "user-123"
const STOP_ID = "stop-uuid-1"

function makeArrivalRequest(params: string, options?: { auth?: boolean }) {
  return makeRequest("GET", `${BASE}?${params}`, {
    headers: options?.auth !== false ? AUTH_HEADER : {},
  })
}

// ─── stopId 없고 type도 없으면 400 ─────────────────────────────────────────

Deno.test("arrival-info multiregion — stopId 없고 type도 없으면 400", async () => {
  const res = await handler(makeArrivalRequest(""))
  assertEquals(res.status, 400)
})

// ─── 인증 검증 ────────────────────────────────────────────────────────────────

supabaseTest("arrival-info multiregion — stopId 있고 인증 없으면 401", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthFailure(), async () => {
      const res = await handler(makeArrivalRequest(`stopId=${STOP_ID}`, { auth: false }))
      assertEquals(res.status, 401)
    })
  )
})

// ─── 신 경로: stopId 기반 서울 provider ──────────────────────────────────────

supabaseTest("arrival-info multiregion — stopId + provider=seoul → SeoulBusProvider 호출", async () => {
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
        const res = await handler(makeArrivalRequest(`stopId=${STOP_ID}`))
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

// ─── 신 경로: stopId 기반 경기 provider ──────────────────────────────────────

supabaseTest("arrival-info multiregion — stopId + provider=gyeonggi → GyeonggiBusProvider 호출", async () => {
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
              gbis_station_id: "200000177",
              provider: "gyeonggi",
              odsay_stop_id: "999001",
              stop_name: "광명사거리역",
              routes: { user_id: USER_ID },
              stop_routes: [],
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
        const res = await handler(makeArrivalRequest(`stopId=${STOP_ID}`))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.provider, "gyeonggi")
        assertEquals(body.items.length, 1)
        assertEquals(body.items[0].arrmsg1, "3분후[2번째 전]")
        assertEquals(body.items[0].remainSeatCnt1, null)  // -1 → null
        assertEquals(body.items[0].crowded1, 2)
        assertEquals(body.items[0].lowPlate1, 1)
      },
    )
  )
})

// ─── 신 경로: stopId 기반 odsay_fallback provider ────────────────────────────

supabaseTest("arrival-info multiregion — stopId + provider=odsay_fallback → OdsayBusProvider 호출", async () => {
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
              gbis_station_id: null,
              provider: "odsay_fallback",
              odsay_stop_id: "106186",
              stop_name: "강남역",
              routes: { user_id: USER_ID },
              stop_routes: [],
            }),
        },
        {
          match: "api.odsay.com",
          response: () =>
            jsonResponse({
              result: {
                real: [
                  { routeID: "100100643", routeName: "643", arrivalTime1: 5, arrivalTime2: 15, type: 2 },
                ],
              },
            }),
        },
      ]),
      async () => {
        const res = await handler(makeArrivalRequest(`stopId=${STOP_ID}`))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.provider, "odsay_fallback")
        assertEquals(body.items.length, 1)
        assertEquals(body.items[0].arrmsg1, "5분후")
      },
    )
  )
})

// ─── 신 경로: 다른 사용자 stopId → 404 ─────────────────────────────────────

supabaseTest("arrival-info multiregion — 다른 사용자 stopId → 404", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess(USER_ID) },
        // PostgREST single() 404 응답 (PGRST116)
        {
          match: "/rest/v1/route_stops",
          response: () =>
            new Response(
              JSON.stringify({ code: "PGRST116", message: "Not found" }),
              { status: 406, headers: { "Content-Type": "application/json" } },
            ),
        },
      ]),
      async () => {
        const res = await handler(makeArrivalRequest(`stopId=non-existent-stop`))
        assertEquals(res.status, 404)
      },
    )
  )
})

// ─── legacy 호환: ?type=bus&arsId ───────────────────────────────────────────
// Supabase 이전 테스트의 타이머 누수가 일반 Deno.test에 영향을 줄 수 있으므로
// sanitizeOps/Resources 비활성화

Deno.test({
  name: "arrival-info multiregion — legacy ?type=bus&arsId 호환 유지",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    await withEnv({ SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY }, () =>
      withMockFetch(async () =>
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
        }), async () => {
        const res = await handler(
          makeArrivalRequest("type=bus&busRouteId=100100643&arsId=17243"),
        )
        assertEquals(res.status, 200)
        const body = await res.json()
        // legacy 응답 포맷 (LegacyBusArrivalResponse)
        assertEquals(body.routeName, "643")
        assertEquals(body.arrivalSec1, 300)
      })
    )
  },
})

// ─── 신 아키텍처: stop_routes.provider 기반 멀티 프로바이더 aggregation ───────

supabaseTest(
  "arrival-info multiregion — stop_routes에 서울+경기 혼합 → 양쪽 API 모두 호출, 결과 merge",
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
                ars_id: "17243",
                gbis_station_id: "200000177",
                provider: "gyeonggi",
                odsay_stop_id: "999001",
                stop_name: "대원주유소",
                routes: { user_id: USER_ID },
                stop_routes: [
                  // 서울 노선 (1로 시작)
                  {
                    gbis_route_id: null,
                    gbis_sta_order: null,
                    provider: "seoul",
                    odsay_route_id: "100100096",
                  },
                  // 경기 노선 (2로 시작)
                  {
                    gbis_route_id: "234000006",
                    gbis_sta_order: 5,
                    provider: "gyeonggi",
                    odsay_route_id: "213000006",
                  },
                ],
              }),
          },
          // 서울 버스 API (getStationByUid)
          {
            match: "ws.bus.go.kr",
            response: () =>
              jsonResponse({
                msgBody: {
                  itemList: [
                    {
                      busRouteId: "100100096",
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
          // 경기 버스 API (GBIS)
          {
            match: "apis.data.go.kr",
            response: () =>
              jsonResponse({
                msgHeader: { resultCode: 0 },
                msgBody: {
                  busArrivalList: [
                    {
                      stationId: 200000177,
                      routeId: 234000006,
                      routeName: "1",
                      staOrder: 5,
                      predictTimeSec1: 120,
                      predictTimeSec2: 600,
                      locationNo1: 1,
                      locationNo2: 5,
                      flag: "RUN",
                      stateCd1: 0,
                      stateCd2: 0,
                      remainSeatCnt1: -1,
                      remainSeatCnt2: -1,
                      crowded1: null,
                      crowded2: null,
                      lowPlate1: null,
                      lowPlate2: null,
                      routeTypeCd: 13,
                      predictTime1: 2,
                      predictTime2: 10,
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
          const res = await handler(makeArrivalRequest(`stopId=${STOP_ID}`))
          assertEquals(res.status, 200)
          const body = await res.json()
          // 두 provider 결과가 merge되어 2개 item
          assertEquals(body.items.length, 2)
          // dominant provider는 gyeonggi
          assertEquals(body.provider, "gyeonggi")
          // 서울 노선 item 포함 확인
          const seoulItem = body.items.find((i: { busRouteAbrv: string }) => i.busRouteAbrv === "643")
          assertEquals(seoulItem !== undefined, true)
          // 경기 노선 item 포함 확인
          const gyeonggiItem = body.items.find((i: { busRouteAbrv: string }) => i.busRouteAbrv === "1")
          assertEquals(gyeonggiItem !== undefined, true)
          assertEquals(typeof body.fetchedAt, "string")
        },
      )
    )
  },
)

supabaseTest(
  "arrival-info multiregion — stop_routes.provider=null인 경우 odsay_route_id로 재추론",
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
                ars_id: "17243",
                gbis_station_id: null,
                provider: "seoul",
                odsay_stop_id: "106186",
                stop_name: "강남역",
                routes: { user_id: USER_ID },
                stop_routes: [
                  // provider null — odsay_route_id "1..." 로 서울 추론
                  {
                    gbis_route_id: null,
                    gbis_sta_order: null,
                    provider: null,
                    odsay_route_id: "100100643",
                  },
                ],
              }),
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
                      arrmsg1: "3분후[1번째 전]",
                      arrmsg2: "15분후[8번째 전]",
                      traTime1: "180",
                      traTime2: "900",
                    },
                  ],
                },
              }),
          },
        ]),
        async () => {
          const res = await handler(makeArrivalRequest(`stopId=${STOP_ID}`))
          assertEquals(res.status, 200)
          const body = await res.json()
          assertEquals(body.provider, "seoul")
          assertEquals(body.items.length, 1)
          assertEquals(body.items[0].busRouteAbrv, "643")
        },
      )
    )
  },
)

supabaseTest(
  "arrival-info multiregion — stop_routes 없을 때 route_stops.provider로 fallback (legacy 호환)",
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
            match: "ws.bus.go.kr",
            response: () =>
              jsonResponse({
                msgBody: {
                  itemList: [
                    {
                      busRouteId: "100100643",
                      busRouteAbrv: "643",
                      arrmsg1: "7분후[4번째 전]",
                      arrmsg2: "20분후[12번째 전]",
                      traTime1: "420",
                      traTime2: "1200",
                    },
                  ],
                },
              }),
          },
        ]),
        async () => {
          const res = await handler(makeArrivalRequest(`stopId=${STOP_ID}`))
          assertEquals(res.status, 200)
          const body = await res.json()
          assertEquals(body.provider, "seoul")
          assertEquals(body.items.length, 1)
        },
      )
    )
  },
)

// ─── OPTIONS preflight ───────────────────────────────────────────────────────

Deno.test({
  name: "arrival-info multiregion — OPTIONS는 200 반환",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const res = await handler(makeRequest("OPTIONS", BASE))
    assertEquals(res.status, 200)
  },
})
