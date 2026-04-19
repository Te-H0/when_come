import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Search, MapPin, ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RouteNodeCard, { RouteNode } from "../components/RouteNodeCard";
import SearchResultNode, { SearchNodeData } from "../components/SearchResultNode";
import StopPicker from "../components/StopPicker";
import BottomNav from "@/components/BottomNav";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { searchStops, searchRoutes, saveRoute } from "@/lib/api";
import { getJwt } from "@/lib/supabase";
import { subwayCodeToLineName } from "@/utils/transitColors";
import type { ApiStop, ApiRouteOption } from "@/types/api";
import { toast } from "sonner";

function apiRouteToSearchResult(route: ApiRouteOption): {
  routeId: string
  totalTime: number
  transferCount: number
  nodes: SearchNodeData[]
} {
  const nodes: SearchNodeData[] = route.segments.map((seg, idx) => {
    if (seg.type === 'subway') {
      const line = seg.lines[0]
      const lineName = line ? subwayCodeToLineName(line.subwayCode) || line.routeName : ''
      return {
        id: `${route.id}-${idx}`,
        name: seg.startName,
        type: 'subway',
        subwayLine: lineName,
        direction: seg.endName,
      }
    }
    return {
      id: `${route.id}-${idx}`,
      name: seg.startName,
      type: 'bus',
      availableBuses: seg.lines.map(l => l.routeName),
      busRouteId: seg.lines[0]?.busRouteId ?? undefined,
    }
  })
  return { routeId: route.id, totalTime: route.totalMinutes, transferCount: route.transferCount, nodes }
}

export default function SetupRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [routeName, setRouteName] = useState('');
  const [startStop, setStartStop] = useState<ApiStop | null>(null);
  const [endStop, setEndStop] = useState<ApiStop | null>(null);

  const [nodes, setNodes] = useState<RouteNode[]>([]);
  const [searchResults, setSearchResults] = useState<ReturnType<typeof apiRouteToSearchResult>[]>([]);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [manualQuery, setManualQuery] = useState('');
  const [manualResults, setManualResults] = useState<ApiStop[]>([]);
  const [isManualLoading, setIsManualLoading] = useState(false);
  const manualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (manualTimerRef.current) clearTimeout(manualTimerRef.current)
    }
  }, [])

  const handleManualSearch = (text: string) => {
    setManualQuery(text);
    if (manualTimerRef.current) clearTimeout(manualTimerRef.current);
    if (!text.trim()) { setManualResults([]); return; }
    manualTimerRef.current = setTimeout(async () => {
      setIsManualLoading(true);
      try {
        const data = await searchStops(text);
        setManualResults(data.slice(0, 10));
      } catch {
        setManualResults([]);
      } finally {
        setIsManualLoading(false);
      }
    }, 300);
  };

  const handleAutoSearch = async () => {
    if (!startStop || !endStop) return;
    setIsSearching(true);
    try {
      const routes = await searchRoutes(startStop.lng, startStop.lat, endStop.lng, endStop.lat);
      const results = routes.map(apiRouteToSearchResult);
      setSearchResults(results);
      if (results.length > 0) setExpandedRoutes(new Set([results[0].routeId]));
    } catch {
      toast.error('경로 검색에 실패했습니다');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleRoute = (routeId: string) => {
    const next = new Set(expandedRoutes);
    next.has(routeId) ? next.delete(routeId) : next.add(routeId);
    setExpandedRoutes(next);
  };

  const handleAddNodeFromSearch = (node: SearchNodeData) => {
    const newNode: RouteNode = {
      id: `node-${Date.now()}`,
      name: node.name,
      type: node.type,
      order: nodes.length + 1,
      stopId: node.stopId,
      lat: node.lat,
      lng: node.lng,
      busNumbers: node.type === 'bus' ? (node.availableBuses ?? []) : undefined,
      subwayLine: node.subwayLine,
      direction: node.direction,
      busRouteId: node.busRouteId,
    };
    setNodes(prev => [...prev, newNode]);
  };

  const handleAddNodeManual = (stop: ApiStop) => {
    const newNode: RouteNode = {
      id: `node-${Date.now()}`,
      name: stop.name,
      type: stop.type,
      order: nodes.length + 1,
      stopId: stop.id,
      lat: stop.lat,
      lng: stop.lng,
      busNumbers: stop.type === 'bus' ? [] : undefined,
    };
    setNodes(prev => [...prev, newNode]);
    setManualQuery('');
    setManualResults([]);
  };

  const handleRemoveNode = (nodeId: string) => {
    const filtered = nodes.filter(n => n.id !== nodeId);
    setNodes(filtered.map((n, idx) => ({ ...n, order: idx + 1 })));
  };

  const handleUpdateBusNumbers = (nodeId: string, busNumbers: string[]) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, busNumbers } : n));
  };

  const handleSave = async () => {
    if (!routeName.trim() || nodes.length === 0) return;
    setIsSaving(true);
    try {
      const jwt = await getJwt();
      if (!jwt) throw new Error('로그인이 필요합니다');

      const stops = nodes.map(node => ({
        odsayStopId: node.stopId ?? node.id,
        stopName: node.name,
        stopType: node.type,
        sequence: node.order,
        stopRoutes: node.type === 'subway'
          ? [{
              odsayRouteId: node.stopId ?? node.id,
              routeName: node.subwayLine ?? '',
              stationName: node.name,
            }]
          : (node.busNumbers ?? []).map(busNum => ({
              odsayRouteId: node.busRouteId ?? busNum,
              routeName: busNum,
              busRouteId: node.busRouteId,
            })),
      }));

      await saveRoute({
        name: routeName.trim(),
        originName: startStop?.name ?? '출발지',
        destinationName: endStop?.name ?? '도착지',
        originCoords: startStop ? { lat: startStop.lat, lng: startStop.lng } : undefined,
        destinationCoords: endStop ? { lat: endStop.lat, lng: endStop.lng } : undefined,
        stops,
      }, jwt);

      queryClient.invalidateQueries({ queryKey: ['routes'] });
      toast.success('경로가 저장되었습니다');
      navigate('/');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했습니다');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24">
      {/* 헤더 */}
      <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-10 border-b border-black/5">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-xl w-9 h-9">
            <ArrowLeft className="w-5 h-5" strokeWidth={2} />
          </Button>
          <h1 className="text-[17px] font-semibold text-[#111827]">경로 등록</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {/* 기본 정보 */}
        <Card className="p-5 rounded-2xl border border-black/5 shadow-sm bg-white space-y-4">
          <div>
            <Label htmlFor="routeName" className="text-[14px] font-medium text-[#111827] mb-2 block">
              경로 이름
            </Label>
            <Input
              id="routeName"
              placeholder="출근 경로"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              className="rounded-xl border-black/5 h-11 text-[15px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StopPicker
              label="출발지"
              placeholder="정류장·역 검색"
              value={startStop}
              onChange={setStartStop}
            />
            <StopPicker
              label="도착지"
              placeholder="정류장·역 검색"
              value={endStop}
              onChange={setEndStop}
            />
          </div>
        </Card>

        {/* 추가된 노드 */}
        {nodes.length > 0 && (
          <Card className="p-4 rounded-2xl border border-black/5 shadow-sm bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-semibold text-[#111827]">내 경로 ({nodes.length})</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNodes([])}
                className="text-[13px] h-auto p-0 text-[#6B7280] hover:text-[#111827]"
              >
                전체 삭제
              </Button>
            </div>
            <div className="space-y-2">
              {nodes.map((node) => (
                <RouteNodeCard
                  key={node.id}
                  node={node}
                  onRemove={() => handleRemoveNode(node.id)}
                  onUpdateBusNumbers={(busNumbers) => handleUpdateBusNumbers(node.id, busNumbers)}
                />
              ))}
            </div>
          </Card>
        )}

        {/* 노드 추가 */}
        <Tabs defaultValue="auto">
          <TabsList className="grid w-full grid-cols-2 bg-white rounded-xl border border-black/5 p-1">
            <TabsTrigger
              value="auto"
              className="rounded-lg data-[state=active]:bg-[#111827] data-[state=active]:text-white text-[14px] font-medium"
            >
              자동 검색
            </TabsTrigger>
            <TabsTrigger
              value="manual"
              className="rounded-lg data-[state=active]:bg-[#111827] data-[state=active]:text-white text-[14px] font-medium"
            >
              수동 등록
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auto" className="space-y-3 mt-3">
            <Card className="p-4 rounded-2xl border border-black/5 shadow-sm bg-white">
              <p className="text-[14px] text-[#6B7280] mb-3">
                출발지·도착지를 선택하면 경로를 검색합니다
              </p>
              <Button
                onClick={handleAutoSearch}
                className="w-full bg-[#111827] hover:bg-[#1F2937] rounded-xl h-11 text-[15px] font-medium"
                disabled={!startStop || !endStop || isSearching}
              >
                {isSearching ? (
                  <Loader2 className="w-[18px] h-[18px] mr-2 animate-spin" />
                ) : (
                  <Search className="w-[18px] h-[18px] mr-2" strokeWidth={2} />
                )}
                경로 검색
              </Button>
            </Card>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((route, routeIdx) => (
                  <Card key={route.routeId} className="overflow-hidden rounded-2xl border border-black/5 shadow-sm bg-white">
                    <Collapsible
                      open={expandedRoutes.has(route.routeId)}
                      onOpenChange={() => toggleRoute(route.routeId)}
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full p-4 h-auto hover:bg-[#F9FAFB] transition-colors justify-between rounded-none"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="text-left">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[15px] font-semibold text-[#111827]">경로 {routeIdx + 1}</span>
                              </div>
                              <div className="flex items-center gap-3 text-[13px] text-[#6B7280]">
                                <span>{route.totalTime}분</span>
                                <span>환승 {route.transferCount}회</span>
                              </div>
                            </div>
                            {expandedRoutes.has(route.routeId) ? (
                              <ChevronUp className="w-5 h-5 text-[#6B7280] flex-shrink-0" strokeWidth={2} />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-[#6B7280] flex-shrink-0" strokeWidth={2} />
                            )}
                          </div>
                        </Button>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="p-3 space-y-2 border-t border-black/5">
                          {route.nodes.map((node) => (
                            <SearchResultNode
                              key={node.id}
                              node={node}
                              routeIndex={routeIdx}
                              onAdd={handleAddNodeFromSearch}
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 mt-3">
            <Card className="p-4 rounded-2xl border border-black/5 shadow-sm bg-white">
              <Label htmlFor="manualSearch" className="text-[14px] font-medium text-[#111827] mb-2 block">
                정류장/역 검색
              </Label>
              <div className="relative">
                <Input
                  id="manualSearch"
                  placeholder="정류장 또는 역 이름"
                  value={manualQuery}
                  onChange={(e) => handleManualSearch(e.target.value)}
                  className="rounded-xl border-black/5 h-11 text-[15px] pr-10"
                />
                {isManualLoading && (
                  <Loader2 className="absolute right-3 top-3 w-5 h-5 text-[#9CA3AF] animate-spin" />
                )}
              </div>

              {manualResults.length > 0 && (
                <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                  {manualResults.map((stop) => (
                    <div
                      key={stop.id}
                      className="p-3 rounded-xl hover:bg-[#F9FAFB] cursor-pointer transition-colors border border-black/5"
                      onClick={() => handleAddNodeManual(stop)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[15px] font-medium text-[#111827]">{stop.name}</div>
                          <div className="text-[13px] text-[#6B7280] mt-0.5">
                            {stop.type === 'bus' ? '버스 정류장' : '지하철역'}
                          </div>
                        </div>
                        <div className="px-2 py-1 rounded-lg bg-[#F1F3F5] text-[12px] font-medium text-[#6B7280]">
                          {stop.type === 'bus' ? '버스' : '지하철'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {/* 저장 */}
        {nodes.length > 0 && (
          <Button
            onClick={handleSave}
            className="w-full bg-[#111827] hover:bg-[#1F2937] rounded-xl h-12 text-[15px] font-medium shadow-sm"
            size="lg"
            disabled={!routeName.trim() || isSaving}
          >
            {isSaving ? (
              <Loader2 className="w-[18px] h-[18px] mr-2 animate-spin" />
            ) : (
              <MapPin className="w-[18px] h-[18px] mr-2" strokeWidth={2} />
            )}
            경로 저장하기
          </Button>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
