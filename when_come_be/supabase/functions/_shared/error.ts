import { corsHeaders } from "./cors.ts"
import { logAnomaly } from "./anomaly.ts"

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
//
// source 인자를 전달하면 로깅 대상 에러를 anomaly_logs 에 fire-and-forget 기록.
// 로깅 정책: 5xx 전체 + 비즈니스 코드(code 있는 4xx) 기록. 단순 4xx 클라이언트 잘못은 기록 안 함.
export function errorResponse(e: unknown, source?: string): Response {
  if (e instanceof AppError) {
    if (source && _shouldLog(e)) {
      logAnomaly({
        source,
        category: e.code ? `error.business.${e.code}` : `error.${e.status}xx`,
        detail: {
          message: e.message,
          status: e.status,
          ...(e.code ? { code: e.code } : {}),
          ...(e.detail ? { detail: e.detail } : {}),
        },
      })
    }

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

  if (source) {
    logAnomaly({
      source,
      category: "error.unhandled",
      detail: {
        message: e instanceof Error ? e.message : String(e),
        ...(e instanceof Error && e.stack ? { stack: e.stack } : {}),
      },
    })
  }
  console.error(e)
  return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/** 기록 대상 여부: 5xx 전체 또는 비즈니스 코드(code 있는 4xx) */
function _shouldLog(err: AppError): boolean {
  if (err.status >= 500) return true
  return typeof err.code === "string" // 비즈니스 에러 코드 있는 4xx
}
