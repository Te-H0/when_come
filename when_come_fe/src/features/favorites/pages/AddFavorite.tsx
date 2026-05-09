import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import UnifiedStopPicker from '@/features/stop-picker/UnifiedStopPicker'
import type { PickerPayload } from '@/features/stop-picker/UnifiedStopPicker'
import { getStopBuses, createFavoriteStop } from '@/lib/api'
import { getJwt } from '@/lib/supabase'
import { getBusTypeByOdsay, seoulBisTypeToOdsayBusType } from '@/utils/transitColors'
import { formatStationName } from '@/utils/stationName'
import type { ApiStop, ApiStopBus } from '@/types/api'

// ──────────────────────── 버스 노선 선택 단계 ────────────────────────

interface BusRouteSelectStepProps {
  stop: ApiStop
  selectedRoutes: string[]
  busLines: ApiStopBus[]
  isLoading: boolean
  alias: string
  onToggleRoute: (routeName: string) => void
  onAliasChange: (alias: string) => void
  onSave: () => void
  isSaving: boolean
}

function BusRouteSelectStep({
  stop,
  selectedRoutes,
  busLines,
  isLoading,
  alias,
  onToggleRoute,
  onAliasChange,
  onSave,
  isSaving,
}: BusRouteSelectStepProps) {
  const canSave = selectedRoutes.length > 0 && !isSaving

  return (
    <div className="flex flex-col gap-4">
      {/* 정류장 정보 */}
      <div className="px-1">
        <div className="text-[16px] font-semibold text-[#111827]">{stop.name}</div>
        <div className="text-[13px] text-[#6B7280] mt-0.5">
          버스 정류장
          {stop.arsId && <span className="ml-1.5 font-mono text-[#9CA3AF]">ARS {stop.arsId}</span>}
        </div>
      </div>

      {/* 노선 선택 */}
      <div>
        <p className="text-[14px] font-medium text-[#374151] mb-2">
          이 정류장에서 탑승할 노선을 선택하세요
          <span className="ml-1.5 text-[12px] text-[#9CA3AF] font-normal">(1개 이상 필수)</span>
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-[14px] text-[#9CA3AF]">
            <Loader2 className="w-4 h-4 animate-spin" />
            노선 조회 중...
          </div>
        ) : busLines.length === 0 ? (
          <p className="text-[13px] text-[#9CA3AF] py-2">이 정류장의 노선 정보를 불러올 수 없어요</p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-xl border border-black/10">
            {busLines.map((line) => {
              const busInfo = getBusTypeByOdsay(
                seoulBisTypeToOdsayBusType(line.busRouteType),
                line.routeName,
              )
              const isSelected = selectedRoutes.includes(line.routeName)
              return (
                <button
                  key={line.routeName}
                  onClick={() => onToggleRoute(line.routeName)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-black/5 last:border-0 ${
                    isSelected ? 'bg-[#EFF6FF]' : 'hover:bg-[#F9FAFB]'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border"
                    style={{
                      backgroundColor: isSelected ? busInfo.color : 'transparent',
                      borderColor: isSelected ? busInfo.color : '#D1D5DB',
                    }}
                  >
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M2 5l2.5 2.5 3.5-4"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: busInfo.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-medium text-[#111827]">{line.routeName}번</span>
                      <span className="text-[12px] text-[#9CA3AF]">{busInfo.label}버스</span>
                    </div>
                    {(line.startStation || line.endStation) && (
                      <div className="text-[11px] text-[#9CA3AF] truncate">
                        {line.startStation}
                        {line.startStation && line.endStation ? ' ~ ' : ''}
                        {line.endStation}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 별명 입력 */}
      <div>
        <label className="text-[14px] font-medium text-[#374151] mb-2 block">
          별명 <span className="text-[12px] text-[#9CA3AF] font-normal">(선택사항)</span>
        </label>
        <input
          type="text"
          value={alias}
          onChange={(e) => onAliasChange(e.target.value)}
          placeholder="예: 회사 가는 버스"
          maxLength={20}
          className="w-full h-11 px-3.5 text-[15px] rounded-xl border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </div>

      {/* 저장 버튼 */}
      <Button
        onClick={onSave}
        disabled={!canSave}
        className="w-full h-12 rounded-xl text-[15px] font-medium"
        style={{ backgroundColor: canSave ? '#111827' : '#9CA3AF' }}
      >
        {isSaving ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Check className="w-4 h-4 mr-2" strokeWidth={2.5} />
        )}
        즐겨찾기에 추가
      </Button>
    </div>
  )
}

// ──────────────────────── 지하철 확인 단계 ────────────────────────

interface SubwayConfirmStepProps {
  stop: ApiStop
  direction: { updn: null; nextStop: null }
  alias: string
  onAliasChange: (alias: string) => void
  onSave: () => void
  isSaving: boolean
}

function SubwayConfirmStep({
  stop,
  // direction은 현재 표시에 미사용 (옵션 A: 양방향 표시)
  alias,
  onAliasChange,
  onSave,
  isSaving,
}: SubwayConfirmStepProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* 역 정보 */}
      <div className="px-1">
        <div className="text-[16px] font-semibold text-[#111827]">{formatStationName(stop.name)}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[13px] text-[#6B7280]">{stop.laneName ?? '지하철역'}</span>
          <span className="text-[12px] text-[#6B7280]">이 호선의 양방향 도착 정보가 모두 표시돼요</span>
        </div>
      </div>

      {/* 별명 입력 */}
      <div>
        <label className="text-[14px] font-medium text-[#374151] mb-2 block">
          별명 <span className="text-[12px] text-[#9CA3AF] font-normal">(선택사항)</span>
        </label>
        <input
          type="text"
          value={alias}
          onChange={(e) => onAliasChange(e.target.value)}
          placeholder="예: 출근 지하철"
          maxLength={20}
          className="w-full h-11 px-3.5 text-[15px] rounded-xl border border-black/10 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </div>

      {/* 저장 버튼 */}
      <Button
        onClick={onSave}
        disabled={isSaving}
        className="w-full h-12 rounded-xl text-[15px] font-medium bg-[#111827] hover:bg-[#1F2937]"
      >
        {isSaving ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Check className="w-4 h-4 mr-2" strokeWidth={2.5} />
        )}
        즐겨찾기에 추가
      </Button>
    </div>
  )
}

// ──────────────────────── 메인 페이지 ────────────────────────

type PageStep =
  | { kind: 'picking' }
  | { kind: 'bus-routes'; stop: ApiStop; busLines: ApiStopBus[]; isLoadingLines: boolean }
  | { kind: 'subway-confirm'; stop: ApiStop; direction: { updn: null; nextStop: null } }

export default function AddFavorite() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pageStep, setPageStep] = useState<PageStep>({ kind: 'picking' })
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([])
  const [alias, setAlias] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const busLinesRef = useRef<ApiStopBus[]>([])

  // 버스 노선 로드
  useEffect(() => {
    if (pageStep.kind !== 'bus-routes') return
    if (!pageStep.stop.arsId) return
    let cancelled = false
    const arsId = pageStep.stop.arsId
    setPageStep(prev => prev.kind === 'bus-routes' ? { ...prev, isLoadingLines: true } : prev)
    getStopBuses(arsId)
      .then(lines => {
        if (cancelled) return
        busLinesRef.current = lines
        setPageStep(prev => prev.kind === 'bus-routes' ? { ...prev, busLines: lines, isLoadingLines: false } : prev)
      })
      .catch(() => {
        if (cancelled) return
        setPageStep(prev => prev.kind === 'bus-routes' ? { ...prev, busLines: [], isLoadingLines: false } : prev)
      })
    return () => { cancelled = true }
  // pageStep.kind 변경 시에만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStep.kind === 'bus-routes' ? pageStep.stop.id : null])

  const handlePickerComplete = (payload: PickerPayload) => {
    if (payload.type === 'bus') {
      setPageStep({ kind: 'bus-routes', stop: payload.stop, busLines: [], isLoadingLines: true })
      setSelectedRoutes([])
      setAlias('')
    } else {
      setPageStep({ kind: 'subway-confirm', stop: payload.stop, direction: payload.direction })
      setAlias('')
    }
  }

  const handleToggleRoute = (routeName: string) => {
    setSelectedRoutes(prev =>
      prev.includes(routeName) ? prev.filter(r => r !== routeName) : [...prev, routeName],
    )
  }

  const handleSaveBus = async () => {
    if (pageStep.kind !== 'bus-routes') return
    if (selectedRoutes.length === 0) return
    setIsSaving(true)
    try {
      const jwt = await getJwt()
      if (!jwt) throw new Error('로그인이 필요합니다')
      const stop = pageStep.stop
      const routes = selectedRoutes.map(routeName => {
        const line = busLinesRef.current.find(l => l.routeName === routeName)
        return {
          odsayRouteId: line?.busRouteId ?? routeName,
          routeName,
          busType: line ? seoulBisTypeToOdsayBusType(line.busRouteType) : null,
          stId: null,
          busRouteId: line?.busRouteId ?? null,
          stationName: stop.name,
        }
      })
      await createFavoriteStop(
        {
          odsayStopId: stop.id,
          stopName: stop.name,
          stopType: 'bus',
          arsId: stop.arsId ?? null,
          lat: stop.lat ?? null,
          lng: stop.lng ?? null,
          alias: alias.trim() || null,
          routes,
        },
        jwt,
      )
      queryClient.invalidateQueries({ queryKey: ['favorite-stops'] })
      toast.success('즐겨찾기에 추가됐어요')
      navigate('/favorites')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했어요')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveSubway = async () => {
    if (pageStep.kind !== 'subway-confirm') return
    setIsSaving(true)
    try {
      const jwt = await getJwt()
      if (!jwt) throw new Error('로그인이 필요합니다')
      const stop = pageStep.stop
      const dir = pageStep.direction
      // 호선 이름 = stop.laneName (검색 결과에서 이미 포함됨)
      const lineName = stop.laneName ?? stop.name
      await createFavoriteStop(
        {
          odsayStopId: stop.id,
          stopName: stop.name,
          stopType: 'subway',
          arsId: null,
          lat: stop.lat ?? null,
          lng: stop.lng ?? null,
          directionHeadsign: null, // D11: 저장 안 함
          directionUpdn: dir.updn,
          directionNextStop: dir.nextStop || null,
          alias: alias.trim() || null,
          routes: [
            {
              odsayRouteId: stop.id,
              routeName: lineName,
              busType: null,
              // ODsay search-stops 응답의 stop 단위 subwayCode 복사
              subwayCode: stop.subwayCode ?? null,
            },
          ],
        },
        jwt,
      )
      queryClient.invalidateQueries({ queryKey: ['favorite-stops'] })
      toast.success('즐겨찾기에 추가됐어요')
      navigate('/favorites')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했어요')
    } finally {
      setIsSaving(false)
    }
  }

  const handleBack = () => {
    if (pageStep.kind === 'picking') {
      navigate(-1)
    } else {
      setPageStep({ kind: 'picking' })
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      {/* 헤더 */}
      <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-10 border-b border-black/5">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={handleBack}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
            aria-label="뒤로"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2} />
          </button>
          <h1 className="text-[17px] font-semibold text-[#111827]">즐겨찾기 추가</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 pb-24">
        <Card className="p-4 rounded-2xl border border-black/5 shadow-sm bg-white">
          {pageStep.kind === 'picking' && (
            <UnifiedStopPicker
              onComplete={handlePickerComplete}
              onCancel={() => navigate(-1)}
            />
          )}

          {pageStep.kind === 'bus-routes' && (
            <BusRouteSelectStep
              stop={pageStep.stop}
              selectedRoutes={selectedRoutes}
              busLines={pageStep.busLines}
              isLoading={pageStep.isLoadingLines}
              alias={alias}
              onToggleRoute={handleToggleRoute}
              onAliasChange={setAlias}
              onSave={handleSaveBus}
              isSaving={isSaving}
            />
          )}

          {pageStep.kind === 'subway-confirm' && (
            <SubwayConfirmStep
              stop={pageStep.stop}
              direction={pageStep.direction}
              alias={alias}
              onAliasChange={setAlias}
              onSave={handleSaveSubway}
              isSaving={isSaving}
            />
          )}
        </Card>
      </div>
    </div>
  )
}
