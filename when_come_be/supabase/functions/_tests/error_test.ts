import { assertEquals } from "@std/assert"
import { AppError, errorResponse, type ArrivalErrorCode } from "../_shared/error.ts"

Deno.test("AppError — Error를 상속하고 message를 보존한다", () => {
  const err = new AppError("뭔가 잘못됨", 422)
  assertEquals(err instanceof Error, true)
  assertEquals(err instanceof AppError, true)
  assertEquals(err.message, "뭔가 잘못됨")
  assertEquals(err.status, 422)
})

Deno.test("AppError — 기본 status는 400이다", () => {
  const err = new AppError("잘못된 요청")
  assertEquals(err.status, 400)
})

Deno.test("errorResponse — AppError는 정확한 status와 body를 반환한다", async () => {
  const err = new AppError("권한 없음", 403)
  const res = errorResponse(err)

  assertEquals(res.status, 403)
  const body = await res.json()
  assertEquals(body.error, "권한 없음")
})

Deno.test("errorResponse — AppError 응답에 CORS 헤더가 포함된다", () => {
  const res = errorResponse(new AppError("에러", 400))
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
  assertEquals(res.headers.get("Content-Type"), "application/json")
})

Deno.test("errorResponse — 알 수 없는 에러는 500을 반환한다", async () => {
  const res = errorResponse(new Error("예상치 못한 오류"))

  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.error, "INTERNAL_SERVER_ERROR")
})

Deno.test("errorResponse — 알 수 없는 에러도 CORS 헤더가 포함된다", () => {
  const res = errorResponse("문자열 에러")
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
})

Deno.test("errorResponse — null/undefined도 500으로 처리한다", async () => {
  const res = errorResponse(null)
  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.error, "INTERNAL_SERVER_ERROR")
})

// ─── 구조화된 에러 코드 (code 포함) ────────────────────────────────────────

Deno.test("AppError — code/detail 필드를 보존한다", () => {
  const err = new AppError(
    "경로를 찾을 수 없어요.",
    404,
    "ARRIVAL_STOP_NOT_FOUND" satisfies ArrivalErrorCode,
    "route_stops.id=abc not found",
  )
  assertEquals(err.status, 404)
  assertEquals(err.code, "ARRIVAL_STOP_NOT_FOUND")
  assertEquals(err.detail, "route_stops.id=abc not found")
})

Deno.test("errorResponse — code 있는 AppError는 구조화된 객체 반환", async () => {
  const err = new AppError(
    "이 지역은 실시간 도착 정보를 지원하지 않아요.",
    422,
    "ARRIVAL_UNSUPPORTED_REGION" satisfies ArrivalErrorCode,
    "region=unknown lat=37.85 lng=128.59",
  )
  const res = errorResponse(err)
  assertEquals(res.status, 422)
  const body = await res.json()
  assertEquals(body.error.code, "ARRIVAL_UNSUPPORTED_REGION")
  assertEquals(body.error.message, "이 지역은 실시간 도착 정보를 지원하지 않아요.")
  assertEquals(body.error.detail, "region=unknown lat=37.85 lng=128.59")
})

Deno.test("errorResponse — code 있는 AppError에 CORS 헤더가 포함된다", () => {
  const err = new AppError("잠시 후 다시 시도해 주세요.", 502, "ARRIVAL_PROVIDER_ERROR")
  const res = errorResponse(err)
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*")
  assertEquals(res.headers.get("Content-Type"), "application/json")
})

Deno.test("errorResponse — code 없는 AppError는 기존 flat 구조 유지 (하위 호환)", async () => {
  const err = new AppError("권한 없음", 403)
  const res = errorResponse(err)
  assertEquals(res.status, 403)
  const body = await res.json()
  // code 없으면 { error: "message" } — 기존 FE 호환
  assertEquals(body.error, "권한 없음")
})

Deno.test("errorResponse — detail 없는 code 있는 AppError에는 detail 키 없음", async () => {
  const err = new AppError("경로를 찾을 수 없어요.", 404, "ARRIVAL_STOP_NOT_FOUND")
  const res = errorResponse(err)
  const body = await res.json()
  assertEquals(body.error.code, "ARRIVAL_STOP_NOT_FOUND")
  assertEquals("detail" in body.error, false)
})
