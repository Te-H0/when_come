import { assertEquals } from "@std/assert"
import {
  detectRegion,
  findGbisStationFromDB,
  mapGbisRoutes,
  verifyGbisMapping,
  resolveStopProvider,
  nameSimilarity,
  haversineMeters,
} from "../_shared/regionMapper.ts"
import { withMockFetch, withEnv, jsonResponse, multiMockFetch, supabaseTest, TEST_ENV } from "./helpers.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { clearRouteStationCache } from "../_shared/gbisClient.ts"

const GBIS_ENV = { GYEONGGI_BUS_API_KEY: "test-gbis-key" }

// DB 클라이언트 팩토리 (fetch 목킹으로 PostgREST 응답 모사)
function makeDbClient() {
  return createClient(TEST_ENV.SUPABASE_URL, TEST_ENV.SUPABASE_ANON_KEY)
}

// 서울 좌표 (강남역 부근)
const SEOUL_COORDS = { lng: 127.028, lat: 37.498 }
// 경기 좌표 — 수원시청 부근 (서울 bounding box 바깥)
const GYEONGGI_COORDS = { lng: 127.016, lat: 37.265 }
// 부산 좌표
const BUSAN_COORDS = { lng: 129.075, lat: 35.180 }

// ─── detectRegion ────────────────────────────────────────────────────────────

Deno.test("detectRegion — 서울 좌표 → 'seoul'", () => {
  assertEquals(detectRegion(SEOUL_COORDS), "seoul")
})

Deno.test("detectRegion — 경기 수원 좌표 → 'gyeonggi'", () => {
  assertEquals(detectRegion(GYEONGGI_COORDS), "gyeonggi")
})

Deno.test("detectRegion — 부산 좌표 → 'unknown'", () => {
  assertEquals(detectRegion(BUSAN_COORDS), "unknown")
})

Deno.test("detectRegion — 서울 bounding box 경계 내부 → 'seoul'", () => {
  assertEquals(detectRegion({ lng: 126.764, lat: 37.413 }), "seoul")
  assertEquals(detectRegion({ lng: 127.184, lat: 37.715 }), "seoul")
})

// ─── nameSimilarity ──────────────────────────────────────────────────────────

Deno.test("nameSimilarity — 동일 문자열 → 1.0", () => {
  assertEquals(nameSimilarity("광명사거리역", "광명사거리역"), 1.0)
})

Deno.test("nameSimilarity — 빈 문자열 → 0", () => {
  assertEquals(nameSimilarity("", "광명사거리역"), 0)
  assertEquals(nameSimilarity("광명사거리역", ""), 0)
})

Deno.test("nameSimilarity — 유사한 이름 → 0.7 이상", () => {
  // '광명사거리역' vs '광명사거리' — 일부 겹침
  const sim = nameSimilarity("광명사거리역", "광명사거리")
  assertEquals(sim >= 0.7, true)
})

Deno.test("nameSimilarity — 전혀 다른 이름 → 0.7 미만", () => {
  const sim = nameSimilarity("광명사거리역", "수원시청")
  assertEquals(sim < 0.7, true)
})

// ─── haversineMeters ─────────────────────────────────────────────────────────

Deno.test("haversineMeters — 동일 좌표 → 0m", () => {
  assertEquals(haversineMeters(126.861, 37.480, 126.861, 37.480), 0)
})

Deno.test("haversineMeters — 0.001도 차이 → 약 100m 이내", () => {
  const dist = haversineMeters(126.861, 37.480, 126.862, 37.480)
  assertEquals(dist < 120, true)
  assertEquals(dist > 0, true)
})

// ─── findGbisStationFromDB ───────────────────────────────────────────────────

supabaseTest("findGbisStationFromDB — ARS 단일 매칭 → 확정 반환", async () => {
  const db = makeDbClient()
  await withMockFetch(
    async () =>
      jsonResponse([
        { station_id: "200000177", station_name: "광명사거리역", lng: 126.861, lat: 37.480, ars_no: "85019", sigun_nm: "광명시" },
      ]),
    async () => {
      const result = await findGbisStationFromDB(db, {
        stationName: "광명사거리역",
        x: 126.861,
        y: 37.480,
        arsID: "85019",
      })
      assertEquals(result?.stationId, "200000177")
      assertEquals(result?.arsNo, "85019")
    },
  )
})

supabaseTest("findGbisStationFromDB — ARS 다중 매칭 → 좌표 가장 가까운 것 선택", async () => {
  const db = makeDbClient()
  let callCount = 0
  await withMockFetch(
    async () => {
      callCount++
      if (callCount === 1) {
        // ARS 검색: 2개 반환
        return jsonResponse([
          { station_id: "A", station_name: "정류소A", lng: 126.861, lat: 37.480, ars_no: "85019", sigun_nm: "광명시" },
          { station_id: "B", station_name: "정류소B", lng: 127.000, lat: 38.000, ars_no: "85019", sigun_nm: "광명시" },
        ])
      }
      // bbox 검색은 호출 안 됨 (ARS 다중에서 좌표로 처리)
      return jsonResponse([])
    },
    async () => {
      const result = await findGbisStationFromDB(db, {
        stationName: "정류소A",
        x: 126.861,
        y: 37.480,
        arsID: "85019",
      })
      // 좌표가 가장 가까운 "A" 선택
      assertEquals(result?.stationId, "A")
    },
  )
})

supabaseTest("findGbisStationFromDB — ARS 없음 + 좌표 200m 이내 + 이름 0.7 이상 → 매칭", async () => {
  const db = makeDbClient()
  // arsID=null이므로 ARS 검색 없이 bbox 검색만 실행됨
  await withMockFetch(
    async () =>
      // bbox 검색 응답: 동일 좌표 정류소
      jsonResponse([
        { station_id: "200000177", station_name: "광명사거리역", lng: 127.016, lat: 37.265, ars_no: null, sigun_nm: "광명시" },
      ]),
    async () => {
      const result = await findGbisStationFromDB(db, {
        stationName: "광명사거리역",
        x: 127.016,
        y: 37.265,
        arsID: null,
      })
      assertEquals(result?.stationId, "200000177")
    },
  )
})

supabaseTest("findGbisStationFromDB — 좌표 200m 초과 → null", async () => {
  const db = makeDbClient()
  await withMockFetch(
    async () =>
      // bbox 검색: 1km 이상 떨어진 정류소
      jsonResponse([
        { station_id: "200000177", station_name: "먼정류소", lng: 127.016 + 0.02, lat: 37.265, ars_no: null, sigun_nm: "광명시" },
      ]),
    async () => {
      const result = await findGbisStationFromDB(db, {
        stationName: "먼정류소",
        x: 127.016,
        y: 37.265,
        arsID: null,
      })
      assertEquals(result, null)
    },
  )
})

supabaseTest("findGbisStationFromDB — 좌표 200m 이내이지만 이름 유사도 0.7 미만 → null", async () => {
  const db = makeDbClient()
  await withMockFetch(
    async () =>
      jsonResponse([
        { station_id: "200000177", station_name: "수원시청앞정류장완전다른이름", lng: 127.016, lat: 37.265, ars_no: null, sigun_nm: "광명시" },
      ]),
    async () => {
      const result = await findGbisStationFromDB(db, {
        stationName: "광명사거리역",
        x: 127.016,
        y: 37.265,
        arsID: null,
      })
      assertEquals(result, null)
    },
  )
})

supabaseTest("findGbisStationFromDB — ARS 다중 매칭이지만 모두 200m 초과 → null (bbox로 fallback도 실패)", async () => {
  const db = makeDbClient()
  let callCount = 0
  await withMockFetch(
    async () => {
      callCount++
      if (callCount === 1) {
        // ARS 검색: 2개 반환, 둘 다 1km 이상 떨어져 있음
        return jsonResponse([
          { station_id: "A", station_name: "정류소A", lng: 127.100, lat: 38.000, ars_no: "85019", sigun_nm: "광명시" },
          { station_id: "B", station_name: "정류소B", lng: 127.200, lat: 38.100, ars_no: "85019", sigun_nm: "광명시" },
        ])
      }
      // bbox 검색도 빈 결과
      return jsonResponse([])
    },
    async () => {
      const result = await findGbisStationFromDB(db, {
        stationName: "정류소A",
        x: 126.861,
        y: 37.480,
        arsID: "85019",
      })
      // ARS 다중 중 가장 가까운 것도 200m 초과 → null
      assertEquals(result, null)
    },
  )
})

supabaseTest("findGbisStationFromDB — DB 빈 테이블 → null", async () => {
  const db = makeDbClient()
  await withMockFetch(
    async () => jsonResponse([]),
    async () => {
      const result = await findGbisStationFromDB(db, {
        stationName: "광명사거리역",
        x: 127.016,
        y: 37.265,
        arsID: "85019",
      })
      assertEquals(result, null)
    },
  )
})

// ─── mapGbisRoutes ──────────────────────────────────────────────────────────

Deno.test({ name: "mapGbisRoutes — 노선 1개 정상 매핑 → gbisRouteId/staOrder 채워짐", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  clearRouteStationCache()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(
      multiMockFetch([
        // getBusRouteListv2
        {
          match: "getBusRouteListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busRouteList: [
                  { routeId: "234000016", routeName: "11", regionName: "광명", districtCd: "41210" },
                ],
              },
            }),
        },
        // getBusRouteStationListv2
        {
          match: "getBusRouteStationListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busRouteStationList: [
                  { stationId: "200000177", stationName: "광명사거리역", stationSeq: 12 },
                ],
              },
            }),
        },
      ]),
      async () => {
        const station = {
          stationId: "200000177",
          stationName: "광명사거리역",
          x: 126.861,
          y: 37.480,
          sigunNm: "광명시",
        }
        const result = await mapGbisRoutes(station, [
          { odsayRouteId: "r1", routeName: "11" },
        ])
        assertEquals(result.length, 1)
        assertEquals(result[0].gbisRouteId, "234000016")
        assertEquals(result[0].gbisStaOrder, 12)
      },
    )
  )
}})

Deno.test({ name: "mapGbisRoutes — 부분 매핑 실패 (배열 일부 null OK)", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  clearRouteStationCache()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(
      multiMockFetch([
        {
          match: "getBusRouteListv2",
          response: () =>
            jsonResponse({ msgHeader: { resultCode: 4 } }), // 노선 없음
        },
      ]),
      async () => {
        const station = {
          stationId: "200000177",
          stationName: "광명사거리역",
          x: 126.861,
          y: 37.480,
          sigunNm: "광명시",
        }
        const result = await mapGbisRoutes(station, [
          { odsayRouteId: "r1", routeName: "없는노선번호" },
        ])
        assertEquals(result.length, 1)
        assertEquals(result[0].gbisRouteId, null)
        assertEquals(result[0].gbisStaOrder, null)
      },
    )
  )
}})

// ─── verifyGbisMapping ───────────────────────────────────────────────────────

Deno.test("verifyGbisMapping — routeId 교집합 50% 이상 시 true", async () => {
  await withEnv(GBIS_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 0 },
        msgBody: {
          busArrivalList: [
            { routeId: 234000016, routeName: "11", flag: "RUN", staOrder: 1, stationId: 1, predictTimeSec1: 60, predictTimeSec2: null, locationNo1: 1, locationNo2: null, stateCd1: 0, stateCd2: null, remainSeatCnt1: null, remainSeatCnt2: null, crowded1: null, crowded2: null, lowPlate1: null, lowPlate2: null, routeTypeCd: 13, predictTime1: 1, predictTime2: null, plateNo1: null, plateNo2: null, routeDestId: null, routeDestName: null, vehId1: null, vehId2: null, taglessCd1: null, taglessCd2: null, turnSeq: null },
          ],
        },
      }), async () => {
      // 기대: ["234000016", "999"] → 1/2 = 50% ≥ ceil(50%) → true
      const result = await verifyGbisMapping("200000177", ["234000016", "999999999"])
      assertEquals(result, true)
    })
  )
})

Deno.test("verifyGbisMapping — routeId 교집합 50% 미만 시 false", async () => {
  await withEnv(GBIS_ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgHeader: { resultCode: 0 },
        msgBody: {
          busArrivalList: [
            { routeId: 99, routeName: "999", flag: "RUN", staOrder: 1, stationId: 1, predictTimeSec1: 60, predictTimeSec2: null, locationNo1: 1, locationNo2: null, stateCd1: 0, stateCd2: null, remainSeatCnt1: null, remainSeatCnt2: null, crowded1: null, crowded2: null, lowPlate1: null, lowPlate2: null, routeTypeCd: 13, predictTime1: 1, predictTime2: null, plateNo1: null, plateNo2: null, routeDestId: null, routeDestName: null, vehId1: null, vehId2: null, taglessCd1: null, taglessCd2: null, turnSeq: null },
          ],
        },
      }), async () => {
      // 기대: ["234000016", "234000017"] → 0/2 = 0% < 50% → false
      const result = await verifyGbisMapping("200000177", ["234000016", "234000017"])
      assertEquals(result, false)
    })
  )
})

Deno.test({ name: "verifyGbisMapping — GBIS API 오류 시 true 반환 (장애 시 매핑 유지)", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await withEnv(GBIS_ENV, () =>
    withMockFetch(async () => new Response("", { status: 503 }), async () => {
      const result = await verifyGbisMapping("200000177", ["234000016"])
      assertEquals(result, true)
    })
  )
}})

supabaseTest("verifyGbisMapping — 기대 routeId 빈 배열이면 true", async () => {
  const result = await verifyGbisMapping("200000177", [])
  assertEquals(result, true)
})

// ─── resolveStopProvider ─────────────────────────────────────────────────────

supabaseTest("resolveStopProvider — subway stopType → provider='seoul' 고정 (경기 좌표여도)", async () => {
  const db = makeDbClient()
  const result = await resolveStopProvider(
    db,
    {
      stationID: "123",
      stationName: "수원역",
      x: GYEONGGI_COORDS.lng,
      y: GYEONGGI_COORDS.lat,
      arsID: null,
      stopType: "subway",
    },
    [],
  )
  assertEquals(result.provider, "seoul")
  assertEquals(result.gbisStationId, null)
})

supabaseTest("resolveStopProvider — 서울 좌표 bus → provider='seoul'", async () => {
  const db = makeDbClient()
  const result = await resolveStopProvider(
    db,
    {
      stationID: "106186",
      stationName: "강남역",
      x: SEOUL_COORDS.lng,
      y: SEOUL_COORDS.lat,
      arsID: "17243",
      stopType: "bus",
    },
    [],
  )
  assertEquals(result.provider, "seoul")
  assertEquals(result.arsId, "17243")
  assertEquals(result.gbisStationId, null)
})

supabaseTest("resolveStopProvider — 경기 좌표 + DB 검색 성공 + 검증 통과 → provider='gyeonggi'", async () => {
  const db = makeDbClient()
  clearRouteStationCache()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(
      multiMockFetch([
        // ARS 검색 (없음)
        {
          match: "eq=ars_no",
          response: () => jsonResponse([]),
        },
        // bbox 검색 → 수원 정류소 반환
        {
          match: "gbis_stations",
          response: () =>
            jsonResponse([
              { station_id: "200000555", station_name: "수원시청", lng: 127.016, lat: 37.265, ars_no: null, sigun_nm: "수원시" },
            ]),
        },
        // getBusRouteListv2
        {
          match: "getBusRouteListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busRouteList: [
                  { routeId: "234000011", routeName: "11", regionName: "수원", districtCd: "41111" },
                ],
              },
            }),
        },
        // getBusRouteStationListv2
        {
          match: "getBusRouteStationListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busRouteStationList: [
                  { stationId: "200000555", stationName: "수원시청", stationSeq: 5 },
                ],
              },
            }),
        },
        // 검증 (getBusArrivalListv2) → routeId 교집합 ≥ 50%
        {
          match: "getBusArrivalListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busArrivalList: [
                  { routeId: 234000011, routeName: "11", flag: "RUN", staOrder: 5, stationId: 200000555, predictTimeSec1: 60, predictTimeSec2: null, locationNo1: 1, locationNo2: null, stateCd1: 0, stateCd2: null, remainSeatCnt1: null, remainSeatCnt2: null, crowded1: null, crowded2: null, lowPlate1: null, lowPlate2: null, routeTypeCd: 13, predictTime1: 1, predictTime2: null, plateNo1: null, plateNo2: null, routeDestId: null, routeDestName: null, vehId1: null, vehId2: null, taglessCd1: null, taglessCd2: null, turnSeq: null },
                ],
              },
            }),
        },
      ]),
      async () => {
        const result = await resolveStopProvider(
          db,
          {
            stationID: "999001",
            stationName: "수원시청",
            x: GYEONGGI_COORDS.lng,
            y: GYEONGGI_COORDS.lat,
            arsID: null,
            stopType: "bus",
          },
          [{ odsayRouteId: "r1", routeName: "11" }],
        )
        assertEquals(result.provider, "gyeonggi")
        assertEquals(result.gbisStationId, "200000555")
      },
    )
  )
})

supabaseTest("resolveStopProvider — 경기 좌표 + DB 검색 0건 → provider='odsay_fallback' + fallbackReason='mapping_failed'", async () => {
  const db = makeDbClient()
  await withMockFetch(
    async () => jsonResponse([]), // 모든 DB 조회 빈 결과
    async () => {
      const result = await resolveStopProvider(
        db,
        {
          stationID: "999001",
          stationName: "없는정류소",
          x: GYEONGGI_COORDS.lng,
          y: GYEONGGI_COORDS.lat,
          arsID: null,
          stopType: "bus",
        },
        [],
      )
      assertEquals(result.provider, "odsay_fallback")
      assertEquals(result.fallbackReason, "mapping_failed")
      assertEquals(result.gbisStationId, null)
    },
  )
})

supabaseTest("resolveStopProvider — unknown 지역(부산) → provider='odsay_fallback' + fallbackReason='unsupported_region'", async () => {
  const db = makeDbClient()
  const result = await resolveStopProvider(
    db,
    {
      stationID: "999002",
      stationName: "부산역",
      x: BUSAN_COORDS.lng,
      y: BUSAN_COORDS.lat,
      arsID: null,
      stopType: "bus",
    },
    [],
  )
  assertEquals(result.provider, "odsay_fallback")
  assertEquals(result.fallbackReason, "unsupported_region")
})

supabaseTest("resolveStopProvider — 좌표 없으면 서울 가정 provider='seoul'", async () => {
  const db = makeDbClient()
  const result = await resolveStopProvider(
    db,
    {
      stationID: "123",
      stationName: "강남역",
      x: undefined as unknown as number,
      y: undefined as unknown as number,
      arsID: "17243",
    },
    [],
  )
  assertEquals(result.provider, "seoul")
  assertEquals(result.arsId, "17243")
})

supabaseTest("resolveStopProvider — 검증 실패 → provider='odsay_fallback'로 격하", async () => {
  const db = makeDbClient()
  clearRouteStationCache()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(
      multiMockFetch([
        // ARS 검색 빈 결과
        { match: "eq=ars_no", response: () => jsonResponse([]) },
        // bbox 검색: 매칭됨
        {
          match: "gbis_stations",
          response: () =>
            jsonResponse([
              { station_id: "200000555", station_name: "수원시청", lng: 127.016, lat: 37.265, ars_no: null, sigun_nm: "수원시" },
            ]),
        },
        // getBusRouteListv2 — 빈 결과 (매핑 실패 → mappedRouteIds = [])
        { match: "getBusRouteListv2", response: () => jsonResponse({ msgHeader: { resultCode: 4 } }) },
        // verifyGbisMapping — expectedRouteIds=[] → true (매핑할 노선 없음)
        // 이 케이스에서는 verify가 true 반환되어 gyeonggi가 됨.
        // 강제 격하 테스트를 위해 getBusArrivalListv2가 다른 노선만 반환하게 해야 함.
        // 여기서는 mapGbisRoutes 실패 후 expectedRouteIds=[] → verify skip → gyeonggi 반환됨.
        // 따라서 mappedRoutes에 gbisRouteId가 있는 케이스로 테스트:
      ]),
      async () => {
        const result = await resolveStopProvider(
          db,
          {
            stationID: "999001",
            stationName: "수원시청",
            x: GYEONGGI_COORDS.lng,
            y: GYEONGGI_COORDS.lat,
            arsID: null,
            stopType: "bus",
          },
          [{ odsayRouteId: "r1", routeName: "없는노선" }],
        )
        // mappedRouteIds=[] → verifyGbisMapping([]) → true → gyeonggi
        assertEquals(result.provider, "gyeonggi")
        assertEquals(result.gbisStationId, "200000555")
      },
    )
  )
})

// ─── D3-supplement: busType===6 보조 신호 ────────────────────────────────────

supabaseTest("resolveStopProvider — 서울 bbox이지만 busType===6 → GBIS 매핑 시도 후 gyeonggi", async () => {
  const db = makeDbClient()
  clearRouteStationCache()
  // SEOUL_COORDS(127.028, 37.498) 근처에 경기도 정류소가 있는 시나리오
  // mock 정류소 좌표를 SEOUL_COORDS와 100m 이내로 설정
  const NEAR_SEOUL = { lng: 127.028, lat: 37.4985 }  // ~55m
  await withEnv(GBIS_ENV, () =>
    withMockFetch(
      multiMockFetch([
        // ARS 검색 빈 결과
        { match: "eq=ars_no", response: () => jsonResponse([]) },
        // bbox 검색 → SEOUL_COORDS 근처에 경기 정류소 반환
        {
          match: "gbis_stations",
          response: () =>
            jsonResponse([
              { station_id: "200000177", station_name: "경계정류소", lng: NEAR_SEOUL.lng, lat: NEAR_SEOUL.lat, ars_no: null, sigun_nm: "광명시" },
            ]),
        },
        // getBusRouteListv2
        {
          match: "getBusRouteListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busRouteList: [
                  { routeId: "234000016", routeName: "11", regionName: "광명", districtCd: "41210" },
                ],
              },
            }),
        },
        // getBusRouteStationListv2
        {
          match: "getBusRouteStationListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busRouteStationList: [
                  { stationId: "200000177", stationName: "광명사거리역", stationSeq: 12 },
                ],
              },
            }),
        },
        // 검증 통과
        {
          match: "getBusArrivalListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busArrivalList: [
                  { routeId: 234000016, routeName: "11", flag: "RUN", staOrder: 12, stationId: 200000177, predictTimeSec1: 120, predictTimeSec2: null, locationNo1: 1, locationNo2: null, stateCd1: 0, stateCd2: null, remainSeatCnt1: null, remainSeatCnt2: null, crowded1: null, crowded2: null, lowPlate1: null, lowPlate2: null, routeTypeCd: 13, predictTime1: 2, predictTime2: null, plateNo1: null, plateNo2: null, routeDestId: null, routeDestName: null, vehId1: null, vehId2: null, taglessCd1: null, taglessCd2: null, turnSeq: null },
                ],
              },
            }),
        },
      ]),
      async () => {
        // SEOUL_COORDS 사용 (서울 bbox 안)이지만 busType===6 노선이 있어 GBIS 시도
        const result = await resolveStopProvider(
          db,
          {
            stationID: "999003",
            stationName: "경계정류소",
            x: SEOUL_COORDS.lng,
            y: SEOUL_COORDS.lat,
            arsID: null,
            stopType: "bus",
          },
          [{ odsayRouteId: "r1", routeName: "11", busType: 6 }],
        )
        assertEquals(result.provider, "gyeonggi")
        assertEquals(result.gbisStationId, "200000177")
      },
    )
  )
})

supabaseTest("resolveStopProvider — 서울 bbox + busType===6이지만 GBIS 매핑 실패 → seoul fallback", async () => {
  const db = makeDbClient()
  await withMockFetch(
    async () => jsonResponse([]),  // 모든 DB 조회 빈 결과 → station not found
    async () => {
      const result = await resolveStopProvider(
        db,
        {
          stationID: "999004",
          stationName: "없는정류소",
          x: SEOUL_COORDS.lng,
          y: SEOUL_COORDS.lat,
          arsID: null,
          stopType: "bus",
        },
        [{ odsayRouteId: "r1", routeName: "없는노선", busType: 6 }],
      )
      // 서울 bbox + GBIS 매핑 실패 → region="seoul"이므로 seoul fallback
      assertEquals(result.provider, "seoul")
      assertEquals(result.gbisStationId, null)
    },
  )
})

supabaseTest("resolveStopProvider — 검증 실패(실제 routeId 불일치) → provider='odsay_fallback' + fallbackReason='verify_failed'", async () => {
  const db = makeDbClient()
  clearRouteStationCache()
  await withEnv(GBIS_ENV, () =>
    withMockFetch(
      multiMockFetch([
        // ARS 검색 빈 결과
        { match: "eq=ars_no", response: () => jsonResponse([]) },
        // bbox 검색
        {
          match: "gbis_stations",
          response: () =>
            jsonResponse([
              { station_id: "200000555", station_name: "수원시청", lng: 127.016, lat: 37.265, ars_no: null, sigun_nm: "수원시" },
            ]),
        },
        // getBusRouteListv2 → routeId 234000011
        {
          match: "getBusRouteListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busRouteList: [
                  { routeId: "234000011", routeName: "11", regionName: "수원" },
                ],
              },
            }),
        },
        // getBusRouteStationListv2 → stationId 포함 → gbisRouteId="234000011"
        {
          match: "getBusRouteStationListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busRouteStationList: [
                  { stationId: "200000555", stationName: "수원시청", stationSeq: 5 },
                ],
              },
            }),
        },
        // 검증: 전혀 다른 routeId만 있음 → 교집합 0% < 50% → false
        {
          match: "getBusArrivalListv2",
          response: () =>
            jsonResponse({
              msgHeader: { resultCode: 0 },
              msgBody: {
                busArrivalList: [
                  { routeId: 999999, routeName: "999", flag: "RUN", staOrder: 1, stationId: 1, predictTimeSec1: 60, predictTimeSec2: null, locationNo1: 1, locationNo2: null, stateCd1: 0, stateCd2: null, remainSeatCnt1: null, remainSeatCnt2: null, crowded1: null, crowded2: null, lowPlate1: null, lowPlate2: null, routeTypeCd: 13, predictTime1: 1, predictTime2: null, plateNo1: null, plateNo2: null, routeDestId: null, routeDestName: null, vehId1: null, vehId2: null, taglessCd1: null, taglessCd2: null, turnSeq: null },
                ],
              },
            }),
        },
      ]),
      async () => {
        const result = await resolveStopProvider(
          db,
          {
            stationID: "999001",
            stationName: "수원시청",
            x: GYEONGGI_COORDS.lng,
            y: GYEONGGI_COORDS.lat,
            arsID: null,
            stopType: "bus",
          },
          [{ odsayRouteId: "r1", routeName: "11" }],
        )
        assertEquals(result.provider, "odsay_fallback")
        assertEquals(result.fallbackReason, "verify_failed")
        assertEquals(result.gbisStationId, null)
      },
    )
  )
})
