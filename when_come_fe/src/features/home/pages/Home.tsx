import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MapPin, Settings, RefreshCw, Navigation,
  ChevronRight, ChevronDown, ChevronUp, Clock, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BottomNav from "@/components/BottomNav";
import { getBusTypeByOdsay, getSubwayColor } from "@/utils/transitColors";
import { listRoutes } from "@/lib/api";
import { getJwt } from "@/lib/supabase";
import { mapApiRoute } from "@/lib/mappers";
import type { SavedRoute } from "@/lib/mockData";
import { fetchArrival, getArrivalDisplay, getArrivalDisplay2, getArrivalMin, applyCountdownToArrmsg, getMatchedSubwayItems } from "@/lib/arrival";
import type { ArrivalData } from "@/lib/arrival";

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

  const SELECTED_ROUTE_KEY = 'when_come:selectedRouteId';

  const [selectedRouteId, setSelectedRouteId] = useState<string>(() => {
    return localStorage.getItem(SELECTED_ROUTE_KEY) ?? '';
  });
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // 호선별 도착 정보 펼침 상태 (key = line 이름)
  const [expandedLines, setExpandedLines] = useState<Record<string, boolean>>({});

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
  const nextSegment = currentRoute?.segments[currentSegmentIndex + 1];

  const { data: arrivalData, refetch: refetchArrival } = useQuery({
    queryKey: ['arrival', currentSegment?.stop.id, currentSegment?.stop.type, currentSegment?.stop.name],
    queryFn: () => fetchArrival(currentSegment!.stop),
    // refetchInterval: 30_000, // 프로덕션 시 복원
    enabled: !!currentSegment,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // 도착 데이터가 갱신될 때마다 기준 시각 기록
  const fetchedAtRef = useRef(Date.now());
  useEffect(() => {
    fetchedAtRef.current = Date.now();
  }, [arrivalData]);

  // 세그먼트가 바뀌면 펼침 상태 초기화
  useEffect(() => {
    setExpandedLines({});
  }, [currentSegmentIndex]);

  // 1초마다 리렌더링 → 카운트다운 효과
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetch(), refetchArrival()]);
    setIsRefreshing(false);
  };

  function handleBoardingComplete() {
    if (!currentRoute || currentSegmentIndex >= currentRoute.segments.length - 1) return;
    const prevIndex = currentSegmentIndex;
    setCurrentSegmentIndex(prevIndex + 1);
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
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center pb-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#6B7280]" />
        <BottomNav />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-4 pb-20">
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
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-4 pb-20">
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
    <div className="min-h-screen bg-[#F6F7F9] pb-24">
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
        {/* 경로 타임라인 */}
        <Card className="p-4 rounded-2xl border border-black/5 shadow-sm bg-white">
          <div className="flex items-center gap-2 overflow-x-auto">
            {currentRoute.segments.map((segment, idx) => {
              const isPassed = segment.order < currentSegment.order;
              const isCurrent = segment.id === currentSegment.id;
              const firstLine = segment.stop.lines[0] ?? null;
              const isSubwaySeg = segment.stop.type === 'subway';
              const subwayInfo = isSubwaySeg && firstLine ? getSubwayColor(firstLine) : null;
              const busInfo = !isSubwaySeg && firstLine
                ? getBusTypeByOdsay(segment.stop.stopRoutes?.find(r => r.routeName === firstLine)?.busType, firstLine)
                : null;

              const chipLabel = firstLine
                ? (isSubwaySeg ? firstLine : `${firstLine}번`)
                : (isSubwaySeg ? '전철' : '버스');

              let chipStyle: React.CSSProperties = {};
              let chipClassName = `px-3 py-1.5 rounded-lg text-[13px] font-medium`;

              if (isCurrent) {
                chipClassName += ' bg-[#111827] text-white';
              } else if (isPassed) {
                chipClassName += ' bg-[#F1F3F5] text-[#6B7280]';
              } else if (subwayInfo && firstLine) {
                chipStyle = { backgroundColor: subwayInfo.bgColor, color: subwayInfo.textColor };
              } else if (busInfo && firstLine) {
                chipStyle = { backgroundColor: busInfo.bgColor, color: busInfo.color };
              } else {
                chipClassName += ' bg-[#F9FAFB] text-[#9CA3AF]';
              }

              return (
                <div key={segment.id} className="flex items-center gap-2 flex-shrink-0">
                  <div className={chipClassName} style={chipStyle}>
                    {chipLabel}
                  </div>
                  {idx < currentRoute.segments.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-[#D1D5DB]" strokeWidth={2} />
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* 현재 타야할 교통수단 */}
        <div className="space-y-2">
          <div className="px-1 flex items-center justify-between">
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

          <Card className="rounded-2xl border border-black/5 shadow-sm bg-white overflow-hidden">
            {/* 정류장 정보 */}
            <div className="p-5 border-b border-black/5">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h4 className="text-[18px] font-semibold text-[#111827] mb-1">
                    {currentSegment.stop.name}
                  </h4>
                  {currentSegment.stop.type === 'bus' && currentSegment.stop.arsId && (
                    <div className="text-[11px] text-[#9CA3AF] font-mono mt-1">
                      ARS {currentSegment.stop.arsId}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 버스/전철 도착 정보 */}
            <div className="divide-y divide-black/5">
              {currentSegment.stop.lines.length === 0 ? (
                <div className="px-5 py-4 text-[14px] text-[#9CA3AF]">
                  노선 정보 없음
                </div>
              ) : (
                currentSegment.stop.lines.map((line, idx) => {
                  const isSubway = currentSegment.stop.type === 'subway';
                  const stopRoute = currentSegment.stop.stopRoutes?.find(r => r.routeName === line);
                  const busTypeInfo = !isSubway ? getBusTypeByOdsay(stopRoute?.busType, line) : null;
                  const subwayColorInfo = isSubway ? getSubwayColor(line) : null;

                  const elapsedSec = (Date.now() - fetchedAtRef.current) / 1000;
                  const rawMsg1 = getArrivalDisplay(currentSegment.stop, line, idx, arrivalData ?? null);
                  const rawMsg2 = getArrivalDisplay2(currentSegment.stop, line, idx, arrivalData ?? null);
                  const arrivalText = rawMsg1 !== '--' ? applyCountdownToArrmsg(rawMsg1, elapsedSec) : '--';
                  const arrivalText2 = rawMsg2 ? applyCountdownToArrmsg(rawMsg2, elapsedSec) : null;
                  const baseMin = getArrivalMin(currentSegment.stop, line, idx, arrivalData ?? null);
                  const remainSec = baseMin !== null ? Math.max(0, baseMin * 60 - elapsedSec) : null;
                  const isUrgent = remainSec !== null && remainSec < 180;
                  const noService = arrivalData !== undefined && arrivalText === '--';

                  // T22: 지하철 방향 배지 — directionHeadsign이 있을 때만 표시
                  const headsign = isSubway ? (currentSegment.stop.directionHeadsign ?? null) : null;
                  // T23: 방향 정보 없음 안내 — 지하철이고 headsign/updn 둘 다 null일 때
                  const showNoDirection = isSubway
                    && !currentSegment.stop.directionHeadsign
                    && !currentSegment.stop.directionUpdn;

                  // 지하철: 매칭된 모든 item (3건 이상이면 토글 버튼 노출)
                  const matchedSubwayItems = isSubway
                    ? getMatchedSubwayItems(currentSegment.stop, line, arrivalData ?? null)
                    : [];
                  const hasMoreItems = isSubway && matchedSubwayItems.length > 2;
                  const isLineExpanded = expandedLines[line] ?? false;

                  // 펼침 시 보여줄 추가 항목 (3번째 이후)
                  const extraItems = hasMoreItems && isLineExpanded
                    ? matchedSubwayItems.slice(2)
                    : [];

                  function handleToggleLine() {
                    setExpandedLines(prev => ({ ...prev, [line]: !prev[line] }));
                  }

                  return (
                    <div key={line} className="px-5 py-4 hover:bg-[#F9FAFB] transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
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
                          <div>
                            {/* T22: 호선명 + 헤드사인 배지 */}
                            <div className="flex items-center gap-1.5">
                              <div className="text-[15px] font-semibold text-[#111827]">
                                {isSubway ? line : `${line}번`}
                              </div>
                              {headsign && (
                                <span
                                  className="text-[12px] font-medium px-2 py-0.5 rounded-md border"
                                  style={subwayColorInfo
                                    ? { backgroundColor: subwayColorInfo.bgColor, color: subwayColorInfo.textColor, borderColor: `${subwayColorInfo.color}33` }
                                    : { backgroundColor: '#F1F3F5', color: '#6B7280', borderColor: '#E5E7EB' }
                                  }
                                >
                                  {headsign}방향
                                </span>
                              )}
                            </div>
                            <div className="text-[13px] text-[#6B7280]">
                              {isSubway ? '전철' : (busTypeInfo?.label ?? '') + '버스'}
                            </div>
                            {/* T23: 방향 정보 없음 안내 (지하철이고 방향 정보 미저장 시) */}
                            {showNoDirection && (
                              <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                                방향 정보 없음 — 경로를 다시 등록하면 더 정확해요
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <div className="text-right space-y-1">
                            <div>
                              <div className="text-[11px] text-[#9CA3AF] text-right leading-none mb-0.5">이번 차</div>
                              <div className="flex items-center gap-2 justify-end">
                                <Clock className="w-[14px] h-[14px] text-[#6B7280]" strokeWidth={2} />
                                <span className={`text-[18px] font-bold tabular-nums leading-tight ${isUrgent ? 'text-[#DC2626]' : noService ? 'text-[#9CA3AF]' : 'text-[#111827]'}`}>
                                  {noService ? '운행 없음' : arrivalText}
                                </span>
                              </div>
                            </div>
                            {arrivalText2 && (
                              <div>
                                <div className="text-[11px] text-[#9CA3AF] text-right leading-none mb-0.5">다음 차</div>
                                <div className="text-[12px] text-[#9CA3AF] tabular-nums text-right">
                                  {arrivalText2}
                                </div>
                              </div>
                            )}
                          </div>
                          {/* 지하철 3건 이상일 때 토글 버튼 */}
                          {hasMoreItems && (
                            <button
                              onClick={handleToggleLine}
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
                            const msg = applyCountdownToArrmsg(item.arrmsg1, elapsedSec);
                            return (
                              <div key={`${line}-extra-${extraIdx}`} className="flex items-center justify-between">
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
        </div>

        {/* 다음 교통수단 */}
        {nextSegment && (
          <div className="space-y-2">
            <h3 className="text-[15px] font-semibold text-[#111827] px-1">다음 교통수단</h3>
            <Card className="p-4 rounded-2xl border border-black/5 shadow-sm bg-white">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-[15px] font-medium text-[#111827] mb-2">
                    {nextSegment.stop.name}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {nextSegment.stop.lines.slice(0, 3).map(line => {
                      const isSubway = nextSegment.stop.type === 'subway';
                      return (
                        <span
                          key={line}
                          className="text-[13px] px-2 py-1 rounded-md font-medium text-[#6B7280] bg-[#F1F3F5]"
                        >
                          {isSubway ? line : `${line}번`}
                        </span>
                      );
                    })}
                    {nextSegment.stop.lines.length > 3 && (
                      <span className="text-[13px] px-2 py-1 text-[#9CA3AF]">
                        외 {nextSegment.stop.lines.length - 3}개
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* 경로 완료 */}
        {currentSegmentIndex === currentRoute.segments.length - 1 && (
          <Card className="p-6 text-center rounded-2xl border border-black/5 shadow-sm bg-white">
            <div className="w-12 h-12 bg-[#111827] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-6 h-6 text-white" strokeWidth={2} />
            </div>
            <h3 className="text-[17px] font-semibold text-[#111827] mb-1">마지막 구간입니다</h3>
            <p className="text-[14px] text-[#6B7280]">곧 목적지에 도착합니다</p>
          </Card>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
