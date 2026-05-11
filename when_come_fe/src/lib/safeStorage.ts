/**
 * 사파리 사적 브라우징 / 사용자 설정으로 localStorage가 차단된 환경에서
 * `localStorage.getItem`/`setItem`이 throw하면 첫 호출 페이지가 흰 화면으로 멈춤.
 * 모든 접근은 이 wrapper만 사용. 실패는 silent (메모리 fallback 없음 — 단순 best-effort).
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Quota / private mode — silent skip
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // silent
    }
  },
}
