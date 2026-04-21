import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts"
import { handler } from "../stop-routes/index.ts"
import {
  jsonResponse,
  makeRequest,
  TEST_ENV,
  withEnv,
  withMockFetch,
} from "./helpers.ts"

const MOCK_ITEMS = [
  { busRouteId: "100100643", busRouteAbrv: "643", busRouteNm: "643", busRouteType: "2" },
  { busRouteId: "100100275", busRouteAbrv: "5618", busRouteNm: "5618", busRouteType: "4" },
]

function mockSeoulBusSuccess(items = MOCK_ITEMS): Response {
  return jsonResponse({
    msgHeader: { headerCd: "0", headerMsg: "정상적으로 처리되었습니다.", itemCount: items.length },
    msgBody: { itemList: items },
  })
}

function mockSeoulBusEmpty(): Response {
  return jsonResponse({
    msgHeader: { headerCd: "0", headerMsg: "정상적으로 처리되었습니다.", itemCount: 0 },
    msgBody: {},
  })
}

Deno.test("OPTIONS preflight → 200", async () => {
  const res = await handler(makeRequest("OPTIONS", "http://localhost/stop-routes"))
  assertEquals(res.status, 200)
})

Deno.test("정상 동작 — arsId 있을 때 노선 목록 반환", async () => {
  await withEnv({ SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY }, async () => {
    await withMockFetch(async () => mockSeoulBusSuccess(), async () => {
      const res = await handler(makeRequest("GET", "http://localhost/stop-routes?arsId=19235"))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 2)
      assertEquals(body[0].busRouteId, "100100643")
      assertEquals(body[0].routeName, "643")
      assertEquals(body[0].busRouteType, 2)
    })
  })
})

Deno.test("빈 결과 — itemList 없을 때 빈 배열 반환", async () => {
  await withEnv({ SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY }, async () => {
    await withMockFetch(async () => mockSeoulBusEmpty(), async () => {
      const res = await handler(makeRequest("GET", "http://localhost/stop-routes?arsId=99999"))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body, [])
    })
  })
})

Deno.test("400 — arsId 누락", async () => {
  await withEnv({ SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY }, async () => {
    const res = await handler(makeRequest("GET", "http://localhost/stop-routes"))
    assertEquals(res.status, 400)
  })
})

Deno.test("400 — arsId 빈 문자열", async () => {
  await withEnv({ SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY }, async () => {
    const res = await handler(makeRequest("GET", "http://localhost/stop-routes?arsId="))
    assertEquals(res.status, 400)
  })
})

Deno.test("405 — POST 요청", async () => {
  await withEnv({ SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY }, async () => {
    const res = await handler(makeRequest("POST", "http://localhost/stop-routes?arsId=19235"))
    assertEquals(res.status, 405)
  })
})

Deno.test("502 — 서울 버스 API HTTP 오류", async () => {
  await withEnv({ SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY }, async () => {
    await withMockFetch(async () => new Response("error", { status: 500 }), async () => {
      const res = await handler(makeRequest("GET", "http://localhost/stop-routes?arsId=19235"))
      assertEquals(res.status, 502)
    })
  })
})
