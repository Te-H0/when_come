import { assertEquals, assertRejects } from "@std/assert"
import {
  getGbisBusArrivalList,
  getGbisBusArrivalItem,
  searchGbisStation,
  searchGbisStationByArs,
  searchGbisStationByBbox,
  searchGbisRoute,
  getBusRouteStationList,
  clearRouteStationCache,
} from "../_shared/gbisClient.ts"
import { withMockFetch, withEnv, jsonResponse, supabaseTest, TEST_ENV } from "./helpers.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const ENV = { GYEONGGI_BUS_API_KEY: "test-gbis-key" }

// ─── DB mock 헬퍼 ───────────────────────────────────────────────────────────
function makeDbClient() {
  return createClient(
    TEST_ENV.SUPABASE_URL,
    TEST_ENV.SUPABASE_ANON_KEY,
  )
}

function mockDbRows(rows: unknown[]) {
  return jsonResponse(rows, 200)
}

// ─── 도착 목록 ──────────────────────────────────────────────────────────────

Deno.test("gbisClient getBusArrivalList — 정상 응답 시 배열 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 0, resultMessage: "정상" },
        msgBody: {
          busArrivalList: [
            {
              stationId: 200000177,
              routeId: 234000016,
              routeName: "11",
              staOrder: 12,
              predictTime1: 3,
              predictTime2: 12,
              predictTimeSec1: 180,
              predictTimeSec2: 720,
              locationNo1: 2,
              locationNo2: 8,
              plateNo1: "경기75자1234",
              plateNo2: "경기75자5678",
              lowPlate1: 1,
              lowPlate2: 0,
              remainSeatCnt1: -1,
              remainSeatCnt2: -1,
              crowded1: 2,
              crowded2: 3,
              stateCd1: 0,
              stateCd2: 2,
              flag: "RUN",
              routeDestId: 200000178,
              routeDestName: "광명사거리역",
              routeTypeCd: 13,
              vehId1: 234001234,
              vehId2: 234005678,
              taglessCd1: 0,
              taglessCd2: 0,
              turnSeq: 45,
            },
          ],
        },
      }), async () => {
      const result = await getGbisBusArrivalList("200000177")
      assertEquals(result.length, 1)
      assertEquals(result[0].routeName, "11")
      assertEquals(result[0].predictTimeSec1, 180)
      assertEquals(result[0].flag, "RUN")
    })
  )
})

Deno.test("gbisClient getBusArrivalList — resultCode=4 시 빈 배열 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 4, resultMessage: "결과없음" },
      }), async () => {
      const result = await getGbisBusArrivalList("200000177")
      assertEquals(result.length, 0)
    })
  )
})

Deno.test("gbisClient getBusArrivalList — HTTP 오류 시 AppError throw", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 503 }), async () => {
      await assertRejects(
        () => getGbisBusArrivalList("200000177"),
        Error,
      )
    })
  )
})

Deno.test("gbisClient getBusArrivalList — resultCode=8(인증오류) 시 502 AppError throw", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 8, resultMessage: "인증 오류" },
      }), async () => {
      await assertRejects(
        () => getGbisBusArrivalList("200000177"),
        Error,
      )
    })
  )
})

Deno.test("gbisClient getBusArrivalList — API 키 미설정 시 500 AppError throw", async () => {
  await withEnv({}, () =>
    withMockFetch(async () => jsonResponse({ msgHeader: { resultCode: 0 }, msgBody: {} }), async () => {
      await assertRejects(
        () => getGbisBusArrivalList("200000177"),
        Error,
        "GYEONGGI_BUS_API_KEY",
      )
    })
  )
})

// ─── 단일 도착정보 ──────────────────────────────────────────────────────────

Deno.test("gbisClient getBusArrivalItem — 정상 응답 시 단일 item 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 0 },
        msgBody: {
          busArrivalItem: {
            stationId: 200000177,
            routeId: 234000016,
            routeName: "11",
            staOrder: 12,
            predictTimeSec1: 180,
            predictTimeSec2: null,
            locationNo1: 2,
            locationNo2: null,
            flag: "RUN",
            stateCd1: 0,
            stateCd2: null,
            remainSeatCnt1: -1,
            remainSeatCnt2: -1,
            crowded1: 2,
            crowded2: null,
            lowPlate1: 1,
            lowPlate2: null,
            plateNo1: "경기75자1234",
            plateNo2: null,
            predictTime1: 3,
            predictTime2: null,
            routeTypeCd: 13,
            routeDestId: null,
            routeDestName: null,
            vehId1: null,
            vehId2: null,
            taglessCd1: null,
            taglessCd2: null,
            turnSeq: null,
          },
        },
      }), async () => {
      const result = await getGbisBusArrivalItem("200000177", "234000016", 12)
      assertEquals(result?.routeName, "11")
      assertEquals(result?.predictTimeSec1, 180)
    })
  )
})

Deno.test("gbisClient getBusArrivalItem — resultCode=4 시 null 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 4 },
      }), async () => {
      const result = await getGbisBusArrivalItem("200000177", "234000016", 12)
      assertEquals(result, null)
    })
  )
})

// ─── searchGbisStation — DB 검색 (v2) ────────────────────────────────────────

supabaseTest("gbisClient searchGbisStation — DB 검색 정상 응답", async () => {
  const db = makeDbClient()
  await withMockFetch(async () =>
    mockDbRows([
      { station_id: "200000177", station_name: "광명사거리역", lng: 126.861, lat: 37.480, ars_no: "85019", sigun_nm: "광명시" },
    ]), async () => {
    const result = await searchGbisStation(db, "광명사거리역")
    assertEquals(result.length, 1)
    assertEquals(result[0].stationId, "200000177")
    assertEquals(result[0].stationName, "광명사거리역")
    assertEquals(result[0].x, 126.861)
    assertEquals(result[0].y, 37.480)
    assertEquals(result[0].arsNo, "85019")
  })
})

supabaseTest("gbisClient searchGbisStation — 결과 없으면 빈 배열 반환", async () => {
  const db = makeDbClient()
  await withMockFetch(async () => mockDbRows([]), async () => {
    const result = await searchGbisStation(db, "없는정류소")
    assertEquals(result.length, 0)
  })
})

// ─── searchGbisStationByArs ─────────────────────────────────────────────────

supabaseTest("gbisClient searchGbisStationByArs — ARS 매칭 정상", async () => {
  const db = makeDbClient()
  await withMockFetch(async () =>
    mockDbRows([
      { station_id: "200000177", station_name: "광명사거리역", lng: 126.861, lat: 37.480, ars_no: "85019", sigun_nm: "광명시" },
    ]), async () => {
    const result = await searchGbisStationByArs(db, "85019")
    assertEquals(result.length, 1)
    assertEquals(result[0].arsNo, "85019")
  })
})

// ─── searchGbisStationByBbox ────────────────────────────────────────────────

supabaseTest("gbisClient searchGbisStationByBbox — bbox 범위 내 정류소 반환", async () => {
  const db = makeDbClient()
  await withMockFetch(async () =>
    mockDbRows([
      { station_id: "200000177", station_name: "광명사거리역", lng: 126.861, lat: 37.480, ars_no: "85019", sigun_nm: "광명시" },
      { station_id: "200000178", station_name: "광명사거리역(환승)", lng: 126.862, lat: 37.481, ars_no: null, sigun_nm: "광명시" },
    ]), async () => {
    const result = await searchGbisStationByBbox(db, 37.480, 126.861)
    assertEquals(result.length, 2)
  })
})

// ─── searchGbisRoute — v2 getBusRouteListv2 ─────────────────────────────────

Deno.test("gbisClient searchGbisRoute — getBusRouteListv2 정상 응답", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 0 },
        msgBody: {
          busRouteList: [
            {
              routeId: 234000016,
              routeName: "11",
              routeTypeCd: 13,
              routeTypeName: "일반형 시내",
              startStationName: "기점",
              endStationName: "종점",
              regionName: "광명",
              districtCd: "41210",
              adminName: "광명시",
            },
          ],
        },
      }), async () => {
      const result = await searchGbisRoute("11")
      assertEquals(result.length, 1)
      assertEquals(result[0].routeId, "234000016")
      assertEquals(result[0].routeName, "11")
      assertEquals(result[0].regionName, "광명")
      assertEquals(result[0].districtCd, "41210")
    })
  )
})

Deno.test("gbisClient searchGbisRoute — resultCode=4 시 빈 배열 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 4 },
      }), async () => {
      const result = await searchGbisRoute("없는노선")
      assertEquals(result.length, 0)
    })
  )
})

Deno.test("gbisClient searchGbisRoute — HTTP 502 시 AppError throw", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 502 }), async () => {
      await assertRejects(
        () => searchGbisRoute("11"),
        Error,
      )
    })
  )
})

// ─── getBusRouteStationList — v2 + 5분 캐시 ─────────────────────────────────

Deno.test("gbisClient getBusRouteStationList — 정상 응답 시 정류소 목록 반환", async () => {
  clearRouteStationCache()
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 0 },
        msgBody: {
          busRouteStationList: [
            {
              stationId: 200000177,
              stationName: "광명사거리역",
              stationSeq: 12,
              mobileNo: "85019",
              x: 126.861,
              y: 37.480,
              regionName: "광명",
              districtCd: "41210",
              centerYn: "N",
              turnSeq: null,
              turnYn: "N",
              adminName: "광명시",
            },
          ],
        },
      }), async () => {
      const result = await getBusRouteStationList("234000016")
      assertEquals(result.length, 1)
      assertEquals(result[0].stationId, "200000177")
      assertEquals(result[0].stationSeq, 12)
      assertEquals(result[0].regionName, "광명")
    })
  )
})

Deno.test("gbisClient getBusRouteStationList — 같은 routeId 두 번 호출 시 fetch 1회 (캐시)", async () => {
  clearRouteStationCache()
  let fetchCount = 0
  await withEnv(ENV, () =>
    withMockFetch(async () => {
      fetchCount++
      return jsonResponse({
        msgHeader: { resultCode: 0 },
        msgBody: {
          busRouteStationList: [
            { stationId: 200000177, stationName: "광명사거리역", stationSeq: 12 },
          ],
        },
      })
    }, async () => {
      // 첫 번째 호출
      await getBusRouteStationList("234000016")
      // 두 번째 호출 (캐시 히트)
      await getBusRouteStationList("234000016")
      assertEquals(fetchCount, 1)
    })
  )
})

Deno.test("gbisClient getBusRouteStationList — resultCode=4 시 빈 배열 반환", async () => {
  clearRouteStationCache()
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ msgHeader: { resultCode: 4 } }), async () => {
      // 다른 routeId 사용 (캐시 충돌 방지)
      const result = await getBusRouteStationList("999000099")
      assertEquals(result.length, 0)
    })
  )
})

Deno.test("gbisClient getBusRouteStationList — HTTP 오류 시 AppError throw", async () => {
  clearRouteStationCache()
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 500 }), async () => {
      await assertRejects(
        () => getBusRouteStationList("234000016"),
        Error,
      )
    })
  )
})
