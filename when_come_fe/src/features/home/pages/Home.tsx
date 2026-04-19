import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Settings, RefreshCw, Navigation,
  ChevronRight, Clock, ChevronDown, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BottomNav from "@/components/BottomNav";
import { getBusType, getSubwayColor } from "@/utils/transitColors";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listRoutes } from "@/lib/api";
import { getJwt } from "@/lib/supabase";
import { mapApiRoute } from "@/lib/mappers";
import type { SavedRoute } from "@/lib/mockData";
import { fetchArrival, getArrivalDisplay, getArrivalMin } from "@/lib/arrival";
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

  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const currentRoute = activeRoutes.find(r => r.id === selectedRouteId) ?? activeRoutes[0];
  const currentSegment = currentRoute?.segments[currentSegmentIndex];
  const nextSegment = currentRoute?.segments[currentSegmentIndex + 1];

  const { data: arrivalData } = useQuery({
    queryKey: ['arrival', currentSegment?.stop.id, currentSegment?.stop.type, currentSegment?.stop.name],
    queryFn: () => fetchArrival(currentSegment!.stop),
    refetchInterval: 30_000,
    enabled: !!currentSegment,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      refetch(),
    ]);
    setIsRefreshing(false);
  };

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
          {activeRoutes.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-auto p-0 hover:bg-transparent font-normal">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-[#6B7280]" strokeWidth={2} />
                    <span className="text-[15px] text-[#111827] font-medium">{currentRoute.name}</span>
                    <ChevronDown className="w-4 h-4 text-[#6B7280]" strokeWidth={2} />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="rounded-xl border-black/5 min-w-[200px]">
                {activeRoutes.map((route) => (
                  <DropdownMenuItem
                    key={route.id}
                    onClick={() => {
                      setSelectedRouteId(route.id);
                      setCurrentSegmentIndex(0);
                    }}
                    className={`text-[14px] cursor-pointer ${route.id === (currentRoute?.id) ? 'bg-[#F9FAFB]' : ''}`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className="flex-1">
                        <div className="font-medium">{route.name}</div>
                        <div className="text-[12px] text-[#6B7280]">{route.from} → {route.to}</div>
                      </div>
                      {route.id === currentRoute?.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#111827]" />
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-[#6B7280]" strokeWidth={2} />
              <span className="text-[15px] text-[#111827] font-medium">{currentRoute?.name ?? '내 경로'}</span>
            </div>
          )}

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

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {/* 목적지 & ETA 카드 */}
        <Card className="p-5 rounded-2xl border border-black/5 shadow-sm bg-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-[#6B7280] mb-1">지금 출발하면</div>
              <div className="text-[22px] font-semibold text-[#111827]">{currentRoute.to}</div>
            </div>
            <div className="text-right">
              <div className="text-[13px] text-[#6B7280] mb-1">도착</div>
              <div className="text-[28px] font-bold text-[#111827] tracking-tight">
                35<span className="text-[20px]">분</span>
              </div>
            </div>
          </div>
        </Card>

        {/* 경로 타임라인 */}
        <Card className="p-4 rounded-2xl border border-black/5 shadow-sm bg-white">
          <div className="flex items-center gap-2 overflow-x-auto">
            {currentRoute.segments.map((segment, idx) => {
              const isPassed = segment.order < currentSegment.order;
              const isCurrent = segment.id === currentSegment.id;

              return (
                <div key={segment.id} className="flex items-center gap-2 flex-shrink-0">
                  <div className={`px-3 py-1.5 rounded-lg text-[13px] font-medium ${
                    isCurrent
                      ? 'bg-[#111827] text-white'
                      : isPassed
                        ? 'bg-[#F1F3F5] text-[#6B7280]'
                        : 'bg-[#F9FAFB] text-[#9CA3AF]'
                  }`}>
                    {segment.stop.type === 'bus' ? '버스' : '전철'}
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
              onClick={() => {
                if (currentSegmentIndex < currentRoute.segments.length - 1) {
                  setCurrentSegmentIndex(currentSegmentIndex + 1);
                }
              }}
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
                  <div className="flex items-center gap-2">
                    <MapPin className="w-[14px] h-[14px] text-[#6B7280]" strokeWidth={2} />
                    <span className="text-[14px] text-[#6B7280]">도보 150m</span>
                  </div>
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
                  const busTypeInfo = !isSubway ? getBusType(line) : null;
                  const subwayColorInfo = isSubway ? getSubwayColor(line) : null;
                  const arrivalText = getArrivalDisplay(currentSegment.stop, line, idx, arrivalData ?? null);
                  const arrivalMin = getArrivalMin(currentSegment.stop, line, idx, arrivalData ?? null);
                  const isUrgent = arrivalMin !== null && arrivalMin <= 3;

                  return (
                    <div key={line} className="px-5 py-4 flex items-center justify-between hover:bg-[#F9FAFB] transition-colors">
                      <div className="flex items-center gap-3">
                        {isSubway ? (
                          <div className="w-10 h-10 rounded-xl bg-[#F9FAFB] flex items-center justify-center">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={subwayColorInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 12h0"/><path d="M9.75 9.75h4.5"/><path d="M7 15h10"/>
                              <rect x="5" y="4" width="14" height="16" rx="2"/>
                              <path d="M8 20l-2 2"/><path d="M16 20l2 2"/>
                            </svg>
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-[#F9FAFB] flex items-center justify-center">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={busTypeInfo?.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>
                              <path d="m18 18 3-3-3-3"/>
                              <path d="M3 6h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2"/>
                              <circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>
                            </svg>
                          </div>
                        )}
                        <div>
                          <div className="text-[15px] font-semibold text-[#111827]">
                            {isSubway ? line : `${line}번`}
                          </div>
                          <div className="text-[13px] text-[#6B7280]">
                            {isSubway ? '전철' : (busTypeInfo?.label ?? '') + '버스'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-[14px] h-[14px] text-[#6B7280]" strokeWidth={2} />
                        <span className={`text-[18px] font-bold tabular-nums leading-tight ${isUrgent ? 'text-[#DC2626]' : 'text-[#111827]'}`}>
                          {arrivalText}
                        </span>
                      </div>
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
                <ChevronRight className="w-5 h-5 text-[#D1D5DB]" strokeWidth={2} />
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
