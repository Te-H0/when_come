import { useEffect, useState } from 'react'

/**
 * 페이지(탭)가 사용자에게 보이는 상태인지 추적.
 *
 * 모바일 브라우저는 다른 앱으로 전환되거나 화면 꺼짐 시 visibilitychange로 hidden 통지.
 * 도착 카운트다운 setInterval처럼 매초 도는 타이머가 화면 안 보일 때 계속 돌면 배터리/CPU 낭비.
 * 사용처에서 `if (!isVisible) return` 가드로 effect 종료 또는 interval 정지.
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState<boolean>(() =>
    typeof document === 'undefined' ? true : !document.hidden,
  )

  useEffect(() => {
    const onChange = () => setIsVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  return isVisible
}
