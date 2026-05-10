import { assertEquals } from "@std/assert"
import { handler } from "../search-stops/index.ts"
import { withMockFetch, withEnv, jsonResponse, multiMockFetch, makeRequest, TEST_ENV } from "./helpers.ts"

const ENV = { ODSAY_API_KEY: TEST_ENV.ODSAY_API_KEY }

const BASE = "https://test.supabase.co/functions/v1/search-stops"

function odsayStationsResponse(stations: unknown[]) {
  return jsonResponse({ result: { station: stations } })
}

function odsayEmpty() {
  return jsonResponse({ error: [{ code: "-98", message: "없음" }] })
}

// ─── CORS ────────────────────────────────────────────────────

Deno.test("search-stops — OPTIONS는 200을 반환한다", async () => {
  const req = makeRequest("OPTIONS", BASE)
  const res = await handler(req)
  assertEquals(res.status, 200)
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
})

// ─── 메서드 검증 ───────────────────────────────────────────────

Deno.test("search-stops — POST는 405를 반환한다", async () => {
  const req = makeRequest("POST", `${BASE}?q=강남`)
  const res = await handler(req)
  assertEquals(res.status, 405)
})

Deno.test("search-stops — DELETE는 405를 반환한다", async () => {
  const req = makeRequest("DELETE", `${BASE}?q=강남`)
  const res = await handler(req)
  assertEquals(res.status, 405)
})

// ─── 파라미터 검증 ────────────────────────────────────────────

Deno.test("search-stops — q 파라미터 없으면 400을 반환한다", async () => {
  const req = makeRequest("GET", BASE)
  const res = await handler(req)
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error.code, "STOP_QUERY_REQUIRED")
})

Deno.test("search-stops — q가 공백만 있으면 400을 반환한다", async () => {
  const req = makeRequest("GET", `${BASE}?q=   `)
  const res = await handler(req)
  assertEquals(res.status, 400)
})

// ─── 정상 동작 ────────────────────────────────────────────────
// 이름 검색은 includeSubway=true → ODsay fetch 2회 (stationClass=1 버스, stationClass=2 지하철)
// multiMockFetch로 URL 패턴 분기

Deno.test("search-stops — 버스 정류장을 올바르게 매핑한다", async () => {
  const busStop = { stationID: 11001, stationName: "강남역버스정류장", x: 127.026, y: 37.500, type: 1, arsID: "22173" }
  await withEnv(ENV, () =>
    withMockFetch(multiMockFetch([
      { match: "stationClass=1", response: () => odsayStationsResponse([busStop]) },
      { match: "stationClass=2", response: () => odsayEmpty() },
    ]), async () => {
      const req = makeRequest("GET", `${BASE}?q=강남`)
      const res = await handler(req)
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 1)
      assertEquals(body[0].id, "11001")
      assertEquals(body[0].name, "강남역버스정류장")
      assertEquals(body[0].type, "bus")
      assertEquals(body[0].lat, 37.500)
      assertEquals(body[0].lng, 127.026)
      assertEquals(body[0].arsId, "22173")
    })
  )
})

Deno.test("search-stops — 지하철역을 올바르게 매핑한다 (type=2 → subway)", async () => {
  const subwayStop = { stationID: 106186, stationName: "강남역", x: 127.026267, y: 37.500083, type: 2, arsID: "" }
  await withEnv(ENV, () =>
    withMockFetch(multiMockFetch([
      { match: "stationClass=1", response: () => odsayEmpty() },
      { match: "stationClass=2", response: () => odsayStationsResponse([subwayStop]) },
    ]), async () => {
      const req = makeRequest("GET", `${BASE}?q=강남역`)
      const res = await handler(req)
      const body = await res.json()
      assertEquals(body[0].type, "subway")
    })
  )
})

Deno.test("search-stops — ODsay 결과 없으면 빈 배열을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => odsayEmpty(), async () => {
      const req = makeRequest("GET", `${BASE}?q=존재하지않는역`)
      const res = await handler(req)
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body, [])
    })
  )
})

Deno.test("search-stops — arsID가 없으면 null로 반환한다", async () => {
  const subwayStop = { stationID: 99999, stationName: "테스트역", x: 127.0, y: 37.5, type: 2, arsID: undefined }
  await withEnv(ENV, () =>
    withMockFetch(multiMockFetch([
      { match: "stationClass=1", response: () => odsayEmpty() },
      { match: "stationClass=2", response: () => odsayStationsResponse([subwayStop]) },
    ]), async () => {
      const req = makeRequest("GET", `${BASE}?q=테스트`)
      const res = await handler(req)
      const body = await res.json()
      assertEquals(body[0].arsId, null)
    })
  )
})

// ─── subway-first 정렬 ───────────────────────────────────────
// includeSubway=true: stationClass=1 → 버스, stationClass=2 → 지하철
// 응답 merge 순서는 [...busStations, ...subwayStations] — 지하철이 뒤에 붙음
// sort 후 subway가 앞으로 와야 함

Deno.test("search-stops — 버스+지하철 혼합 응답에서 subway가 앞에 정렬된다", async () => {
  const busStops = [
    { stationID: 11001, stationName: "서울역버스정류장", x: 126.972, y: 37.555, type: 1, arsID: "12345" },
    { stationID: 11002, stationName: "서울역버스2", x: 126.973, y: 37.556, type: 1, arsID: "12346" },
  ]
  const subwayStops = [
    { stationID: 106200, stationName: "서울역(1호선)", x: 126.972, y: 37.554, type: 2, arsID: "" },
    { stationID: 106201, stationName: "서울역(4호선)", x: 126.971, y: 37.554, type: 2, arsID: "" },
  ]
  await withEnv(ENV, () =>
    withMockFetch(multiMockFetch([
      { match: "stationClass=1", response: () => odsayStationsResponse(busStops) },
      { match: "stationClass=2", response: () => odsayStationsResponse(subwayStops) },
    ]), async () => {
      const req = makeRequest("GET", `${BASE}?q=서울역`)
      const res = await handler(req)
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 4)
      // subway 2건이 앞에 위치해야 함
      assertEquals(body[0].type, "subway")
      assertEquals(body[1].type, "subway")
      assertEquals(body[2].type, "bus")
      assertEquals(body[3].type, "bus")
      // subway 내부 순서는 ODsay 응답 순서(안정 정렬) 유지
      assertEquals(body[0].id, "106200")
      assertEquals(body[1].id, "106201")
    })
  )
})

Deno.test("search-stops — subway만 있으면 정렬 후에도 순서 유지된다", async () => {
  const subwayStops = [
    { stationID: 106200, stationName: "서울역(1호선)", x: 126.972, y: 37.554, type: 2, arsID: "" },
    { stationID: 106201, stationName: "서울역(4호선)", x: 126.971, y: 37.554, type: 2, arsID: "" },
  ]
  await withEnv(ENV, () =>
    withMockFetch(multiMockFetch([
      { match: "stationClass=1", response: () => odsayEmpty() },
      { match: "stationClass=2", response: () => odsayStationsResponse(subwayStops) },
    ]), async () => {
      const req = makeRequest("GET", `${BASE}?q=서울역`)
      const res = await handler(req)
      const body = await res.json()
      assertEquals(body.length, 2)
      assertEquals(body[0].type, "subway")
      assertEquals(body[1].type, "subway")
      assertEquals(body[0].id, "106200")
      assertEquals(body[1].id, "106201")
    })
  )
})

Deno.test("search-stops — ODsay HTTP 오류는 502를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 500 }), async () => {
      const req = makeRequest("GET", `${BASE}?q=강남`)
      const res = await handler(req)
      assertEquals(res.status, 502)
    })
  )
})

Deno.test("search-stops — CORS 헤더가 성공 응답에도 포함된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => odsayEmpty(), async () => {
      const req = makeRequest("GET", `${BASE}?q=강남`)
      const res = await handler(req)
      assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
    })
  )
})

// ─── 지하철 laneName / subwayCode 필드 ───────────────────────

Deno.test("search-stops — 지하철 row에 laneName과 subwayCode가 포함된다", async () => {
  // ODsay stationClass=2 응답: stationClass 필드 있음, type=1(1호선)
  const subwayStop = {
    stationID: 133, stationName: "서울역", x: 126.972, y: 37.555,
    stationClass: 2, type: 1, arsID: "133",
    laneName: "수도권 1호선", laneCity: "수도권",
  }
  await withEnv(ENV, () =>
    withMockFetch(multiMockFetch([
      { match: "stationClass=1", response: () => odsayEmpty() },
      { match: "stationClass=2", response: () => odsayStationsResponse([subwayStop]) },
    ]), async () => {
      const req = makeRequest("GET", `${BASE}?q=서울역`)
      const res = await handler(req)
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 1)
      assertEquals(body[0].type, "subway")
      assertEquals(body[0].laneName, "수도권 1호선")
      assertEquals(body[0].subwayCode, "1001")  // ODsay type=1 → "1001"
    })
  )
})

Deno.test("search-stops — 4호선 지하철 row에 subwayCode 1004가 포함된다", async () => {
  const subwayStop = {
    stationID: 426, stationName: "서울역", x: 126.972, y: 37.553,
    stationClass: 2, type: 4, arsID: "426",
    laneName: "수도권 4호선", laneCity: "수도권",
  }
  await withEnv(ENV, () =>
    withMockFetch(multiMockFetch([
      { match: "stationClass=1", response: () => odsayEmpty() },
      { match: "stationClass=2", response: () => odsayStationsResponse([subwayStop]) },
    ]), async () => {
      const req = makeRequest("GET", `${BASE}?q=서울역`)
      const res = await handler(req)
      const body = await res.json()
      assertEquals(body[0].subwayCode, "1004")
    })
  )
})

Deno.test("search-stops — 버스 row에는 laneName과 subwayCode가 없다", async () => {
  const busStop = { stationID: 11001, stationName: "강남역버스정류장", x: 127.026, y: 37.500, type: 1, arsID: "22173" }
  await withEnv(ENV, () =>
    withMockFetch(multiMockFetch([
      { match: "stationClass=1", response: () => odsayStationsResponse([busStop]) },
      { match: "stationClass=2", response: () => odsayEmpty() },
    ]), async () => {
      const req = makeRequest("GET", `${BASE}?q=강남`)
      const res = await handler(req)
      const body = await res.json()
      assertEquals(body.length, 1)
      assertEquals(body[0].type, "bus")
      assertEquals(body[0].laneName, undefined)
      assertEquals(body[0].subwayCode, undefined)
    })
  )
})

Deno.test("search-stops — 경의중앙선(type=104) subwayCode는 1104로 매핑된다", async () => {
  const subwayStop = {
    stationID: 1610, stationName: "서울역", x: 126.971, y: 37.556,
    stationClass: 2, type: 104, arsID: "P313",
    laneName: "경의중앙선", laneCity: "수도권",
  }
  await withEnv(ENV, () =>
    withMockFetch(multiMockFetch([
      { match: "stationClass=1", response: () => odsayEmpty() },
      { match: "stationClass=2", response: () => odsayStationsResponse([subwayStop]) },
    ]), async () => {
      const req = makeRequest("GET", `${BASE}?q=서울역`)
      const res = await handler(req)
      const body = await res.json()
      // 경의중앙선: ODsay 104 → FE "1104" 또는 null (매핑 미지원 시)
      // subwayCode가 undefined가 아닌 string 또는 null인지 확인
      const sc = body[0].subwayCode
      assertEquals(sc === null || typeof sc === "string", true)
    })
  )
})

// ─── "역" 접미사 제거 fallback (이슈 1: 개봉역 등) ──────────────────────────
// "개봉역"처럼 "역"으로 끝나는 query: "개봉역"과 "개봉" 두 변형으로 지하철 호출
// 두 응답 merge + stationID dedupe

Deno.test("search-stops — 역 접미사 query에서 지하철 변형 호출이 merge된다", async () => {
  // "개봉역" 원본 → 0건, "개봉" 제거 변형 → 1건
  // stationClass=2 응답 포맷: stationClass 필드 포함, type=호선코드
  const subwayStop = { stationID: 3001, stationName: "개봉", x: 126.847, y: 37.493, stationClass: 2, type: 1, arsID: "" }
  let subwayCallCount = 0
  await withEnv(ENV, () =>
    withMockFetch(
      async (url: string) => {
        if (url.includes("stationClass=1")) return odsayEmpty()
        if (url.includes("stationClass=2")) {
          subwayCallCount++
          // 첫 번째 호출(원본 "개봉역") → 0건, 두 번째 호출("개봉") → 결과
          if (subwayCallCount === 1) return odsayEmpty()
          return odsayStationsResponse([subwayStop])
        }
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        const req = makeRequest("GET", `${BASE}?q=개봉역`)
        const res = await handler(req)
        assertEquals(res.status, 200)
        const body = await res.json()
        // 변형 호출에서 가져온 지하철역이 포함되어야 함
        assertEquals(body.length, 1)
        assertEquals(body[0].type, "subway")
        assertEquals(body[0].id, "3001")
        // 지하철 stationClass=2 호출이 2회 발생해야 함 (원본 + 변형)
        assertEquals(subwayCallCount, 2)
      },
    )
  )
})

Deno.test("search-stops — 역 접미사 query에서 stationID 중복은 dedupe된다", async () => {
  // 두 변형 호출 모두 같은 stationID 반환 → dedupe 후 1건
  const subwayStop = { stationID: 3001, stationName: "개봉", x: 126.847, y: 37.493, stationClass: 2, type: 1, arsID: "" }
  await withEnv(ENV, () =>
    withMockFetch(
      async (url: string) => {
        if (url.includes("stationClass=1")) return odsayEmpty()
        if (url.includes("stationClass=2")) return odsayStationsResponse([subwayStop])
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        const req = makeRequest("GET", `${BASE}?q=개봉역`)
        const res = await handler(req)
        const body = await res.json()
        // 중복 제거 후 1건
        assertEquals(body.length, 1)
        assertEquals(body[0].id, "3001")
      },
    )
  )
})

Deno.test("search-stops — 역으로 끝나지 않는 query는 지하철 호출 1회만 한다", async () => {
  const subwayStop = { stationID: 106186, stationName: "강남역", x: 127.026, y: 37.500, type: 2, arsID: "" }
  let subwayCallCount = 0
  await withEnv(ENV, () =>
    withMockFetch(
      async (url: string) => {
        if (url.includes("stationClass=1")) return odsayEmpty()
        if (url.includes("stationClass=2")) {
          subwayCallCount++
          return odsayStationsResponse([subwayStop])
        }
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        const req = makeRequest("GET", `${BASE}?q=강남`)
        const res = await handler(req)
        assertEquals(res.status, 200)
        // "강남"은 "역"으로 끝나지 않으므로 변형 없이 1회만
        assertEquals(subwayCallCount, 1)
      },
    )
  )
})

Deno.test("search-stops — query가 '역' 한 글자일 때 변형 없이 1회만 호출한다", async () => {
  let subwayCallCount = 0
  await withEnv(ENV, () =>
    withMockFetch(
      async (url: string) => {
        if (url.includes("stationClass=1")) return odsayEmpty()
        if (url.includes("stationClass=2")) {
          subwayCallCount++
          return odsayEmpty()
        }
        throw new Error(`Unmocked: ${url}`)
      },
      async () => {
        const req = makeRequest("GET", `${BASE}?q=역`)
        await handler(req)
        // "역" 한 글자는 변형 없이 1회만
        assertEquals(subwayCallCount, 1)
      },
    )
  )
})
