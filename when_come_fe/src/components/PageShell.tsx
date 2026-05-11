import type { ReactNode } from 'react'
import BottomNav from '@/components/BottomNav'

interface PageShellProps {
  children: ReactNode
  /** 페이지 본문 추가 클래스 (대부분 필요 없음) */
  className?: string
  /**
   * sticky 저장 버튼 등 BottomNav 위에 떠 있는 영역이 있을 때 true.
   * true면 padding-bottom을 --bottom-nav-total + 56px로 늘림.
   */
  reserveStickyFooter?: boolean
}

/**
 * 모든 페이지의 최상위 컨테이너.
 *
 * 책임:
 * - h-dvh flex-col 구조 (html/body는 overflow:hidden으로 잠겨있으므로 main이 스크롤 담당)
 * - background-color: var(--surface-page)
 * - main: flex-1 overflow-y-auto → 페이지 본문 스크롤 가능, pull-to-refresh 차단 유지
 * - padding-bottom: var(--bottom-nav-total) 자동 처리 (BottomNav 가림 방지)
 * - BottomNav 자동 렌더링 (각 페이지에서 직접 import 불필요)
 */
export default function PageShell({
  children,
  className = '',
  reserveStickyFooter = false,
}: PageShellProps) {
  return (
    <div className={`h-dvh flex flex-col bg-surface-page ${className}`}>
      <main
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: reserveStickyFooter
            ? 'calc(var(--bottom-nav-total) + 56px + var(--keyboard-inset-height, 0px))'
            : 'calc(var(--bottom-nav-total) + 24px + var(--keyboard-inset-height, 0px))',
        }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
