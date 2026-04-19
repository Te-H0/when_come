import { assertEquals } from "@std/assert"
import { handler } from "../search-stops/index.ts"
import { withMockFetch, withEnv, jsonResponse, makeRequest, TEST_ENV } from "./helpers.ts"

const ENV = { ODSAY_API_KEY: TEST_ENV.ODSAY_API_KEY }

const BASE = "https://test.supabase.co/functions/v1/search-stops"

function odsayStationsResponse(stations: unknown[]) {
  return jsonResponse({ result: { station: stations } })
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
  assertEquals(body.error, "q 파라미터가 필요합니다")
})

Deno.test("search-stops — q가 공백만 있으면 400을 반환한다", async () => {
  const req = makeRequest("GET", `${BASE}?q=   `)
  const res = await handler(req)
  assertEquals(res.status, 400)
})

// ─── 정상 동작 ────────────────────────────────────────────────

Deno.test("search-stops — 버스 정류장을 올바르게 매핑한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayStationsResponse([
        { stationID: 11001, stationName: "강남역버스정류장", x: 127.026, y: 37.500, type: 1, arsID: "22173" },
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
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayStationsResponse([
        { stationID: 106186, stationName: "강남역", x: 127.026267, y: 37.500083, type: 2, arsID: "" },
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
    withMockFetch(async () =>
      jsonResponse({ error: [{ code: "-98", message: "없음" }] }), async () => {
      const req = makeRequest("GET", `${BASE}?q=존재하지않는역`)
      const res = await handler(req)
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body, [])
    })
  )
})

Deno.test("search-stops — arsID가 없으면 null로 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayStationsResponse([
        { stationID: 99999, stationName: "테스트역", x: 127.0, y: 37.5, type: 2, arsID: undefined },
      ]), async () => {
      const req = makeRequest("GET", `${BASE}?q=테스트`)
      const res = await handler(req)
      const body = await res.json()
      assertEquals(body[0].arsId, null)
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
    withMockFetch(async () => odsayStationsResponse([]), async () => {
      const req = makeRequest("GET", `${BASE}?q=강남`)
      const res = await handler(req)
      assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
    })
  )
})
