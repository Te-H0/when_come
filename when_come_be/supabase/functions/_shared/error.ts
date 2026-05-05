import { corsHeaders } from "./cors.ts"

// ─── 에러 코드 타입 ────────────────────────────────────────────────────────────
export type ArrivalErrorCode =
  | "ARRIVAL_UNSUPPORTED_REGION"
  | "ARRIVAL_MAPPING_FAILED"
  | "ARRIVAL_VERIFY_FAILED"
  | "ARRIVAL_PROVIDER_ERROR"
  | "ARRIVAL_STOP_NOT_FOUND"

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code?: ArrivalErrorCode | string,
    public readonly detail?: string,
  ) {
    super(message)
  }
}

// ─── 구조화된 에러 응답 ────────────────────────────────────────────────────────
// 스키마: { "error": { "code": "...", "message": "...", "detail": "..." } }
// AppError에 code가 없으면 message를 code로 사용 (하위 호환)
export function errorResponse(e: unknown): Response {
  if (e instanceof AppError) {
    const body = e.code
      ? JSON.stringify({
          error: {
            code: e.code,
            message: e.message,
            ...(e.detail !== undefined ? { detail: e.detail } : {}),
          },
        })
      : JSON.stringify({ error: e.message })

    return new Response(body, {
      status: e.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  console.error(e)
  return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
