import { assertEquals, assertRejects } from "@std/assert"
import { AppError } from "../_shared/error.ts"
import {
  SeoulBusProvider,
  GyeonggiBusProvider,
  OdsayBusProvider,
  pickProvider,
  ArrivalQueryContext,
} from "../_shared/arrivalProvider.ts"
import { withMockFetch, withEnv, jsonResponse, TEST_ENV } from "./helpers.ts"

const SEOUL_ENV = { SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY }
const GBIS_ENV = { GYEONGGI_BUS_API_KEY: "test-gbis-key" }
const ODSAY_ENV = { ODSAY_API_KEY: TEST_ENV.ODSAY_API_KEY }

// ─── 기본 ctx 팩토리 ────────────────────────────────────────────────────────
function seoulCtx(overrides?: Partial<ArrivalQueryContext>): ArrivalQueryContext {
  return {
    stopType: "bus",
    arsId: "17243",
    gbisStationId: null,
    gbisRouteId: null,
    gbisStaOrder: null,
    odsayStopId: "106186",
    stationName: null,
    subwayCode: null,
    ...overrides,
  }
}

function gyeonggiCtx(overrides?: Partial<ArrivalQueryContext>): ArrivalQueryContext {
  return {
    stopType: "bus",
    arsId: null,
    gbisStationId: "200000177",
    gbisRouteId: null,
    gbisStaOrder: null,
    odsayStopId: "999001",
    stationName: null,
    subwayCode: null,
    ...overrides,
  }
}

function odsayCtx(overrides?: Partial<ArrivalQueryContext>): ArrivalQueryContext {
  return {
    stopType: "bus",
    arsId: null,
    gbisStationId: null,
    gbisRouteId: null,
    gbisStaOrder: null,
    odsayStopId: "106186",
    stationName: null,
    subwayCode: null,
    ...overrides,
  }
}

// ─── SeoulBusProvider ────────────────────────────────────────────────────────

Deno.test("SeoulBusProvider — canHandle: arsId 있으면 true", () => {
  const p = new SeoulBusProvider()
  assertEquals(p.canHandle(seoulCtx()), true)
})

Deno.test("SeoulBusProvider — canHandle: arsId 없으면 false", () => {
  const p = new SeoulBusProvider()
  assertEquals(p.canHandle(seoulCtx({ arsId: null })), false)
})

Deno.test("SeoulBusProvider — canHandle: stopType=subway이면 false", () => {
  const p = new SeoulBusProvider()
  assertEquals(p.canHandle(seoulCtx({ stopType: "subway" })), false)
})

Deno.test("SeoulBusProvider — fetchArrivals happy path", async () => {
  const p = new SeoulBusProvider()
  await withEnv(SEOUL_ENV, () =>
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
              busRouteType: "12",
            },
          ],
        },
      }), async () => {
      const result = await p.fetchArrivals(seoulCtx())
      assertEquals(result.provider, "seoul")
      assertEquals(result.items.length, 1)
      assertEquals(result.items[0].busRouteAbrv, "643")
      assertEquals(result.items[0].traTime1, 300)
      assertEquals(result.items[0].busType, 12)
      assertEquals(typeof result.fetchedAt, "string")
    })
  )
})

Deno.test("SeoulBusProvider — fetchArrivals: API HTTP 오류 시 502", async () => {
  const p = new SeoulBusProvider()
  await withEnv(SEOUL_ENV, () =>
    withMockFetch(async () => new Response("", { status: 503 }), async () => {
      await assertRejects(() => p.fetchArrivals(seoulCtx()), Error)
    })
  )
})

Deno.test("SeoulBusProvider — fetchArrivals: 빈 itemList 시 items=[]", async () => {
  const p = new SeoulBusProvider()
  await withEnv(SEOUL_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ msgBody: { itemList: [] } }), async () => {
      const result = await p.fetchArrivals(seoulCtx())
      assertEquals(result.items.length, 0)
    })
  )
})

Deno.test("SeoulBusProvider — fetchArrivals: traTime=0 시 traTime1=null", async () => {
  const p = new SeoulBusProvider()
  await withEnv(SEOUL_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgBody: {
          itemList: [
            {
              busRouteId: "1",
              busRouteAbrv: "273",
              arrmsg1: "운행종료",
              arrmsg2: "",
              traTime1: "0",
              traTime2: "0",
            },
          ],
        },
      }), async () => {
      const result = await p.fetchArrivals(seoulCtx())
      assertEquals(result.items[0].traTime1, null)
      assertEquals(result.items[0].traTime2, null)
    })
  )
})

// ─── GyeonggiBusProvider ─────────────────────────────────────────────────────

Deno.test("GyeonggiBusProvider — canHandle: gbisStationId 있으면 true", () => {
  const p = new GyeonggiBusProvider()
  assertEquals(p.canHandle(gyeonggiCtx()), true)
})

Deno.test("GyeonggiBusProvider — canHandle: gbisStationId 없으면 false", () => {
  const p = new GyeonggiBusProvider()
  assertEquals(p.canHandle(gyeonggiCtx({ gbisStationId: null })), false)
})

Deno.test("GyeonggiBusProvider — fetchArrivals happy path: predictTimeSec1=180, locationNo1=2 → arrmsg1='3분후[2번째 전]'", async () => {
  const p = new GyeonggiBusProvider()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(async () =>
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
              remainSeatCnt2: 15,
              crowded1: 2,
              crowded2: 3,
              lowPlate1: 1,
              lowPlate2: 0,
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
      }), async () => {
      const result = await p.fetchArrivals(gyeonggiCtx())
      assertEquals(result.provider, "gyeonggi")
      assertEquals(result.items.length, 1)
      assertEquals(result.items[0].arrmsg1, "3분후[2번째 전]")
      assertEquals(result.items[0].traTime1, 180)
      assertEquals(result.items[0].remainSeatCnt1, null)   // -1 → null
      assertEquals(result.items[0].remainSeatCnt2, 15)
      assertEquals(result.items[0].crowded1, 2)
      assertEquals(result.items[0].lowPlate1, 1)
    })
  )
})

Deno.test("GyeonggiBusProvider — fetchArrivals: flag=STOP → arrmsg1='운행종료'", async () => {
  const p = new GyeonggiBusProvider()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 0 },
        msgBody: {
          busArrivalList: [
            {
              stationId: 200000177,
              routeId: 234000016,
              routeName: "11",
              staOrder: 12,
              predictTimeSec1: null,
              predictTimeSec2: null,
              locationNo1: null,
              locationNo2: null,
              flag: "STOP",
              stateCd1: null,
              stateCd2: null,
              remainSeatCnt1: null,
              remainSeatCnt2: null,
              crowded1: null,
              crowded2: null,
              lowPlate1: null,
              lowPlate2: null,
              routeTypeCd: 13,
              predictTime1: null,
              predictTime2: null,
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
      }), async () => {
      const result = await p.fetchArrivals(gyeonggiCtx())
      assertEquals(result.items[0].arrmsg1, "운행종료")
    })
  )
})

Deno.test("GyeonggiBusProvider — fetchArrivals: resultCode=4 → items=[]", async () => {
  const p = new GyeonggiBusProvider()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ msgHeader: { resultCode: 4 } }), async () => {
      const result = await p.fetchArrivals(gyeonggiCtx())
      assertEquals(result.items.length, 0)
      assertEquals(result.provider, "gyeonggi")
    })
  )
})

Deno.test("GyeonggiBusProvider — fetchArrivals: gbisRouteId 있으면 해당 노선만 필터", async () => {
  const p = new GyeonggiBusProvider()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 0 },
        msgBody: {
          busArrivalList: [
            {
              routeId: 111,
              routeName: "11",
              predictTimeSec1: 60,
              predictTimeSec2: null,
              locationNo1: 1,
              locationNo2: null,
              flag: "RUN",
              stateCd1: 0,
              stateCd2: null,
              staOrder: 1,
              stationId: 200000177,
              remainSeatCnt1: null,
              remainSeatCnt2: null,
              crowded1: null,
              crowded2: null,
              lowPlate1: null,
              lowPlate2: null,
              routeTypeCd: 13,
              predictTime1: 1,
              predictTime2: null,
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
            {
              routeId: 222,
              routeName: "21",
              predictTimeSec1: 120,
              predictTimeSec2: null,
              locationNo1: 2,
              locationNo2: null,
              flag: "RUN",
              stateCd1: 0,
              stateCd2: null,
              staOrder: 1,
              stationId: 200000177,
              remainSeatCnt1: null,
              remainSeatCnt2: null,
              crowded1: null,
              crowded2: null,
              lowPlate1: null,
              lowPlate2: null,
              routeTypeCd: 13,
              predictTime1: 2,
              predictTime2: null,
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
      }), async () => {
      // gbisRouteId="111"로 필터
      const result = await p.fetchArrivals(gyeonggiCtx({ gbisRouteId: "111" }))
      assertEquals(result.items.length, 1)
      assertEquals(result.items[0].busRouteAbrv, "11")
    })
  )
})

Deno.test("GyeonggiBusProvider — fetchArrivals: stateCd1=1 → arrmsg1='곧 도착'", async () => {
  const p = new GyeonggiBusProvider()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 0 },
        msgBody: {
          busArrivalList: [
            {
              routeId: 111,
              routeName: "11",
              predictTimeSec1: 10,
              predictTimeSec2: null,
              locationNo1: 0,
              locationNo2: null,
              flag: "RUN",
              stateCd1: 1,
              stateCd2: null,
              staOrder: 1,
              stationId: 200000177,
              remainSeatCnt1: null,
              remainSeatCnt2: null,
              crowded1: null,
              crowded2: null,
              lowPlate1: null,
              lowPlate2: null,
              routeTypeCd: 13,
              predictTime1: 0,
              predictTime2: null,
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
      }), async () => {
      const result = await p.fetchArrivals(gyeonggiCtx())
      assertEquals(result.items[0].arrmsg1, "곧 도착")
    })
  )
})

// ─── OdsayBusProvider ────────────────────────────────────────────────────────

Deno.test("OdsayBusProvider — canHandle: odsayStopId 있으면 true", () => {
  const p = new OdsayBusProvider()
  assertEquals(p.canHandle(odsayCtx()), true)
})

Deno.test("OdsayBusProvider — canHandle: odsayStopId 없으면 false", () => {
  const p = new OdsayBusProvider()
  assertEquals(p.canHandle(odsayCtx({ odsayStopId: null })), false)
})

Deno.test("OdsayBusProvider — fetchArrivals happy path", async () => {
  const p = new OdsayBusProvider()
  await withEnv(ODSAY_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        result: {
          real: [
            { routeID: "100100643", routeName: "643", arrivalTime1: 5, arrivalTime2: 15, type: 2 },
          ],
        },
      }), async () => {
      const result = await p.fetchArrivals(odsayCtx())
      assertEquals(result.provider, "odsay_fallback")
      assertEquals(result.items.length, 1)
      assertEquals(result.items[0].arrmsg1, "5분후")
      assertEquals(result.items[0].traTime1, 300)   // 5 * 60
      assertEquals(result.items[0].arrmsg2, "15분후")
    })
  )
})

Deno.test("OdsayBusProvider — fetchArrivals: arrivalTime1=null → arrmsg1='정보없음'", async () => {
  const p = new OdsayBusProvider()
  await withEnv(ODSAY_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        result: {
          real: [
            { routeID: "1", routeName: "273", arrivalTime1: null, arrivalTime2: null, type: 2 },
          ],
        },
      }), async () => {
      const result = await p.fetchArrivals(odsayCtx())
      assertEquals(result.items[0].arrmsg1, "정보없음")
      assertEquals(result.items[0].traTime1, null)
    })
  )
})

Deno.test("OdsayBusProvider — fetchArrivals: error code=-98 → items=[]", async () => {
  const p = new OdsayBusProvider()
  await withEnv(ODSAY_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ error: [{ code: "-98", message: "No data" }] }), async () => {
      const result = await p.fetchArrivals(odsayCtx())
      assertEquals(result.items.length, 0)
    })
  )
})

// ─── pickProvider 팩토리 ─────────────────────────────────────────────────────

Deno.test("pickProvider — 'seoul' → SeoulBusProvider 반환", () => {
  const p = pickProvider("seoul")
  assertEquals(p.name, "seoul")
})

Deno.test("pickProvider — 'gyeonggi' → GyeonggiBusProvider 반환", () => {
  const p = pickProvider("gyeonggi")
  assertEquals(p.name, "gyeonggi")
})

Deno.test("pickProvider — 'odsay_fallback' → OdsayBusProvider 반환", () => {
  const p = pickProvider("odsay_fallback")
  assertEquals(p.name, "odsay_fallback")
})

// ─── GyeonggiBusProvider: HTTP 오류 시 ARRIVAL_PROVIDER_ERROR ────────────────

Deno.test("GyeonggiBusProvider — fetchArrivals: API HTTP 오류 시 ARRIVAL_PROVIDER_ERROR 코드로 throw", async () => {
  const p = new GyeonggiBusProvider()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(async () => new Response("", { status: 503 }), async () => {
      const err = await p.fetchArrivals(gyeonggiCtx()).catch(e => e)
      assertEquals(err instanceof AppError, true)
      assertEquals((err as AppError).status, 502)
      assertEquals((err as AppError).code, "ARRIVAL_PROVIDER_ERROR")
    })
  )
})

// ─── OdsayBusProvider: HTTP 오류 시 ARRIVAL_PROVIDER_ERROR ───────────────────

Deno.test("OdsayBusProvider — fetchArrivals: API HTTP 오류 시 ARRIVAL_PROVIDER_ERROR 코드로 throw", async () => {
  const p = new OdsayBusProvider()
  await withEnv(ODSAY_ENV, () =>
    withMockFetch(async () => new Response("", { status: 503 }), async () => {
      const err = await p.fetchArrivals(odsayCtx()).catch(e => e)
      assertEquals(err instanceof AppError, true)
      assertEquals((err as AppError).status, 502)
      assertEquals((err as AppError).code, "ARRIVAL_PROVIDER_ERROR")
    })
  )
})
