import { assertEquals } from "@std/assert"
import { handler } from "../sync-gbis-stations/index.ts"
import {
  withMockFetch,
  withEnv,
  jsonResponse,
  makeRequest,
  multiMockFetch,
  supabaseTest,
  TEST_ENV,
} from "./helpers.ts"

const ENV = {
  SUPABASE_URL: TEST_ENV.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: TEST_ENV.SUPABASE_SERVICE_ROLE_KEY,
  GYEONGGI_OPENAPI_KEY: "test-gg-openapi-key",
}

const SERVICE_ROLE_HEADER = {
  authorization: `Bearer ${TEST_ENV.SUPABASE_SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
}

// ─── 경기도 OpenAPI 목 응답 헬퍼 ──────────────────────────────────────────
function makeOkResponse(rows: unknown[], totalCount = rows.length) {
  return jsonResponse({
    BusStation: [
      {
        head: [
          { LIST_TOTAL_COUNT: totalCount },
          { RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." } },
          { API_VERSION: "1.0" },
        ],
      },
      { row: rows },
    ],
  })
}

function makeEmptyResponse() {
  return jsonResponse({
    BusStation: [
      { head: [{ LIST_TOTAL_COUNT: 0 }, { RESULT: { CODE: "INFO-200", MESSAGE: "데이터 없음" } }] },
      {},
    ],
  })
}

function makeSampleRow(id: string = "200000177") {
  return {
    STATION_ID: id,
    STATION_NM_INFO: "광명사거리역",
    STATION_MANAGE_NO: "85019",
    WGS84_LAT: 37.480712,
    WGS84_LOGT: 126.861534,
    SIGUN_NM: "광명시",
    SIGUN_CD: "41210",
  }
}

// Supabase upsert 목 응답 (service role bypass = PostgREST 배열 응답)
function mockUpsertSuccess() {
  return jsonResponse([], 200)
}

// ─── OPTIONS preflight ───────────────────────────────────────────────────────
Deno.test("sync-gbis-stations OPTIONS preflight → 200", async () => {
  const res = await handler(makeRequest("OPTIONS", "https://test.supabase.co/functions/v1/sync-gbis-stations"))
  assertEquals(res.status, 200)
})

// ─── 인증 실패 ───────────────────────────────────────────────────────────────
Deno.test("sync-gbis-stations 인증 헤더 없음 → 401", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", { body: {} }))
    assertEquals(res.status, 401)
    const body = await res.json()
    assertEquals(body.error, "UNAUTHORIZED")
  })
})

Deno.test("sync-gbis-stations 잘못된 토큰 → 401", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
      body: {},
      headers: { authorization: "Bearer wrong-token" },
    }))
    assertEquals(res.status, 401)
  })
})

// ─── 단일 시군 happy path ────────────────────────────────────────────────────
supabaseTest("sync-gbis-stations 단일 시군 광명시 — 정상 1페이지 synced=1", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        { match: "openapi.gg.go.kr", response: () => makeOkResponse([makeSampleRow()]) },
        { match: "/rest/v1/gbis_stations", response: () => mockUpsertSuccess() },
      ]),
      async () => {
        const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
          body: { sigun_nm: "광명시" },
          headers: SERVICE_ROLE_HEADER,
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.ok, true)
        assertEquals(body.synced, 1)
        assertEquals(body.errors.length, 0)
        assertEquals(body.dryRun, false)
        assertEquals(typeof body.startedAt, "string")
        assertEquals(typeof body.finishedAt, "string")
        assertEquals(typeof body.durationMs, "number")
      },
    )
  )
})

// ─── dryRun 모드 ─────────────────────────────────────────────────────────────
supabaseTest("sync-gbis-stations dryRun=true — upsert 없이 synced 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      async (url) => {
        if (url.includes("openapi.gg.go.kr")) return makeOkResponse([makeSampleRow()])
        // dryRun이면 DB 호출 없어야 함
        throw new Error(`Unexpected fetch: ${url}`)
      },
      async () => {
        const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
          body: { sigun_nm: "광명시", dryRun: true },
          headers: SERVICE_ROLE_HEADER,
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.ok, true)
        assertEquals(body.dryRun, true)
        // dryRun이어도 synced count는 집계됨
        assertEquals(body.synced, 1)
      },
    )
  )
})

// ─── 페이징 (2페이지) ────────────────────────────────────────────────────────
supabaseTest("sync-gbis-stations 2페이지 처리 — totalCount=3, pSize=2 → 2회 fetch", async () => {
  let callCount = 0
  await withEnv(ENV, () =>
    withMockFetch(
      async (url) => {
        if (url.includes("openapi.gg.go.kr")) {
          callCount++
          if (callCount === 1) {
            // 1페이지: 2개, totalCount=3
            return makeOkResponse([makeSampleRow("A"), makeSampleRow("B")], 3)
          } else {
            // 2페이지: 1개
            return makeOkResponse([makeSampleRow("C")], 3)
          }
        }
        if (url.includes("/rest/v1/gbis_stations")) return mockUpsertSuccess()
        throw new Error(`Unexpected fetch: ${url}`)
      },
      async () => {
        const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
          body: { sigun_nm: "광명시", pSize: 2 },
          headers: SERVICE_ROLE_HEADER,
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.synced, 3)
        assertEquals(callCount, 2)
      },
    )
  )
})

// ─── 외부 API 5xx → errors[] 누적, 200 유지 ─────────────────────────────────
supabaseTest("sync-gbis-stations 외부 API 5xx → errors[]에 누적, 200 응답 유지", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      async (url) => {
        if (url.includes("openapi.gg.go.kr")) return new Response("", { status: 503 })
        throw new Error(`Unexpected fetch: ${url}`)
      },
      async () => {
        const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
          body: { sigun_nm: "광명시" },
          headers: SERVICE_ROLE_HEADER,
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.ok, true)
        assertEquals(body.synced, 0)
        assertEquals(body.errors.length > 0, true)
        assertEquals(body.errors[0].sigun, "광명시")
      },
    )
  )
})

// ─── INFO-200 (데이터 없음) → 빈 응답 처리 ──────────────────────────────────
supabaseTest("sync-gbis-stations INFO-200 응답 → 시군 건너뜀, errors 없음", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      async (url) => {
        if (url.includes("openapi.gg.go.kr")) return makeEmptyResponse()
        throw new Error(`Unexpected fetch: ${url}`)
      },
      async () => {
        const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
          body: { sigun_nm: "연천군" },
          headers: SERVICE_ROLE_HEADER,
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.synced, 0)
        assertEquals(body.errors.length, 0)
      },
    )
  )
})

// ─── 입력 검증 ───────────────────────────────────────────────────────────────
Deno.test("sync-gbis-stations sigun_nm 빈 문자열 → 400", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
      body: { sigun_nm: "" },
      headers: SERVICE_ROLE_HEADER,
    }))
    assertEquals(res.status, 400)
  })
})

// ─── 환경변수 미설정 ─────────────────────────────────────────────────────────
supabaseTest("sync-gbis-stations GYEONGGI_OPENAPI_KEY 미설정 → 500", async () => {
  await withEnv(
    {
      SUPABASE_URL: TEST_ENV.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: TEST_ENV.SUPABASE_SERVICE_ROLE_KEY,
      // GYEONGGI_OPENAPI_KEY 없음
    },
    () =>
      withMockFetch(
        async (url) => {
          // DB 목 (service role 클라이언트 초기화 성공 유도)
          if (url.includes("openapi.gg.go.kr")) throw new Error("should not reach here")
          return jsonResponse({})
        },
        async () => {
          const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
            body: { sigun_nm: "광명시" },
            headers: {
              authorization: `Bearer ${TEST_ENV.SUPABASE_SERVICE_ROLE_KEY}`,
              "content-type": "application/json",
            },
          }))
          // GYEONGGI_OPENAPI_KEY 없으면 fetchBusStationsBySigun에서 AppError(500) throw
          // → processSigun catch에서 status===500이면 즉시 re-throw
          // → handler catch → errorResponse → HTTP 500
          assertEquals(res.status, 500)
        },
      ),
  )
})

// ─── pSize 입력 검증 (C2) ────────────────────────────────────────────────────
Deno.test("sync-gbis-stations pSize=0 → 400", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
      body: { sigun_nm: "광명시", pSize: 0 },
      headers: SERVICE_ROLE_HEADER,
    }))
    assertEquals(res.status, 400)
    const body = await res.json()
    assertEquals(typeof body.error, "string")
  })
})

Deno.test("sync-gbis-stations pSize 음수 → 400", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
      body: { sigun_nm: "광명시", pSize: -1 },
      headers: SERVICE_ROLE_HEADER,
    }))
    assertEquals(res.status, 400)
  })
})

Deno.test("sync-gbis-stations pSize=1001 초과 → 400", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
      body: { sigun_nm: "광명시", pSize: 1001 },
      headers: SERVICE_ROLE_HEADER,
    }))
    assertEquals(res.status, 400)
  })
})

// ─── sigun_nm_in 입력 검증 (C2) ──────────────────────────────────────────────
supabaseTest("sync-gbis-stations sigun_nm_in 비문자열 요소 → 400", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
      body: { sigun_nm_in: ["광명시", 123] },
      headers: SERVICE_ROLE_HEADER,
    }))
    assertEquals(res.status, 400)
    const body = await res.json()
    assertEquals(typeof body.error, "string")
  })
})

Deno.test("sync-gbis-stations sigun_nm_in 알 수 없는 시군명 → 400", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
      body: { sigun_nm_in: ["광명시", "서울시"] }, // 서울시는 경기도 31개 목록에 없음
      headers: SERVICE_ROLE_HEADER,
    }))
    assertEquals(res.status, 400)
  })
})

// ─── sigun_nm_in 모드 ────────────────────────────────────────────────────────
supabaseTest("sync-gbis-stations sigun_nm_in 배열 모드 — 2개 시군 처리", async () => {
  let callCount = 0
  await withEnv(ENV, () =>
    withMockFetch(
      multiMockFetch([
        {
          match: "openapi.gg.go.kr",
          response: () => {
            callCount++
            return makeOkResponse([makeSampleRow(String(callCount))])
          },
        },
        { match: "/rest/v1/gbis_stations", response: () => mockUpsertSuccess() },
      ]),
      async () => {
        const res = await handler(makeRequest("POST", "https://test.supabase.co/functions/v1/sync-gbis-stations", {
          body: { sigun_nm_in: ["광명시", "시흥시"] },
          headers: SERVICE_ROLE_HEADER,
        }))
        assertEquals(res.status, 200)
        const body = await res.json()
        assertEquals(body.synced, 2)
        assertEquals(callCount, 2)
      },
    )
  )
})
