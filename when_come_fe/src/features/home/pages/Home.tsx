import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { showApiErrorToast } from "@/lib/errorToast";
import {
  MapPin, Settings, RefreshCw, Navigation,
  ChevronDown, ChevronUp, Loader2, Plus, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PageShell from "@/components/PageShell";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StopName from "@/components/StopName";
import { getBusTypeByOdsay, getSubwayColor, normalizeSubwayLineName } from "@/utils/transitColors";
import { listRoutes, updateRoute } from "@/lib/api";
import { getJwt } from "@/lib/supabase";
import { mapApiRoute } from "@/lib/mappers";
import type { TransitStop, SavedRoute } from "@/lib/mockData";
import { fetchArrival, getArrivalDisplay, getArrivalDisplay2, getArrivalMin, applyCountdownToArrmsg, getMatchedSubwayItems, formatTrainTypeShort } from "@/lib/arrival";
import type { ArrivalData } from "@/lib/arrival";
import { ApiError } from "@/lib/api";
import { safeStorage } from "@/lib/safeStorage";
import { usePageVisibility } from "@/lib/usePageVisibility";
import { ArrivalText, splitArrival } from "@/utils/arrivalDisplay";

const SELECTED_ROUTE_KEY = 'when_come:selectedRouteId';

/**
 * 에러 코드 → inline 안내 메시지.
 * ARRIVAL_PROVIDER_ERROR, ARRIVAL_STOP_NOT_FOUND: BE에서 실제로 throw됨.
 * ARRIVAL_UNSUPPORTED_REGION, ARRIVAL_MAPPING_FAILED, ARRIVAL_VERIFY_FAILED:
 *   현재 BE는 저장 시점에 odsay_fallback으로 처리하므로 실제로 오지 않음.
 *   미래 BE 확장(저장 후 재검증 등)을 위한 준비 코드.
 */
const ARRIVAL_ERROR_MESSAGES: Record<string, string> = {
  ARRIVAL_UNSUPPORTED_REGION: '이 지역은 실시간 도착 정보를 지원하지 않아요',
  ARRIVAL_MAPPING_FAILED: '도착 정보를 가져올 수 없어요. 경로를 다시 등록하면 더 정확해져요',
  ARRIVAL_VERIFY_FAILED: '도착 정보 정확도가 낮아요. 경로를 다시 등록해 주세요',
  ARRIVAL_PROVIDER_ERROR: '외부 서비스 오류로 도착 정보를 가져오지 못했어요',
  ARRIVAL_STOP_NOT_FOUND: '등록된 정류장 정보를 찾을 수 없어요',
}

interface ArrivalErrorInlineProps {
  code: string
  isRetryable: boolean
  onRefresh?: () => void
}

function ArrivalErrorInline({ code, isRetryable, onRefresh }: ArrivalErrorInlineProps) {
  const message = ARRIVAL_ERROR_MESSAGES[code] ?? '도착 정보를 불러오지 못했어요'
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-3">
      <p className="text-caption leading-snug flex-1">{message}</p>
      {isRetryable && onRefresh && (
        <button
          onClick={onRefresh}
          className="flex-shrink-0 flex items-center gap-1 text-label hover:text-text-primary transition-colors"
          aria-label="새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
          <span>재시도</span>
        </button>
      )}
    </div>
  )
}

/**
 * "[N번째 전]" suffix를 arrmsg에서 제거해 미니카드용 단순 텍스트를 반환.
 * "3분후[2번째 전]" → "3분후", "3개전[2번째 전]" → "3개전"
 */
function stripSuffix(msg: string): string {
  return msg.replace(/\s*\[.*?\]$/, '').trim()
}

function getFastestArrivalText(stop: TransitStop, arrival: ArrivalData, elapsedSec: number): string {
  if (!arrival) return '--'
  if (arrival.type === 'subway') {
    // 방향/호선 필터 적용 — items[0] 직접 접근 시 다른 방향·호선이 노출되는 회귀 방어
    const line = stop.lines[0] ?? ''
    const matched = getMatchedSubwayItems(stop, line, arrival)
    const item = matched[0]
    if (!item) return '--'
    const rawMsg = item.displayMsg ?? item.arrmsg1
    return item.displayMsg ? rawMsg : stripSuffix(applyCountdownToArrmsg(rawMsg, elapsedSec))
  }
  if (arrival.type === 'bus_by_stopid') {
    const items = arrival.data.items
    if (items.length === 0) return '--'
    // 선택된 노선(stop.lines)에 해당하는 item만 필터링
    const relevantItems = stop.lines.length > 0
      ? items.filter(item => stop.lines.some(line => item.busRouteAbrv === line || item.busRouteAbrv.replace(/번$/, '') === line))
      : items
    const candidateItems = relevantItems.length > 0 ? relevantItems : items
    let minSec = Infinity
    let minMsg = '--'
    for (const item of candidateItems) {
      const t = item.traTime1 ?? null
      if (t !== null && t < minSec) { minSec = t; minMsg = item.arrmsg1 }
      else if (minMsg === '--' && item.arrmsg1) minMsg = item.arrmsg1
    }
    return stripSuffix(applyCountdownToArrmsg(minMsg, elapsedSec, 'bus'))
  }
  if (arrival.type === 'odsay') {
    const item = arrival.items[0]
    if (!item) return '--'
    return item.arrivalTime1 != null ? `${item.arrivalTime1}분` : '--'
  }
  if (arrival.type === 'bus') {
    const item = arrival.items[0]
    if (!item) return '--'
    if (item.arrivalSec1 != null) return stripSuffix(applyCountdownToArrmsg(`${Math.ceil(item.arrivalSec1 / 60)}분후`, elapsedSec))
    return item.arrmsg1 ? stripSuffix(applyCountdownToArrmsg(item.arrmsg1, elapsedSec)) : '--'
  }
  return '--'
}

interface RouteChipProps {
  route: SavedRoute;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function RouteChip({ route, isSelected, onSelect }: RouteChipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: route.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(route.id)}
      {...attributes}
      {...listeners}
      className={`px-4 py-1.5 rounded-pill text-label font-medium whitespace-nowrap transition-colors select-none touch-none ${
        isDragging
          ? 'opacity-40 cursor-grabbing'
          : 'cursor-grab active:cursor-grabbing'
      } ${
        isSelected
          ? 'bg-text-primary text-white'
          : 'bg-surface-muted text-text-secondary hover:bg-border-strong'
      }`}
    >
      {route.name}
    </button>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: apiRoutes, isLoading, isError, refetch } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => {
      const jwt = await getJwt();
      if (!jwt) throw new Error('인증 실패');
      return listRoutes(jwt);
    },
    staleTime: 1000 * 60 * 5,
  });

  const routes = useMemo<SavedRoute[]>(() => (apiRoutes ?? []).map(mapApiRoute), [apiRoutes]);
  const activeRoutes = useMemo(() => routes.filter(r => r.isActive), [routes]);

  // 칩 정렬 로컬 상태 (드래그 중 optimistic 순서 유지)
  const [chipOrder, setChipOrder] = useState<string[]>([]);
  const activeRouteIdsKey = useMemo(() => activeRoutes.map(r => r.id).join(','), [activeRoutes]);
  useEffect(() => {
    setChipOrder(activeRoutes.map(r => r.id));
  // activeRouteIdsKey가 변경될 때만 순서 초기화 — 불필요한 리셋 방지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRouteIdsKey]);

  const orderedActiveRoutes = useMemo(() => {
    if (chipOrder.length === 0) return activeRoutes;
    const map = new Map(activeRoutes.map(r => [r.id, r]));
    return chipOrder.flatMap(id => (map.has(id) ? [map.get(id)!] : []));
  }, [chipOrder, activeRoutes]);

  const chipSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleChipDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = chipOrder.indexOf(active.id as string);
    const newIdx = chipOrder.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;

    const nextOrder = arrayMove(chipOrder, oldIdx, newIdx);
    setChipOrder(nextOrder);

    // 변경된 route만 PATCH
    const changed: Array<{ id: string; displayOrder: number }> = [];
    nextOrder.forEach((id, idx) => {
      const route = activeRoutes.find(r => r.id === id);
      if (!route || route.displayOrder !== idx) changed.push({ id, displayOrder: idx });
    });
    if (changed.length === 0) return;
    try {
      await Promise.all(changed.map(({ id, displayOrder }) => updateRoute(id, { displayOrder })));
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    } catch (e) {
      showApiErrorToast(e, '순서 저장에 실패했어요');
      queryClient.invalidateQueries({ queryKey: ['routes'] });
    }
  }, [chipOrder, activeRoutes, queryClient]);

  const [selectedRouteId, setSelectedRouteId] = useState<string>(() => {
    return safeStorage.get(SELECTED_ROUTE_KEY) ?? '';
  });
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // 호선별 도착 정보 펼침 상태 (key = line 이름)
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});
  // 펼쳐진 upcoming 그룹 인덱스 집합
  const [expandedUpcoming, setExpandedUpcoming] = useState<Set<number>>(new Set())

  const resolvedRouteId = activeRoutes.find(r => r.id === selectedRouteId)
    ? selectedRouteId
    : activeRoutes[0]?.id ?? '';
  const currentRoute = activeRoutes.find(r => r.id === resolvedRouteId) ?? activeRoutes[0];

  const handleSelectRoute = (id: string) => {
    setSelectedRouteId(id);
    setCurrentSegmentIndex(0);
    safeStorage.set(SELECTED_ROUTE_KEY, id);
  };
  const currentSegment = currentRoute?.segments[currentSegmentIndex];

  // stepGroup 기준으로 그룹핑된 세그먼트 배열
  const groupedSegments = useMemo(() => {
    if (!currentRoute) return [];
    const groups = new Map<number, typeof currentRoute.segments>()
    for (const seg of currentRoute.segments) {
      const g = seg.stepGroup ?? seg.order
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(seg)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([, segs]) => segs)
  }, [currentRoute])

  // 현재 세그먼트가 속한 그룹 인덱스
  const currentGroupIndex = useMemo(() => {
    if (!currentSegment) return 0
    return groupedSegments.findIndex(group =>
      group.some(seg => seg.id === currentSegment.id)
    )
  }, [groupedSegments, currentSegment])

  // 모든 세그먼트 (past 포함 — 탑승 완료한 스텝도 토글 펼침 시 도착정보 동일 표시)
  const allSegments = useMemo(() => {
    return groupedSegments.flat()
  }, [groupedSegments])

  const allArrivalResults = useQueries({
    queries: allSegments.map(seg => ({
      queryKey: ['arrival', seg.stop.id, seg.stop.type, seg.stop.name],
      queryFn: () => fetchArrival(seg.stop),
      enabled: !!seg.stop.id,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    })),
  });

  // stop.id → { data, isLoading, error } 맵
  // error: ApiError이면 에러 코드 분기 처리, 일반 Error이면 UNKNOWN 코드로 표준화
  const arrivalByStopId = useMemo(() => {
    const map = new Map<string, { data: ArrivalData; isLoading: boolean; error: ApiError | null }>()
    allSegments.forEach((seg, idx) => {
      const result = allArrivalResults[idx]
      const rawError = result?.error
      let apiError: ApiError | null = null
      if (rawError instanceof ApiError) {
        apiError = rawError
      } else if (rawError instanceof Error) {
        // 네트워크 오류 등 — UNKNOWN 코드로 표준화하여 일반 에러 UI 표시
        apiError = new ApiError('UNKNOWN', rawError.message)
      }
      map.set(seg.stop.id, {
        data: result?.data ?? null,
        isLoading: result?.isLoading ?? false,
        error: apiError,
      })
    })
    return map
  }, [allSegments, allArrivalResults])

  // 도착 데이터가 갱신될 때마다 기준 시각 기록
  const fetchedAtRef = useRef(Date.now());
  const arrivalDataKey = allArrivalResults.map(r => r.dataUpdatedAt).join(',');
  useEffect(() => {
    fetchedAtRef.current = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrivalDataKey]);

  // 도착 에러 코드별 toast 처리 (ARRIVAL_PROVIDER_ERROR, ARRIVAL_STOP_NOT_FOUND, UNKNOWN)
  useEffect(() => {
    allArrivalResults.forEach(result => {
      if (!result.error) return
      if (!(result.error instanceof ApiError)) return
      const err = result.error
      if (err.code === 'ARRIVAL_PROVIDER_ERROR') {
        // 카탈로그 매핑 메시지 사용, 중복 방지 id 부여
        showApiErrorToast(err, '잠시 후 다시 시도해 주세요', { id: 'arrival-provider-error' })
      } else if (err.code === 'ARRIVAL_STOP_NOT_FOUND') {
        showApiErrorToast(err, '경로를 찾을 수 없어요. 새로고침 해주세요', { id: 'arrival-stop-not-found' })
      } else if (
        err.code !== 'ARRIVAL_UNSUPPORTED_REGION' &&
        err.code !== 'ARRIVAL_MAPPING_FAILED' &&
        err.code !== 'ARRIVAL_VERIFY_FAILED'
      ) {
        // UNKNOWN 또는 기타 — 사용자에게 원시 메시지(URL 등) 노출 방지
        showApiErrorToast(err, '도착 정보를 불러오지 못했어요', { id: `arrival-error-${err.code}` })
      }
      // UNSUPPORTED_REGION / MAPPING_FAILED / VERIFY_FAILED 는 inline 처리 (toast 없음)
    })
  // allArrivalResults 참조 안정성: dataUpdatedAt/errorUpdatedAt 변화로 감지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allArrivalResults.map(r => r.errorUpdatedAt).join(',')])

  // 세그먼트가 바뀌면 펼침 상태 초기화
  useEffect(() => {
    setExpandedLines({});
  }, [currentSegmentIndex]);

  // currentGroupIndex 바뀔 때 upcoming 펼침 상태 초기화
  useEffect(() => {
    setExpandedUpcoming(new Set())
  }, [currentGroupIndex])

  // 1초마다 리렌더링 → 카운트다운 효과. 화면 안 보일 때(다른 탭/앱 백그라운드) 정지로 배터리 절약.
  const [, forceUpdate] = useState(0);
  const isPageVisible = usePageVisibility();
  useEffect(() => {
    if (!isPageVisible) return;
    const id = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [isPageVisible]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetch(), ...allArrivalResults.map(r => r.refetch())]);
    setIsRefreshing(false);
  };

  function handleBoardingComplete() {
    if (!currentRoute || currentGroupIndex >= groupedSegments.length - 1) return;
    // 다음 그룹의 첫 세그먼트 인덱스를 찾아서 이동
    const nextGroupFirstSeg = groupedSegments[currentGroupIndex + 1]?.[0]
    if (!nextGroupFirstSeg) return
    const nextIdx = currentRoute.segments.findIndex(s => s.id === nextGroupFirstSeg.id)
    if (nextIdx === -1) return
    const prevIndex = currentSegmentIndex;
    setCurrentSegmentIndex(nextIdx);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success('탑승 완료', {
      duration: 5000,
      action: {
        label: '되돌리기',
        onClick: () => setCurrentSegmentIndex(prevIndex),
      },
    });
  }

  function handleUndoBoarding() {
    if (!currentRoute || currentGroupIndex <= 0) return;
    const prevGroupFirstSeg = groupedSegments[currentGroupIndex - 1]?.[0]
    if (!prevGroupFirstSeg) return
    const prevIdx = currentRoute.segments.findIndex(s => s.id === prevGroupFirstSeg.id)
    if (prevIdx === -1) return
    setCurrentSegmentIndex(prevIdx);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 경로 칩 + 추가 버튼 row (PageHeader bottom 슬롯)
  const chipRow = (
    <div className="bg-surface-card border-b border-border-subtle">
      <div className="max-w-[var(--page-max-width)] mx-auto px-[var(--page-padding-x)] py-2 flex items-center gap-2">
        {orderedActiveRoutes.length > 0 && (
          <div className="flex-1 overflow-x-auto scrollbar-hide min-w-0">
            <DndContext
              sensors={chipSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleChipDragEnd}
              modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
            >
              <SortableContext items={chipOrder} strategy={horizontalListSortingStrategy}>
                <div className="flex gap-2 w-max" style={{ touchAction: 'pan-y' }}>
                  {orderedActiveRoutes.map((route) => (
                    <RouteChip
                      key={route.id}
                      route={route}
                      isSelected={route.id === currentRoute?.id}
                      onSelect={handleSelectRoute}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
        {/* + 버튼 — 경로 등록 진입점 */}
        <button
          onClick={() => navigate('/setup')}
          className="flex-shrink-0 w-8 h-8 rounded-pill bg-surface-muted hover:bg-border-strong flex items-center justify-center transition-colors"
          aria-label="경로 추가"
        >
          <Plus className="w-4 h-4 text-text-secondary" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center p-4 py-16">
          <Card className="max-w-md w-full p-8 text-center rounded-card border border-border-subtle shadow-card bg-surface-card">
            <p className="text-text-danger text-body mb-4">경로를 불러오지 못했습니다</p>
            <Button onClick={() => refetch()} className="bg-text-primary hover:bg-text-primary/90 rounded-control text-white">
              다시 시도
            </Button>
          </Card>
        </div>
      </PageShell>
    );
  }

  if (activeRoutes.length === 0) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center p-4 py-16">
          <EmptyState
            icon={<MapPin className="w-8 h-8 text-white" strokeWidth={1.5} />}
            title="경로를 등록해주세요"
            description={['출발지와 도착지를 설정하면', '실시간으로 교통정보를 확인할 수 있습니다']}
            cta={{ label: '경로 등록하기', onClick: () => navigate('/setup') }}
          />
        </div>
      </PageShell>
    );
  }

  if (!currentSegment) return null;

  return (
    <PageShell>
      <PageHeader
        leading={<Navigation className="w-4 h-4 text-text-secondary flex-shrink-0" strokeWidth={2} />}
        title={currentRoute?.name ?? '내 경로'}
        badge={currentRoute?.to ? (
          <span className="text-caption ml-1.5 truncate max-w-[160px] inline-block align-middle">
            · {currentRoute.to}
          </span>
        ) : undefined}
        right={
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className={`rounded-control hover:bg-surface-muted w-9 h-9 ${isRefreshing ? 'animate-spin' : ''}`}
            >
              <RefreshCw className="w-[18px] h-[18px] text-text-secondary" strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/routes')}
              className="rounded-control hover:bg-surface-muted w-9 h-9"
            >
              <Settings className="w-[18px] h-[18px] text-text-secondary" strokeWidth={2} />
            </Button>
          </>
        }
        bottom={chipRow}
      />

      <div className="max-w-[var(--page-max-width)] mx-auto px-[var(--page-padding-x)] pt-4 space-y-3">
        {/* 전체 스텝 세로 타임라인 */}
        <div className="space-y-3">
          {groupedSegments.map((group, groupIdx) => {
            const isCurrent = groupIdx === currentGroupIndex;
            const isPast = groupIdx < currentGroupIndex;

            if (isCurrent) {
              // 현재 스텝: 도착 정보 포함 강조 카드
              return (
                <div key={groupIdx}>
                  <div className="px-1 flex items-center justify-between mb-2">
                    <h3 className="text-section">지금 타야할 교통수단</h3>
                    <div className="flex items-center gap-3">
                      {currentGroupIndex > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-caption text-text-tertiary hover:text-text-primary h-auto p-0 font-normal flex items-center gap-0.5"
                          onClick={handleUndoBoarding}
                          aria-label="이전 스텝으로 되돌리기"
                        >
                          <RotateCcw className="w-3 h-3" strokeWidth={2} />
                          이전 스텝
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-label hover:text-text-primary h-auto p-0 font-medium"
                        onClick={handleBoardingComplete}
                      >
                        탑승 완료
                      </Button>
                    </div>
                  </div>
                  {/* step_group 2개 이상: flex-row 가로 배치 */}
                  <div className={group.length > 1 ? "flex gap-2" : ""}>
                    {group.map((seg) => {
                      const isGrouped = group.length > 1;
                      const segArrivalResult = arrivalByStopId.get(seg.stop.id)
                      const segArrivalData = segArrivalResult?.data ?? null;
                      const isArrivalLoading = segArrivalResult?.isLoading ?? false;
                      const segArrivalError = segArrivalResult?.error ?? null;
                      const elapsedSec = (Date.now() - fetchedAtRef.current) / 1000;

                      return (
                        <Card
                          key={seg.id}
                          className={`rounded-card border border-border-subtle shadow-card bg-surface-card overflow-hidden ${isGrouped ? 'flex-1 min-w-0' : ''}`}
                        >
                          {/* 정류장 정보 */}
                          <div className={isGrouped ? "px-3 py-3 border-b border-border-subtle" : "p-5 border-b border-border-subtle"}>
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="mb-1">
                                  <StopName
                                    name={seg.stop.displayName ?? seg.stop.name}
                                    alias={seg.stop.alias ?? undefined}
                                    size={isGrouped ? 'md' : 'lg'}
                                  />
                                </div>
                                {seg.stop.type === 'bus' && seg.stop.arsId && (
                                  <div className="text-caption font-mono mt-1">
                                    ARS {seg.stop.arsId}
                                  </div>
                                )}
                                {/* T14: fallback 안내 */}
                                {seg.stop.type === 'bus'
                                  && segArrivalData?.type === 'bus_by_stopid'
                                  && segArrivalData.data.provider === 'odsay_fallback' && (
                                  <div className="text-caption mt-1">
                                    도착 정보가 부정확할 수 있어요 (제휴 데이터 사용)
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 버스/전철 도착 정보 */}
                          <div className="divide-y divide-border-subtle">
                            {segArrivalError ? (
                              <ArrivalErrorInline
                                code={segArrivalError.code}
                                isRetryable={segArrivalError.code === 'ARRIVAL_PROVIDER_ERROR'}
                                onRefresh={segArrivalError.code === 'ARRIVAL_PROVIDER_ERROR' ? handleRefresh : undefined}
                              />
                            ) : seg.stop.lines.length === 0 ? (
                              <div className="px-5 py-4 text-body text-text-tertiary">
                                노선 정보 없음
                              </div>
                            ) : (
                              seg.stop.lines.map((line, idx) => {
                                const isSubway = seg.stop.type === 'subway';
                                const displayLine = isSubway ? normalizeSubwayLineName(line) : line;
                                const stopRoute = seg.stop.stopRoutes?.find(r => r.routeName === line);
                                const busTypeInfo = !isSubway ? getBusTypeByOdsay(stopRoute?.busType, line) : null;
                                const subwayColorInfo = isSubway ? getSubwayColor(displayLine) : null;

                                const transitMode = isSubway ? 'subway' : 'bus';
                                const rawMsg1 = getArrivalDisplay(seg.stop, line, segArrivalData);
                                const rawMsg2 = getArrivalDisplay2(seg.stop, line, segArrivalData);
                                const arrivalText = rawMsg1 !== '--' ? applyCountdownToArrmsg(rawMsg1, elapsedSec, transitMode) : '--';
                                const arrivalText2 = rawMsg2 ? applyCountdownToArrmsg(rawMsg2, elapsedSec, transitMode) : null;
                                const baseMin = getArrivalMin(seg.stop, line, segArrivalData);
                                const remainSec = baseMin !== null ? Math.max(0, baseMin * 60 - elapsedSec) : null;
                                const isUrgent = remainSec !== null && remainSec < 180;
                                const noService = segArrivalData !== null && arrivalText === '--';

                                // T22: 지하철 방향 배지 (기존 방향 배지용)
                                const headsign = isSubway ? (seg.stop.directionHeadsign ?? null) : null;

                                // 지하철: 매칭된 모든 item
                                const matchedSubwayItems = isSubway
                                  ? getMatchedSubwayItems(seg.stop, line, segArrivalData)
                                  : [];
                                const hasMoreItems = isSubway && matchedSubwayItems.length > 2;

                                // 카카오 스타일 행선지 prefix — 매칭 item별 headsign
                                const item1Headsign = isSubway && matchedSubwayItems[0]?.headsign
                                  ? matchedSubwayItems[0].headsign
                                  : null;
                                const item2Headsign = isSubway && matchedSubwayItems[1]?.headsign
                                  ? matchedSubwayItems[1].headsign
                                  : null;
                                // (급)/(특)/(ITX) prefix — formatTrainTypeShort가 null이면 표시 안 함
                                const item1TrainType = isSubway ? formatTrainTypeShort(matchedSubwayItems[0]?.trainType) : null;
                                const item2TrainType = isSubway ? formatTrainTypeShort(matchedSubwayItems[1]?.trainType) : null;
                                const lineKey = `${seg.id}-${line}`;
                                const isLineExpanded = expandedLines[lineKey] ?? false;

                                // 펼침 시 보여줄 추가 항목 (3번째 이후)
                                const extraItems = hasMoreItems && isLineExpanded
                                  ? matchedSubwayItems.slice(2)
                                  : [];

                                const { time: arrivalTimeOnly, stops: stopsBefore } = splitArrival(arrivalText)
                                const { time: arrivalTimeOnly2, stops: stopsBefore2 } = splitArrival(arrivalText2)

                                if (isGrouped) {
                                  // isGrouped === true: 세로 2단 레이아웃
                                  return (
                                    <div key={line} className="px-3 py-3 hover:bg-surface-input transition-colors">
                                      {/* 위 행: 아이콘 + 번호 + 타입 (가로 한 줄) */}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <div className="w-8 h-8 rounded-control bg-surface-input flex items-center justify-center flex-shrink-0">
                                          {isSubway ? (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={subwayColorInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M12 12h0"/><path d="M9.75 9.75h4.5"/><path d="M7 15h10"/>
                                              <rect x="5" y="4" width="14" height="16" rx="2"/>
                                              <path d="M8 20l-2 2"/><path d="M16 20l2 2"/>
                                            </svg>
                                          ) : (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={busTypeInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>
                                              <path d="m18 18 3-3-3-3"/>
                                              <path d="M3 6h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2"/>
                                              <circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>
                                            </svg>
                                          )}
                                        </div>
                                        <span className="text-label font-semibold text-text-primary">
                                          {isSubway ? displayLine : `${line}번`}
                                        </span>
                                        <span className="text-caption text-text-secondary">
                                          {isSubway ? '전철' : (busTypeInfo?.label ?? '') + '버스'}
                                        </span>
                                        {headsign && (
                                          <span
                                            className="text-caption font-medium px-1.5 py-0.5 rounded-chip border whitespace-nowrap"
                                            style={subwayColorInfo
                                              ? { backgroundColor: subwayColorInfo.bgColor, color: subwayColorInfo.textColor, borderColor: `${subwayColorInfo.color}33` }
                                              : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)', borderColor: 'var(--border-strong)' }
                                            }
                                          >
                                            {headsign}방향
                                          </span>
                                        )}
                                      </div>

                                      {/* 아래 행: 도착 정보 — 카카오 스타일 (지하철: 행선지 prefix) */}
                                      <div className="mt-2 space-y-1.5">
                                        {isArrivalLoading ? (
                                          <div className="text-caption text-text-tertiary">조회 중...</div>
                                        ) : noService ? (
                                          <div className="text-caption text-text-tertiary">도착 정보 없음</div>
                                        ) : (
                                          <>
                                            {/* 첫 번째 차 — isUrgent 빨강 */}
                                            <div className="flex items-center gap-1.5" aria-label="이번 차">
                                              {(item1TrainType || item1Headsign) && (
                                                <span className="text-caption text-text-secondary whitespace-nowrap font-medium">
                                                  {item1TrainType && `(${item1TrainType})`}{item1Headsign && `${item1Headsign}행`}
                                                </span>
                                              )}
                                              <span className={`text-label font-bold tabular-nums whitespace-nowrap ${isUrgent ? 'text-arrival-urgent' : 'text-arrival-normal'}`}>
                                                {arrivalTimeOnly}
                                              </span>
                                              {stopsBefore && (
                                                <span className="text-caption text-text-tertiary whitespace-nowrap">{stopsBefore}</span>
                                              )}
                                            </div>
                                            {/* 두 번째 차 — 항상 회색 */}
                                            {arrivalText2 && (
                                              <div className="flex items-center gap-1.5" aria-label="다음 차">
                                                {(item2TrainType || item2Headsign) && (
                                                  <span className="text-caption text-text-tertiary whitespace-nowrap">
                                                    {item2TrainType && `(${item2TrainType})`}{item2Headsign && `${item2Headsign}행`}
                                                  </span>
                                                )}
                                                <span className="text-caption text-arrival-muted tabular-nums whitespace-nowrap">{arrivalTimeOnly2}</span>
                                                {stopsBefore2 && (
                                                  <span className="text-caption text-text-tertiary whitespace-nowrap">{stopsBefore2}</span>
                                                )}
                                              </div>
                                            )}
                                          </>
                                        )}
                                        {/* 지하철 3건 이상 토글 */}
                                        {hasMoreItems && (
                                          <button
                                            onClick={() => setExpandedLines(prev => ({ ...prev, [lineKey]: !prev[lineKey] }))}
                                            className="mt-0.5 p-0.5 rounded-chip hover:bg-surface-muted transition-colors"
                                            aria-label={isLineExpanded ? '접기' : '더 보기'}
                                          >
                                            {isLineExpanded ? (
                                              <ChevronUp className="w-4 h-4 text-text-tertiary" strokeWidth={2} />
                                            ) : (
                                              <ChevronDown className="w-4 h-4 text-text-tertiary" strokeWidth={2} />
                                            )}
                                          </button>
                                        )}
                                        {/* 펼침 시 추가 항목 */}
                                        {extraItems.length > 0 && (
                                          <div className="space-y-1">
                                            {extraItems.map((item, extraIdx) => {
                                              const label = extraIdx === 0 ? '3번째' : `${extraIdx + 3}번째`;
                                              const rawMsg = item.displayMsg ?? item.arrmsg1;
                                              const msg = item.displayMsg ? rawMsg : applyCountdownToArrmsg(rawMsg, elapsedSec, 'subway');
                                              const itemHeadsign = item.headsign ?? null;
                                              const itemTrainType = formatTrainTypeShort(item.trainType);
                                              return (
                                                <div key={`${lineKey}-extra-${extraIdx}`} className="flex items-center justify-between gap-2">
                                                  <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="text-caption text-text-tertiary whitespace-nowrap">{label}</span>
                                                    {(itemTrainType || itemHeadsign) && (
                                                      <span className="text-caption text-text-secondary truncate">
                                                        {itemTrainType && `(${itemTrainType})`}{itemHeadsign && `${itemHeadsign}행`}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-caption text-arrival-muted tabular-nums whitespace-nowrap">{msg}</div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }

                                // isGrouped === false: 기존 가로 레이아웃
                                return (
                                  <div key={line} className="px-5 py-4 hover:bg-surface-input transition-colors">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        {isSubway ? (
                                          <div className="w-10 h-10 rounded-control bg-surface-input flex items-center justify-center flex-shrink-0">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={subwayColorInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M12 12h0"/><path d="M9.75 9.75h4.5"/><path d="M7 15h10"/>
                                              <rect x="5" y="4" width="14" height="16" rx="2"/>
                                              <path d="M8 20l-2 2"/><path d="M16 20l2 2"/>
                                            </svg>
                                          </div>
                                        ) : (
                                          <div className="w-10 h-10 rounded-control bg-surface-input flex items-center justify-center flex-shrink-0">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={busTypeInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>
                                              <path d="m18 18 3-3-3-3"/>
                                              <path d="M3 6h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2"/>
                                              <circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>
                                            </svg>
                                          </div>
                                        )}
                                        <div className="min-w-0 overflow-hidden">
                                          {/* T22: 호선명 + 헤드사인 배지 */}
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <div className="text-body font-semibold text-text-primary truncate max-w-[80px]">
                                              {isSubway ? displayLine : `${line}번`}
                                            </div>
                                            {headsign && (
                                              <span
                                                className="text-caption font-medium px-2 py-0.5 rounded-chip border whitespace-nowrap"
                                                style={subwayColorInfo
                                                  ? { backgroundColor: subwayColorInfo.bgColor, color: subwayColorInfo.textColor, borderColor: `${subwayColorInfo.color}33` }
                                                  : { backgroundColor: 'var(--surface-muted)', color: 'var(--text-secondary)', borderColor: 'var(--border-strong)' }
                                                }
                                              >
                                                {headsign}방향
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-label text-text-secondary whitespace-nowrap">
                                            {isSubway ? '전철' : (busTypeInfo?.label ?? '') + '버스'}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-start gap-2 flex-shrink-0">
                                        {/* 카카오 스타일 — 행선지 prefix + 시간, 두 번째 차 항상 회색 */}
                                        <div className="text-right space-y-1.5">
                                          {isArrivalLoading ? (
                                            <div className="flex items-center gap-1.5 justify-end">
                                              <Loader2 className="w-[14px] h-[14px] text-text-tertiary animate-spin" strokeWidth={2} />
                                              <span className="text-section text-text-tertiary tabular-nums">조회 중...</span>
                                            </div>
                                          ) : noService ? (
                                            <span className="text-body text-arrival-muted">도착 정보 없음</span>
                                          ) : (
                                            <>
                                              {/* 첫 번째 차 */}
                                              <div className="flex items-center gap-1.5 justify-end" aria-label="이번 차">
                                                {(item1TrainType || item1Headsign) && (
                                                  <span className="text-caption text-text-secondary whitespace-nowrap font-medium">
                                                    {item1TrainType && `(${item1TrainType})`}{item1Headsign && `${item1Headsign}행`}
                                                  </span>
                                                )}
                                                <span className={`font-bold tabular-nums leading-tight whitespace-nowrap text-section ${isUrgent ? 'text-arrival-urgent' : 'text-arrival-normal'}`}>
                                                  {arrivalTimeOnly}
                                                </span>
                                                {stopsBefore && (
                                                  <span className="text-caption text-text-tertiary whitespace-nowrap">{stopsBefore}</span>
                                                )}
                                              </div>
                                              {/* 두 번째 차 — 항상 회색 */}
                                              {arrivalText2 && (
                                                <div className="flex items-center gap-1.5 justify-end" aria-label="다음 차">
                                                  {(item2TrainType || item2Headsign) && (
                                                    <span className="text-caption text-arrival-muted whitespace-nowrap">
                                                      {item2TrainType && `(${item2TrainType})`}{item2Headsign && `${item2Headsign}행`}
                                                    </span>
                                                  )}
                                                  <span className="text-body text-arrival-muted tabular-nums whitespace-nowrap">{arrivalTimeOnly2}</span>
                                                  {stopsBefore2 && <span className="text-caption text-text-tertiary whitespace-nowrap">{stopsBefore2}</span>}
                                                </div>
                                              )}
                                            </>
                                          )}
                                        </div>
                                        {/* 지하철 3건 이상일 때 토글 버튼 */}
                                        {hasMoreItems && (
                                          <button
                                            onClick={() => setExpandedLines(prev => ({ ...prev, [lineKey]: !prev[lineKey] }))}
                                            className="mt-1 p-1 rounded-control hover:bg-surface-muted transition-colors flex-shrink-0"
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

                                    {/* 펼침 시 추가 항목 */}
                                    {extraItems.length > 0 && (
                                      <div className="mt-2 ml-[52px] space-y-1">
                                        {extraItems.map((item, extraIdx) => {
                                          const label = extraIdx === 0 ? '3번째' : `${extraIdx + 3}번째`;
                                          const rawMsg = item.displayMsg ?? item.arrmsg1;
                                          const msg = item.displayMsg ? rawMsg : applyCountdownToArrmsg(rawMsg, elapsedSec, 'subway');
                                          const itemHeadsign = item.headsign ?? null;
                                          return (
                                            <div key={`${lineKey}-extra-${extraIdx}`} className="flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-1.5 min-w-0">
                                                <span className="text-caption text-text-tertiary whitespace-nowrap">{label}</span>
                                                {itemHeadsign && (
                                                  <span className="text-caption text-text-secondary truncate">{itemHeadsign}행</span>
                                                )}
                                              </div>
                                              <div className="text-caption text-arrival-muted tabular-nums whitespace-nowrap">{msg}</div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // 다음 스텝들: 미니 도착 카드 (accordion)
            return (
              <div key={groupIdx} className={group.length > 1 ? "flex gap-2" : ""}>
                {group.map((seg) => {
                  const arrResult = arrivalByStopId.get(seg.stop.id)
                  const arrData = arrResult?.data ?? null
                  const isLoading = arrResult?.isLoading ?? false
                  const isExpanded = expandedUpcoming.has(groupIdx)
                  const elapsedSec = (Date.now() - fetchedAtRef.current) / 1000;

                  // 가장 빠른 도착 시간 계산
                  const fastestText = getFastestArrivalText(seg.stop, arrData, elapsedSec)

                  return (
                    <div key={seg.id} className={group.length > 1 ? "flex-1 min-w-0" : ""}>
                      {/* 미니 카드 헤더 (항상 보임) */}
                      <Card
                        className={`rounded-card border border-border-subtle bg-surface-card overflow-hidden cursor-pointer h-full ${isPast ? 'opacity-60' : ''}`}
                        onClick={() => setExpandedUpcoming(prev => {
                          const next = new Set(prev)
                          next.has(groupIdx) ? next.delete(groupIdx) : next.add(groupIdx)
                          return next
                        })}
                      >
                        <div className="px-4 py-3 flex items-center justify-between">
                          {isPast && (
                            <div className="w-5 h-5 rounded-pill bg-text-primary flex items-center justify-center flex-shrink-0 mr-3">
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="truncate">
                              <StopName name={seg.stop.displayName ?? seg.stop.name} alias={seg.stop.alias ?? undefined} size="sm" />
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {seg.stop.lines.slice(0, 3).map(line => (
                                <span key={line} className="text-caption px-1.5 py-0.5 rounded-chip bg-surface-muted text-text-tertiary">
                                  {seg.stop.type === 'subway' ? line : `${line}번`}
                                </span>
                              ))}
                              {seg.stop.lines.length > 3 && (
                                <span className="text-caption text-text-tertiary">+{seg.stop.lines.length - 3}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            {isLoading ? (
                              <Loader2 className="w-3.5 h-3.5 text-text-tertiary animate-spin" strokeWidth={2} />
                            ) : (
                              <ArrivalText
                                msg={fastestText}
                                size="lg"
                                className={`tabular-nums ${fastestText === '--' ? 'text-arrival-empty text-body' : 'text-text-primary'}`}
                              />
                            )}
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-text-tertiary" strokeWidth={2} />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-text-tertiary" strokeWidth={2} />
                            )}
                          </div>
                        </div>

                        {/* 펼쳐지면 노선별 도착 상세 */}
                        {isExpanded && (
                          <div className="border-t border-border-subtle divide-y divide-border-subtle">
                            {seg.stop.lines.length === 0 ? (
                              <div className="px-4 py-3 text-label text-text-tertiary">노선 정보 없음</div>
                            ) : (
                              seg.stop.lines.map((line) => {
                                const isSubway = seg.stop.type === 'subway'
                                const displayLine = isSubway ? normalizeSubwayLineName(line) : line
                                const stopRoute = seg.stop.stopRoutes?.find(r => r.routeName === line)
                                const busTypeInfo = !isSubway ? getBusTypeByOdsay(stopRoute?.busType, line) : null
                                const subwayColorInfo = isSubway ? getSubwayColor(displayLine) : null
                                const rawMsg1 = getArrivalDisplay(seg.stop, line, arrData)
                                const rawMsg2 = getArrivalDisplay2(seg.stop, line, arrData)
                                const miniMode = isSubway ? 'subway' : 'bus'
                                const arrText = rawMsg1 !== '--' ? applyCountdownToArrmsg(rawMsg1, elapsedSec, miniMode) : '--'
                                const arrText2 = rawMsg2 ? applyCountdownToArrmsg(rawMsg2, elapsedSec, miniMode) : null
                                const noSvc = arrData !== null && arrText === '--'
                                const { time: miniT1, stops: miniS1 } = splitArrival(arrText)
                                const { time: miniT2, stops: miniS2 } = splitArrival(arrText2)
                                const miniMatchedItems = isSubway ? getMatchedSubwayItems(seg.stop, line, arrData) : []
                                const miniHeadsign1 = miniMatchedItems[0]?.headsign ?? null
                                const miniHeadsign2 = miniMatchedItems[1]?.headsign ?? null
                                const miniTrainType1 = isSubway ? formatTrainTypeShort(miniMatchedItems[0]?.trainType) : null
                                const miniTrainType2 = isSubway ? formatTrainTypeShort(miniMatchedItems[1]?.trainType) : null
                                return (
                                  <div key={line} className="px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-2 h-2 rounded-pill flex-shrink-0" style={{ backgroundColor: isSubway ? subwayColorInfo?.color : busTypeInfo?.color ?? 'var(--text-tertiary)' }} />
                                      <div className="min-w-0">
                                        <div className="text-label font-medium text-text-primary">
                                          {isSubway ? displayLine : `${line}번`}
                                        </div>
                                        <div className="text-caption text-text-tertiary">
                                          {isSubway ? '전철' : (busTypeInfo?.label ?? '') + '버스'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-2">
                                      {isLoading ? (
                                        <div className="text-caption text-text-tertiary">조회 중...</div>
                                      ) : noSvc ? (
                                        <div className="text-label font-semibold tabular-nums text-arrival-empty">도착 정보 없음</div>
                                      ) : (
                                        <>
                                          <div className="flex items-baseline justify-end gap-1.5 tabular-nums">
                                            {(miniTrainType1 || miniHeadsign1) && (
                                              <span className="text-caption text-text-secondary font-medium whitespace-nowrap">
                                                {miniTrainType1 && `(${miniTrainType1})`}{miniHeadsign1 && `${miniHeadsign1}행`}
                                              </span>
                                            )}
                                            <span className="text-label font-semibold text-text-primary">{miniT1}</span>
                                            {miniS1 && <span className="text-caption text-text-tertiary">{miniS1}</span>}
                                          </div>
                                          {arrText2 && (
                                            <div className="flex items-baseline justify-end gap-1.5 tabular-nums">
                                              {(miniTrainType2 || miniHeadsign2) && (
                                                <span className="text-caption text-arrival-muted whitespace-nowrap">
                                                  {miniTrainType2 && `(${miniTrainType2})`}{miniHeadsign2 && `${miniHeadsign2}행`}
                                                </span>
                                              )}
                                              <span className="text-caption text-arrival-muted">{miniT2}</span>
                                              {miniS2 && <span className="text-caption text-text-tertiary">{miniS2}</span>}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </Card>
                    </div>
                  )
                })}
              </div>
            );
          })}

          {/* 경로 완료 */}
          {currentGroupIndex === groupedSegments.length - 1 && (
            <Card className="p-6 text-center rounded-card border border-border-subtle shadow-card bg-surface-card">
              <div className="w-12 h-12 bg-text-primary rounded-card flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-6 h-6 text-white" strokeWidth={2} />
              </div>
              <h3 className="text-section mb-1">마지막 구간입니다</h3>
              <p className="text-body text-text-secondary">곧 목적지에 도착합니다</p>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}
