import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueries } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MapPin, Settings, RefreshCw, Navigation,
  ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BottomNav from "@/components/BottomNav";
import StopName from "@/components/StopName";
import { getBusTypeByOdsay, getSubwayColor } from "@/utils/transitColors";
import { listRoutes } from "@/lib/api";
import { getJwt } from "@/lib/supabase";
import { mapApiRoute } from "@/lib/mappers";
import type { TransitStop, SavedRoute } from "@/lib/mockData";
import { fetchArrival, getArrivalDisplay, getArrivalDisplay2, getArrivalMin, applyCountdownToArrmsg, getMatchedSubwayItems } from "@/lib/arrival";
import type { ArrivalData } from "@/lib/arrival";
import { ApiError } from "@/lib/api";

const SELECTED_ROUTE_KEY = 'when_come:selectedRouteId';

/**
 * 도착 텍스트 파싱 결과.
 * - count 타입: "3개전" → { kind: 'count', count: 3, unit: '개전' }
 * - text 타입: "곧 도착", "도착 정보 없음" 등 → { kind: 'text', text: '...' }
 */
type ArrivalTextToken =
  | { kind: 'count'; count: number; unit: string }
  | { kind: 'text'; text: string }

/**
 * "3개전", "5분후", "1분30초후" 같은 텍스트를 파싱해 토큰으로 분해.
 * 숫자+단위 패턴을 감지하고, 나머지는 그대로 text 토큰으로 반환.
 */
function parseArrivalToken(msg: string): ArrivalTextToken {
  if (!msg || msg === '--') return { kind: 'text', text: msg || '--' }
  // "N개전" 패턴
  const countMatch = msg.match(/^(\d+)(개전)/)
  if (countMatch) return { kind: 'count', count: parseInt(countMatch[1]), unit: countMatch[2] }
  // "N분후", "N분N초후" 패턴
  const minMatch = msg.match(/^(\d+)분/)
  if (minMatch) return { kind: 'count', count: parseInt(minMatch[1]), unit: '분' }
  return { kind: 'text', text: msg }
}

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
      <p className="text-[13px] text-[#9CA3AF] leading-snug flex-1">{message}</p>
      {isRetryable && onRefresh && (
        <button
          onClick={onRefresh}
          className="flex-shrink-0 flex items-center gap-1 text-[12px] text-[#6B7280] hover:text-[#111827] transition-colors"
          aria-label="새로고침"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
          <span>재시도</span>
        </button>
      )}
    </div>
  )
}

/** 도착 텍스트 토큰을 JSX 요소로 렌더링 */
function ArrivalText({ msg, className }: { msg: string; className?: string }) {
  const token = parseArrivalToken(msg)
  if (token.kind === 'count') {
    return (
      <span className={className}>
        <span className="font-bold text-xl tabular-nums">{token.count}</span>
        <span className="text-xs font-normal">{token.unit}</span>
      </span>
    )
  }
  return <span className={className}>{token.text}</span>
}

/**
 * "[N번째 전]" suffix를 arrmsg에서 제거해 미니카드용 단순 텍스트를 반환.
 * "3분후[2번째 전]" → "3분후", "3개전[2번째 전]" → "3개전"
 */
function stripSuffix(msg: string): string {
  return msg.replace(/\s*\[.*?\]$/, '').trim()
}

function splitArrival(text: string | null): { time: string; stops: string | null } {
  if (!text) return { time: '--', stops: null }
  const match = text.match(/^(.*?)\[(\d+)번째 전\]$/)
  if (match) return { time: match[1].trim(), stops: `${match[2]}정거장 전` }
  return { time: text, stops: null }
}

function getFastestArrivalText(stop: TransitStop, arrival: ArrivalData, elapsedSec: number): string {
  if (!arrival) return '--'
  if (arrival.type === 'subway') {
    const item = arrival.items[0]
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

export default function Home() {
  const navigate = useNavigate();

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

  const [selectedRouteId, setSelectedRouteId] = useState<string>(() => {
    return localStorage.getItem(SELECTED_ROUTE_KEY) ?? '';
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
    localStorage.setItem(SELECTED_ROUTE_KEY, id);
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

  // 현재 + 이후 모든 세그먼트 (past 제외)
  const nonPastSegments = useMemo(() => {
    return groupedSegments.slice(currentGroupIndex).flat()
  }, [groupedSegments, currentGroupIndex])

  const allArrivalResults = useQueries({
    queries: nonPastSegments.map(seg => ({
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
    nonPastSegments.forEach((seg, idx) => {
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
  }, [nonPastSegments, allArrivalResults])

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
        toast.error('잠시 후 다시 시도해 주세요', { id: 'arrival-provider-error' })
      } else if (err.code === 'ARRIVAL_STOP_NOT_FOUND') {
        toast.error('경로를 찾을 수 없어요. 새로고침 해주세요', { id: 'arrival-stop-not-found' })
      } else if (
        err.code !== 'ARRIVAL_UNSUPPORTED_REGION' &&
        err.code !== 'ARRIVAL_MAPPING_FAILED' &&
        err.code !== 'ARRIVAL_VERIFY_FAILED'
      ) {
        // UNKNOWN 또는 기타 — BE message를 그대로 toast
        toast.error(err.message, { id: `arrival-error-${err.code}` })
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

  // 1초마다 리렌더링 → 카운트다운 효과
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

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

  if (isLoading) {
    return (
      <div className="h-dvh bg-[#F6F7F9] flex items-center justify-center pb-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#6B7280]" />
        <BottomNav />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-dvh bg-[#F6F7F9] flex items-center justify-center p-4 pb-20">
        <Card className="max-w-md w-full p-8 text-center rounded-2xl border border-black/5 shadow-sm">
          <p className="text-[#DC2626] text-[15px] mb-4">경로를 불러오지 못했습니다</p>
          <Button onClick={() => refetch()} className="bg-[#111827] hover:bg-[#1F2937] rounded-xl">
            다시 시도
          </Button>
        </Card>
        <BottomNav />
      </div>
    );
  }

  if (activeRoutes.length === 0) {
    return (
      <div className="h-dvh bg-[#F6F7F9] flex items-center justify-center p-4 pb-20">
        <Card className="max-w-md w-full p-8 text-center rounded-2xl border border-black/5 shadow-sm">
          <div className="mb-6">
            <div className="w-16 h-16 bg-[#111827] rounded-2xl flex items-center justify-center mx-auto mb-6">
              <MapPin className="w-8 h-8 text-white" strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-[#111827]">경로를 등록해주세요</h2>
            <p className="text-[#6B7280] text-[15px] leading-relaxed">
              출발지와 도착지를 설정하면<br />
              실시간으로 교통정보를 확인할 수 있습니다
            </p>
          </div>
          <Button
            onClick={() => navigate('/setup')}
            className="w-full bg-[#111827] hover:bg-[#1F2937] rounded-xl h-12 text-[15px] font-medium shadow-sm"
            size="lg"
          >
            경로 등록하기
          </Button>
        </Card>
        <BottomNav />
      </div>
    );
  }

  if (!currentSegment) return null;

  return (
    <div className="h-dvh overflow-y-auto bg-[#F6F7F9] pb-24">
      {/* 헤더 */}
      <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-10 border-b border-black/5">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Navigation className="w-4 h-4 text-[#6B7280] flex-shrink-0" strokeWidth={2} />
            <div className="min-w-0">
              <span className="text-[15px] text-[#111827] font-medium">{currentRoute?.name ?? '내 경로'}</span>
              {currentRoute?.to && (
                <span className="text-[13px] text-[#9CA3AF] ml-1.5 truncate max-w-[160px] inline-block align-middle">· {currentRoute.to}</span>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className={`rounded-xl hover:bg-[#F1F3F5] w-9 h-9 ${isRefreshing ? 'animate-spin' : ''}`}
            >
              <RefreshCw className="w-[18px] h-[18px] text-[#6B7280]" strokeWidth={2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/routes')}
              className="rounded-xl hover:bg-[#F1F3F5] w-9 h-9"
            >
              <Settings className="w-[18px] h-[18px] text-[#6B7280]" strokeWidth={2} />
            </Button>
          </div>
        </div>
      </div>

      {/* 활성 경로 탭 — 2개 이상일 때만 표시 */}
      {activeRoutes.length > 1 && (
        <div className="bg-white border-b border-black/5">
          <div className="max-w-2xl mx-auto px-4 py-2 overflow-x-auto">
            <div className="flex gap-2 w-max">
              {activeRoutes.map((route) => {
                const isSelected = route.id === currentRoute?.id;
                return (
                  <button
                    key={route.id}
                    onClick={() => handleSelectRoute(route.id)}
                    className={`px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                      isSelected
                        ? 'bg-[#111827] text-white'
                        : 'bg-[#F1F3F5] text-[#6B7280] hover:bg-[#E5E7EB]'
                    }`}
                  >
                    {route.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {/* 전체 스텝 세로 타임라인 */}
        <div className="space-y-3">
          {groupedSegments.map((group, groupIdx) => {
            const isCurrent = groupIdx === currentGroupIndex;
            const isPast = groupIdx < currentGroupIndex;

            if (isPast) {
              // 완료된 스텝: 컴팩트 카드
              return (
                <div key={groupIdx} className="flex items-center gap-3 px-1">
                  {/* 체크 아이콘 */}
                  <div className="w-6 h-6 rounded-full bg-[#111827] flex items-center justify-center flex-shrink-0">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  {/* 정류장명 + 노선 */}
                  <div className="flex-1 min-w-0 bg-white rounded-2xl border border-black/5 px-4 py-3">
                    {group.map((seg) => (
                      <div key={seg.id} className="flex items-center justify-between gap-2">
                        <StopName name={seg.stop.displayName ?? seg.stop.name} alias={seg.stop.alias ?? undefined} size="sm" className="text-[#6B7280] truncate" />
                        <div className="flex gap-1 flex-shrink-0">
                          {seg.stop.lines.slice(0, 2).map(line => (
                            <span key={line} className="text-[12px] px-2 py-0.5 rounded-md bg-[#F1F3F5] text-[#9CA3AF]">
                              {seg.stop.type === 'subway' ? line : `${line}번`}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            if (isCurrent) {
              // 현재 스텝: 도착 정보 포함 강조 카드
              return (
                <div key={groupIdx}>
                  <div className="px-1 flex items-center justify-between mb-2">
                    <h3 className="text-[15px] font-semibold text-[#111827]">지금 타야할 교통수단</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[13px] text-[#6B7280] hover:text-[#111827] h-auto p-0 font-medium"
                      onClick={handleBoardingComplete}
                    >
                      탑승 완료
                    </Button>
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
                          className={`rounded-2xl border border-black/5 shadow-sm bg-white overflow-hidden ${isGrouped ? 'flex-1 min-w-0' : ''}`}
                        >
                          {/* 정류장 정보 */}
                          <div className={isGrouped ? "px-3 py-3 border-b border-black/5" : "p-5 border-b border-black/5"}>
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
                                  <div className="text-[11px] text-[#9CA3AF] font-mono mt-1">
                                    ARS {seg.stop.arsId}
                                  </div>
                                )}
                                {/* T14: fallback 안내 */}
                                {seg.stop.type === 'bus'
                                  && segArrivalData?.type === 'bus_by_stopid'
                                  && segArrivalData.data.provider === 'odsay_fallback' && (
                                  <div className="text-[11px] text-[#9CA3AF] mt-1">
                                    도착 정보가 부정확할 수 있어요 (제휴 데이터 사용)
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 버스/전철 도착 정보 */}
                          <div className="divide-y divide-black/5">
                            {segArrivalError ? (
                              <ArrivalErrorInline
                                code={segArrivalError.code}
                                isRetryable={segArrivalError.code === 'ARRIVAL_PROVIDER_ERROR'}
                                onRefresh={segArrivalError.code === 'ARRIVAL_PROVIDER_ERROR' ? handleRefresh : undefined}
                              />
                            ) : seg.stop.lines.length === 0 ? (
                              <div className="px-5 py-4 text-[14px] text-[#9CA3AF]">
                                노선 정보 없음
                              </div>
                            ) : (
                              seg.stop.lines.map((line, idx) => {
                                const isSubway = seg.stop.type === 'subway';
                                const stopRoute = seg.stop.stopRoutes?.find(r => r.routeName === line);
                                const busTypeInfo = !isSubway ? getBusTypeByOdsay(stopRoute?.busType, line) : null;
                                const subwayColorInfo = isSubway ? getSubwayColor(line) : null;

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
                                // T23: 방향 정보 없음 안내
                                const showNoDirection = isSubway
                                  && !seg.stop.directionHeadsign
                                  && !seg.stop.directionUpdn;

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
                                    <div key={line} className="px-3 py-3 hover:bg-[#F9FAFB] transition-colors">
                                      {/* 위 행: 아이콘 + 번호/타입 */}
                                      <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-xl bg-[#F9FAFB] flex items-center justify-center flex-shrink-0">
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
                                        <div className="min-w-0">
                                          <div className="text-[13px] font-semibold text-[#111827]">
                                            {isSubway ? line : `${line}번`}
                                          </div>
                                          <div className="flex items-center gap-1 mt-0.5">
                                            <span className="text-[11px] text-[#6B7280]">
                                              {isSubway ? '전철' : (busTypeInfo?.label ?? '') + '버스'}
                                            </span>
                                            {headsign && (
                                              <span
                                                className="text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap"
                                                style={subwayColorInfo
                                                  ? { backgroundColor: subwayColorInfo.bgColor, color: subwayColorInfo.textColor, borderColor: `${subwayColorInfo.color}33` }
                                                  : { backgroundColor: '#F1F3F5', color: '#6B7280', borderColor: '#E5E7EB' }
                                                }
                                              >
                                                {headsign}방향
                                              </span>
                                            )}
                                          </div>
                                          {showNoDirection && (
                                            <div className="text-[10px] text-[#9CA3AF] mt-0.5">
                                              방향 정보 없음
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* 아래 행: 도착 정보 — 카카오 스타일 (지하철: 행선지 prefix) */}
                                      <div className="mt-2 space-y-1.5">
                                        {isArrivalLoading ? (
                                          <div className="text-[12px] text-[#9CA3AF]">조회 중...</div>
                                        ) : noService ? (
                                          <div className="text-[12px] text-[#9CA3AF]">도착 정보 없음</div>
                                        ) : (
                                          <>
                                            {/* 첫 번째 차 — isUrgent 빨강 */}
                                            <div className="flex items-center gap-1.5" aria-label="이번 차">
                                              {item1Headsign && (
                                                <span className="text-[11px] text-[#6B7280] whitespace-nowrap font-medium">{item1Headsign}행</span>
                                              )}
                                              <span className={`text-[13px] font-bold tabular-nums whitespace-nowrap ${isUrgent ? 'text-[#DC2626]' : 'text-[#111827]'}`}>
                                                {arrivalTimeOnly}
                                              </span>
                                              {stopsBefore && (
                                                <span className="text-[10px] text-[#9CA3AF] whitespace-nowrap">{stopsBefore}</span>
                                              )}
                                            </div>
                                            {/* 두 번째 차 — 항상 회색 */}
                                            {arrivalText2 && (
                                              <div className="flex items-center gap-1.5" aria-label="다음 차">
                                                {item2Headsign && (
                                                  <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap">{item2Headsign}행</span>
                                                )}
                                                <span className="text-[12px] text-[#9CA3AF] tabular-nums whitespace-nowrap">{arrivalTimeOnly2}</span>
                                                {stopsBefore2 && (
                                                  <span className="text-[10px] text-[#9CA3AF] whitespace-nowrap">{stopsBefore2}</span>
                                                )}
                                              </div>
                                            )}
                                          </>
                                        )}
                                        {/* 지하철 3건 이상 토글 */}
                                        {hasMoreItems && (
                                          <button
                                            onClick={() => setExpandedLines(prev => ({ ...prev, [lineKey]: !prev[lineKey] }))}
                                            className="mt-0.5 p-0.5 rounded hover:bg-[#F1F3F5] transition-colors"
                                            aria-label={isLineExpanded ? '접기' : '더 보기'}
                                          >
                                            {isLineExpanded ? (
                                              <ChevronUp className="w-4 h-4 text-[#9CA3AF]" strokeWidth={2} />
                                            ) : (
                                              <ChevronDown className="w-4 h-4 text-[#9CA3AF]" strokeWidth={2} />
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
                                              return (
                                                <div key={`${lineKey}-extra-${extraIdx}`} className="flex items-center justify-between">
                                                  <div className="text-[11px] text-[#9CA3AF]">{label}</div>
                                                  <div className="text-[12px] text-[#9CA3AF] tabular-nums">{msg}</div>
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
                                  <div key={line} className="px-5 py-4 hover:bg-[#F9FAFB] transition-colors">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        {isSubway ? (
                                          <div className="w-10 h-10 rounded-xl bg-[#F9FAFB] flex items-center justify-center flex-shrink-0">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={subwayColorInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M12 12h0"/><path d="M9.75 9.75h4.5"/><path d="M7 15h10"/>
                                              <rect x="5" y="4" width="14" height="16" rx="2"/>
                                              <path d="M8 20l-2 2"/><path d="M16 20l2 2"/>
                                            </svg>
                                          </div>
                                        ) : (
                                          <div className="w-10 h-10 rounded-xl bg-[#F9FAFB] flex items-center justify-center flex-shrink-0">
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
                                            <div className="text-[15px] font-semibold text-[#111827] truncate max-w-[80px]">
                                              {isSubway ? line : `${line}번`}
                                            </div>
                                            {headsign && (
                                              <span
                                                className="text-[12px] font-medium px-2 py-0.5 rounded-md border whitespace-nowrap"
                                                style={subwayColorInfo
                                                  ? { backgroundColor: subwayColorInfo.bgColor, color: subwayColorInfo.textColor, borderColor: `${subwayColorInfo.color}33` }
                                                  : { backgroundColor: '#F1F3F5', color: '#6B7280', borderColor: '#E5E7EB' }
                                                }
                                              >
                                                {headsign}방향
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[13px] text-[#6B7280] whitespace-nowrap">
                                            {isSubway ? '전철' : (busTypeInfo?.label ?? '') + '버스'}
                                          </div>
                                          {/* T23: 방향 정보 없음 안내 */}
                                          {showNoDirection && (
                                            <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                                              방향 정보 없음 — 경로를 다시 등록하면 더 정확해요
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-start gap-2 flex-shrink-0">
                                        {/* 카카오 스타일 — 행선지 prefix + 시간, 두 번째 차 항상 회색 */}
                                        <div className="text-right space-y-1.5">
                                          {isArrivalLoading ? (
                                            <div className="flex items-center gap-1.5 justify-end">
                                              <Loader2 className="w-[14px] h-[14px] text-[#9CA3AF] animate-spin" strokeWidth={2} />
                                              <span className="text-[16px] text-[#9CA3AF] tabular-nums">조회 중...</span>
                                            </div>
                                          ) : noService ? (
                                            <span className="text-[14px] text-[#9CA3AF]">도착 정보 없음</span>
                                          ) : (
                                            <>
                                              {/* 첫 번째 차 */}
                                              <div className="flex items-center gap-1.5 justify-end" aria-label="이번 차">
                                                {item1Headsign && (
                                                  <span className="text-[12px] text-[#6B7280] whitespace-nowrap font-medium">{item1Headsign}행</span>
                                                )}
                                                <span className={`font-bold tabular-nums leading-tight whitespace-nowrap text-[18px] ${isUrgent ? 'text-[#DC2626]' : 'text-[#111827]'}`}>
                                                  {arrivalTimeOnly}
                                                </span>
                                                {stopsBefore && (
                                                  <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap">{stopsBefore}</span>
                                                )}
                                              </div>
                                              {/* 두 번째 차 — 항상 회색 */}
                                              {arrivalText2 && (
                                                <div className="flex items-center gap-1.5 justify-end" aria-label="다음 차">
                                                  {item2Headsign && (
                                                    <span className="text-[12px] text-[#9CA3AF] whitespace-nowrap">{item2Headsign}행</span>
                                                  )}
                                                  <span className="text-[14px] text-[#9CA3AF] tabular-nums whitespace-nowrap">{arrivalTimeOnly2}</span>
                                                  {stopsBefore2 && <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap">{stopsBefore2}</span>}
                                                </div>
                                              )}
                                            </>
                                          )}
                                        </div>
                                        {/* 지하철 3건 이상일 때 토글 버튼 */}
                                        {hasMoreItems && (
                                          <button
                                            onClick={() => setExpandedLines(prev => ({ ...prev, [lineKey]: !prev[lineKey] }))}
                                            className="mt-1 p-1 rounded-lg hover:bg-[#F1F3F5] transition-colors flex-shrink-0"
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

                                    {/* 펼침 시 추가 항목 */}
                                    {extraItems.length > 0 && (
                                      <div className="mt-2 ml-[52px] space-y-1">
                                        {extraItems.map((item, extraIdx) => {
                                          const label = extraIdx === 0 ? '3번째' : `${extraIdx + 3}번째`;
                                          const rawMsg = item.displayMsg ?? item.arrmsg1;
                                          const msg = item.displayMsg ? rawMsg : applyCountdownToArrmsg(rawMsg, elapsedSec, 'subway');
                                          return (
                                            <div key={`${lineKey}-extra-${extraIdx}`} className="flex items-center justify-between">
                                              <div className="text-[11px] text-[#9CA3AF]">{label}</div>
                                              <div className="text-[12px] text-[#9CA3AF] tabular-nums">{msg}</div>
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
                        className="rounded-2xl border border-black/5 bg-white overflow-hidden cursor-pointer h-full"
                        onClick={() => setExpandedUpcoming(prev => {
                          const next = new Set(prev)
                          next.has(groupIdx) ? next.delete(groupIdx) : next.add(groupIdx)
                          return next
                        })}
                      >
                        <div className="px-4 py-3 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="truncate">
                              <StopName name={seg.stop.displayName ?? seg.stop.name} alias={seg.stop.alias ?? undefined} size="sm" />
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {seg.stop.lines.slice(0, 3).map(line => (
                                <span key={line} className="text-[11px] px-1.5 py-0.5 rounded-md bg-[#F1F3F5] text-[#9CA3AF]">
                                  {seg.stop.type === 'subway' ? line : `${line}번`}
                                </span>
                              ))}
                              {seg.stop.lines.length > 3 && (
                                <span className="text-[11px] text-[#9CA3AF]">+{seg.stop.lines.length - 3}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            {isLoading ? (
                              <Loader2 className="w-3.5 h-3.5 text-[#9CA3AF] animate-spin" strokeWidth={2} />
                            ) : (
                              <ArrivalText
                                msg={fastestText}
                                className={`tabular-nums ${fastestText === '--' ? 'text-[#D1D5DB] text-[14px]' : 'text-[#374151]'}`}
                              />
                            )}
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-[#9CA3AF]" strokeWidth={2} />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#9CA3AF]" strokeWidth={2} />
                            )}
                          </div>
                        </div>

                        {/* 펼쳐지면 노선별 도착 상세 */}
                        {isExpanded && (
                          <div className="border-t border-black/5 divide-y divide-black/5">
                            {seg.stop.lines.length === 0 ? (
                              <div className="px-4 py-3 text-[13px] text-[#9CA3AF]">노선 정보 없음</div>
                            ) : (
                              seg.stop.lines.map((line, idx) => {
                                const isSubway = seg.stop.type === 'subway'
                                const stopRoute = seg.stop.stopRoutes?.find(r => r.routeName === line)
                                const busTypeInfo = !isSubway ? getBusTypeByOdsay(stopRoute?.busType, line) : null
                                const subwayColorInfo = isSubway ? getSubwayColor(line) : null
                                const rawMsg1 = getArrivalDisplay(seg.stop, line, arrData)
                                const rawMsg2 = getArrivalDisplay2(seg.stop, line, arrData)
                                const miniMode = isSubway ? 'subway' : 'bus'
                                const arrText = rawMsg1 !== '--' ? applyCountdownToArrmsg(rawMsg1, elapsedSec, miniMode) : '--'
                                const arrText2 = rawMsg2 ? applyCountdownToArrmsg(rawMsg2, elapsedSec, miniMode) : null
                                const noSvc = arrData !== null && arrText === '--'
                                return (
                                  <div key={line} className="px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isSubway ? subwayColorInfo?.color : busTypeInfo?.color ?? '#9CA3AF' }} />
                                      <div className="min-w-0">
                                        <div className="text-[13px] font-medium text-[#374151]">
                                          {isSubway ? line : `${line}번`}
                                        </div>
                                        <div className="text-[11px] text-[#9CA3AF]">
                                          {isSubway ? '전철' : (busTypeInfo?.label ?? '') + '버스'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-2">
                                      {isLoading ? (
                                        <div className="text-[12px] text-[#9CA3AF]">조회 중...</div>
                                      ) : (
                                        <>
                                          <div className={`text-[13px] font-semibold tabular-nums ${noSvc ? 'text-[#D1D5DB]' : 'text-[#374151]'}`}>
                                            {noSvc ? '도착 정보 없음' : arrText}
                                          </div>
                                          {arrText2 && (
                                            <div className="text-[11px] text-[#9CA3AF] tabular-nums">{arrText2}</div>
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
            <Card className="p-6 text-center rounded-2xl border border-black/5 shadow-sm bg-white">
              <div className="w-12 h-12 bg-[#111827] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-6 h-6 text-white" strokeWidth={2} />
              </div>
              <h3 className="text-[17px] font-semibold text-[#111827] mb-1">마지막 구간입니다</h3>
              <p className="text-[14px] text-[#6B7280]">곧 목적지에 도착합니다</p>
            </Card>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
