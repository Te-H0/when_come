import { assertEquals, assertRejects } from "@std/assert"
import { fetchBusStationsBySigun, fetchBusStationsAll } from "../_shared/gbisOpenApiClient.ts"
import { withMockFetch, withEnv, jsonResponse } from "./helpers.ts"

const ENV = { GYEONGGI_OPENAPI_KEY: "test-gg-openapi-key" }

// ─── 정상 응답 헬퍼 ────────────────────────────────────────────────────────
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
      {
        head: [
          { LIST_TOTAL_COUNT: 0 },
          { RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없음" } },
          { API_VERSION: "1.0" },
        ],
      },
      {},
    ],
  })
}

function makeSampleRow(id: string = "200000177") {
  return {
    STATION_ID: id,
    STATION_NM_INFO: "광명사거리역.광명시장",
    STATION_MANAGE_NO: "85019",
    STATION_DIV_NM: "노선버스",
    JURISD_INST_NM: "광명시청",
    LOCPLC_LOC: "광명사거리역 1번출구 앞",
    WGS84_LAT: 37.480712,
    WGS84_LOGT: 126.861534,
    SIGUN_NM: "광명시",
    SIGUN_CD: "41210",
  }
}

// ─── fetchBusStationsBySigun ────────────────────────────────────────────────

Deno.test("gbisOpenApiClient fetchBusStationsBySigun — 정상 응답 시 rows 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => makeOkResponse([makeSampleRow()]), async () => {
      const result = await fetchBusStationsBySigun("광명시", 1, 100)
      assertEquals(result.code, "INFO-000")
      assertEquals(result.totalCount, 1)
      assertEquals(result.rows.length, 1)
      assertEquals(result.rows[0].station_id, "200000177")
      assertEquals(result.rows[0].station_name, "광명사거리역.광명시장")
      assertEquals(result.rows[0].ars_no, "85019")
      assertEquals(result.rows[0].lat, 37.480712)
      assertEquals(result.rows[0].lng, 126.861534)
      assertEquals(result.rows[0].sigun_nm, "광명시")
      assertEquals(result.rows[0].sigun_cd, "41210")
    })
  )
})

Deno.test("gbisOpenApiClient fetchBusStationsBySigun — INFO-200 시 빈 배열 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => makeEmptyResponse(), async () => {
      const result = await fetchBusStationsBySigun("연천군", 1, 100)
      assertEquals(result.code, "INFO-200")
      assertEquals(result.rows.length, 0)
      assertEquals(result.totalCount, 0)
    })
  )
})

Deno.test("gbisOpenApiClient fetchBusStationsBySigun — 에러 코드(INFO-300) 시 AppError throw", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        BusStation: [
          { head: [{ RESULT: { CODE: "INFO-300", MESSAGE: "필수입력값 오류" } }] },
          {},
        ],
      }), async () => {
      await assertRejects(
        () => fetchBusStationsBySigun("", 1, 100),
        Error,
        "INFO-300",
      )
    })
  )
})

Deno.test("gbisOpenApiClient fetchBusStationsBySigun — HTTP 오류 시 AppError throw", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 500 }), async () => {
      await assertRejects(
        () => fetchBusStationsBySigun("광명시", 1, 100),
        Error,
      )
    })
  )
})

Deno.test("gbisOpenApiClient fetchBusStationsBySigun — 환경변수 미설정 시 500 AppError", async () => {
  await withEnv({}, () =>
    withMockFetch(async () => makeOkResponse([]), async () => {
      await assertRejects(
        () => fetchBusStationsBySigun("광명시"),
        Error,
        "GYEONGGI_OPENAPI_KEY",
      )
    })
  )
})

Deno.test("gbisOpenApiClient fetchBusStationsBySigun — 페이징 2번째 페이지 정상", async () => {
  await withEnv(ENV, () =>
    withMockFetch(
      async () => makeOkResponse([makeSampleRow("200000200"), makeSampleRow("200000201")], 201),
      async () => {
        const result = await fetchBusStationsBySigun("광명시", 2, 100)
        assertEquals(result.rows.length, 2)
        assertEquals(result.totalCount, 201)
      },
    )
  )
})

Deno.test("gbisOpenApiClient fetchBusStationsBySigun — STATION_MANAGE_NO 없는 row는 ars_no=null", async () => {
  const rowWithoutArs = { ...makeSampleRow() }
  delete (rowWithoutArs as Record<string, unknown>)["STATION_MANAGE_NO"]

  await withEnv(ENV, () =>
    withMockFetch(async () => makeOkResponse([rowWithoutArs]), async () => {
      const result = await fetchBusStationsBySigun("광명시")
      assertEquals(result.rows[0].ars_no, null)
    })
  )
})

Deno.test("gbisOpenApiClient fetchBusStationsBySigun — row 키 자체 누락 응답 → 빈 배열 반환", async () => {
  // BusStation[1]에 row 키가 없는 경우 (데이터가 있지만 row 없는 엣지케이스)
  await withEnv(ENV, () =>
    withMockFetch(
      async () =>
        jsonResponse({
          BusStation: [
            {
              head: [
                { LIST_TOTAL_COUNT: 0 },
                { RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." } },
              ],
            },
            {}, // row 키 없음
          ],
        }),
      async () => {
        const result = await fetchBusStationsBySigun("광명시", 1, 100)
        assertEquals(result.code, "INFO-000")
        assertEquals(result.rows.length, 0)
      },
    )
  )
})

// ─── fetchBusStationsAll ────────────────────────────────────────────────────

Deno.test("gbisOpenApiClient fetchBusStationsAll — 정상 응답 시 rows 반환", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => makeOkResponse([makeSampleRow()]), async () => {
      const result = await fetchBusStationsAll(1, 100)
      assertEquals(result.code, "INFO-000")
      assertEquals(result.rows.length, 1)
    })
  )
})

Deno.test("gbisOpenApiClient fetchBusStationsAll — HTTP 오류 시 AppError throw", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 503 }), async () => {
      await assertRejects(
        () => fetchBusStationsAll(1, 100),
        Error,
      )
    })
  )
})
