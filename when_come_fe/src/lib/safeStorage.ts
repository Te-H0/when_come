/**
 * 사파리 사적 브라우징 / 사용자 설정으로 localStorage가 차단된 환경에서
 * `localStorage.getItem`/`setItem`이 throw하면 첫 호출 페이지가 흰 화면으로 멈춤.
 * 모든 접근은 이 wrapper만 사용. 실패는 silent (메모리 fallback 없음 — 단순 best-effort).
 */
export const safeStorage = {
  /** Explicit writes must not claim persistence after a browser storage failure. */
  getOrThrow(key: string): string | null {
    try { return window.localStorage.getItem(key) } catch {
      throw new Error('브라우저 저장 공간을 읽을 수 없어요. 저장 허용 설정을 확인해 주세요.')
    }
  },
  setOrThrow(key: string, value: string): void {
    try { window.localStorage.setItem(key, value) } catch {
      throw new Error('브라우저 저장 공간을 사용할 수 없어요. 저장 허용 설정을 확인해 주세요.')
    }
  },
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
