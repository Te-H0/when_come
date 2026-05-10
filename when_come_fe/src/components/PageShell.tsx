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
 * - min-h-dvh (모바일 viewport — 키보드 올라와도 안 잘림)
 * - background-color: var(--surface-page)
 * - padding-bottom: var(--bottom-nav-total) 자동 처리 (BottomNav 가림 방지)
 * - BottomNav 자동 렌더링 (각 페이지에서 직접 import 불필요)
 */
export default function PageShell({
  children,
  className = '',
  reserveStickyFooter = false,
}: PageShellProps) {
  return (
    <div className={`min-h-dvh bg-surface-page ${className}`}>
      <main
        style={{
          paddingBottom: reserveStickyFooter
            ? 'calc(var(--bottom-nav-total) + 56px)'
            : 'var(--bottom-nav-total)',
        }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
