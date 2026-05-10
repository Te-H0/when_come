import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'

interface PageHeaderProps {
  title?: string
  /**
   * 좌측 back 버튼:
   * - undefined/false: 표시 안 함
   * - true: navigate(-1)
   * - 함수: 직접 호출
   */
  back?: boolean | (() => void)
  /** 우측 액션 슬롯 (Settings, +, RefreshCw 등 아이콘 버튼들) */
  right?: ReactNode
  /** 제목 좌측 (back 우측)에 들어갈 보조 슬롯 */
  leading?: ReactNode
  /** 제목 우측에 들어갈 inline 배지 슬롯 */
  badge?: ReactNode
  /** 헤더 아래에 붙는 secondary row (탭 바, 칩 스크롤 등) */
  bottom?: ReactNode
}

/**
 * 모든 페이지의 표준 헤더 컴포넌트.
 *
 * 책임:
 * - sticky top-0, z-10, backdrop-blur
 * - border-bottom: border-subtle
 * - padding-top: safe-area-inset-top (iOS notch 대응)
 * - max-width + 좌우 padding 적용 (inner container)
 * - back 버튼, title, right 슬롯, bottom 슬롯
 */
export default function PageHeader({
  title,
  back,
  right,
  leading,
  badge,
  bottom,
}: PageHeaderProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (typeof back === 'function') {
      back()
    } else {
      navigate(-1)
    }
  }

  return (
    <header
      className="sticky top-0 z-10 border-b border-border-subtle"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div
        className="mx-auto flex flex-col"
        style={{
          maxWidth: 'var(--page-max-width)',
          paddingLeft: 'var(--page-padding-x)',
          paddingRight: 'var(--page-padding-x)',
        }}
      >
        {/* 메인 타이틀 행 */}
        <div className="flex items-center gap-2 py-3 min-h-[var(--page-header-height)]">
          {back && (
            <button
              onClick={handleBack}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-control text-text-secondary hover:bg-surface-muted transition-colors"
              aria-label="뒤로"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={2} />
            </button>
          )}
          {leading}
          {title && (
            <h1 className="text-card-title flex-1 truncate">{title}</h1>
          )}
          {badge}
          {right && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {right}
            </div>
          )}
        </div>

        {/* bottom 슬롯 (탭 바, 칩 스크롤 등) */}
        {bottom && (
          <div>
            {bottom}
          </div>
        )}
      </div>
    </header>
  )
}
