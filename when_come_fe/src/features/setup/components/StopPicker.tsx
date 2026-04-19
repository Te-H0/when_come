import { useState, useEffect, useRef } from 'react'
import { Loader2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchStops } from '@/lib/api'
import type { ApiStop } from '@/types/api'

interface StopPickerProps {
  label: string
  placeholder: string
  value: ApiStop | null
  onChange: (stop: ApiStop | null) => void
}

export default function StopPicker({ label, placeholder, value, onChange }: StopPickerProps) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [results, setResults] = useState<ApiStop[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value) setQuery(value.name)
  }, [value])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleInput = (text: string) => {
    setQuery(text)
    onChange(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!text.trim()) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const data = await searchStops(text)
        setResults(data.slice(0, 8))
      } catch {
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 300)
  }

  const handleSelect = (stop: ApiStop) => {
    setQuery(stop.name)
    setResults([])
    onChange(stop)
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    onChange(null)
  }

  return (
    <div className="relative">
      <Label className="text-[14px] font-medium text-[#111827] mb-2 block">{label}</Label>
      <div className="relative">
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          className="rounded-xl border-black/5 h-11 text-[15px] pr-10"
        />
        {isLoading ? (
          <Loader2 className="absolute right-3 top-3 w-5 h-5 text-[#9CA3AF] animate-spin" />
        ) : value ? (
          <button onClick={handleClear} className="absolute right-3 top-3 text-[#9CA3AF] hover:text-[#6B7280]">
            <X className="w-5 h-5" />
          </button>
        ) : null}
      </div>
      {results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 top-[calc(100%+4px)] bg-white rounded-xl border border-black/5 shadow-md overflow-hidden max-h-60 overflow-y-auto">
          {results.map(stop => (
            <button
              key={stop.id}
              onClick={() => handleSelect(stop)}
              className="w-full px-4 py-3 text-left hover:bg-[#F9FAFB] transition-colors flex items-center justify-between border-b border-black/5 last:border-0"
            >
              <div>
                <div className="text-[14px] font-medium text-[#111827]">{stop.name}</div>
                <div className="text-[12px] text-[#6B7280]">
                  {stop.type === 'bus' ? '버스 정류장' : '지하철역'}
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
