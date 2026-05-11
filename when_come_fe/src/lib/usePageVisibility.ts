import { useEffect, useState } from 'react'

/**
 * 페이지(탭)가 사용자에게 보이는 상태인지 추적.
 *
 * 두 이벤트 채널 동시 사용 — iOS Safari PWA standalone 신뢰성 보강:
 * 1. `visibilitychange` — 대부분 케이스 (앱 스위처, 화면 잠금, 다른 탭). PWA/일반 사파리 둘 다.
 * 2. `pageshow` (`event.persisted: true`) — bfcache 복원 / iOS PWA가 메모리에서 깨어날 때.
 *    visibilitychange가 발화 안 하는 일부 케이스 안전망.
 *
 * 사용처에서 `if (!isVisible) return` 가드로 effect 종료 또는 interval 정지.
 * 또는 visible 변화 자체를 listen해 도착정보 refetch (Home/Favorites 패턴).
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState<boolean>(() =>
    typeof document === 'undefined' ? true : !document.hidden,
  )

  useEffect(() => {
    const onVisibilityChange = () => setIsVisible(!document.hidden)
    const onPageShow = (e: PageTransitionEvent) => {
      // bfcache 복원이거나(`persisted=true`) 일반 로드 모두 visible로 간주.
      // 일반 로드는 어차피 useState 초기값으로 true지만 멱등 호출 OK.
      if (e.persisted || !document.hidden) setIsVisible(true)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  return isVisible
}
