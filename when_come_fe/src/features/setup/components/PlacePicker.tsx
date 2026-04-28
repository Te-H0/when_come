import { useState, useEffect, useRef } from 'react'
import { Loader2, X, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchPlaces } from '@/lib/api'
import type { ApiPlace } from '@/types/api'

interface PlacePickerProps {
  label: string
  placeholder: string
  value: ApiPlace | null
  onChange: (place: ApiPlace | null) => void
}

export default function PlacePicker({ label, placeholder, value, onChange }: PlacePickerProps) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [results, setResults] = useState<ApiPlace[]>([])
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
        const data = await searchPlaces(text)
        setResults(data.slice(0, 8))
      } catch {
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 300)
  }

  const handleSelect = (place: ApiPlace) => {
    setQuery(place.name)
    setResults([])
    onChange(place)
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
          {results.map((place, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(place)}
              className="w-full px-4 py-3 text-left hover:bg-[#F9FAFB] transition-colors flex items-start gap-3 border-b border-black/5 last:border-0"
            >
              <MapPin className="w-4 h-4 text-[#9CA3AF] mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[14px] font-medium text-[#111827]">{place.name}</div>
                <div className="text-[12px] text-[#6B7280]">{place.address}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
