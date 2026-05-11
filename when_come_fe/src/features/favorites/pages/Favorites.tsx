import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { showApiErrorToast } from '@/lib/errorToast'
import { Plus, Star, RefreshCw, MoreVertical, Loader2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import PageShell from '@/components/PageShell'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import StopName from '@/components/StopName'
import AliasEditor from '@/components/AliasEditor'
import { listFavoriteStops, updateFavoriteStop, deleteFavoriteStop } from '@/lib/api'
import { getJwt } from '@/lib/supabase'
import { mapApiFavoriteStopToTransitStop } from '@/lib/mappers'
import { fetchArrival, getArrivalDisplay, getArrivalDisplay2, getArrivalMin, applyCountdownToArrmsg, getMatchedSubwayItems, groupSubwayItemsByDirection, formatTrainTypeShort } from '@/lib/arrival'
import type { ArrivalData } from '@/lib/arrival'
import { ApiError } from '@/lib/api'
import { usePageVisibility } from '@/lib/usePageVisibility'
import { ArrivalText, splitArrival } from '@/utils/arrivalDisplay'
import { getBusTypeByOdsay, getSubwayColor, normalizeSubwayLineName } from '@/utils/transitColors'
import type { ApiFavoriteStop } from '@/types/api'
import type { TransitStop } from '@/lib/mockData'

// ──────────────────────── 즐겨찾기 카드 ────────────────────────

interface FavoriteCardProps {
  fav: ApiFavoriteStop
  stop: TransitStop
  arrivalData: ArrivalData
  isArrivalLoading: boolean
  elapsedSec: number
  onUpdateAlias: (alias: string | null) => Promise<void>
  onDelete: () => void
}

function FavoriteCard({
  fav,
  stop,
  arrivalData,
  isArrivalLoading,
  elapsedSec,
  onUpdateAlias,
  onDelete,
}: FavoriteCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({})
  const menuRef = useRef<HTMLDivElement>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fav.id })

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!showMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  const handleDelete = () => {
    setShowMenu(false)
    onDelete()
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="transition-opacity duration-fast"
    >
    <Card className="rounded-card border border-border-subtle shadow-card bg-surface-card overflow-hidden">
      {/* 카드 헤더: 정류장명 + 별명 편집 + 메뉴 */}
      <div className="px-4 py-3 border-b border-border-subtle flex items-start justify-between gap-2">
        {/* 드래그 핸들 — listeners만 핸들에 부착, 카드 본문 클릭은 영향 없음 */}
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="flex-shrink-0 mt-0.5 p-1 -ml-1 rounded-control text-text-disabled hover:text-text-tertiary hover:bg-surface-muted transition-colors cursor-grab active:cursor-grabbing touch-none"
          aria-label="순서 변경"
        >
          <GripVertical className="w-4 h-4" strokeWidth={2} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StopName name={stop.displayName} alias={fav.alias ?? undefined} size="md" />
          </div>
          {stop.type === 'bus' && stop.arsId && (
            <div className="text-caption font-mono mt-0.5 text-text-tertiary">ARS {stop.arsId}</div>
          )}
          {stop.type === 'subway' && fav.direction_updn && fav.direction_next_stop && (
            <div className="text-caption text-text-secondary mt-0.5">
              {fav.direction_next_stop} 방향
            </div>
          )}
          {stop.type === 'bus'
            && arrivalData?.type === 'bus_by_stopid'
            && arrivalData.data.provider === 'odsay_fallback' && (
            <div className="text-caption mt-0.5 text-text-tertiary">
              도착 정보가 부정확할 수 있어요 (제휴 데이터 사용)
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <AliasEditor
            initialAlias={fav.alias}
            onSave={onUpdateAlias}
          />
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(v => !v)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-control text-text-tertiary hover:text-text-secondary hover:bg-surface-muted transition-colors"
              aria-label="메뉴"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 z-20 bg-surface-card rounded-card border border-border-default shadow-floating w-32 overflow-hidden">
                <button
                  onClick={handleDelete}
                  className="w-full px-4 py-2.5 text-left text-body text-text-danger hover:bg-surface-danger-soft transition-colors"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 노선별 도착 정보 */}
      <div className="divide-y divide-border-subtle">
        {stop.lines.length === 0 ? (
          <div className="px-4 py-3 text-label text-text-tertiary">노선 정보 없음</div>
        ) : (
          stop.lines.map((line) => {
            const isSubway = stop.type === 'subway'
            const displayLine = isSubway ? normalizeSubwayLineName(line) : line
            const stopRoute = stop.stopRoutes?.find(r => r.routeName === line)
            const busTypeInfo = !isSubway ? getBusTypeByOdsay(stopRoute?.busType, line) : null
            const subwayColorInfo = isSubway ? getSubwayColor(displayLine) : null
            const lineKey = `${fav.id}-${line}`

            // 지하철이고 방향 NULL → 양방향 분리 UI 적용
            const isBidirectional = isSubway && !fav.direction_updn
            const matchedSubwayItems = isSubway ? getMatchedSubwayItems(stop, line, arrivalData) : []

            if (isBidirectional) {
              // 양방향 분리 UI — updnLine 기준으로 up/down 그룹핑, 좌우 2열 그리드
              const grouped = groupSubwayItemsByDirection(matchedSubwayItems)
              const allEmpty = grouped.up.length === 0 && grouped.down.length === 0 && grouped.other.length === 0

              // 좌우 2열에 배치할 그룹 (up + down, other는 별도 처리)
              const leftItems = grouped.up.length > 0 ? grouped.up : grouped.other.slice(0, Math.ceil(grouped.other.length / 2))
              const rightItems = grouped.down.length > 0 ? grouped.down : grouped.up.length > 0 ? [] : grouped.other.slice(Math.ceil(grouped.other.length / 2))

              return (
                <div key={line} className="px-4 py-3 hover:bg-surface-input transition-colors">
                  {/* 호선 헤더 */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-control bg-surface-input flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={subwayColorInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 12h0"/><path d="M9.75 9.75h4.5"/><path d="M7 15h10"/>
                        <rect x="5" y="4" width="14" height="16" rx="2"/>
                        <path d="M8 20l-2 2"/><path d="M16 20l2 2"/>
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="text-body font-semibold text-text-primary">{displayLine}</div>
                      <div className="text-caption text-text-secondary">전철</div>
                    </div>
                  </div>

                  {/* 방향별 좌우 분리 표시 */}
                  {isArrivalLoading ? (
                    <div className="flex items-center gap-1.5 ml-[52px]">
                      <Loader2 className="w-3.5 h-3.5 text-text-tertiary animate-spin" />
                      <span className="text-label text-text-tertiary">조회 중...</span>
                    </div>
                  ) : allEmpty ? (
                    <div className="ml-[52px] text-label text-text-tertiary">도착 정보 없음</div>
                  ) : (
                    <div className="ml-[52px] grid grid-cols-2 gap-0 divide-x divide-border-subtle">
                      {/* 왼쪽 열 — 상행 */}
                      <div className="pr-3 space-y-1">
                        {leftItems.slice(0, 2).map((item, itemIdx) => {
                          const rawMsg = item.displayMsg ?? item.arrmsg1
                          const msg = item.displayMsg ? rawMsg : applyCountdownToArrmsg(rawMsg, elapsedSec, 'subway')
                          const { time: timeOnly } = splitArrival(msg)
                          const minVal = item.displayMsg != null ? 0 : (rawMsg.match(/(\d+)분/) ? parseInt(rawMsg.match(/(\d+)분/)![1]) : null)
                          const isUrgentItem = minVal !== null && minVal < 3
                          const isSecondRow = itemIdx === 1
                          const itemTrainType = formatTrainTypeShort(item.trainType)
                          return (
                            <div key={itemIdx} className="flex items-baseline gap-1.5 min-w-0">
                              {(itemTrainType || item.headsign) && (
                                <span className={`${isSecondRow ? 'text-caption' : 'text-caption'} text-text-tertiary shrink-0`}>
                                  {itemTrainType && `(${itemTrainType})`}{item.headsign && `${item.headsign}행`}
                                </span>
                              )}
                              <span className={`${isSecondRow ? 'text-caption font-medium' : 'text-body font-bold'} tabular-nums leading-tight ${itemIdx === 0 && isUrgentItem ? 'text-arrival-urgent' : itemIdx === 0 ? 'text-arrival-normal' : 'text-arrival-muted'}`}>
                                {timeOnly}
                              </span>
                            </div>
                          )
                        })}
                        {leftItems.length === 0 && (
                          <div className="text-caption text-arrival-empty">정보 없음</div>
                        )}
                      </div>
                      {/* 오른쪽 열 — 하행 */}
                      <div className="pl-3 space-y-1">
                        {rightItems.slice(0, 2).map((item, itemIdx) => {
                          const rawMsg = item.displayMsg ?? item.arrmsg1
                          const msg = item.displayMsg ? rawMsg : applyCountdownToArrmsg(rawMsg, elapsedSec, 'subway')
                          const { time: timeOnly } = splitArrival(msg)
                          const minVal = item.displayMsg != null ? 0 : (rawMsg.match(/(\d+)분/) ? parseInt(rawMsg.match(/(\d+)분/)![1]) : null)
                          const isUrgentItem = minVal !== null && minVal < 3
                          const isSecondRow = itemIdx === 1
                          const itemTrainType = formatTrainTypeShort(item.trainType)
                          return (
                            <div key={itemIdx} className="flex items-baseline gap-1.5 min-w-0">
                              {(itemTrainType || item.headsign) && (
                                <span className={`${isSecondRow ? 'text-caption' : 'text-caption'} text-text-tertiary shrink-0`}>
                                  {itemTrainType && `(${itemTrainType})`}{item.headsign && `${item.headsign}행`}
                                </span>
                              )}
                              <span className={`${isSecondRow ? 'text-caption font-medium' : 'text-body font-bold'} tabular-nums leading-tight ${itemIdx === 0 && isUrgentItem ? 'text-arrival-urgent' : itemIdx === 0 ? 'text-arrival-normal' : 'text-arrival-muted'}`}>
                                {timeOnly}
                              </span>
                            </div>
                          )
                        })}
                        {rightItems.length === 0 && (
                          <div className="text-caption text-arrival-empty">정보 없음</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            }

            // 단방향 또는 버스 — 기존 흐름
            const transitMode = isSubway ? 'subway' : 'bus'
            const rawMsg1 = getArrivalDisplay(stop, line, arrivalData)
            const rawMsg2 = getArrivalDisplay2(stop, line, arrivalData)
            const arrivalText = rawMsg1 !== '--' ? applyCountdownToArrmsg(rawMsg1, elapsedSec, transitMode) : '--'
            const arrivalText2 = rawMsg2 ? applyCountdownToArrmsg(rawMsg2, elapsedSec, transitMode) : null
            const baseMin = getArrivalMin(stop, line, arrivalData)
            const remainSec = baseMin !== null ? Math.max(0, baseMin * 60 - elapsedSec) : null
            const isUrgent = remainSec !== null && remainSec < 180
            const noService = arrivalData !== null && arrivalText === '--'

            const { time: arrivalTimeOnly, stops: stopsBefore } = splitArrival(arrivalText)
            const { time: arrivalTimeOnly2, stops: stopsBefore2 } = splitArrival(arrivalText2)

            const item1Headsign = isSubway && matchedSubwayItems[0]?.headsign ? matchedSubwayItems[0].headsign : null
            const item2Headsign = isSubway && matchedSubwayItems[1]?.headsign ? matchedSubwayItems[1].headsign : null
            const item1TrainType = isSubway ? formatTrainTypeShort(matchedSubwayItems[0]?.trainType) : null
            const item2TrainType = isSubway ? formatTrainTypeShort(matchedSubwayItems[1]?.trainType) : null
            const hasMoreItems = isSubway && matchedSubwayItems.length > 2
            const isLineExpanded = expandedLines[lineKey] ?? false
            const extraItems = hasMoreItems && isLineExpanded ? matchedSubwayItems.slice(2) : []

            return (
              <div key={line} className="px-4 py-3 hover:bg-surface-input transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {isSubway ? (
                      <div className="w-9 h-9 rounded-control bg-surface-input flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={subwayColorInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 12h0"/><path d="M9.75 9.75h4.5"/><path d="M7 15h10"/>
                          <rect x="5" y="4" width="14" height="16" rx="2"/>
                          <path d="M8 20l-2 2"/><path d="M16 20l2 2"/>
                        </svg>
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-control bg-surface-input flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={busTypeInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>
                          <path d="m18 18 3-3-3-3"/>
                          <path d="M3 6h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2"/>
                          <circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-body font-semibold text-text-primary">
                        {isSubway ? displayLine : `${line}번`}
                      </div>
                      <div className="text-caption text-text-secondary">
                        {isSubway ? '전철' : (busTypeInfo?.label ?? '') + '버스'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 flex-shrink-0">
                    <div className="text-right space-y-1">
                      {isArrivalLoading ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          <Loader2 className="w-3.5 h-3.5 text-text-tertiary animate-spin" />
                          <span className="text-body text-text-tertiary">조회 중...</span>
                        </div>
                      ) : noService ? (
                        <span className="text-label text-arrival-muted">도착 정보 없음</span>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-1.5 justify-end">
                            {(item1TrainType || item1Headsign) && (
                              <span className="text-caption text-text-secondary whitespace-nowrap">
                                {item1TrainType && `(${item1TrainType})`}{item1Headsign && `${item1Headsign}행`}
                              </span>
                            )}
                            <ArrivalText
                              msg={arrivalTimeOnly}
                              className={`text-section font-bold tabular-nums whitespace-nowrap ${isUrgent ? 'text-arrival-urgent' : 'text-arrival-normal'}`}
                            />
                            {stopsBefore && (
                              <span className="text-caption text-text-tertiary whitespace-nowrap">{stopsBefore}</span>
                            )}
                          </div>
                          {arrivalText2 && (
                            <div className="flex items-baseline gap-1.5 justify-end">
                              {(item2TrainType || item2Headsign) && (
                                <span className="text-caption text-arrival-muted whitespace-nowrap">
                                  {item2TrainType && `(${item2TrainType})`}{item2Headsign && `${item2Headsign}행`}
                                </span>
                              )}
                              <span className="text-label text-arrival-muted tabular-nums whitespace-nowrap">{arrivalTimeOnly2}</span>
                              {stopsBefore2 && (
                                <span className="text-caption text-text-tertiary whitespace-nowrap">{stopsBefore2}</span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {hasMoreItems && (
                      <button
                        onClick={() => setExpandedLines(prev => ({ ...prev, [lineKey]: !prev[lineKey] }))}
                        className="mt-0.5 p-1 rounded-control hover:bg-surface-muted transition-colors"
                        aria-label={isLineExpanded ? '접기' : '더 보기'}
                      >
                        {isLineExpanded ? (
                          <ChevronUp className="w-4 h-4 text-text-tertiary" strokeWidth={2} />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-text-tertiary" strokeWidth={2} />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {extraItems.length > 0 && (
                  <div className="mt-2 ml-[52px] space-y-1">
                    {extraItems.map((item, idx) => {
                      const label = idx === 0 ? '3번째' : `${idx + 3}번째`
                      const rawMsg = item.displayMsg ?? item.arrmsg1
                      const msg = item.displayMsg ? rawMsg : applyCountdownToArrmsg(rawMsg, elapsedSec, 'subway')
                      const itemTrainType = formatTrainTypeShort(item.trainType)
                      return (
                        <div key={`${lineKey}-extra-${idx}`} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-caption text-text-tertiary whitespace-nowrap">{label}</span>
                            {(itemTrainType || item.headsign) && (
                              <span className="text-caption text-text-secondary truncate">
                                {itemTrainType && `(${itemTrainType})`}{item.headsign && `${item.headsign}행`}
                              </span>
                            )}
                          </div>
                          <span className="text-caption text-arrival-muted tabular-nums whitespace-nowrap">{msg}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </Card>
    </div>
  )
}

// ──────────────────────── 메인 페이지 ────────────────────────

export default function Favorites() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [, forceUpdate] = useState(0)
  const isPageVisible = usePageVisibility()

  // 1초마다 카운트다운 리렌더링. 화면 안 보일 때 정지.
  useEffect(() => {
    if (!isPageVisible) return
    const id = setInterval(() => forceUpdate(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [isPageVisible])

  const { data: favData, isLoading, isError, refetch } = useQuery({
    queryKey: ['favorite-stops'],
    queryFn: async () => {
      const jwt = await getJwt()
      if (!jwt) throw new Error('인증 실패')
      return listFavoriteStops(jwt)
    },
    staleTime: 1000 * 60 * 5,
  })

  const favorites = favData ?? []

  // 카드 정렬 로컬 상태 (드래그 중 optimistic 순서 유지)
  const [cardOrder, setCardOrder] = useState<string[]>([])
  const favoriteIdsKey = useMemo(() => favorites.map(f => f.id).join(','), [favorites])
  useEffect(() => {
    setCardOrder(favorites.map(f => f.id))
  // favoriteIdsKey가 변경될 때만 순서 초기화 — 불필요한 리셋 방지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoriteIdsKey])

  const orderedFavorites = useMemo(() => {
    if (cardOrder.length === 0) return favorites
    const map = new Map(favorites.map(f => [f.id, f]))
    return cardOrder.flatMap(id => (map.has(id) ? [map.get(id)!] : []))
  }, [cardOrder, favorites])

  const cardSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleCardDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = cardOrder.indexOf(active.id as string)
    const newIdx = cardOrder.indexOf(over.id as string)
    if (oldIdx === -1 || newIdx === -1) return

    const nextOrder = arrayMove(cardOrder, oldIdx, newIdx)
    setCardOrder(nextOrder)

    const changed: Array<{ id: string; displayOrder: number }> = []
    nextOrder.forEach((id, idx) => {
      const fav = favorites.find(f => f.id === id)
      if (!fav || fav.display_order !== idx) changed.push({ id, displayOrder: idx })
    })
    if (changed.length === 0) return
    try {
      const jwt = await getJwt()
      if (!jwt) throw new Error('인증 실패')
      await Promise.all(
        changed.map(({ id, displayOrder }) =>
          updateFavoriteStop(id, { displayOrder }, jwt)
        )
      )
      queryClient.invalidateQueries({ queryKey: ['favorite-stops'] })
    } catch (e) {
      showApiErrorToast(e, '순서 저장에 실패했어요')
      queryClient.invalidateQueries({ queryKey: ['favorite-stops'] })
    }
  }, [cardOrder, favorites, queryClient])

  // TransitStop 변환 (memoized)
  const stops = useMemo(
    () => favorites.map(mapApiFavoriteStopToTransitStop),
    [favorites],
  )

  // stop.id → TransitStop Map — 인덱스 역산 없이 O(1) 조회
  const stopMap = useMemo(() => new Map(stops.map(s => [s.id, s])), [stops])

  // 모든 stop에 대해 도착 정보 동시 조회
  const allArrivalResults = useQueries({
    queries: stops.map(stop => ({
      queryKey: ['arrival', stop.id, stop.type, stop.name],
      queryFn: () => fetchArrival(stop),
      enabled: !!stop.id,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    })),
  })

  // stop.id → { data, isLoading } 맵
  const arrivalByStopId = useMemo(() => {
    const map = new Map<string, { data: ArrivalData; isLoading: boolean; error: ApiError | null }>()
    stops.forEach((stop, idx) => {
      const result = allArrivalResults[idx]
      const rawError = result?.error
      let apiError: ApiError | null = null
      if (rawError instanceof ApiError) {
        apiError = rawError
      } else if (rawError instanceof Error) {
        apiError = new ApiError('UNKNOWN', rawError.message)
      }
      map.set(stop.id, {
        data: result?.data ?? null,
        isLoading: result?.isLoading ?? false,
        error: apiError,
      })
    })
    return map
  }, [stops, allArrivalResults])

  // 도착 데이터 기준 시각
  const fetchedAtRef = useRef(Date.now())
  const arrivalDataKey = allArrivalResults.map(r => r.dataUpdatedAt).join(',')
  useEffect(() => {
    fetchedAtRef.current = Date.now()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalDataKey])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([refetch(), ...allArrivalResults.map(r => r.refetch())])
    setIsRefreshing(false)
  }

  const handleUpdateAlias = async (fav: ApiFavoriteStop, alias: string | null) => {
    try {
      const jwt = await getJwt()
      if (!jwt) throw new Error('인증 실패')
      await updateFavoriteStop(fav.id, { alias }, jwt)
      refetch()
      toast.success('별명을 저장했어요')
    } catch (e) {
      showApiErrorToast(e, '저장에 실패했습니다')
    }
  }

  const handleDelete = async (fav: ApiFavoriteStop) => {
    try {
      const jwt = await getJwt()
      if (!jwt) throw new Error('인증 실패')
      await deleteFavoriteStop(fav.id, jwt)
      queryClient.invalidateQueries({ queryKey: ['favorite-stops'] })
      toast.success('즐겨찾기를 삭제했어요')
    } catch (e) {
      showApiErrorToast(e, '삭제에 실패했어요')
    }
  }

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
        </div>
      </PageShell>
    )
  }

  if (isError) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center p-4 py-16">
          <Card className="max-w-md w-full p-8 text-center rounded-card border border-border-subtle shadow-card bg-surface-card">
            <p className="text-text-danger text-body mb-4">즐겨찾기를 불러오지 못했습니다</p>
            <Button onClick={() => refetch()} className="bg-text-primary hover:bg-text-primary/90 rounded-control text-white">
              다시 시도
            </Button>
          </Card>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="즐겨찾기"
        right={
          <>
            {favorites.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                className={`rounded-control hover:bg-surface-muted w-9 h-9 ${isRefreshing ? 'animate-spin' : ''}`}
              >
                <RefreshCw className="w-[18px] h-[18px] text-text-secondary" strokeWidth={2} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/favorites/add')}
              className="rounded-control hover:bg-surface-muted w-9 h-9"
              aria-label="즐겨찾기 추가"
            >
              <Plus className="w-[18px] h-[18px] text-text-secondary" strokeWidth={2} />
            </Button>
          </>
        }
      />

      <div className="max-w-[var(--page-max-width)] mx-auto px-[var(--page-padding-x)] pt-4">
        {favorites.length === 0 ? (
          <div className="flex items-center justify-center">
            <EmptyState
              icon={<Star className="w-8 h-8 text-white" strokeWidth={1.5} />}
              title="자주 가는 정류장을 등록해보세요"
              description="한 번에 도착 시간을 확인할 수 있어요"
              cta={{ label: '즐겨찾기 추가', onClick: () => navigate('/favorites/add') }}
            />
          </div>
        ) : (
          <DndContext
            sensors={cardSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleCardDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext items={cardOrder} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {orderedFavorites.map((fav) => {
                  // Map 기반 조회 — 인덱스 역산 패턴 제거
                  const stop = stopMap.get(fav.id)
                  if (!stop) return null
                  const arrResult = arrivalByStopId.get(stop.id)
                  const elapsedSec = (Date.now() - fetchedAtRef.current) / 1000
                  return (
                    <FavoriteCard
                      key={fav.id}
                      fav={fav}
                      stop={stop}
                      arrivalData={arrResult?.data ?? null}
                      isArrivalLoading={arrResult?.isLoading ?? false}
                      elapsedSec={elapsedSec}
                      onUpdateAlias={(alias) => handleUpdateAlias(fav, alias)}
                      onDelete={() => handleDelete(fav)}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </PageShell>
  )
}
