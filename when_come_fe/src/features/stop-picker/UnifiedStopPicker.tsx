import { useState, useRef, useEffect } from 'react'
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // ── 검색 ──
  const handleInput = (text: string) => {
    setQuery(text)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!text.trim()) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
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
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
          aria-label="뒤로"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-[13px] font-medium text-[#6B7280]">
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
  onClear: () => void
  onSelect: (stop: ApiStop) => void
}

function SearchStep({
  query,
  results,
  isSearching,
  onInput,
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
          placeholder="정류장 또는 역 이름 입력"
          className="w-full h-11 pl-3.5 pr-10 text-[15px] rounded-xl border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
        {isSearching ? (
          <Loader2 className="absolute right-3 top-3 w-5 h-5 text-[#9CA3AF] animate-spin" />
        ) : query ? (
          <button
            onClick={onClear}
            className="absolute right-3 top-3 text-[#9CA3AF] hover:text-[#6B7280]"
            aria-label="지우기"
          >
            <X className="w-5 h-5" />
          </button>
        ) : null}
      </div>

      {results.length > 0 && (
        <div className="rounded-xl border border-black/5 shadow-sm overflow-hidden max-h-64 overflow-y-auto bg-white">
          {results.map((stop) => (
            <button
              key={stop.id}
              onClick={() => onSelect(stop)}
              className="w-full px-4 py-3 text-left hover:bg-[#F9FAFB] transition-colors flex items-center justify-between border-b border-black/5 last:border-0"
            >
              <div>
                <div className="text-[14px] font-medium text-[#111827]">{stop.name}</div>
                <div className="text-[12px] text-[#6B7280]">
                  {stop.type === 'bus' ? '버스 정류장' : stop.laneName ?? '지하철역'}
                </div>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-[#F1F3F5] text-[#6B7280]">
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
      <p className="text-[13px] text-[#6B7280]">이용할 호선을 선택하세요</p>
      <div className="flex flex-wrap gap-2">
        {candidates.map((stop) => (
          <button
            key={stop.id}
            onClick={() => onSelect(stop)}
            className="px-3.5 py-2 rounded-xl border border-black/10 text-[13px] font-medium text-[#374151] bg-white hover:bg-[#F3F4F6] transition-colors"
          >
            {stop.laneName ?? stop.name}
          </button>
        ))}
      </div>
    </div>
  )
}
