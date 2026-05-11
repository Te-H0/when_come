import { useCallback, useRef } from 'react'

/**
 * 저장 버튼 더블탭 가드.
 *
 * `isSaving` state로 disabled를 거는 패턴은 첫 클릭→setState→다음 렌더 사이에 들어온 두 번째
 * 클릭을 막지 못한다. ref는 동기적으로 즉시 lock되어 두 번째 호출을 차단.
 *
 * 사용:
 * ```ts
 * const guardedSave = useSubmitGuard(async () => {
 *   setIsSaving(true)
 *   try { await api.create(...) } finally { setIsSaving(false) }
 * })
 * <Button onClick={guardedSave}>저장</Button>
 * ```
 */
export function useSubmitGuard<T>(handler: () => Promise<T>): () => Promise<void> {
  const lockRef = useRef(false)
  return useCallback(async () => {
    if (lockRef.current) return
    lockRef.current = true
    try {
      await handler()
    } finally {
      lockRef.current = false
    }
  }, [handler])
}
