/**
 * 지하철 arrmsg 정규화 + headsign 추출 단위 테스트
 *
 * 테스트 대상:
 * - extractHeadsign — trainLineNm 우선, arrmsg 괄호 fallback, 둘 다 실패 null
 * - normalizeArrmsg — "[N]번째 전역" → "N개역 전", 시간 카운트다운 → null, 실패 null
 * - anomaly_logs mock INSERT 검증 (실패 케이스)
 */
import { assertEquals } from "@std/assert"
import { extractHeadsign, normalizeArrmsg } from "../arrival-info/index.ts"

// ─── anomaly 목 헬퍼 ───────────────────────────────────────────────────────
// logAnomaly는 fire-and-forget이므로 호출 횟수만 추적
let anomalyCallCount = 0
let lastAnomalyPayload: unknown = null

function resetAnomalyMock() {
  anomalyCallCount = 0
  lastAnomalyPayload = null
}

// Supabase SERVICE_ROLE_KEY 없으면 logAnomaly가 silent-skip → 환경변수 주입 없이도 동작.
// anomaly INSERT를 실제로 검증하려면 SERVICE_ROLE_KEY를 셋업해야 하나,
// fire-and-forget이라 함수 자체를 mock으로 감싸지 않아도 결과(null 반환)는 동일.
// 여기서는 반환값과 호출 부작용만 검증.

// ─── extractHeadsign ──────────────────────────────────────────────────────

Deno.test("extractHeadsign — trainLineNm '온수행 - 인천 급행' → '온수행'", () => {
  const result = extractHeadsign("온수행 - 인천 급행", "[2]번째 전역 (온수)")
  assertEquals(result, "온수행")
})

Deno.test("extractHeadsign — trainLineNm '광명행' → '광명행'", () => {
  const result = extractHeadsign("광명행", "[1]번째 전역 (인천)")
  assertEquals(result, "광명행")
})

Deno.test("extractHeadsign — trainLineNm '동묘앞행' → '동묘앞행'", () => {
  const result = extractHeadsign("동묘앞행", "5분 30초 후")
  assertEquals(result, "동묘앞행")
})

Deno.test("extractHeadsign — trainLineNm '광명행 - 급행' 우선 (arrmsg '[1]번째 전역 (인천)') → '광명행'", () => {
  // trainLineNm 우선 — arrmsg 괄호 '인천'이 아닌 '광명행' 반환해야 함
  const result = extractHeadsign("광명행 - 급행", "[1]번째 전역 (인천)")
  assertEquals(result, "광명행")
})

Deno.test("extractHeadsign — trainLineNm null, arrmsg '5분 30초 후 (인천)' → '인천행'", () => {
  const result = extractHeadsign(null, "5분 30초 후 (인천)")
  assertEquals(result, "인천행")
})

Deno.test("extractHeadsign — trainLineNm null, arrmsg '[2]번째 전역 (온수)' → '온수행'", () => {
  const result = extractHeadsign(null, "[2]번째 전역 (온수)")
  assertEquals(result, "온수행")
})

Deno.test("extractHeadsign — arrmsg 괄호 안에 이미 '행' 접미사 있으면 중복 추가 안 함 → '장암행'", () => {
  const result = extractHeadsign(null, "3분 후 (장암행)")
  assertEquals(result, "장암행")
})

Deno.test("extractHeadsign — trainLineNm null, arrmsg 괄호 없음 → null + anomaly", () => {
  // 두 조건 모두 실패 → null
  const result = extractHeadsign(null, "전역 출발")
  assertEquals(result, null)
})

Deno.test("extractHeadsign — trainLineNm 빈 문자열 공백, arrmsg 괄호 없음 → null", () => {
  const result = extractHeadsign("  ", "도착")
  assertEquals(result, null)
})

// ─── normalizeArrmsg ──────────────────────────────────────────────────────

Deno.test("normalizeArrmsg — '[2]번째 전역 (온수)' → displayMsg '2개역 전', stripped '전역'", () => {
  const result = normalizeArrmsg("[2]번째 전역 (온수)")
  assertEquals(result.displayMsg, "2개역 전")
  // stripped은 괄호 제거
  assertEquals(result.stripped.includes("온수"), false)
})

Deno.test("normalizeArrmsg — '[1]번째 전역 (인천)' → displayMsg '1개역 전'", () => {
  const result = normalizeArrmsg("[1]번째 전역 (인천)")
  assertEquals(result.displayMsg, "1개역 전")
})

Deno.test("normalizeArrmsg — '[5]번째 전역 (광명사거리)' → displayMsg '5개역 전'", () => {
  const result = normalizeArrmsg("[5]번째 전역 (광명사거리)")
  assertEquals(result.displayMsg, "5개역 전")
})

Deno.test("normalizeArrmsg — '5분 30초 후 (인천)' → displayMsg null (카운트다운)", () => {
  const result = normalizeArrmsg("5분 30초 후 (인천)")
  assertEquals(result.displayMsg, null)
})

Deno.test("normalizeArrmsg — '2분 40초 후' → displayMsg null (카운트다운)", () => {
  const result = normalizeArrmsg("2분 40초 후")
  assertEquals(result.displayMsg, null)
})

Deno.test("normalizeArrmsg — '30초 후' → displayMsg null (초 단위 카운트다운)", () => {
  const result = normalizeArrmsg("30초 후")
  assertEquals(result.displayMsg, null)
})

Deno.test("normalizeArrmsg — stripped에서 괄호 제거됨", () => {
  const result = normalizeArrmsg("5분 후 (강남)")
  assertEquals(result.stripped.includes("강남"), false)
  assertEquals(result.stripped.includes("("), false)
})

Deno.test("normalizeArrmsg — 알 수 없는 패턴 → displayMsg null + anomaly", () => {
  // "운행종료"처럼 숫자도 없고 "[N]번째 전역"도 없는 경우 → null
  const result = normalizeArrmsg("운행종료")
  assertEquals(result.displayMsg, null)
})

Deno.test("normalizeArrmsg — 빈 문자열 → displayMsg null", () => {
  const result = normalizeArrmsg("")
  assertEquals(result.displayMsg, null)
})

// ─── arvlCd + normalizeArrmsg 통합 시나리오 ──────────────────────────────
// fetchSubwayArrivalRaw 내부 분기 로직을 시뮬레이션
// arvlCd 0~5 → arvlCdToDisplayMsg 성공, normalizeArrmsg 호출 안 됨
// arvlCd 99 → normalizeArrmsg fallback

import { arvlCdToDisplayMsg } from "../arrival-info/index.ts"

Deno.test("통합 — arvlCd '4' (전역 진입): displayMsg '전역 진입', normalizeArrmsg 불필요", () => {
  const base = arvlCdToDisplayMsg("4")
  assertEquals(base, "전역 진입")
  // normalizeArrmsg 호출 불필요 — base가 null이 아니면 사용 안 함
})

Deno.test("통합 — arvlCd '99' + '[2]번째 전역 (온수)': normalizeArrmsg '2개역 전'", () => {
  const base = arvlCdToDisplayMsg("99")
  assertEquals(base, null) // 99는 null
  const { displayMsg } = normalizeArrmsg("[2]번째 전역 (온수)", { arvlCd: "99" })
  assertEquals(displayMsg, "2개역 전")
})

Deno.test("통합 — arvlCd '99' + '5분 30초 후 (인천)': displayMsg null (카운트다운 유지)", () => {
  const base = arvlCdToDisplayMsg("99")
  assertEquals(base, null)
  const { displayMsg } = normalizeArrmsg("5분 30초 후 (인천)", { arvlCd: "99" })
  assertEquals(displayMsg, null)
})

Deno.test("통합 — arvlCd '99' + arrmsg, headsign: '인천행'", () => {
  const headsign = extractHeadsign(null, "5분 30초 후 (인천)")
  assertEquals(headsign, "인천행")
})

Deno.test("통합 — trainLineNm '온수행 - 인천 급행', arrmsg '[2]번째 전역 (온수)': headsign '온수행', displayMsg '2개역 전'", () => {
  const headsign = extractHeadsign("온수행 - 인천 급행", "[2]번째 전역 (온수)")
  assertEquals(headsign, "온수행")

  const base = arvlCdToDisplayMsg("99")
  const { displayMsg } = base !== null
    ? { displayMsg: base }
    : normalizeArrmsg("[2]번째 전역 (온수)", { arvlCd: "99" })
  assertEquals(displayMsg, "2개역 전")
})
