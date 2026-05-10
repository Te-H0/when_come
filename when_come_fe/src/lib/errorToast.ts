/**
 * API 에러 토스트 헬퍼
 *
 * 정책: ADR-002 §4.6 FE 표준 토스트 패턴
 * 컨벤션: .claude/rules/error-handling.md FE 규칙 1~3
 *
 * 사용법:
 *   import { showApiErrorToast, getErrorMessage } from '@/lib/errorToast'
 *
 *   catch (e) {
 *     showApiErrorToast(e, '저장에 실패했어요')
 *   }
 *
 * 코드별 UX 분기가 필요한 경우:
 *   catch (e) {
 *     if (e instanceof ApiError && e.code === 'FAVORITE_ROUTES_REQUIRED') {
 *       openRoutePicker()
 *       return
 *     }
 *     showApiErrorToast(e, '즐겨찾기 추가 실패')
 *   }
 */

import { toast } from 'sonner'
import { ApiError } from '@/lib/api'
import { lookupMessage } from '@/lib/errorMessages'

/**
 * 에러로부터 사용자에게 표시할 메시지 문자열을 반환한다.
 *
 * - `e instanceof ApiError`이면:
 *   - 운영: 카탈로그 매핑 메시지 → 없으면 e.message → 없으면 fallback
 *   - dev: `[CODE/STATUS] 메시지` prefix 부착
 * - ApiError 아니면: fallback
 */
export function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const userMessage = lookupMessage(
      e.code === 'UNKNOWN' ? undefined : e.code,
      e.message || fallback,
    )

    if (import.meta.env.DEV) {
      const codeLabel = e.code && e.code !== 'UNKNOWN' ? e.code : ''
      const statusLabel = e.status ? String(e.status) : ''
      const prefix = [codeLabel, statusLabel].filter(Boolean).join('/')
      return prefix ? `[${prefix}] ${userMessage}` : userMessage
    }

    return userMessage
  }

  return fallback
}

interface ShowApiErrorToastOptions {
  id?: string
}

/**
 * 에러를 분석해 sonner toast.error를 호출한다.
 * toast.error 직접 호출 대신 이 헬퍼를 사용한다.
 *
 * @param e - catch 블록의 에러 (unknown)
 * @param fallback - ApiError가 아닐 때 표시할 기본 메시지
 * @param options - toast 옵션 (id: 중복 방지용 고유 키)
 */
export function showApiErrorToast(
  e: unknown,
  fallback: string,
  options?: ShowApiErrorToastOptions,
): void {
  const message = getErrorMessage(e, fallback)
  toast.error(message, options ? { id: options.id } : undefined)
}
