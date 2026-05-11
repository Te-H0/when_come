import { useEffect } from 'react'

/**
 * 모바일 키보드 가시영역(visual viewport)을 CSS 변수 `--keyboard-inset-height`로 노출.
 *
 * iOS Safari는 `interactive-widget=resizes-content`를 무시하므로 visualViewport API로 폴리필.
 * Android Chrome도 동일 API 사용 — viewport meta로도 처리되지만 일관성 위해 같이 적용.
 *
 * 사용처: `PageShell`(main padding-bottom), `BottomNav`(bottom), SetupRoute sticky 저장 버튼.
 * App 최상위에서 1회 호출.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      document.documentElement.style.setProperty('--keyboard-inset-height', `${inset}px`)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.documentElement.style.setProperty('--keyboard-inset-height', '0px')
    }
  }, [])
}
