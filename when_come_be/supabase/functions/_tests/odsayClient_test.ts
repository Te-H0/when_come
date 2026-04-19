import { assertEquals, assertRejects } from "@std/assert"
import { searchStation, realtimeStation, searchPubTransPath } from "../_shared/odsayClient.ts"
import { AppError } from "../_shared/error.ts"
import { withMockFetch, withEnv, jsonResponse, TEST_ENV } from "./helpers.ts"

const ENV = { ODSAY_API_KEY: TEST_ENV.ODSAY_API_KEY }

// ─── searchStation ────────────────────────────────────────────

Deno.test("searchStation — 정상 결과를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        result: {
          station: [
            { stationID: 106186, stationName: "강남역", x: 127.026, y: 37.500, type: 2, arsID: "22173" },
          ],
        },
      }), async () => {
      const result = await searchStation("강남")
      assertEquals(result.length, 1)
      assertEquals(result[0].stationName, "강남역")
      assertEquals(result[0].type, 2)
    })
  )
})

Deno.test("searchStation — ODsay 결과 없음(-98)은 빈 배열을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ error: [{ code: "-98", message: "결과 없음" }] }), async () => {
      const result = await searchStation("존재하지않는역이름xyz")
      assertEquals(result, [])
    })
  )
})

Deno.test("searchStation — ODsay 결과 없음(-99)은 빈 배열을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ error: [{ code: "-99", message: "결과 없음" }] }), async () => {
      const result = await searchStation("xyz")
      assertEquals(result, [])
    })
  )
})

Deno.test("searchStation — ODsay -8 에러는 400 AppError를 던진다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ error: [{ code: "-8", message: "파라미터 오류" }] }), () =>
      assertRejects(
        () => searchStation(""),
        AppError,
        "파라미터 형식 오류",
      )
    )
  )
})

Deno.test("searchStation — ODsay -9 에러는 400 AppError를 던진다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ error: [{ code: "-9", message: "필수값 누락" }] }), () =>
      assertRejects(
        () => searchStation("강남"),
        AppError,
        "필수 파라미터 누락",
      )
    )
  )
})

Deno.test("searchStation — 알 수 없는 ODsay 에러 코드는 502를 던진다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ error: [{ code: "-500", message: "서버 오류" }] }), () =>
      assertRejects(
        () => searchStation("강남"),
        AppError,
        "ODsay 오류 [-500]",
      )
    )
  )
})

Deno.test("searchStation — HTTP 오류는 502를 던진다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("Bad Gateway", { status: 502 }), () =>
      assertRejects(
        () => searchStation("강남"),
        AppError,
        "ODsay 연결 실패",
      )
    )
  )
})

Deno.test("searchStation — ODSAY_API_KEY 미설정 시 500을 던진다", async () => {
  await withEnv({}, () =>
    withMockFetch(async () => jsonResponse({}), () =>
      assertRejects(
        () => searchStation("강남"),
        AppError,
        "ODSAY_API_KEY not configured",
      )
    )
  )
})

Deno.test("searchStation — result.station이 null일 때 빈 배열을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => jsonResponse({ result: { station: null } }), async () => {
      const result = await searchStation("강남")
      assertEquals(result, [])
    })
  )
})

// ─── realtimeStation ──────────────────────────────────────────

Deno.test("realtimeStation — 정상 결과를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        result: {
          real: [
            { routeID: "100100118", routeName: "273", arrivalTime1: 3, arrivalTime2: 25, type: 2 },
          ],
        },
      }), async () => {
      const result = await realtimeStation("106186")
      assertEquals(result.length, 1)
      assertEquals(result[0].routeName, "273")
      assertEquals(result[0].arrivalTime1, 3)
    })
  )
})

Deno.test("realtimeStation — 결과 없음(-98)은 빈 배열을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ error: [{ code: "-98", message: "없음" }] }), async () => {
      const result = await realtimeStation("999999")
      assertEquals(result, [])
    })
  )
})

// ─── searchPubTransPath ───────────────────────────────────────

Deno.test("searchPubTransPath — 정상 경로를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        result: {
          path: [
            {
              pathType: 1,
              info: { totalTime: 41, transferCount: 0 },
              subPath: [
                {
                  trafficType: 1,
                  sectionTime: 38,
                  startName: "강남",
                  endName: "홍대입구",
                  lane: [{ name: "수도권 2호선", subwayCode: 2 }],
                },
              ],
            },
          ],
        },
      }), async () => {
      const result = await searchPubTransPath(127.02, 37.49, 126.92, 37.55)
      assertEquals(result.length, 1)
      assertEquals(result[0].info.totalTime, 41)
      assertEquals(result[0].subPath[0].lane?.[0].subwayCode, 2)
    })
  )
})

Deno.test("searchPubTransPath — 경로 없음은 빈 배열을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({ error: [{ code: "-98", message: "없음" }] }), async () => {
      const result = await searchPubTransPath(0, 0, 1, 1)
      assertEquals(result, [])
    })
  )
})
