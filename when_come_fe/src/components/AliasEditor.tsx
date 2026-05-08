import { useState, useRef, useEffect } from 'react'
import { Pencil, Check, X, Trash2, Loader2 } from 'lucide-react'

interface AliasEditorProps {
  initialAlias: string | null
  onSave: (alias: string | null) => void | Promise<void>
  className?: string
}

export default function AliasEditor({ initialAlias, onSave, className }: AliasEditorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState(initialAlias ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setInputValue(initialAlias ?? '')
      // 다음 프레임에서 포커스
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen, initialAlias])

  const handleOpen = () => setIsOpen(true)

  const handleCancel = () => {
    setIsOpen(false)
    setInputValue(initialAlias ?? '')
  }

  const handleSave = async (valueToSave: string | null) => {
    setIsSaving(true)
    try {
      await onSave(valueToSave)
      setIsOpen(false)
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
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') handleCancel()
  }

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] transition-colors ${className ?? ''}`}
        aria-label="별명 편집"
      >
        <Pencil className="w-4 h-4" />
      </button>
    )
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        placeholder="예: 회사 앞"
        className="h-8 px-2.5 text-[13px] rounded-lg border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:opacity-50 min-w-0 w-32"
      />
      {/* 저장 */}
      <button
        onClick={handleConfirm}
        disabled={isSaving}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white bg-[#111827] hover:bg-[#374151] disabled:opacity-50 transition-colors"
        aria-label="저장"
      >
        {isSaving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Check className="w-3.5 h-3.5" />
        )}
      </button>
      {/* 취소 */}
      <button
        onClick={handleCancel}
        disabled={isSaving}
        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] disabled:opacity-50 transition-colors"
        aria-label="취소"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {/* 삭제 — initialAlias 있을 때만 */}
      {initialAlias && (
        <button
          onClick={handleDelete}
          disabled={isSaving}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[#EF4444] hover:bg-red-50 disabled:opacity-50 transition-colors"
          aria-label="별명 삭제"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
