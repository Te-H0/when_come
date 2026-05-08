import { assertEquals } from "@std/assert"
import { handler } from "../subway-station-directions/index.ts"
import {
  withMockFetch,
  withEnv,
  jsonResponse,
  makeRequest,
  multiMockFetch,
  mockSupabaseAuthSuccess,
  mockSupabaseAuthFailure,
  supabaseTest,
  TEST_ENV,
} from "./helpers.ts"

const ENV = {
  ODSAY_API_KEY: TEST_ENV.ODSAY_API_KEY,
  SUPABASE_URL: TEST_ENV.SUPABASE_URL,
  SUPABASE_ANON_KEY: TEST_ENV.SUPABASE_ANON_KEY,
}

const BASE = "https://test.supabase.co/functions/v1/subway-station-directions"
const AUTH_HEADER = { authorization: "Bearer valid-jwt-token" }

// ─── ODsay subwayStationInfo 목 응답 헬퍼 ────────────────────────────────

function odsaySubwayStationInfoResponse(stationData: unknown) {
  return jsonResponse({ result: { station: [stationData] } })
}

function odsaySubwayStationInfoEmpty() {
  return jsonResponse({ error: [{ code: "-98", message: "결과 없음" }] })
}

// ─── prevOBJ/nextOBJ 배열 래퍼 생성 헬퍼 ──────────────────────────────────
// ODsay 실제 응답: prevOBJ/nextOBJ는 { station: [{ stationID, stationName, ... }] } 래퍼

function stationRef(stationID: number, stationName: string) {
  return { station: [{ stationID, stationName }] }
}

// 양방향이 있는 정상 역 (서울역 1호선) — 실제 ODsay 응답 구조 반영
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
      prevOBJ: stationRef(134, "시청"),
      nextOBJ: stationRef(132, "남영"),
    },
    {
      wayCode: 2,
      wayName: "신창",
      prevOBJ: stationRef(132, "남영"),
      nextOBJ: stationRef(134, "시청"),
    },
  ],
}

// prevOBJ/nextOBJ 단일 포맷 (wayList 없이 최상위에 인접역 — 실제 ODsay 응답 구조)
const MOCK_STATION_SINGLE_DIRECTION = {
  stationID: 133,
  stationName: "서울역",
  laneName: "수도권 1호선",
  laneCity: "수도권",
  subwayCode: 1,
  prevOBJ: stationRef(134, "시청"),
  nextOBJ: stationRef(132, "남영"),
}

// laneName 없는 역 (일부 ODsay 응답에서 laneName 누락)
const MOCK_STATION_NO_LANENAME = {
  stationID: 999,
  stationName: "테스트역",
  laneCity: "수도권",
  subwayCode: 1,
  wayList: [
    {
      wayCode: 1,
      wayName: "소요산",
      prevOBJ: stationRef(1000, "다음역A"),
      nextOBJ: stationRef(998, "다음역B"),
    },
  ],
}

// wayList가 있지만 nextOBJ 없고 prevOBJ만 있는 경우 (개봉역 등 일부 광역 노선)
const MOCK_STATION_WAYLIST_NO_NEXTOBJ = {
  stationID: 140,
  stationName: "개봉",
  laneName: "수도권 1호선",
  laneCity: "수도권",
  subwayCode: 1,
  wayList: [
    {
      wayCode: 1,
      wayName: "소요산",
      prevOBJ: stationRef(141, "오류동"),
      // nextOBJ 없음
    },
    {
      wayCode: 2,
      wayName: "신창",
      prevOBJ: stationRef(139, "온수"),
      // nextOBJ 없음
    },
  ],
}

// wayList는 있지만 prevOBJ/nextOBJ 모두 없는 경우 → 최상위 prevOBJ/nextOBJ fallback
const MOCK_STATION_WAYLIST_EMPTY_OBJS = {
  stationID: 141,
  stationName: "오류동",
  laneName: "수도권 1호선",
  laneCity: "수도권",
  subwayCode: 1,
  wayList: [
    { wayCode: 1, wayName: "소요산" },
    { wayCode: 2, wayName: "신창" },
  ],
  prevOBJ: stationRef(142, "개봉"),
  nextOBJ: stationRef(140, "구일"),
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

// ─── 인증 검증 ────────────────────────────────────────────────

supabaseTest("subway-station-directions — Authorization 헤더 없으면 401을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthFailure(), async () => {
      const req = makeRequest("GET", `${BASE}?stationId=133`)
      const res = await handler(req)
      assertEquals(res.status, 401)
    })
  )
})

supabaseTest("subway-station-directions — 유효하지 않은 JWT는 401을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthFailure(), async () => {
      const req = makeRequest("GET", `${BASE}?stationId=133`, {
        headers: { authorization: "Bearer invalid-token" },
      })
      const res = await handler(req)
      assertEquals(res.status, 401)
    })
  )
})

// ─── 파라미터 검증 ────────────────────────────────────────────────

supabaseTest("subway-station-directions — stationId 없으면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const req = makeRequest("GET", BASE, { headers: AUTH_HEADER })
      const res = await handler(req)
      assertEquals(res.status, 400)
      const body = await res.json()
      assertEquals(body.error, "stationId 파라미터가 필요합니다")
    })
  )
})

supabaseTest("subway-station-directions — stationId 공백이면 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => mockSupabaseAuthSuccess(), async () => {
      const req = makeRequest("GET", `${BASE}?stationId=   `, { headers: AUTH_HEADER })
      const res = await handler(req)
      assertEquals(res.status, 400)
    })
  )
})

// ─── 정상 동작 ────────────────────────────────────────────────

supabaseTest("subway-station-directions — wayList 포맷: 양방향 directions를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
        { match: "subwayStationInfo", response: () => odsaySubwayStationInfoResponse(MOCK_STATION_BIDIRECTIONAL) },
      ]),
      async () => {
        const req = makeRequest("GET", `${BASE}?stationId=133`, { headers: AUTH_HEADER })
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
      },
    )
  )
})

supabaseTest("subway-station-directions — prevOBJ/nextOBJ 단일 포맷: 방향 2건 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
        { match: "subwayStationInfo", response: () => odsaySubwayStationInfoResponse(MOCK_STATION_SINGLE_DIRECTION) },
      ]),
      async () => {
        const req = makeRequest("GET", `${BASE}?stationId=133`, { headers: AUTH_HEADER })
        const res = await handler(req)
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.directions.length, 2)
      },
    )
  )
})

supabaseTest("subway-station-directions — 기본 응답 스키마 필드가 모두 존재한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
        { match: "subwayStationInfo", response: () => odsaySubwayStationInfoResponse(MOCK_STATION_BIDIRECTIONAL) },
      ]),
      async () => {
        const req = makeRequest("GET", `${BASE}?stationId=133`, { headers: AUTH_HEADER })
        const res = await handler(req)
        const body = await res.json()
        // 스키마 필드 존재 검사
        assertEquals(typeof body.stationName, "string")
        // lineName은 string | null
        assertEquals(typeof body.lineName === "string" || body.lineName === null, true)
        // subwayCode는 string | null
        assertEquals(typeof body.subwayCode === "string" || body.subwayCode === null, true)
        assertEquals(Array.isArray(body.directions), true)
        for (const d of body.directions) {
          assertEquals(typeof d.updn, "string")
          assertEquals(typeof d.nextStop, "string")
        }
      },
    )
  )
})

// ─── lineName null 케이스 (ODsay laneName 누락) ──────────────────────────────

supabaseTest("subway-station-directions — laneName 없는 역은 lineName: null을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
        { match: "subwayStationInfo", response: () => odsaySubwayStationInfoResponse(MOCK_STATION_NO_LANENAME) },
      ]),
      async () => {
        const req = makeRequest("GET", `${BASE}?stationId=999`, { headers: AUTH_HEADER })
        const res = await handler(req)
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.lineName, null)
      },
    )
  )
})

// ─── 404 케이스 ────────────────────────────────────────────────

supabaseTest("subway-station-directions — ODsay 결과 없음은 404를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
        { match: "subwayStationInfo", response: () => odsaySubwayStationInfoEmpty() },
      ]),
      async () => {
        const req = makeRequest("GET", `${BASE}?stationId=999999`, { headers: AUTH_HEADER })
        const res = await handler(req)
        assertEquals(res.status, 404)
        const body = await res.json()
        assertEquals(body.error, "역 정보를 찾을 수 없습니다")
      },
    )
  )
})

// ─── 502 케이스 ────────────────────────────────────────────────

supabaseTest("subway-station-directions — ODsay HTTP 오류는 502를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
        { match: "subwayStationInfo", response: () => new Response("", { status: 500 }) },
      ]),
      async () => {
        const req = makeRequest("GET", `${BASE}?stationId=133`, { headers: AUTH_HEADER })
        const res = await handler(req)
        assertEquals(res.status, 502)
      },
    )
  )
})

// ─── wayList prevOBJ fallback (이슈 3: 개봉역 등 광역 노선) ─────────────────

supabaseTest("subway-station-directions — wayList에 nextOBJ 없고 prevOBJ만 있으면 prevOBJ로 방향 추출한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
        { match: "subwayStationInfo", response: () => odsaySubwayStationInfoResponse(MOCK_STATION_WAYLIST_NO_NEXTOBJ) },
      ]),
      async () => {
        const req = makeRequest("GET", `${BASE}?stationId=140`, { headers: AUTH_HEADER })
        const res = await handler(req)
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.stationName, "개봉")
        // wayList 2건 모두 prevOBJ로 추출되어야 함
        assertEquals(body.directions.length, 2)
        const upDir = body.directions.find((d: { updn: string }) => d.updn === "up")
        assertEquals(upDir?.nextStop, "오류동")
        const downDir = body.directions.find((d: { updn: string }) => d.updn === "down")
        assertEquals(downDir?.nextStop, "온수")
      },
    )
  )
})

supabaseTest("subway-station-directions — wayList에 OBJ 정보 없으면 최상위 prevOBJ/nextOBJ로 fallback한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
        { match: "subwayStationInfo", response: () => odsaySubwayStationInfoResponse(MOCK_STATION_WAYLIST_EMPTY_OBJS) },
      ]),
      async () => {
        const req = makeRequest("GET", `${BASE}?stationId=141`, { headers: AUTH_HEADER })
        const res = await handler(req)
        assertEquals(res.status, 200)
        const body = await res.json()
        // wayList에서 추출 불가 → 최상위 prevOBJ/nextOBJ로 2건 반환
        assertEquals(body.directions.length, 2)
        const upDir = body.directions.find((d: { updn: string }) => d.updn === "up")
        assertEquals(upDir?.nextStop, "개봉")
        const downDir = body.directions.find((d: { updn: string }) => d.updn === "down")
        assertEquals(downDir?.nextStop, "구일")
      },
    )
  )
})

// ─── searchSubwaySchedule fallback ──────────────────────────────────────────

// wayList/prevOBJ/nextOBJ 모두 없는 역 (stationId=143 같은 케이스)
const MOCK_STATION_NO_DIRECTION_INFO = {
  stationID: 143,
  stationName: "테스트역143",
  laneName: "수도권 1호선",
  laneCity: "수도권",
  subwayCode: 1,
  // wayList, prevOBJ, nextOBJ 모두 없음
}

// schedule 응답: result.weekdaySchedule.up/down 구조 (실제 ODsay 응답 형식)
// prevOBJ/nextOBJ는 인접역(배열 래퍼) — schedule fallback 1차 소스
function odsaySubwayScheduleResponse(
  up: unknown[],
  down: unknown[],
  prevStation?: { id: number; name: string },
  nextStation?: { id: number; name: string },
) {
  return jsonResponse({
    result: {
      weekdaySchedule: { up, down },
      ...(prevStation ? { prevOBJ: stationRef(prevStation.id, prevStation.name) } : {}),
      ...(nextStation ? { nextOBJ: stationRef(nextStation.id, nextStation.name) } : {}),
    },
  })
}

function odsaySubwayScheduleEmpty() {
  return jsonResponse({ error: [{ code: "-98", message: "결과 없음" }] })
}

supabaseTest(
  "subway-station-directions — wayList/prevOBJ/nextOBJ 모두 없으면 searchSubwaySchedule prevOBJ/nextOBJ로 directions 2건 반환한다",
  async () => {
    const ENV_WITH_SERVICE = { ...ENV, SUPABASE_SERVICE_ROLE_KEY: TEST_ENV.SUPABASE_SERVICE_ROLE_KEY }
    await withEnv(ENV_WITH_SERVICE, () =>
      withMockFetch(
        multiMockFetch([
          { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
          {
            match: "subwayStationInfo",
            response: () => odsaySubwayStationInfoResponse(MOCK_STATION_NO_DIRECTION_INFO),
          },
          {
            match: "searchSubwaySchedule",
            response: () =>
              odsaySubwayScheduleResponse(
                [{ startStationName: "소요산", endStationName: "소요산" }],
                [{ startStationName: "신창", endStationName: "신창" }],
                { id: 142, name: "소요산" },   // prevOBJ → up
                { id: 144, name: "신창" },     // nextOBJ → down
              ),
          },
          // anomaly_logs INSERT (fire-and-forget, 실패해도 무관)
          { match: "/rest/v1/anomaly_logs", response: () => jsonResponse(null, 201) },
        ]),
        async () => {
          const req = makeRequest("GET", `${BASE}?stationId=143`, { headers: AUTH_HEADER })
          const res = await handler(req)
          assertEquals(res.status, 200)
          const body = await res.json()
          assertEquals(body.stationName, "테스트역143")
          assertEquals(body.directions.length, 2)
          const upDir = body.directions.find((d: { updn: string }) => d.updn === "up")
          assertEquals(upDir?.nextStop, "소요산")
          const downDir = body.directions.find((d: { updn: string }) => d.updn === "down")
          assertEquals(downDir?.nextStop, "신창")
        },
      )
    )
  },
)

supabaseTest(
  "subway-station-directions — schedule prevOBJ/nextOBJ 없으면 weekdaySchedule endStationName으로 fallback한다",
  async () => {
    const ENV_WITH_SERVICE = { ...ENV, SUPABASE_SERVICE_ROLE_KEY: TEST_ENV.SUPABASE_SERVICE_ROLE_KEY }
    await withEnv(ENV_WITH_SERVICE, () =>
      withMockFetch(
        multiMockFetch([
          { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
          {
            match: "subwayStationInfo",
            response: () => odsaySubwayStationInfoResponse(MOCK_STATION_NO_DIRECTION_INFO),
          },
          {
            match: "searchSubwaySchedule",
            // prevOBJ/nextOBJ 없이 weekdaySchedule만 있는 경우
            response: () =>
              odsaySubwayScheduleResponse(
                [{ startStationName: "소요산", endStationName: "소요산" }],
                [{ startStationName: "신창", endStationName: "신창" }],
              ),
          },
          { match: "/rest/v1/anomaly_logs", response: () => jsonResponse(null, 201) },
        ]),
        async () => {
          const req = makeRequest("GET", `${BASE}?stationId=143`, { headers: AUTH_HEADER })
          const res = await handler(req)
          assertEquals(res.status, 200)
          const body = await res.json()
          assertEquals(body.stationName, "테스트역143")
          assertEquals(body.directions.length, 2)
          const upDir = body.directions.find((d: { updn: string }) => d.updn === "up")
          assertEquals(upDir?.nextStop, "소요산")
          const downDir = body.directions.find((d: { updn: string }) => d.updn === "down")
          assertEquals(downDir?.nextStop, "신창")
        },
      )
    )
  },
)

supabaseTest(
  "subway-station-directions — searchSubwaySchedule도 빈 응답이면 directions 빈 배열 + 200 반환한다",
  async () => {
    const ENV_WITH_SERVICE = { ...ENV, SUPABASE_SERVICE_ROLE_KEY: TEST_ENV.SUPABASE_SERVICE_ROLE_KEY }
    await withEnv(ENV_WITH_SERVICE, () =>
      withMockFetch(
        multiMockFetch([
          { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
          {
            match: "subwayStationInfo",
            response: () => odsaySubwayStationInfoResponse(MOCK_STATION_NO_DIRECTION_INFO),
          },
          { match: "searchSubwaySchedule", response: () => odsaySubwayScheduleEmpty() },
          { match: "/rest/v1/anomaly_logs", response: () => jsonResponse(null, 201) },
        ]),
        async () => {
          const req = makeRequest("GET", `${BASE}?stationId=143`, { headers: AUTH_HEADER })
          const res = await handler(req)
          assertEquals(res.status, 200)
          const body = await res.json()
          assertEquals(body.stationName, "테스트역143")
          assertEquals(body.directions.length, 0)
        },
      )
    )
  },
)

supabaseTest(
  "subway-station-directions — subwayStationInfo invalid station(null 반환) + schedule도 빈 응답이면 404 유지",
  async () => {
    const ENV_WITH_SERVICE = { ...ENV, SUPABASE_SERVICE_ROLE_KEY: TEST_ENV.SUPABASE_SERVICE_ROLE_KEY }
    await withEnv(ENV_WITH_SERVICE, () =>
      withMockFetch(
        multiMockFetch([
          { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
          { match: "subwayStationInfo", response: () => odsaySubwayStationInfoEmpty() },
          // null 반환 후 schedule fallback 시도 → 역시 빈 응답
          { match: "searchSubwaySchedule", response: () => odsaySubwayScheduleEmpty() },
          { match: "/rest/v1/anomaly_logs", response: () => jsonResponse(null, 201) },
        ]),
        async () => {
          const req = makeRequest("GET", `${BASE}?stationId=999999`, { headers: AUTH_HEADER })
          const res = await handler(req)
          assertEquals(res.status, 404)
          const body = await res.json()
          assertEquals(body.error, "역 정보를 찾을 수 없습니다")
        },
      )
    )
  },
)

// ─── stationId=143 케이스: subwayStationInfo null이지만 schedule 유효 ──────────

supabaseTest(
  "subway-station-directions — subwayStationInfo null이어도 schedule 유효하면 directions 반환한다 (stationId=143 케이스)",
  async () => {
    const ENV_WITH_SERVICE = { ...ENV, SUPABASE_SERVICE_ROLE_KEY: TEST_ENV.SUPABASE_SERVICE_ROLE_KEY }
    await withEnv(ENV_WITH_SERVICE, () =>
      withMockFetch(
        multiMockFetch([
          { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
          { match: "subwayStationInfo", response: () => odsaySubwayStationInfoEmpty() },
          {
            match: "searchSubwaySchedule",
            response: () =>
              odsaySubwayScheduleResponse(
                [{ startStationName: "소요산", endStationName: "소요산" }],
                [{ startStationName: "광명", endStationName: "광명" }],
              ),
          },
          { match: "/rest/v1/anomaly_logs", response: () => jsonResponse(null, 201) },
        ]),
        async () => {
          const req = makeRequest("GET", `${BASE}?stationId=143`, { headers: AUTH_HEADER })
          const res = await handler(req)
          assertEquals(res.status, 200)
          const body = await res.json()
          // stationName은 빈 문자열, lineName/subwayCode는 null — schedule 데이터만
          assertEquals(body.stationName, "")
          assertEquals(body.lineName, null)
          assertEquals(body.subwayCode, null)
          assertEquals(body.directions.length, 2)
          const upDir = body.directions.find((d: { updn: string }) => d.updn === "up")
          assertEquals(upDir?.nextStop, "소요산")
          const downDir = body.directions.find((d: { updn: string }) => d.updn === "down")
          assertEquals(downDir?.nextStop, "광명")
        },
      )
    )
  },
)

// ─── CORS 헤더 ────────────────────────────────────────────────

supabaseTest("subway-station-directions — CORS 헤더가 성공 응답에도 포함된다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "/auth/v1/user", response: () => mockSupabaseAuthSuccess() },
        { match: "subwayStationInfo", response: () => odsaySubwayStationInfoResponse(MOCK_STATION_BIDIRECTIONAL) },
      ]),
      async () => {
        const req = makeRequest("GET", `${BASE}?stationId=133`, { headers: AUTH_HEADER })
        const res = await handler(req)
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
      },
    )
  )
})
