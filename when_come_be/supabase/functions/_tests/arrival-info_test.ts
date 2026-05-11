import { assertEquals } from "@std/assert"
import { handler, applySubwayNameOverride, stripSubwayNameDecorations, arvlCdToDisplayMsg } from "../arrival-info/index.ts"
import { withMockFetch, withEnv, jsonResponse, makeRequest, multiMockFetch, TEST_ENV } from "./helpers.ts"

// extractHeadsign, normalizeArrmsg 단위 테스트는 arrival_normalize_test.ts에 있음

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
  assertEquals(body.error.code, "ARRIVAL_PARAMS_INVALID")
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
  assertEquals(body.error.code, "ARRIVAL_PARAMS_INVALID")
})

Deno.test("arrival-info bus — stId/ord/arsId 모두 없으면 400을 반환한다", async () => {
  const res = await handler(makeRequest("GET", `${BASE}?type=bus&busRouteId=100100118`))
  assertEquals(res.status, 400)
  const body = await res.json()
  assertEquals(body.error.code, "ARRIVAL_PARAMS_INVALID")
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
  assertEquals(body.error.code, "ARRIVAL_PARAMS_INVALID")
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

// ─── subway btrainSttus / bstatnNm / barvlDt / recptnDt / lstcarAt (2026-05-11~) ─────

Deno.test("arrival-info subway — 신규 5필드(trainType/destinationName/arrivalSeconds/dataTimestamp/isLastTrain) raw 동봉", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [
          {
            subwayId: "1001",
            trainLineNm: "광명행 - 급행",
            arvlMsg2: "2분 40초 후",
            arvlMsg3: "구로",
            arvlCd: "99",
            updnLine: "하행",
            btrainSttus: "급행",
            bstatnNm: "광명",
            barvlDt: "160",
            recptnDt: "2026-05-11 09:23:18",
            lstcarAt: "0",
          },
        ],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=구로`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 1)
      assertEquals(body[0].trainType, "급행")
      assertEquals(body[0].destinationName, "광명")
      assertEquals(body[0].arrivalSeconds, 160)
      assertEquals(body[0].dataTimestamp, "2026-05-11 09:23:18")
      assertEquals(body[0].isLastTrain, false)
    })
  )
})

Deno.test("arrival-info subway — btrainSttus '일반'은 raw 그대로 노출 (FE에서 표시 안 함 정책)", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [
          {
            subwayId: "1002",
            trainLineNm: "성수행 - 역삼방면",
            arvlMsg2: "2분 40초 후",
            arvlMsg3: "서초",
            arvlCd: "99",
            updnLine: "외선",
            btrainSttus: "일반",
          },
        ],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      const body = await res.json()
      // BE는 raw 보존 — FE의 formatTrainTypeShort가 '일반' → null로 변환해 UI 라벨 미노출
      assertEquals(body[0].trainType, "일반")
    })
  )
})

Deno.test("arrival-info subway — btrainSttus 빈 문자열/누락은 trainType=null", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [
          {
            subwayId: "1002",
            trainLineNm: "성수행 - 역삼방면",
            arvlMsg2: "2분 40초 후",
            arvlMsg3: "서초",
            arvlCd: "99",
            updnLine: "외선",
            // btrainSttus 누락
          },
        ],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      const body = await res.json()
      assertEquals(body[0].trainType, null)
    })
  )
})

Deno.test("arrival-info subway — btrainSttus 미지의 값은 raw 그대로 노출 (정보 손실 방지)", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [
          {
            subwayId: "1075",
            trainLineNm: "야탑행",
            arvlMsg2: "5분 후",
            arvlMsg3: "분당",
            arvlCd: "99",
            updnLine: "하행",
            btrainSttus: "K급행", // 가상의 미지 enum
          },
        ],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=분당`))
      const body = await res.json()
      // raw 그대로 — FE가 매핑 실패 시 raw chip 노출 + anomaly 로깅
      assertEquals(body[0].trainType, "K급행")
    })
  )
})

Deno.test("arrival-info subway — barvlDt 누락/빈 문자열은 arrivalSeconds=null", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [
          {
            subwayId: "1002",
            trainLineNm: "성수행 - 역삼방면",
            arvlMsg2: "2분 40초 후",
            arvlMsg3: "서초",
            arvlCd: "99",
            updnLine: "외선",
          },
        ],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      const body = await res.json()
      assertEquals(body[0].arrivalSeconds, null)
    })
  )
})

Deno.test("arrival-info subway — lstcarAt='1'은 isLastTrain=true (막차)", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [
          {
            subwayId: "1002",
            trainLineNm: "성수행",
            arvlMsg2: "운행 종료",
            arvlMsg3: "강남",
            arvlCd: "99",
            updnLine: "외선",
            lstcarAt: "1",
          },
        ],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      const body = await res.json()
      assertEquals(body[0].isLastTrain, true)
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

// ─── headsign 통합 테스트 ────────────────────────────────────────────────────

Deno.test("arrival-info subway — trainLineNm '온수행 - 역삼방면' → headsign '온수' (행 제외)", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [{
          subwayId: "1002",
          trainLineNm: "온수행 - 역삼방면",
          arvlMsg2: "2분 40초 후",
          arvlMsg3: "서초",
          arvlCd: "99",
          updnLine: "외선",
        }],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body[0].headsign, "온수")
    })
  )
})

Deno.test("arrival-info subway — arvlCd '99' + '[2]번째 전역 (온수)' → displayMsg '2개역 전', headsign '온수' (행 제외)", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [{
          subwayId: "1002",
          trainLineNm: null,
          arvlMsg2: "[2]번째 전역 (온수)",
          arvlMsg3: "",
          arvlCd: "99",
          updnLine: "외선",
        }],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body[0].displayMsg, "2개역 전")
      assertEquals(body[0].headsign, "온수")
    })
  )
})

Deno.test("arrival-info subway — arvlCd '99' + '5분 30초 후 (인천)' → displayMsg null, headsign '인천' (행 제외)", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [{
          subwayId: "1007",
          trainLineNm: null,
          arvlMsg2: "5분 30초 후 (인천)",
          arvlMsg3: "",
          arvlCd: "99",
          updnLine: "하행",
        }],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body[0].displayMsg, null)
      assertEquals(body[0].headsign, "인천")
    })
  )
})

Deno.test("arrival-info subway — trainLineNm '광명행 - 급행' → headsign '광명' (행 제외, arrmsg '[1]번째 전역 (인천)' 무시)", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [{
          subwayId: "1001",
          trainLineNm: "광명행 - 급행",
          arvlMsg2: "[1]번째 전역 (인천)",
          arvlMsg3: "",
          arvlCd: "99",
          updnLine: "하행",
        }],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=구로`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body[0].headsign, "광명")
      assertEquals(body[0].displayMsg, "1개역 전")
    })
  )
})

Deno.test("arrival-info subway — arvlCd '0' → displayMsg '진입중', headsign '성수' (행 제외, trainLineNm에서 추출)", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () =>
      jsonResponse({
        realtimeArrivalList: [{
          subwayId: "1002",
          trainLineNm: "성수행 - 역삼방면",
          arvlMsg2: "도착",
          arvlMsg3: "",
          arvlCd: "0",
          updnLine: "외선",
        }],
      }), async () => {
      const res = await handler(makeRequest("GET", `${BASE}?type=subway&stationName=강남`))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body[0].displayMsg, "진입중")
      assertEquals(body[0].headsign, "성수")
    })
  )
})

// ─── subwayCode fallback 테스트 (expectedSubwayCode) ─────────────────────────

/**
 * "서울역" 케이스: 1차 "서울역" 호출 → GTX-A(1032)만 반환.
 * expectedSubwayCode=1004(4호선)이 없으므로 fallback 트리거 → "서울"로 재호출.
 * 결과는 1차(GTX) + 2차(1호선/4호선) merge.
 */
Deno.test("arrival-info subway — subwayCode 있고 1차 응답에 해당 코드 없으면 fallback 호출(2회) + merge", async () => {
  let fetchCallCount = 0
  const capturedUrls: string[] = []
  await withEnv(ENV, () =>
    withMockFetch(async (url) => {
      fetchCallCount++
      capturedUrls.push(url)
      const decoded = decodeURIComponent(url.split("/").pop() ?? "")
      if (decoded === "서울역") {
        // 1차: GTX-A만 응답
        return jsonResponse({
          realtimeArrivalList: [{
            subwayId: "1032",
            trainLineNm: "수서행",
            arvlMsg2: "3분 후",
            arvlMsg3: "공덕",
            arvlCd: "99",
            updnLine: "하행",
          }],
        })
      }
      if (decoded === "서울") {
        // 2차: 1호선 + 4호선 응답
        return jsonResponse({
          realtimeArrivalList: [
            {
              subwayId: "1001",
              trainLineNm: "소요산행",
              arvlMsg2: "2분 후",
              arvlMsg3: "남영",
              arvlCd: "99",
              updnLine: "상행",
            },
            {
              subwayId: "1004",
              trainLineNm: "당고개행",
              arvlMsg2: "5분 후",
              arvlMsg3: "숙대입구",
              arvlCd: "99",
              updnLine: "상행",
            },
          ],
        })
      }
      return jsonResponse({ realtimeArrivalList: [] })
    }, async () => {
      const url = `${BASE}?type=subway&stationName=${encodeURIComponent("서울역")}&subwayCode=1004`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 200)
      const body = await res.json()
      // 1차 1건(GTX) + 2차 2건(1호선, 4호선) = 3건 merge
      assertEquals(body.length, 3)
      assertEquals(fetchCallCount, 2)
      // 1차: "서울역"
      assertEquals(capturedUrls[0].includes(encodeURIComponent("서울역")), true)
      // 2차: "서울" (역 접미사 제거)
      assertEquals(capturedUrls[1].includes(encodeURIComponent("서울")), true)
      // GTX, 1호선, 4호선 모두 포함 확인
      const lineNames = body.map((item: { lineName: string }) => item.lineName)
      assertEquals(lineNames.includes("1032"), true)
      assertEquals(lineNames.includes("1001"), true)
      assertEquals(lineNames.includes("1004"), true)
    })
  )
})

Deno.test("arrival-info subway — subwayCode 있고 1차 응답에 해당 코드 이미 있으면 fallback 안 함(1회)", async () => {
  let fetchCallCount = 0
  await withEnv(ENV, () =>
    withMockFetch(async () => {
      fetchCallCount++
      return jsonResponse({
        realtimeArrivalList: [
          {
            subwayId: "1004",
            trainLineNm: "당고개행",
            arvlMsg2: "3분 후",
            arvlMsg3: "공덕",
            arvlCd: "99",
            updnLine: "상행",
          },
        ],
      })
    }, async () => {
      const url = `${BASE}?type=subway&stationName=${encodeURIComponent("서울역")}&subwayCode=1004`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 1)
      assertEquals(body[0].lineName, "1004")
      // expected code가 1차에 있으므로 fetch 1회만
      assertEquals(fetchCallCount, 1)
    })
  )
})

Deno.test("arrival-info subway — subwayCode 미전달 시 기존 동작 유지(0건일 때만 fallback)", async () => {
  let fetchCallCount = 0
  await withEnv(ENV, () =>
    withMockFetch(async () => {
      fetchCallCount++
      // 1차: 1032만 있음
      return jsonResponse({
        realtimeArrivalList: [{
          subwayId: "1032",
          trainLineNm: "수서행",
          arvlMsg2: "3분 후",
          arvlMsg3: "공덕",
          arvlCd: "99",
          updnLine: "하행",
        }],
      })
    }, async () => {
      // subwayCode 없음 → 1차에 결과 있으면 fallback 안 함
      const url = `${BASE}?type=subway&stationName=${encodeURIComponent("서울역")}`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 200)
      const body = await res.json()
      assertEquals(body.length, 1)
      assertEquals(fetchCallCount, 1)
    })
  )
})

Deno.test("arrival-info subway — 잘못된 형식의 subwayCode는 400을 반환한다", async () => {
  await withEnv(ENV, () =>
    withMockFetch(async () => jsonResponse({}), async () => {
      // subwayCode 형식 불일치 → 400 ARRIVAL_SUBWAY_CODE_INVALID
      const url = `${BASE}?type=subway&stationName=강남&subwayCode=INVALID`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 400)
      const body = await res.json()
      assertEquals(body.error.code, "ARRIVAL_SUBWAY_CODE_INVALID")
    })
  )
})

Deno.test("arrival-info subway — dedupe: 1차+2차 merge 시 같은 key 항목은 중복 제거", async () => {
  // 시나리오: 1차에 1004 없음 → fallback 트리거.
  // 2차 결과에 1차에 이미 있던 1032와 동일한 key 항목이 섞여 반환될 때 dedupe 검증.
  let fetchCallCount = 0
  await withEnv(ENV, () =>
    withMockFetch(async (url) => {
      fetchCallCount++
      const decoded = decodeURIComponent(url.split("/").pop() ?? "")
      const gtxItem = { subwayId: "1032", trainLineNm: "수서행", arvlMsg2: "3분 후", arvlMsg3: "공덕", arvlCd: "99", updnLine: "하행" }
      if (decoded === "서울역") {
        // 1차: 1032(GTX)만 반환, 1004 없음 → needsFallback=true
        return jsonResponse({ realtimeArrivalList: [gtxItem] })
      }
      if (decoded === "서울") {
        // 2차: 1032(GTX) 동일 item + 1004 추가
        return jsonResponse({
          realtimeArrivalList: [
            gtxItem,  // 1차와 완전히 같은 key → dedupe 제거 대상
            { subwayId: "1004", trainLineNm: "당고개행", arvlMsg2: "5분 후", arvlMsg3: "숙대입구", arvlCd: "99", updnLine: "상행" },
          ],
        })
      }
      return jsonResponse({ realtimeArrivalList: [] })
    }, async () => {
      const url = `${BASE}?type=subway&stationName=${encodeURIComponent("서울역")}&subwayCode=1004`
      const res = await handler(makeRequest("GET", url))
      assertEquals(res.status, 200)
      const body = await res.json()
      // 1032(1차) + 1032(2차 중복 제거) + 1004 = 2건
      assertEquals(body.length, 2)
      assertEquals(fetchCallCount, 2)
      const lineNames = body.map((item: { lineName: string }) => item.lineName)
      assertEquals(lineNames.includes("1032"), true)
      assertEquals(lineNames.includes("1004"), true)
    })
  )
})
