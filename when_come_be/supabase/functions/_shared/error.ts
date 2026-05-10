import { corsHeaders } from "./cors.ts"
import { logAnomaly } from "./anomaly.ts"
import type { ErrorCode } from "./errorCodes.ts"

// ─── 환경 판별 ────────────────────────────────────────────────────────────────

/**
 * 현재 실행 환경이 운영(production)인지 판별한다.
 *
 * 판별 순서:
 *  1. DENO_ENV === "production" (명시적 주입, 최우선)
 *  2. ENVIRONMENT === "production" (대체 키)
 *  3. 위 두 키 모두 미설정 → false (dev) — fail-safe default
 *
 * 설계 원칙: 명시적 환경변수 주입이 없으면 항상 dev로 취급한다.
 *
 * 활성화 조건: Supabase 함수 시크릿에 DENO_ENV=production 설정 필요.
 * 설정 명령:  supabase secrets set DENO_ENV=production --project-ref <ref>
 * CI/CD:     .github/workflows/deploy-supabase.yml "Set Edge Function secrets" 스텝에서 자동 설정.
 * 미설정 시:  운영도 dev 모드로 동작 (raw 메시지 노출, 마스킹 없음) — 배포 전 반드시 확인.
 */
export function isProduction(): boolean {
  const denoEnv = Deno.env.get("DENO_ENV")
  if (denoEnv === "production") return true
  if (denoEnv !== undefined) return false // 명시적으로 다른 값이면 dev

  const environment = Deno.env.get("ENVIRONMENT")
  if (environment === "production") return true

  // 미설정 시 항상 dev — fail-safe default (운영 배포는 반드시 env 명시 주입)
  return false
}

// ─── AppError ────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    /**
     * 에러 코드. 신규 코드는 반드시 `_shared/errorCodes.ts`에 등록된
     * `ErrorCode` union literal을 사용한다.
     *
     * string fallback은 마이그레이션 호환용으로만 허용.
     * 새 함수에서 임의 string literal 사용 금지 — `.claude/rules/error-handling.md` §1 참조.
     *
     * @example 올바른 사용
     *   throw new AppError("이름이 비어 있습니다", 400, "ROUTE_NAME_REQUIRED")
     * @example 금지 — 마이그레이션 기간 외
     *   throw new AppError("뭔가 잘못됨", 400, "MY_RANDOM_CODE")
     */
    public readonly code?: ErrorCode | string,
    public readonly detail?: string,
  ) {
    super(message)
  }
}

// ─── 구조화된 에러 응답 ────────────────────────────────────────────────────────
//
// 스키마:
//   code 있음: { "error": { "code": "...", "message": "...", "detail"?: "..." } }
//   code 없음 + dev: { "error": "message" }  (하위 호환 legacy 포맷)
//   code 없음 + prod: { "error": { "code": "COMMON_BAD_REQUEST", "message": "..." } }  (마스킹)
//
// 운영 마스킹 정책 (ADR-002 §3.4):
//   - prod + code 없는 4xx → COMMON_BAD_REQUEST로 치환, detail 제거
//   - prod + 5xx unhandled → COMMON_INTERNAL_ERROR로 치환
//   - prod + code 있는 4xx/5xx → message 그대로, detail만 제거
//   - dev → 마스킹 없음 (raw message + detail 모두 노출)
//
// anomaly_logs 기록은 마스킹 전 raw 데이터로 유지.
//
// source 인자를 전달하면 anomaly_logs 에 fire-and-forget 기록.
// 로깅 정책: 5xx 전체 + code 있는 4xx 기록. 단순 4xx(code 없음)는 기록 안 함.
export function errorResponse(e: unknown, source?: string): Response {
  const prod = isProduction()

  if (e instanceof AppError) {
    // anomaly_logs — 마스킹 전 raw 데이터 기록
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

    const body = _buildAppErrorBody(e, prod)

    return new Response(body, {
      status: e.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // unhandled 예외 (AppError 아님)
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

  const unhandledBody = prod
    ? JSON.stringify({
        error: {
          code: "COMMON_INTERNAL_ERROR",
          message: "잠시 후 다시 시도해 주세요",
        },
      })
    : JSON.stringify({ error: "INTERNAL_SERVER_ERROR" })

  return new Response(unhandledBody, {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/** 기록 대상 여부: 5xx 전체 또는 code 있는 4xx */
function _shouldLog(err: AppError): boolean {
  if (err.status >= 500) return true
  return typeof err.code === "string"
}

/**
 * AppError → 응답 body JSON 문자열 생성.
 * 운영/dev 분기 및 마스킹 정책 적용.
 */
function _buildAppErrorBody(e: AppError, prod: boolean): string {
  if (e.code) {
    // code 있는 에러: prod에서는 detail만 제거, message는 유지
    if (prod) {
      return JSON.stringify({
        error: {
          code: e.code,
          message: e.message,
          // detail은 운영에서 제거
        },
      })
    }
    // dev: detail 포함 그대로
    return JSON.stringify({
      error: {
        code: e.code,
        message: e.message,
        ...(e.detail !== undefined ? { detail: e.detail } : {}),
      },
    })
  }

  // code 없는 에러
  if (prod) {
    // prod: 4xx → COMMON_BAD_REQUEST 마스킹 (5xx는 unhandled 경로에서 처리되므로 여기는 주로 4xx)
    const maskCode = e.status >= 500 ? "COMMON_INTERNAL_ERROR" : "COMMON_BAD_REQUEST"
    const maskMsg = e.status >= 500 ? "잠시 후 다시 시도해 주세요" : "잘못된 요청입니다"
    return JSON.stringify({
      error: {
        code: maskCode,
        message: maskMsg,
      },
    })
  }

  // dev: 기존 legacy flat 포맷 유지 (FE apiFetch 하위 호환)
  return JSON.stringify({ error: e.message })
}

// ─── 하위 호환 re-export ─────────────────────────────────────────────────────
// 기존 error.ts에서 ArrivalErrorCode를 직접 import하던 코드 호환
export type { ArrivalErrorCode } from "./errorCodes.ts"
