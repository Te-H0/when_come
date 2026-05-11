import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * 네트워크 온/오프라인 변화 시 sonner 토스트로 사용자 안내.
 *
 * `navigator.onLine`은 브라우저별로 신뢰도가 다르지만(특히 일부 안드로이드는 WiFi 연결 자체만 보고
 * 인터넷 도달 여부를 안 봄) 명시적인 OS-level 단절(비행기 모드/케이블 뽑힘)에는 잘 동작.
 * 도착정보 fetch 실패 토스트("도착 조회 실패")만으로는 원인을 파악하기 어려운 사용자에게 보강.
 *
 * App 최상위에서 1회 호출.
 */
export function useOnlineStatus(): void {
  useEffect(() => {
    let offlineToastId: string | number | undefined
    const onOffline = () => {
      offlineToastId = toast.error('인터넷 연결이 끊어졌어요', {
        description: '연결되면 자동으로 새로고침해요',
        duration: Infinity,
      })
    }
    const onOnline = () => {
      if (offlineToastId !== undefined) {
        toast.dismiss(offlineToastId)
        offlineToastId = undefined
      }
      toast.success('다시 연결됐어요')
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    // 초기 진입에서 이미 오프라인이면 즉시 안내
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      onOffline()
    }

    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      if (offlineToastId !== undefined) toast.dismiss(offlineToastId)
    }
  }, [])
}
