import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts"
import { handler } from "../stop-buses/index.ts"
import { jsonResponse, makeRequest, withEnv, withMockFetch, TEST_ENV } from "./helpers.ts"

const ENV = { SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY }
const MOCK_ITEMS = [
  { busRouteId: "100100643", busRouteAbrv: "643", busRouteNm: "643", busRouteType: "12" },
  { busRouteId: "100100312", busRouteAbrv: "6637", busRouteNm: "6637", busRouteType: "12" },
]

Deno.test("stop-buses — OPTIONS 200", async () => {
  const res = await handler(makeRequest("OPTIONS", "http://localhost/stop-buses"))
  assertEquals(res.status, 200)
})

Deno.test("stop-buses — 정상 동작", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => jsonResponse({ msgBody: { itemList: MOCK_ITEMS } }), async () => {
      const res = await handler(makeRequest("GET", "http://localhost/stop-buses?arsId=17243"))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 2)
      assertEquals(body[0].routeName, "643")
      assertEquals(body[0].busRouteId, "100100643")
      assertEquals(body[0].busRouteType, 12)
    })
  )
})

Deno.test("stop-buses — 빈 결과 → 빈 배열", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => jsonResponse({ msgBody: {} }), async () => {
      const res = await handler(makeRequest("GET", "http://localhost/stop-buses?arsId=99999"))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body, [])
    })
  )
})

Deno.test("stop-buses — arsId 누락 → 400", async () => {
  const res = await handler(makeRequest("GET", "http://localhost/stop-buses"))
  assertEquals(res.status, 400)
})

Deno.test("stop-buses — POST → 405", async () => {
  const res = await handler(makeRequest("POST", "http://localhost/stop-buses?arsId=1"))
  assertEquals(res.status, 405)
})

Deno.test("stop-buses — API HTTP 오류 → 502", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 500 }), async () => {
      const res = await handler(makeRequest("GET", "http://localhost/stop-buses?arsId=1"))
      assertEquals(res.status, 502)
    })
  )
})
