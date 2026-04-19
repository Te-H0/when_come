import { assertEquals } from "@std/assert"
import { handler } from "../route-search/index.ts"
import { withMockFetch, withEnv, jsonResponse, makeRequest, TEST_ENV } from "./helpers.ts"

const ENV = { ODSAY_API_KEY: TEST_ENV.ODSAY_API_KEY }
const BASE = "https://test.supabase.co/functions/v1/route-search"

function odsayPathResponse(paths: unknown[]) {
  return jsonResponse({ result: { path: paths } })
}

// ─── CORS ────────────────────────────────────────────────────

Deno.test("route-search — OPTIONS는 200을 반환한다", async () => {
  const res = await handler(makeRequest("OPTIONS", BASE))
  assertEquals(res.status, 200)
})

// ─── 메서드 검증 ───────────────────────────────────────────────

Deno.test("route-search — GET은 405를 반환한다", async () => {
  const res = await handler(makeRequest("GET", BASE))
  assertEquals(res.status, 405)
})

Deno.test("route-search — DELETE는 405를 반환한다", async () => {
  const res = await handler(makeRequest("DELETE", BASE))
  assertEquals(res.status, 405)
})

// ─── 파라미터 검증 ────────────────────────────────────────────

Deno.test("route-search — startX 없으면 400을 반환한다", async () => {
  const res = await handler(makeRequest("POST", BASE, {
    body: { startY: 37.49, endX: 126.92, endY: 37.55 },
  }))
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, "startX, startY, endX, endY 가 모두 필요합니다")
})

Deno.test("route-search — 빈 body는 400을 반환한다", async () => {
  const res = await handler(makeRequest("POST", BASE, { body: {} }))
  assertEquals(res.status, 400)
})

Deno.test("route-search — startX가 0이면 falsy라 400을 반환한다", async () => {
  // 좌표 0은 실제 유효하지 않은 한국 좌표 — 현재 구현상 0은 falsy로 처리됨
  const res = await handler(makeRequest("POST", BASE, {
    body: { startX: 0, startY: 37.49, endX: 126.92, endY: 37.55 },
  }))
  assertEquals(res.status, 400)
})

// ─── 정상 동작 ────────────────────────────────────────────────

Deno.test("route-search — 지하철 경로를 올바르게 매핑한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 1,
          info: { totalTime: 41, transferCount: 0 },
          subPath: [
            {
              trafficType: 3, // 도보 — 필터링돼야 함
              sectionTime: 5,
              startName: "출발",
              endName: "강남역",
              lane: [],
            },
            {
              trafficType: 1, // 지하철
              sectionTime: 38,
              startName: "강남",
              endName: "홍대입구",
              lane: [{ name: "수도권 2호선", subwayCode: 2 }],
            },
          ],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.0276, startY: 37.4979, endX: 126.9227, endY: 37.5572 },
      }))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 1)
      assertEquals(body[0].id, "0")
      assertEquals(body[0].totalMinutes, 41)
      assertEquals(body[0].transferCount, 0)
      // 도보 구간이 필터링됐는지 확인
      assertEquals(body[0].segments.length, 1)
      assertEquals(body[0].segments[0].type, "subway")
      assertEquals(body[0].segments[0].sectionMinutes, 38)
      assertEquals(body[0].segments[0].startName, "강남")
      assertEquals(body[0].segments[0].lines[0].routeName, "수도권 2호선")
      assertEquals(body[0].segments[0].lines[0].subwayCode, 2)
      assertEquals(body[0].segments[0].lines[0].busRouteId, null)
      assertEquals(body[0].segments[0].lines[0].busType, null)
    })
  )
})

Deno.test("route-search — 버스 경로를 올바르게 매핑한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 2,
          info: { totalTime: 30, transferCount: 1 },
          subPath: [
            {
              trafficType: 2, // 버스
              sectionTime: 25,
              startName: "강남역",
              endName: "홍대입구",
              lane: [{ busNo: "273", busLocalBlID: "100100118", type: 1 }],
            },
          ],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      const body = await res.json()
      const seg = body[0].segments[0]
      assertEquals(seg.type, "bus")
      assertEquals(seg.lines[0].routeName, "273")
      assertEquals(seg.lines[0].busRouteId, "100100118")
      assertEquals(seg.lines[0].busType, 1)
      assertEquals(seg.lines[0].subwayCode, null)
    })
  )
})

Deno.test("route-search — 도보만 있는 경로는 segments가 빈 배열이다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 3,
          info: { totalTime: 10, transferCount: 0 },
          subPath: [
            { trafficType: 3, sectionTime: 10, startName: "A", endName: "B", lane: [] },
          ],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 127.03, endY: 37.50 },
      }))
      const body = await res.json()
      assertEquals(body[0].segments, [])
    })
  )
})

Deno.test("route-search — ODsay 결과 없으면 빈 배열을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ error: [{ code: "-98", message: "없음" }] }), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body, [])
    })
  )
})

Deno.test("route-search — lane이 없는 subPath도 lines를 빈 배열로 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 1,
          info: { totalTime: 20, transferCount: 0 },
          subPath: [
            { trafficType: 1, sectionTime: 20, startName: "A", endName: "B" },
          ],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      const body = await res.json()
      assertEquals(body[0].segments[0].lines, [])
    })
  )
})

Deno.test("route-search — 복수 경로를 올바르게 인덱싱한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        { pathType: 1, info: { totalTime: 41, transferCount: 0 }, subPath: [] },
        { pathType: 2, info: { totalTime: 35, transferCount: 1 }, subPath: [] },
        { pathType: 3, info: { totalTime: 50, transferCount: 2 }, subPath: [] },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      const body = await res.json()
      assertEquals(body.length, 3)
      assertEquals(body[0].id, "0")
      assertEquals(body[1].id, "1")
      assertEquals(body[2].id, "2")
    })
  )
})

Deno.test("route-search — ODsay HTTP 오류는 502를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 500 }), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      assertEquals(res.status, 502)
    })
  )
})
