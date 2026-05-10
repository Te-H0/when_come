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
  assertEquals(body.error.code, "ROUTE_SEARCH_COORDS_REQUIRED")
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
      assertEquals(body[0].totalTransferCount, 0)
      // 도보 구간이 필터링됐는지 확인
      assertEquals(body[0].segments.length, 1)
      assertEquals(body[0].segments[0].type, "subway")
      assertEquals(body[0].segments[0].sectionMinutes, 38)
      assertEquals(body[0].segments[0].startName, "강남")
      assertEquals(body[0].segments[0].lines[0].routeName, "수도권 2호선")
      assertEquals(body[0].segments[0].lines[0].subwayCode, "1002")
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

// ─── T2: way/wayCode 매핑 ─────────────────────────────────────

Deno.test("route-search — 지하철 subPath에 way+wayCode 있으면 segment에 그대로 매핑된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 1,
          info: { totalTime: 30, transferCount: 0 },
          subPath: [
            {
              trafficType: 1, // 지하철
              sectionTime: 30,
              startName: "석남(거북시장)",
              endName: "부평구청",
              way: "장암",
              wayCode: 1,
              lane: [{ name: "7호선", subwayCode: 7 }],
            },
          ],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 126.84, startY: 37.51, endX: 126.72, endY: 37.51 },
      }))
      assertEquals(res.status, 200)
      const body = await res.json()
      const seg = body[0].segments[0]
      assertEquals(seg.type, "subway")
      assertEquals(seg.way, "장암")
      assertEquals(seg.wayCode, 1)
    })
  )
})

Deno.test("route-search — 지하철 subPath에 way/wayCode 없으면 segment에 null로 매핑된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 1,
          info: { totalTime: 20, transferCount: 0 },
          subPath: [
            {
              trafficType: 1, // 지하철 — way/wayCode 누락
              sectionTime: 20,
              startName: "강남",
              endName: "홍대입구",
              lane: [{ name: "2호선", subwayCode: 2 }],
            },
          ],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      assertEquals(res.status, 200)
      const body = await res.json()
      const seg = body[0].segments[0]
      assertEquals(seg.way, null)
      assertEquals(seg.wayCode, null)
    })
  )
})

// ─── T3: 환승 횟수 산출 (busTransitCount + subwayTransitCount) ──

Deno.test("route-search — busTransitCount=1, subwayTransitCount=2 이면 totalTransferCount=3", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 3,
          info: { totalTime: 60, busTransitCount: 1, subwayTransitCount: 2 },
          subPath: [],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body[0].busTransferCount, 1)
      assertEquals(body[0].subwayTransferCount, 2)
      assertEquals(body[0].totalTransferCount, 3)
    })
  )
})

Deno.test("route-search — busTransitCount=0, subwayTransitCount=2 이면 totalTransferCount=2", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 2,
          info: { totalTime: 45, busTransitCount: 0, subwayTransitCount: 2 },
          subPath: [],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      const body = await res.json()
      assertEquals(body[0].busTransferCount, 0)
      assertEquals(body[0].subwayTransferCount, 2)
      assertEquals(body[0].totalTransferCount, 2)
    })
  )
})

Deno.test("route-search — busTransitCount·subwayTransitCount 둘 다 누락이면 totalTransferCount=0", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 1,
          info: { totalTime: 30 },
          subPath: [],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      const body = await res.json()
      assertEquals(body[0].busTransferCount, null)
      assertEquals(body[0].subwayTransferCount, null)
      assertEquals(body[0].totalTransferCount, 0)
    })
  )
})

Deno.test("route-search — 신규 필드(totalWalkMeters, paymentWon, pathType)가 응답에 정상 노출된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 3,
          info: {
            totalTime: 55,
            totalWalk: 820,
            totalDistance: 12400,
            payment: 1250,
            busTransitCount: 1,
            subwayTransitCount: 0,
            totalStationCount: 10,
          },
          subPath: [],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      assertEquals(res.status, 200)
      const body = await res.json()
      const r = body[0]
      assertEquals(r.pathType, 3)
      assertEquals(r.totalMinutes, 55)
      assertEquals(r.totalWalkMeters, 820)
      assertEquals(r.totalDistanceMeters, 12400)
      assertEquals(r.paymentWon, 1250)
      assertEquals(r.totalStationCount, 10)
      assertEquals(r.totalTransferCount, 1)
    })
  )
})

Deno.test("route-search — 신규 필드가 ODsay 응답에 없으면 null로 노출된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 1,
          info: { totalTime: 20 },
          subPath: [
            {
              trafficType: 1,
              sectionTime: 20,
              startName: "A",
              endName: "B",
              lane: [{ name: "2호선", subwayCode: 2 }],
            },
          ],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      const body = await res.json()
      const r = body[0]
      assertEquals(r.totalWalkMeters, null)
      assertEquals(r.totalDistanceMeters, null)
      assertEquals(r.paymentWon, null)
      assertEquals(r.totalStationCount, null)
      assertEquals(r.busTransferCount, null)
      assertEquals(r.subwayTransferCount, null)
      assertEquals(r.totalTransferCount, 0)
    })
  )
})

Deno.test("route-search — 버스 segment에서 way/wayCode는 항상 null이다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      odsayPathResponse([
        {
          pathType: 2,
          info: { totalTime: 25, transferCount: 0 },
          subPath: [
            {
              trafficType: 2, // 버스
              sectionTime: 25,
              startName: "강남역",
              endName: "홍대입구",
              way: "혹시라도들어온값",  // 버스는 ODsay가 way를 안 보내지만, 방어 테스트
              wayCode: 99,
              lane: [{ busNo: "273", busLocalBlID: "100100118", type: 1 }],
            },
          ],
        },
      ]), async () => {
      const res = await handler(makeRequest("POST", BASE, {
        body: { startX: 127.02, startY: 37.49, endX: 126.92, endY: 37.55 },
      }))
      assertEquals(res.status, 200)
      const body = await res.json()
      const seg = body[0].segments[0]
      assertEquals(seg.type, "bus")
      assertEquals(seg.way, null)
      assertEquals(seg.wayCode, null)
    })
  )
})
