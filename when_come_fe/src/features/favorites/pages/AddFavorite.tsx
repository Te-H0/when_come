import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { showApiErrorToast } from '@/lib/errorToast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import PageShell from '@/components/PageShell'
import PageHeader from '@/components/PageHeader'
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
        <div className="text-section font-semibold text-text-primary">{stop.name}</div>
        <div className="text-caption text-text-secondary mt-0.5">
          버스 정류장
          {stop.arsId && <span className="ml-1.5 font-mono text-text-tertiary">ARS {stop.arsId}</span>}
        </div>
      </div>

      {/* 노선 선택 */}
      <div>
        <p className="text-label font-medium text-text-primary mb-2">
          이 정류장에서 탑승할 노선을 선택하세요
          <span className="ml-1.5 text-caption text-text-tertiary font-normal">(1개 이상 필수)</span>
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-label text-text-tertiary">
            <Loader2 className="w-4 h-4 animate-spin" />
            노선 조회 중...
          </div>
        ) : busLines.length === 0 ? (
          <p className="text-caption text-text-tertiary py-2">이 정류장의 노선 정보를 불러올 수 없어요</p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-control border border-border-default">
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
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border-subtle last:border-0 ${
                    isSelected ? 'bg-surface-info-soft' : 'hover:bg-surface-input'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border"
                    style={{
                      backgroundColor: isSelected ? busInfo.color : 'transparent',
                      borderColor: isSelected ? busInfo.color : 'var(--border-default)',
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
                      <span className="text-label font-medium text-text-primary">{line.routeName}번</span>
                      <span className="text-caption text-text-tertiary">{busInfo.label}버스</span>
                    </div>
                    {(line.startStation || line.endStation) && (
                      <div className="text-caption text-text-tertiary truncate">
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
        <label className="text-label font-medium text-text-primary mb-2 block">
          별명 <span className="text-caption text-text-tertiary font-normal">(선택사항)</span>
        </label>
        <input
          type="text"
          value={alias}
          onChange={(e) => onAliasChange(e.target.value)}
          placeholder="예: 회사 가는 버스"
          maxLength={20}
          className="w-full h-11 px-3.5 rounded-control border border-border-default bg-surface-card focus:outline-none focus:ring-2 focus:ring-ring-focus focus:border-border-focus"
          style={{ fontSize: '16px' }}
        />
      </div>

      {/* 저장 버튼 */}
      <Button
        onClick={onSave}
        disabled={!canSave}
        className="w-full h-12 rounded-control text-body font-medium text-white"
        style={{ backgroundColor: canSave ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
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
        <div className="text-section font-semibold text-text-primary">{formatStationName(stop.name)}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-caption text-text-secondary">{stop.laneName ?? '지하철역'}</span>
          <span className="text-caption text-text-secondary">이 호선의 양방향 도착 정보가 모두 표시돼요</span>
        </div>
      </div>

      {/* 별명 입력 */}
      <div>
        <label className="text-label font-medium text-text-primary mb-2 block">
          별명 <span className="text-caption text-text-tertiary font-normal">(선택사항)</span>
        </label>
        <input
          type="text"
          value={alias}
          onChange={(e) => onAliasChange(e.target.value)}
          placeholder="예: 출근 지하철"
          maxLength={20}
          className="w-full h-11 px-3.5 rounded-control border border-border-default bg-surface-card focus:outline-none focus:ring-2 focus:ring-ring-focus focus:border-border-focus"
          style={{ fontSize: '16px' }}
        />
      </div>

      {/* 저장 버튼 */}
      <Button
        onClick={onSave}
        disabled={isSaving}
        className="w-full h-12 rounded-control text-body font-medium bg-text-primary hover:bg-text-primary/90 text-white"
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
  const savingLockRef = useRef(false)
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
    if (savingLockRef.current) return
    savingLockRef.current = true
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
      showApiErrorToast(e, '저장에 실패했어요')
    } finally {
      setIsSaving(false)
      savingLockRef.current = false
    }
  }

  const handleSaveSubway = async () => {
    if (pageStep.kind !== 'subway-confirm') return
    if (savingLockRef.current) return
    savingLockRef.current = true
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
      showApiErrorToast(e, '저장에 실패했어요')
    } finally {
      setIsSaving(false)
      savingLockRef.current = false
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
    <PageShell>
      <PageHeader back={handleBack} title="즐겨찾기 추가" />

      <div className="max-w-[var(--page-max-width)] mx-auto px-[var(--page-padding-x)] pt-4">
        <Card className="p-4 rounded-card border border-border-subtle shadow-card bg-surface-card">
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
    </PageShell>
  )
}
