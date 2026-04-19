import { assertEquals } from "@std/assert"
import { AppError, errorResponse } from "../_shared/error.ts"

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
