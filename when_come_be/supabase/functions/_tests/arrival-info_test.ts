import { assertEquals } from "@std/assert"
import { handler, applySubwayNameOverride, stripSubwayNameDecorations, arvlCdToDisplayMsg } from "../arrival-info/index.ts"
import { withMockFetch, withEnv, jsonResponse, makeRequest, multiMockFetch, TEST_ENV } from "./helpers.ts"

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
  assertEquals(body.error, "type 파라미터가 필요합니다 (bus | subway | odsay)")
})

Deno.test("arrival-info — 알 수 없는 type은 400을 반환한다", async () => {
  const res = await handler(makeRequest("GET", `${BASE}?type=tram`))
  assertEquals(res.status, 400)
})

// ─── bus 파라미터 검증 ────────────────────────────────────────

Deno.test("arrival-info bus — busRouteId 없으면 400을 반환한다", async () => {
  const res = await handler(makeRequest("GET", `${BASE}?type=bus&stId=106186&ord=65`))
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, "bus 타입은 busRouteId 가 필요합니다")
})

Deno.test("arrival-info bus — stId/ord/arsId 모두 없으면 400을 반환한다", async () => {
  const res = await handler(makeRequest("GET", `${BASE}?type=bus&busRouteId=100100118`))
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error, "bus 타입은 stId+ord 또는 arsId 가 필요합니다")
})

// ─── bus 정상 동작 (stId + ord 직접 전달) ─────────────────────

Deno.test("arrival-info bus — stId+ord로 정상 도착정보를 반환한다", async () => {
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

// ─── bus 정상 동작 (arsId로 단일 조회) ──────────────────────────

Deno.test("arrival-info bus — arsId로 도착정보를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgBody: {
          itemList: [{
            busRouteId: "100100643",
            busRouteAbrv: "643",
            arrmsg1: "5분후[3번째 전]",
            arrmsg2: "18분후[10번째 전]",
            traTime1: "300",
            traTime2: "1080",
          }],
        },
      }), async () => {
      const url = `${BASE}?type=bus&busRouteId=100100643&arsId=17243`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.routeName, "643")
      assertEquals(body.arrivalSec1, 300)
    })
  )
})

Deno.test("arrival-info bus — 해당 노선 없으면 null 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        msgBody: {
          itemList: [{ busRouteId: "999999", busRouteAbrv: "999", arrmsg1: "", arrmsg2: "", traTime1: "0", traTime2: "0" }],
        },
      }), async () => {
      const url = `${BASE}?type=bus&busRouteId=100100643&arsId=17243`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body, null)
    })
  )
})

Deno.test("arrival-info bus — getStationByUid API 오류 시 502를 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => new Response("", { status: 500 }), async () => {
      const url = `${BASE}?type=bus&busRouteId=100100643&arsId=17243`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 502)
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
            arvlCd: "4",
            updnLine: "외선",
          },
          {
            subwayId: "1002",
            trainLineNm: "신사행 - 강남방면",
            arvlMsg2: "5분 후",
            arvlMsg3: "선릉",
            arvlCd: "99",
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
      assertEquals(body[0].displayMsg, "전역 진입")
      assertEquals(body[1].displayMsg, null)
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
      assertEquals(capturedUrl.includes("%EA"), true)   // 강 → %EA%B0%95
      assertEquals(capturedUrl.includes("강남"), false)
    })
  )
})

Deno.test(`arrival-info subway — "역" 접미사 포함 입력은 1차에서 0건 응답 시 2차 strip하여 재요청한다`, async () => {
  let fetchCallCount = 0
  const capturedUrls: string[] = []
  await withEnv(ENV, () =>
    withMockFetch(async (url) => {
      fetchCallCount++
      capturedUrls.push(url)
      // 1차 "강남역" → 0건, 2차 "강남" → 0건 (strip 동작만 검증)
      return jsonResponse({ realtimeArrivalList: [] })
    }, async () => {
      await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남역`))
      // fetch는 1차("강남역") + 2차("강남") 총 2회 호출되어야 함
      assertEquals(fetchCallCount, 2)
      // 1차 URL: "강남역" 인코딩 포함
      assertEquals(capturedUrls[0].includes(encodeURIComponent("강남역")), true)
      // 2차 URL: "강남" 인코딩 포함 (역 접미사 제거됨)
      assertEquals(capturedUrls[1].includes(encodeURIComponent("강남")), true)
      assertEquals(capturedUrls[1].includes(encodeURIComponent("강남역")), false)
    })
  )
})

Deno.test("arrival-info subway — 페이징 사이즈 30으로 요청한다", async () => {
  let capturedUrl = ""
  await withEnv(ENV, () =>
    withMockFetch(async (url) => {
      capturedUrl = url
      return jsonResponse({ realtimeArrivalList: [] })
    }, async () => {
      await handler(makeRequest("GET", `${BASE}?type=subway&stationName=군자`))
      assertEquals(capturedUrl.includes("/0/30/"), true)
      assertEquals(capturedUrl.includes("/0/10/"), false)
    })
  )
})

Deno.test(`arrival-info subway — 역명의 "(별칭)" 부분을 제거하여 외부 API에 요청한다`, async () => {
  let capturedUrl = ""
  await withEnv(ENV, () =>
    withMockFetch(async (url) => {
      capturedUrl = url
      return jsonResponse({ realtimeArrivalList: [] })
    }, async () => {
      await handler(makeRequest("GET", `${BASE}?type=subway&stationName=석남(거북시장)`))
      // 괄호 부분이 제거된 "석남"이 포함되어야 함
      assertEquals(capturedUrl.includes(encodeURIComponent("석남")), true)
      // 괄호 부분이 포함되지 않아야 함
      assertEquals(capturedUrl.includes(encodeURIComponent("(거북시장)")), false)
      assertEquals(capturedUrl.includes(encodeURIComponent("거북시장")), false)
    })
  )
})

// ─── applySubwayNameOverride 단위 테스트 ────────────────────────────────────

Deno.test("applySubwayNameOverride — '군자' → '군자(능동)' (OVERRIDES 매핑)", () => {
  assertEquals(applySubwayNameOverride("군자"), "군자(능동)")
})

Deno.test("applySubwayNameOverride — '군자역' → '군자(능동)' (역 접미사 포함 키 직접 매핑)", () => {
  assertEquals(applySubwayNameOverride("군자역"), "군자(능동)")
})

Deno.test("applySubwayNameOverride — '군자(능동)' → '군자(능동)' (값 그대로 등록된 케이스)", () => {
  assertEquals(applySubwayNameOverride("군자(능동)"), "군자(능동)")
})

Deno.test("applySubwayNameOverride — '강동' → '강동' (override 없는 일반 역)", () => {
  assertEquals(applySubwayNameOverride("강동"), "강동")
})

// ─── stripSubwayNameDecorations 단위 테스트 ─────────────────────────────────

Deno.test("stripSubwayNameDecorations — '강남역(2호선)' → '강남'", () => {
  assertEquals(stripSubwayNameDecorations("강남역(2호선)"), "강남")
})

Deno.test("stripSubwayNameDecorations — '강남역 (2호선)' → '강남' (공백 포함)", () => {
  assertEquals(stripSubwayNameDecorations("강남역 (2호선)"), "강남")
})

Deno.test("stripSubwayNameDecorations — '군자(능동)' → '군자'", () => {
  assertEquals(stripSubwayNameDecorations("군자(능동)"), "군자")
})

Deno.test("stripSubwayNameDecorations — '강동역' → '강동'", () => {
  assertEquals(stripSubwayNameDecorations("강동역"), "강동")
})

// ─── getSubwayArrival 다단계 fallback 통합 테스트 ────────────────────────────

Deno.test("getSubwayArrival fallback — '군자역' 입력 시 1차 URL이 '군자(능동)' 인코딩이고 fetch 1회로 완료된다", async () => {
  let fetchCallCount = 0
  let capturedUrl = ""
  await withEnv(ENV, () =>
    withMockFetch(async (url) => {
      fetchCallCount++
      capturedUrl = url
      if (url.includes(encodeURIComponent("군자(능동)"))) {
        return jsonResponse({
          realtimeArrivalList: Array.from({ length: 8 }, (_, i) => ({
            subwayId: i < 4 ? "1005" : "1007",
            trainLineNm: `열차${i}`,
            arvlMsg2: "2분 후",
            arvlMsg3: "직전역",
            updnLine: "상행",
          })),
        })
      }
      return jsonResponse({ realtimeArrivalList: [] })
    }, async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=${encodeURIComponent("군자역")}`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 8)
      // OVERRIDES["군자역"] = "군자(능동)" 이므로 1차에서 바로 처리 → fetch 1회
      assertEquals(fetchCallCount, 1)
      assertEquals(capturedUrl.includes(encodeURIComponent("군자(능동)")), true)
    })
  )
})

Deno.test("getSubwayArrival fallback — '군자' 입력 시 1차(군자(능동)) URL에서 8건 응답 → fetch 1회", async () => {
  let fetchCallCount = 0
  let capturedUrl = ""
  await withEnv(ENV, () =>
    withMockFetch(async (url) => {
      fetchCallCount++
      capturedUrl = url
      if (url.includes(encodeURIComponent("군자(능동)"))) {
        return jsonResponse({
          realtimeArrivalList: Array.from({ length: 8 }, (_, i) => ({
            subwayId: i < 4 ? "1005" : "1007",
            trainLineNm: `열차${i}`,
            arvlMsg2: "2분 후",
            arvlMsg3: "직전역",
            updnLine: "상행",
          })),
        })
      }
      return jsonResponse({ realtimeArrivalList: [] })
    }, async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=군자`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 8)
      assertEquals(fetchCallCount, 1)
      assertEquals(capturedUrl.includes(encodeURIComponent("군자(능동)")), true)
    })
  )
})

Deno.test("getSubwayArrival fallback — '강남역(2호선)' 입력 시 1차 0건 → 2차 '강남' URL에서 4건 응답 → fetch 2회", async () => {
  let fetchCallCount = 0
  await withEnv(ENV, () =>
    withMockFetch(async (url) => {
      fetchCallCount++
      if (url.includes(encodeURIComponent("강남"))) {
        // 1차는 "강남역(2호선)" encoded, 2차는 "강남" encoded
        const decoded = decodeURIComponent(url.split("/").pop() ?? "")
        if (decoded === "강남") {
          return jsonResponse({
            realtimeArrivalList: Array.from({ length: 4 }, (_, i) => ({
              subwayId: "1002",
              trainLineNm: `열차${i}`,
              arvlMsg2: "3분 후",
              arvlMsg3: "직전역",
              updnLine: i < 2 ? "외선" : "내선",
            })),
          })
        }
      }
      return jsonResponse({ realtimeArrivalList: [] })
    }, async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=${encodeURIComponent("강남역(2호선)")}`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 4)
      assertEquals(fetchCallCount, 2)
    })
  )
})

Deno.test("getSubwayArrival fallback — '존재안함' 입력 시 1차·2차 모두 0건 → 빈 배열 반환", async () => {
  // "존재안함"은 괄호/역 없으므로 stripped === primary → 2차 skip → fetch 1회
  let fetchCallCount = 0
  await withEnv(ENV, () =>
    withMockFetch(async () => {
      fetchCallCount++
      return jsonResponse({ realtimeArrivalList: [] })
    }, async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=존재안함`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body, [])
      assertEquals(fetchCallCount, 1)
    })
  )
})

// ─── arvlCdToDisplayMsg 단위 테스트 ─────────────────────────────────────────

Deno.test("arvlCdToDisplayMsg — '0' → '진입중'", () => {
  assertEquals(arvlCdToDisplayMsg("0"), "진입중")
})

Deno.test("arvlCdToDisplayMsg — '1' → '도착'", () => {
  assertEquals(arvlCdToDisplayMsg("1"), "도착")
})

Deno.test("arvlCdToDisplayMsg — '2' → '출발'", () => {
  assertEquals(arvlCdToDisplayMsg("2"), "출발")
})

Deno.test("arvlCdToDisplayMsg — '3' → '전역 출발'", () => {
  assertEquals(arvlCdToDisplayMsg("3"), "전역 출발")
})

Deno.test("arvlCdToDisplayMsg — '4' → '전역 진입'", () => {
  assertEquals(arvlCdToDisplayMsg("4"), "전역 진입")
})

Deno.test("arvlCdToDisplayMsg — '5' → '전역 도착'", () => {
  assertEquals(arvlCdToDisplayMsg("5"), "전역 도착")
})

Deno.test("arvlCdToDisplayMsg — '99' (운행중) → null", () => {
  assertEquals(arvlCdToDisplayMsg("99"), null)
})

Deno.test("arvlCdToDisplayMsg — 빈 문자열 (arvlCd 누락) → null", () => {
  assertEquals(arvlCdToDisplayMsg(""), null)
})

Deno.test("arvlCdToDisplayMsg — 알 수 없는 코드 → null (graceful)", () => {
  assertEquals(arvlCdToDisplayMsg("77"), null)
})

// ─── arvlCd → displayMsg 통합 테스트 ────────────────────────────────────────

Deno.test("arrival-info subway — arvlCd '0' 이면 displayMsg '진입중'으로 응답한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [{
          subwayId: "1002",
          trainLineNm: "성수행 - 역삼방면",
          arvlMsg2: "가산디지털단지 진입",
          arvlMsg3: "서초",
          arvlCd: "0",
          updnLine: "외선",
        }],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body[0].displayMsg, "진입중")
      assertEquals(body[0].arrmsg1, "가산디지털단지 진입") // 원본 보존
    })
  )
})

Deno.test("arrival-info subway — arvlCd '99' (운행중) 이면 displayMsg null로 응답한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [{
          subwayId: "1002",
          trainLineNm: "신사행 - 강남방면",
          arvlMsg2: "5분 후",
          arvlMsg3: "선릉",
          arvlCd: "99",
          updnLine: "내선",
        }],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body[0].displayMsg, null)
      assertEquals(body[0].arrmsg1, "5분 후") // FE가 arrmsg1 fallback으로 사용
    })
  )
})

Deno.test("arrival-info subway — arvlCd 없는 item은 displayMsg null로 graceful 처리한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [{
          subwayId: "1002",
          trainLineNm: "성수행",
          arvlMsg2: "3분 후",
          arvlMsg3: "역삼",
          updnLine: "외선",
          // arvlCd 필드 없음
        }],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body[0].displayMsg, null)
    })
  )
})
