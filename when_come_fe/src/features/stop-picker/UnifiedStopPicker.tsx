import React, { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Loader2, X } from 'lucide-react'
import { searchStops } from '@/lib/api'
import type { ApiStop } from '@/types/api'

// ──────────────────────── Types ────────────────────────

export type PickerPayload =
  | {
      type: 'bus'
      stop: ApiStop
    }
  | {
      type: 'subway'
      stop: ApiStop
      /** 항상 null — 옵션 A: 방향 선택 제거, 양방향 모두 표시 */
      direction: { updn: null; nextStop: null }
    }

interface UnifiedStopPickerProps {
  onComplete: (payload: PickerPayload) => void
  onCancel?: () => void
}

// ──────────────────────── State Machine ────────────────────────

type PickerStep =
  | { kind: 'searching' }
  | { kind: 'lineSelecting'; stop: ApiStop; candidates: ApiStop[] }

// ──────────────────────── Component ────────────────────────

export default function UnifiedStopPicker({ onComplete, onCancel }: UnifiedStopPickerProps) {
  const [step, setStep] = useState<PickerStep>({ kind: 'searching' })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiStop[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 한글 IME composition 진행 중에는 API 호출 대기 — "강+"/"강나" 단계마다 검색 발사 방지.
  const isComposingRef = useRef(false)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const scheduleSearch = (text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!text.trim()) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      // composition 중이면 다음 사이클까지 대기 (compositionend가 다시 트리거)
      if (isComposingRef.current) return
      setIsSearching(true)
      try {
        const data = await searchStops(text)
        setResults(data.slice(0, 20))
      } catch {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }

  // ── 검색 ──
  const handleInput = (text: string) => {
    setQuery(text)
    scheduleSearch(text)
  }

  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false
    // composition 끝난 시점의 완성형 텍스트로 검색
    scheduleSearch(e.currentTarget.value)
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
  }

  // ── 결과에서 정류장 선택 ──
  const handleSelectStop = (stop: ApiStop) => {
    if (stop.type === 'bus') {
      onComplete({ type: 'bus', stop })
      return
    }

    // 지하철 — 같은 stationName 그룹에서 호선 후보 추출
    const sameName = results.filter(
      (r) => r.type === 'subway' && r.name === stop.name,
    )

    // 단일 호선이면 호선 선택 스킵 → 즉시 완료
    if (sameName.length <= 1) {
      onComplete({ type: 'subway', stop, direction: { updn: null, nextStop: null } })
    } else {
      setStep({ kind: 'lineSelecting', stop, candidates: sameName })
    }
  }

  // ── 호선 선택 → 즉시 완료 (방향 선택 없음) ──
  const handleSelectLine = (lineStop: ApiStop) => {
    onComplete({ type: 'subway', stop: lineStop, direction: { updn: null, nextStop: null } })
  }

  // ── 뒤로가기 ──
  const handleBack = () => {
    if (step.kind === 'lineSelecting') {
      setStep({ kind: 'searching' })
    } else {
      onCancel?.()
    }
  }

  // ──────────────────────── Render ────────────────────────

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 행 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleBack}
          className="inline-flex items-center justify-center w-8 h-8 rounded-chip text-text-secondary hover:bg-surface-muted transition-colors"
          aria-label="뒤로"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-caption font-medium text-text-secondary">
          {step.kind === 'searching' && '정류장/역 검색'}
          {step.kind === 'lineSelecting' && '호선 선택'}
        </span>
      </div>

      {/* 검색 단계 */}
      {step.kind === 'searching' && (
        <SearchStep
          query={query}
          results={results}
          isSearching={isSearching}
          onInput={handleInput}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onClear={handleClear}
          onSelect={handleSelectStop}
        />
      )}

      {/* 호선 선택 단계 */}
      {step.kind === 'lineSelecting' && (
        <LineSelectStep
          candidates={step.candidates}
          onSelect={handleSelectLine}
        />
      )}
    </div>
  )
}

// ──────────────────────── Sub-components ────────────────────────

interface SearchStepProps {
  query: string
  results: ApiStop[]
  isSearching: boolean
  onInput: (text: string) => void
  onCompositionStart: () => void
  onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>) => void
  onClear: () => void
  onSelect: (stop: ApiStop) => void
}

function SearchStep({
  query,
  results,
  isSearching,
  onInput,
  onCompositionStart,
  onCompositionEnd,
  onClear,
  onSelect,
}: SearchStepProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => onInput(e.target.value)}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          placeholder="정류장 또는 역 이름 입력"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full h-11 pl-3.5 pr-10 rounded-control border border-border-default bg-surface-card focus:outline-none focus:ring-2 focus:ring-ring-focus focus:border-border-focus"
          style={{ fontSize: '16px' }}
        />
        {isSearching ? (
          <Loader2 className="absolute right-3 top-3 w-5 h-5 text-text-tertiary animate-spin" />
        ) : query ? (
          <button
            onClick={onClear}
            className="absolute right-3 top-3 text-text-tertiary hover:text-text-secondary"
            aria-label="지우기"
          >
            <X className="w-5 h-5" />
          </button>
        ) : null}
      </div>

      {results.length > 0 && (
        <div className="rounded-control border border-border-subtle shadow-card overflow-hidden max-h-64 overflow-y-auto bg-surface-card">
          {results.map((stop) => (
            <button
              key={stop.id}
              onClick={() => onSelect(stop)}
              className="w-full px-4 py-3 text-left hover:bg-surface-input transition-colors flex items-center justify-between gap-3 border-b border-border-subtle last:border-0"
            >
              <div className="min-w-0">
                <div className="text-label font-medium text-text-primary truncate">{stop.name}</div>
                <div className="text-caption text-text-secondary flex items-center gap-1.5 flex-wrap">
                  <span>{stop.type === 'bus' ? '버스 정류장' : stop.laneName ?? '지하철역'}</span>
                  {stop.type === 'bus' && stop.arsId && (
                    <span className="font-mono text-text-tertiary">ARS {stop.arsId}</span>
                  )}
                </div>
              </div>
              <span className="text-caption px-2 py-0.5 rounded-chip bg-surface-muted text-text-secondary flex-shrink-0">
                {stop.type === 'bus' ? '버스' : '지하철'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface LineSelectStepProps {
  candidates: ApiStop[]
  onSelect: (stop: ApiStop) => void
}

function LineSelectStep({ candidates, onSelect }: LineSelectStepProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-text-secondary">이용할 호선을 선택하세요</p>
      <div className="flex flex-wrap gap-2">
        {candidates.map((stop) => (
          <button
            key={stop.id}
            onClick={() => onSelect(stop)}
            className="px-3.5 py-2 rounded-control border border-border-default text-caption font-medium text-text-primary bg-surface-card hover:bg-surface-muted transition-colors"
          >
            {stop.laneName ?? stop.name}
          </button>
        ))}
      </div>
    </div>
  )
}
