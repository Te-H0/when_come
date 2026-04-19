import { assertEquals } from "@std/assert"
import { handler } from "../arrival-info/index.ts"
import { withMockFetch, withEnv, jsonResponse, makeRequest, TEST_ENV } from "./helpers.ts"

const ENV = {
  SEOUL_BUS_API_KEY: TEST_ENV.SEOUL_BUS_API_KEY,
  SEOUL_SUBWAY_API_KEY: TEST_ENV.SEOUL_SUBWAY_API_KEY,
}

const BASE = "https://test.supabase.co/functions/v1/arrival-info"

// ─── CORS ────────────────────────────────────────────────────

Deno.test("arrival-info — OPTIONS는 200을 반환한다", async () => {
  const res = await handler(makeRequest("OPTIONS", BASE))
  assertEquals(res.status, 200)
})

// ─── 메서드 검증 ───────────────────────────────────────────────

Deno.test("arrival-info — POST는 405를 반환한다", async () => {
  const res = await handler(makeRequest("POST", `${BASE}?type=bus`))
  assertEquals(res.status, 405)
})

// ─── type 파라미터 검증 ───────────────────────────────────────

Deno.test("arrival-info — type 없으면 400을 반환한다", async () => {
  const res = await handler(makeRequest("GET", BASE))
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, "type 파라미터가 필요합니다 (bus | subway)")
})

Deno.test("arrival-info — 알 수 없는 type은 400을 반환한다", async () => {
  const res = await handler(makeRequest("GET", `${BASE}?type=tram`))
  assertEquals(res.status, 400)
})

// ─── bus 파라미터 검증 ────────────────────────────────────────

Deno.test("arrival-info bus — stId 없으면 400을 반환한다", async () => {
  const res = await handler(makeRequest("GET", `${BASE}?type=bus&busRouteId=100100118&ord=65`))
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, "bus 타입은 stId, busRouteId, ord 가 필요합니다")
})

Deno.test("arrival-info bus — busRouteId 없으면 400을 반환한다", async () => {
  const res = await handler(makeRequest("GET", `${BASE}?type=bus&stId=106186&ord=65`))
  assertEquals(res.status, 400)
})

Deno.test("arrival-info bus — ord 없으면 400을 반환한다", async () => {
  const res = await handler(makeRequest("GET", `${BASE}?type=bus&stId=106186&busRouteId=100100118`))
  assertEquals(res.status, 400)
})

// ─── bus 정상 동작 ────────────────────────────────────────────

Deno.test("arrival-info bus — 정상 도착정보를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgBody: {
          itemList: [{
            busRouteAbrv: "273",
            arrmsg1: "3분후[1번째 전]",
            arrmsg2: "25분17초후[18번째 전]",
            traTime1: "180",
            traTime2: "1517",
          }],
        },
      }), async () => {
      const url = `${BASE}?type=bus&stId=106186&busRouteId=100100118&ord=65`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.routeName, "273")
      assertEquals(body.arrmsg1, "3분후[1번째 전]")
      assertEquals(body.arrivalSec1, 180)
      assertEquals(body.arrivalSec2, 1517)
    })
  )
})

Deno.test("arrival-info bus — itemList가 없으면 null을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ msgBody: { itemList: [] } }), async () => {
      const url = `${BASE}?type=bus&stId=999&busRouteId=999&ord=1`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body, null)
    })
  )
})

Deno.test("arrival-info bus — traTime이 0이면 arrivalSec은 null이다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgBody: {
          itemList: [{
            busRouteAbrv: "273",
            arrmsg1: "운행종료",
            arrmsg2: "",
            traTime1: "0",
            traTime2: "0",
          }],
        },
      }), async () => {
      const url = `${BASE}?type=bus&stId=1&busRouteId=1&ord=1`
      const res = await handler(makeRequest("GET", url))
      const body = await res.json()
      assertEquals(body.arrivalSec1, null)
      assertEquals(body.arrivalSec2, null)
    })
  )
})

Deno.test("arrival-info bus — API HTTP 오류는 502를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 503 }), async () => {
      const url = `${BASE}?type=bus&stId=1&busRouteId=1&ord=1`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 502)
    })
  )
})

Deno.test("arrival-info bus — API 키 미설정 시 500을 반환한다", async () => {
  await withEnv({}, () =>
    withMockFetch(async () => jsonResponse({}), async () => {
      const url = `${BASE}?type=bus&stId=1&busRouteId=1&ord=1`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 500)
    })
  )
})

// ─── subway 파라미터 검증 ─────────────────────────────────────

Deno.test("arrival-info subway — stationName 없으면 400을 반환한다", async () => {
  const res = await handler(makeRequest("GET", `${BASE}?type=subway`))
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, "subway 타입은 stationName 이 필요합니다")
})

// ─── subway 정상 동작 ─────────────────────────────────────────

Deno.test("arrival-info subway — 정상 도착정보 목록을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [
          {
            subwayId: "1002",
            trainLineNm: "성수행 - 역삼방면",
            arvlMsg2: "2분 40초 후",
            arvlMsg3: "서초",
            updnLine: "외선",
          },
          {
            subwayId: "1002",
            trainLineNm: "신사행 - 강남방면",
            arvlMsg2: "5분 후",
            arvlMsg3: "선릉",
            updnLine: "내선",
          },
        ],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 2)
      assertEquals(body[0].lineName, "1002")
      assertEquals(body[0].direction, "성수행 - 역삼방면")
      assertEquals(body[0].arrmsg1, "2분 40초 후")
      assertEquals(body[0].updnLine, "외선")
    })
  )
})

Deno.test("arrival-info subway — realtimeArrivalList가 없으면 빈 배열을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => jsonResponse({}), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body, [])
    })
  )
})

Deno.test("arrival-info subway — 지하철 API HTTP 오류는 502를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 500 }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      assertEquals(res.status, 502)
    })
  )
})

Deno.test("arrival-info subway — 역명을 encodeURIComponent로 인코딩하여 요청한다", async () => {
  let capturedUrl = ""
  await withEnv(ENV, () =>
    withMockFetch(async (url) => {
      capturedUrl = url
      return jsonResponse({ realtimeArrivalList: [] })
    }, async () => {
      await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      // 한글은 encodeURIComponent로 반드시 percent-encoding됨
      assertEquals(capturedUrl.includes("%EA"), true)   // 강 → %EA%B0%95
      assertEquals(capturedUrl.includes("강남"), false) // 원문 그대로면 버그
    })
  )
})
