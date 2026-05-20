import React, { useState, useEffect, useRef } from 'react'
import { Pencil, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface AliasEditDialogProps {
  initialAlias: string | null
  onSave: (alias: string | null) => void | Promise<void>
  /** 모달 내부 헤더에 정류장/역 컨텍스트로 표시될 노드 (정류장명 + 노선 chip 등). 호출처가 만들어 넘김. */
  header: React.ReactNode
  /** 트리거 버튼 className 오버라이드 */
  className?: string
}

export default function AliasEditDialog({
  initialAlias,
  onSave,
  header,
  className,
}: AliasEditDialogProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(initialAlias ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 다이얼로그 열릴 때 초기화 + 포커스
  useEffect(() => {
    if (open) {
      setInputValue(initialAlias ?? '')
      // 다음 프레임 포커스 — DialogContent 애니메이션 후 입력 준비
      requestAnimationFrame(() => {
        requestAnimationFrame(() => inputRef.current?.focus())
      })
    }
  }, [open, initialAlias])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSaving) return // 저장 중 닫기 방지
    if (!nextOpen) setInputValue(initialAlias ?? '') // 취소 시 reset
    setOpen(nextOpen)
  }

  const handleSave = async (valueToSave: string | null) => {
    setIsSaving(true)
    try {
      await onSave(valueToSave)
      setOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirm = () => {
    const trimmed = inputValue.trim()
    handleSave(trimmed === '' ? null : trimmed)
  }

  const handleDelete = () => {
    handleSave(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
    // Esc는 Radix Dialog가 자동으로 닫아줌 — handleOpenChange(false) 호출됨
  }

  return (
    <>
      {/* 트리거 버튼 — 닫힌 상태의 연필 아이콘 */}
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-chip text-text-tertiary hover:text-text-secondary hover:bg-surface-muted transition-colors ${className ?? ''}`}
        aria-label="별명 편집"
      >
        <Pencil className="w-4 h-4" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="gap-0 p-0 overflow-hidden">
          {/* 정류장 컨텍스트 헤더 */}
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border-subtle gap-2">
            <DialogTitle className="text-section text-text-primary text-left">
              별명 편집
            </DialogTitle>
            {/* 호출처가 넘겨준 정류장/역 컨텍스트 */}
            <div className="flex flex-col gap-1.5">
              {header}
            </div>
          </DialogHeader>

          {/* 입력 영역 */}
          <div className="px-5 py-4 flex flex-col gap-2">
            <p className="text-caption text-text-tertiary">
              나만 알아볼 수 있는 별명을 적어두세요. 예: 회사 앞, 집 골목
            </p>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSaving}
              placeholder="예: 회사 앞"
              maxLength={30}
              className="h-10 w-full px-3 text-body rounded-control border border-border-default bg-surface-card focus:outline-none focus:ring-2 focus:ring-ring-focus focus:border-border-focus disabled:opacity-50"
            />
          </div>

          {/* 푸터 버튼 */}
          <DialogFooter className="px-5 pb-5 flex flex-row items-center justify-between gap-2">
            {/* 삭제 버튼 — 기존 별칭 있을 때만 */}
            <div className="flex-1">
              {initialAlias && (
                <Button
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="text-text-danger hover:bg-surface-danger-soft hover:text-text-danger px-3"
                >
                  삭제
                </Button>
              )}
            </div>
            {/* 취소 / 저장 */}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={isSaving}
                className="px-4"
              >
                취소
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isSaving}
                className="bg-text-primary text-white hover:bg-text-primary/80 px-4"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  '저장'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
