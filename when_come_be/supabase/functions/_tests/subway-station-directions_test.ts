import { assertEquals } from "@std/assert"
import { handler } from "../subway-station-directions/index.ts"
import { withMockFetch, withEnv, jsonResponse, makeRequest, multiMockFetch, TEST_ENV } from "./helpers.ts"

const ENV = { ODSAY_API_KEY: TEST_ENV.ODSAY_API_KEY }

const BASE = "https://test.supabase.co/functions/v1/subway-station-directions"

// ─── ODsay subwayStationInfo 목 응답 헬퍼 ────────────────────────────────

function odsaySubwayStationInfoResponse(stationData: unknown) {
  return jsonResponse({ result: { station: [stationData] } })
}

function odsaySubwayStationInfoEmpty() {
  return jsonResponse({ error: [{ code: "-98", message: "결과 없음" }] })
}

// 양방향이 있는 정상 역 (서울역 1호선)
const MOCK_STATION_BIDIRECTIONAL = {
  stationID: 133,
  stationName: "서울역",
  laneName: "수도권 1호선",
  laneCity: "수도권",
  subwayCode: 1,
  wayList: [
    {
      wayCode: 1,
      wayName: "소요산",
      prevOBJ: { stationID: 134, stationName: "시청" },
      nextOBJ: { stationID: 132, stationName: "남영" },
    },
    {
      wayCode: 2,
      wayName: "신창",
      prevOBJ: { stationID: 132, stationName: "남영" },
      nextOBJ: { stationID: 134, stationName: "시청" },
    },
  ],
}

// prevOBJ/nextOBJ가 단일 레벨 (일부 API 포맷)
const MOCK_STATION_SINGLE_DIRECTION = {
  stationID: 133,
  stationName: "서울역",
  laneName: "수도권 1호선",
  laneCity: "수도권",
  subwayCode: 1,
  prevOBJ: { stationID: 134, stationName: "시청" },
  nextOBJ: { stationID: 132, stationName: "남영" },
}

// ─── CORS ────────────────────────────────────────────────────

Deno.test("subway-station-directions — OPTIONS는 200을 반환한다", async () => {
  const req = makeRequest("OPTIONS", BASE)
  const res = await handler(req)
  assertEquals(res.status, 200)
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
})

// ─── 메서드 검증 ────────────────────────────────────────────────

Deno.test("subway-station-directions — POST는 405를 반환한다", async () => {
  const req = makeRequest("POST", `${BASE}?stationId=133`)
  const res = await handler(req)
  assertEquals(res.status, 405)
})

// ─── 파라미터 검증 ────────────────────────────────────────────────

Deno.test("subway-station-directions — stationId 없으면 400을 반환한다", async () => {
  const req = makeRequest("GET", BASE)
  const res = await handler(req)
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, "stationId 파라미터가 필요합니다")
})

Deno.test("subway-station-directions — stationId 공백이면 400을 반환한다", async () => {
  const req = makeRequest("GET", `${BASE}?stationId=   `)
  const res = await handler(req)
  assertEquals(res.status, 400)
})

// ─── 정상 동작 ────────────────────────────────────────────────

Deno.test("subway-station-directions — wayList 포맷: 양방향 directions를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => odsaySubwayStationInfoResponse(MOCK_STATION_BIDIRECTIONAL), async () => {
      const req = makeRequest("GET", `${BASE}?stationId=133`)
      const res = await handler(req)
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.stationName, "서울역")
      assertEquals(body.lineName, "수도권 1호선")
      assertEquals(body.subwayCode, "1001")
      assertEquals(body.directions.length, 2)
      // 상행(wayCode=1) → updn=up
      const upDir = body.directions.find((d: { updn: string }) => d.updn === "up")
      assertEquals(upDir?.nextStop, "남영")
      // 하행(wayCode=2) → updn=down
      const downDir = body.directions.find((d: { updn: string }) => d.updn === "down")
      assertEquals(downDir?.nextStop, "시청")
    })
  )
})

Deno.test("subway-station-directions — prevOBJ/nextOBJ 단일 포맷: 방향 2건 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => odsaySubwayStationInfoResponse(MOCK_STATION_SINGLE_DIRECTION), async () => {
      const req = makeRequest("GET", `${BASE}?stationId=133`)
      const res = await handler(req)
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.directions.length, 2)
    })
  )
})

Deno.test("subway-station-directions — 기본 응답 스키마 필드가 모두 존재한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => odsaySubwayStationInfoResponse(MOCK_STATION_BIDIRECTIONAL), async () => {
      const req = makeRequest("GET", `${BASE}?stationId=133`)
      const res = await handler(req)
      const body = await res.json()
      // 스키마 필드 존재 검사
      assertEquals(typeof body.stationName, "string")
      assertEquals(typeof body.lineName, "string")
      assertEquals(typeof body.subwayCode, "string")  // "1001" 형식
      assertEquals(Array.isArray(body.directions), true)
      for (const d of body.directions) {
        assertEquals(typeof d.updn, "string")
        assertEquals(typeof d.nextStop, "string")
      }
    })
  )
})

// ─── 404 케이스 ────────────────────────────────────────────────

Deno.test("subway-station-directions — ODsay 결과 없음은 404를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => odsaySubwayStationInfoEmpty(), async () => {
      const req = makeRequest("GET", `${BASE}?stationId=999999`)
      const res = await handler(req)
      assertEquals(res.status, 404)
      const body = await res.json()
      assertEquals(body.error, "역 정보를 찾을 수 없습니다")
    })
  )
})

// ─── 502 케이스 ────────────────────────────────────────────────

Deno.test("subway-station-directions — ODsay HTTP 오류는 502를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 500 }), async () => {
      const req = makeRequest("GET", `${BASE}?stationId=133`)
      const res = await handler(req)
      assertEquals(res.status, 502)
    })
  )
})

// ─── CORS 헤더 ────────────────────────────────────────────────

Deno.test("subway-station-directions — CORS 헤더가 성공 응답에도 포함된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => odsaySubwayStationInfoResponse(MOCK_STATION_BIDIRECTIONAL), async () => {
      const req = makeRequest("GET", `${BASE}?stationId=133`)
      const res = await handler(req)
      assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
    })
  )
})
