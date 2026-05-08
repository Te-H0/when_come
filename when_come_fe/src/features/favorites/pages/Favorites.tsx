import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { useDrag, useDrop } from 'react-dnd'
import { toast } from 'sonner'
import { Plus, Star, RefreshCw, MoreVertical, Loader2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import BottomNav from '@/components/BottomNav'
import EmptyState from '@/components/EmptyState'
import StopName from '@/components/StopName'
import AliasEditor from '@/components/AliasEditor'
import { listFavoriteStops, updateFavoriteStop, deleteFavoriteStop } from '@/lib/api'
import { getJwt } from '@/lib/supabase'
import { mapApiFavoriteStopToTransitStop } from '@/lib/mappers'
import { fetchArrival, getArrivalDisplay, getArrivalDisplay2, getArrivalMin, applyCountdownToArrmsg, getMatchedSubwayItems } from '@/lib/arrival'
import type { ArrivalData } from '@/lib/arrival'
import { ApiError } from '@/lib/api'
import { getBusTypeByOdsay, getSubwayColor } from '@/utils/transitColors'
import type { ApiFavoriteStop } from '@/types/api'
import type { TransitStop } from '@/lib/mockData'

const FAV_CARD_DND_TYPE = 'FAV_CARD'

interface FavCardDragItem {
  id: string
  index: number
}

// ──────────────────────── 도착 텍스트 파싱 ────────────────────────

type ArrivalTextToken =
  | { kind: 'count'; count: number; unit: string }
  | { kind: 'text'; text: string }

function parseArrivalToken(msg: string): ArrivalTextToken {
  if (!msg || msg === '--') return { kind: 'text', text: msg || '--' }
  const countMatch = msg.match(/^(\d+)(개전)/)
  if (countMatch) return { kind: 'count', count: parseInt(countMatch[1]), unit: countMatch[2] }
  const minMatch = msg.match(/^(\d+)분/)
  if (minMatch) return { kind: 'count', count: parseInt(minMatch[1]), unit: '분' }
  return { kind: 'text', text: msg }
}

function ArrivalText({ msg, className }: { msg: string; className?: string }) {
  const token = parseArrivalToken(msg)
  if (token.kind === 'count') {
    return (
      <span className={className}>
        <span className="font-bold tabular-nums">{token.count}</span>
        <span className="text-xs font-normal">{token.unit}</span>
      </span>
    )
  }
  return <span className={className}>{token.text}</span>
}

function splitArrival(text: string | null): { time: string; stops: string | null } {
  if (!text) return { time: '--', stops: null }
  const match = text.match(/^(.*?)\[(\d+)번째 전\]$/)
  if (match) return { time: match[1].trim(), stops: `${match[2]}정거장 전` }
  return { time: text, stops: null }
}

// ──────────────────────── 즐겨찾기 카드 ────────────────────────

interface FavoriteCardProps {
  fav: ApiFavoriteStop
  stop: TransitStop
  arrivalData: ArrivalData
  isArrivalLoading: boolean
  elapsedSec: number
  index: number
  onUpdateAlias: (alias: string | null) => Promise<void>
  onDelete: () => void
  onMove: (dragIndex: number, hoverIndex: number) => void
  onDrop: () => void
}

function FavoriteCard({
  fav,
  stop,
  arrivalData,
  isArrivalLoading,
  elapsedSec,
  index,
  onUpdateAlias,
  onDelete,
  onMove,
  onDrop,
}: FavoriteCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({})
  const menuRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)

  const [{ isDragging }, drag, preview] = useDrag<FavCardDragItem, void, { isDragging: boolean }>({
    type: FAV_CARD_DND_TYPE,
    item: { id: fav.id, index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    end: (_item, monitor) => {
      if (monitor.didDrop()) onDrop()
    },
  })

  const [, drop] = useDrop<FavCardDragItem>({
    accept: FAV_CARD_DND_TYPE,
    hover(item) {
      if (item.index === index) return
      onMove(item.index, index)
      item.index = index
    },
  })

  // preview는 카드 전체, drag는 핸들에만 연결
  preview(drop(cardRef))
  drag(handleRef)

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
    <div ref={cardRef} style={{ opacity: isDragging ? 0.4 : 1 }} className="transition-opacity">
    <Card className="rounded-2xl border border-black/5 shadow-sm bg-white overflow-hidden">
      {/* 카드 헤더: 정류장명 + 별명 편집 + 메뉴 */}
      <div className="px-4 py-3.5 border-b border-black/5 flex items-start justify-between gap-2">
        {/* 드래그 핸들 */}
        <button
          ref={handleRef}
          className="flex-shrink-0 mt-0.5 p-1 -ml-1 rounded-lg text-[#D1D5DB] hover:text-[#9CA3AF] hover:bg-[#F3F4F6] transition-colors cursor-grab active:cursor-grabbing touch-none"
          aria-label="순서 변경"
        >
          <GripVertical className="w-4 h-4" strokeWidth={2} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StopName name={stop.displayName} alias={fav.alias ?? undefined} size="md" />
          </div>
          {stop.type === 'bus' && stop.arsId && (
            <div className="text-[11px] text-[#9CA3AF] font-mono mt-0.5">ARS {stop.arsId}</div>
          )}
          {stop.type === 'subway' && fav.direction_updn && fav.direction_next_stop && (
            <div className="text-[12px] text-[#6B7280] mt-0.5">
              {fav.direction_next_stop} 방향
            </div>
          )}
          {stop.type === 'subway' && !fav.direction_updn && (
            <div className="text-[11px] text-[#9CA3AF] mt-0.5">
              방향 정보 없음 — 다시 등록하면 더 정확해요
            </div>
          )}
          {stop.type === 'bus'
            && arrivalData?.type === 'bus_by_stopid'
            && arrivalData.data.provider === 'odsay_fallback' && (
            <div className="text-[11px] text-[#9CA3AF] mt-0.5">
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
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
              aria-label="메뉴"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 z-20 bg-white rounded-xl border border-black/10 shadow-lg w-32 overflow-hidden">
                <button
                  onClick={handleDelete}
                  className="w-full px-4 py-2.5 text-left text-[14px] text-[#DC2626] hover:bg-red-50 transition-colors"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 노선별 도착 정보 */}
      <div className="divide-y divide-black/5">
        {stop.lines.length === 0 ? (
          <div className="px-4 py-3 text-[13px] text-[#9CA3AF]">노선 정보 없음</div>
        ) : (
          stop.lines.map((line) => {
            const isSubway = stop.type === 'subway'
            const stopRoute = stop.stopRoutes?.find(r => r.routeName === line)
            const busTypeInfo = !isSubway ? getBusTypeByOdsay(stopRoute?.busType, line) : null
            const subwayColorInfo = isSubway ? getSubwayColor(line) : null

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

            // 지하철: 매칭된 item의 행선지
            const matchedSubwayItems = isSubway ? getMatchedSubwayItems(stop, line, arrivalData) : []
            const item1Headsign = isSubway && matchedSubwayItems[0]?.headsign ? matchedSubwayItems[0].headsign : null
            const item2Headsign = isSubway && matchedSubwayItems[1]?.headsign ? matchedSubwayItems[1].headsign : null
            const hasMoreItems = isSubway && matchedSubwayItems.length > 2
            const lineKey = `${fav.id}-${line}`
            const isLineExpanded = expandedLines[lineKey] ?? false
            const extraItems = hasMoreItems && isLineExpanded ? matchedSubwayItems.slice(2) : []

            return (
              <div key={line} className="px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {isSubway ? (
                      <div className="w-9 h-9 rounded-xl bg-[#F9FAFB] flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={subwayColorInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 12h0"/><path d="M9.75 9.75h4.5"/><path d="M7 15h10"/>
                          <rect x="5" y="4" width="14" height="16" rx="2"/>
                          <path d="M8 20l-2 2"/><path d="M16 20l2 2"/>
                        </svg>
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-[#F9FAFB] flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={busTypeInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>
                          <path d="m18 18 3-3-3-3"/>
                          <path d="M3 6h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2"/>
                          <circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-[#111827]">
                        {isSubway ? line : `${line}번`}
                      </div>
                      <div className="text-[12px] text-[#6B7280]">
                        {isSubway ? '전철' : (busTypeInfo?.label ?? '') + '버스'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 flex-shrink-0">
                    <div className="text-right space-y-1">
                      {isArrivalLoading ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          <Loader2 className="w-3.5 h-3.5 text-[#9CA3AF] animate-spin" />
                          <span className="text-[14px] text-[#9CA3AF]">조회 중...</span>
                        </div>
                      ) : noService ? (
                        <span className="text-[13px] text-[#9CA3AF]">도착 정보 없음</span>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 justify-end">
                            {item1Headsign && (
                              <span className="text-[11px] text-[#6B7280] whitespace-nowrap font-medium">{item1Headsign}행</span>
                            )}
                            <ArrivalText
                              msg={arrivalTimeOnly}
                              className={`text-[16px] font-bold tabular-nums whitespace-nowrap ${isUrgent ? 'text-[#DC2626]' : 'text-[#111827]'}`}
                            />
                            {stopsBefore && (
                              <span className="text-[10px] text-[#9CA3AF] whitespace-nowrap">{stopsBefore}</span>
                            )}
                          </div>
                          {arrivalText2 && (
                            <div className="flex items-center gap-1.5 justify-end">
                              {item2Headsign && (
                                <span className="text-[10px] text-[#9CA3AF] whitespace-nowrap">{item2Headsign}행</span>
                              )}
                              <span className="text-[13px] text-[#9CA3AF] tabular-nums whitespace-nowrap">{arrivalTimeOnly2}</span>
                              {stopsBefore2 && (
                                <span className="text-[10px] text-[#9CA3AF] whitespace-nowrap">{stopsBefore2}</span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {hasMoreItems && (
                      <button
                        onClick={() => setExpandedLines(prev => ({ ...prev, [lineKey]: !prev[lineKey] }))}
                        className="mt-0.5 p-1 rounded-lg hover:bg-[#F1F3F5] transition-colors"
                        aria-label={isLineExpanded ? '접기' : '더 보기'}
                      >
                        {isLineExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[#9CA3AF]" strokeWidth={2} />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#9CA3AF]" strokeWidth={2} />
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
                      return (
                        <div key={`${lineKey}-extra-${idx}`} className="flex items-center justify-between">
                          <span className="text-[11px] text-[#9CA3AF]">{label}</span>
                          <span className="text-[12px] text-[#9CA3AF] tabular-nums">{msg}</span>
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

  // 1초마다 카운트다운 리렌더링
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

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

  const handleCardMove = useCallback((dragIdx: number, hoverIdx: number) => {
    setCardOrder(prev => {
      const next = [...prev]
      const [removed] = next.splice(dragIdx, 1)
      next.splice(hoverIdx, 0, removed)
      return next
    })
  }, [])

  const handleCardDrop = useCallback(async () => {
    const changed: Array<{ id: string; displayOrder: number }> = []
    cardOrder.forEach((id, idx) => {
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
    } catch {
      toast.error('순서 저장에 실패했어요')
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
      toast.error(e instanceof Error ? e.message : '저장에 실패했습니다')
    }
  }

  const handleDelete = async (fav: ApiFavoriteStop) => {
    try {
      const jwt = await getJwt()
      if (!jwt) throw new Error('인증 실패')
      await deleteFavoriteStop(fav.id, jwt)
      refetch()
      toast.success('즐겨찾기를 삭제했어요')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제에 실패했어요')
    }
  }

  if (isLoading) {
    return (
      <div className="h-dvh bg-[#F6F7F9] flex items-center justify-center pb-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#6B7280]" />
        <BottomNav />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="h-dvh bg-[#F6F7F9] flex items-center justify-center p-4 pb-20">
        <Card className="max-w-md w-full p-8 text-center rounded-2xl border border-black/5">
          <p className="text-[#DC2626] text-[15px] mb-4">즐겨찾기를 불러오지 못했습니다</p>
          <Button onClick={() => refetch()} className="bg-[#111827] hover:bg-[#1F2937] rounded-xl">
            다시 시도
          </Button>
        </Card>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24">
      {/* 헤더 */}
      <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-10 border-b border-black/5">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-[17px] font-semibold text-[#111827]">즐겨찾기</h1>
          <div className="flex items-center gap-1">
            {favorites.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                className={`rounded-xl hover:bg-[#F1F3F5] w-9 h-9 ${isRefreshing ? 'animate-spin' : ''}`}
              >
                <RefreshCw className="w-[18px] h-[18px] text-[#6B7280]" strokeWidth={2} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/favorites/add')}
              className="rounded-xl hover:bg-[#F1F3F5] w-9 h-9"
              aria-label="즐겨찾기 추가"
            >
              <Plus className="w-[18px] h-[18px] text-[#6B7280]" strokeWidth={2} />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
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
          <div className="space-y-3">
            {orderedFavorites.map((fav, idx) => {
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
                  index={idx}
                  onUpdateAlias={(alias) => handleUpdateAlias(fav, alias)}
                  onDelete={() => handleDelete(fav)}
                  onMove={handleCardMove}
                  onDrop={handleCardDrop}
                />
              )
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
