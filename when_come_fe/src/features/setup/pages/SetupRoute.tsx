import { useState, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search, MapPin, ChevronDown, ChevronUp, Loader2, Plus, ArrowLeftRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RouteNodeCard, { RouteNode } from "../components/RouteNodeCard";
import SearchResultNode, { SearchNodeData } from "../components/SearchResultNode";
import PlacePicker from "../components/PlacePicker";
import PageShell from "@/components/PageShell";
import PageHeader from "@/components/PageHeader";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { searchRoutes, saveRoute, getStopBuses } from "@/lib/api";
import { getJwt } from "@/lib/supabase";
import { subwayApiCodeToLineName, seoulBisTypeToOdsayBusType } from "@/utils/transitColors";
import { wayCodeToUpdn } from "@/utils/transitDirection";
import type { ApiPlace, ApiStop, ApiRouteOption } from "@/types/api";
import { toast } from "sonner";
import { showApiErrorToast } from "@/lib/errorToast";
import UnifiedStopPicker from "@/features/stop-picker/UnifiedStopPicker";
import type { PickerPayload } from "@/features/stop-picker/UnifiedStopPicker";

interface SearchRouteResult {
  routeId: string
  totalTime: number
  transferCount: number
  nodes: SearchNodeData[]
  totalTransferCount: number | null
  totalWalkMeters: number | null
  paymentWon: number | null
}

function formatWalkDistance(meters: number | null): string | null {
  if (meters === null) return null
  if (meters < 1000) return `도보 ${meters}m`
  return `도보 ${(meters / 1000).toFixed(1)}km`
}

function apiRouteToSearchResult(route: ApiRouteOption): SearchRouteResult {
  const nodes: SearchNodeData[] = route.segments.map((seg, idx) => {
    if (seg.type === 'subway') {
      const line = seg.lines[0]
      const lineName = line ? subwayApiCodeToLineName(line.subwayCode ?? '') || line.routeName : ''
      return {
        id: `${route.id}-${idx}`,
        name: seg.startName,
        type: 'subway',
        stopId: seg.startOdsayId ? String(seg.startOdsayId) : undefined,
        subwayLine: lineName,
        direction: seg.endName,
        way: seg.way ?? null,
        wayCode: seg.wayCode ?? null,
        endName: seg.endName ?? null,
        // route-search 응답의 subwayCode를 노드에 보존 — 저장 시 stopRoute로 복사됨
        subwayCode: line?.subwayCode ?? null,
      }
    }
    return {
      id: `${route.id}-${idx}`,
      name: seg.startName,
      type: 'bus',
      stopId: seg.startArsId ?? undefined,
      arsId: seg.startArsId ?? undefined,
      availableBuses: seg.lines.map(l => l.routeName),
      busLines: seg.lines.map(l => ({
        routeName: l.routeName,
        busRouteId: l.busRouteId ?? undefined,
        busType: l.busType,
      })),
    }
  })
  return {
    routeId: route.id,
    totalTime: route.totalMinutes,
    transferCount: route.transferCount,
    nodes,
    totalTransferCount: route.totalTransferCount ?? null,
    totalWalkMeters: route.totalWalkMeters ?? null,
    paymentWon: route.paymentWon ?? null,
  }
}

interface ReverseOfState {
  fromName: string;
  toName: string;
}

/** nodes 배열에서 다음 신규 stepGroup 번호를 계산 */
function nextStepGroupOf(nodes: RouteNode[]): number {
  if (nodes.length === 0) return 1
  return Math.max(...nodes.map(n => n.stepGroup)) + 1
}

// 같은 ms에 연속 호출되어도 충돌 안 나도록 랜덤 suffix 부여
// (전체 추가 루프에서 지하철 노드는 await 없이 빠르게 연속 추가됨)
function newNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function SetupRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const reverseOf = (location.state as { reverseOf?: ReverseOfState } | null)?.reverseOf ?? null;

  const [routeName, setRouteName] = useState('');
  const [startPlace, setStartPlace] = useState<ApiPlace | null>(null);
  const [endPlace, setEndPlace] = useState<ApiPlace | null>(null);

  // reverseOf 프리필: 출발지/도착지 placeholder 힌트용 이름
  const startPlaceholderHint = reverseOf?.fromName ?? '장소·주소 검색';
  const endPlaceholderHint = reverseOf?.toName ?? '장소·주소 검색';

  const [nodes, setNodes] = useState<RouteNode[]>([]);
  const [searchResults, setSearchResults] = useState<SearchRouteResult[]>([]);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingLockRef = useRef(false);

  // 대안 정류장 추가 모드: 어떤 stepGroup에 추가할지 (null = 일반 추가 모드)
  const [addingAlternativeToStep, setAddingAlternativeToStep] = useState<number | null>(null);

  // 정렬 옵션
  type SortKey = 'default' | 'time' | 'transfer' | 'walk'
  const [sortKey, setSortKey] = useState<SortKey>('default');
  // 더보기 (초기 3건 → 전체)
  const [showAll, setShowAll] = useState(false);

  /**
   * UnifiedStopPicker onComplete 핸들러 (수동 탭 전용).
   * bus: 노선 조회 후 노드 추가. subway: direction 필드 포함해 노드 추가.
   */
  const handleManualPickerComplete = async (payload: PickerPayload) => {
    const stop: ApiStop = payload.stop;
    const nodeId = newNodeId();
    const stepGroup = addingAlternativeToStep ?? nextStepGroupOf(nodes);
    const isAlternative = addingAlternativeToStep !== null;
    const orderInGroup = isAlternative
      ? nodes.filter(n => n.stepGroup === stepGroup).length + 1
      : 1;

    if (payload.type === 'bus') {
      const newNode: RouteNode = {
        id: nodeId,
        name: stop.name,
        type: 'bus',
        stepGroup,
        order: orderInGroup,
        stopId: stop.id,
        arsId: stop.arsId,
        lat: stop.lat,
        lng: stop.lng,
        busNumbers: [],
      };
      setNodes(prev => [...prev, newNode]);
      setAddingAlternativeToStep(null);

      if (stop.arsId) {
        try {
          const buses = await getStopBuses(stop.arsId);
          const mappedLines = buses.map(b => ({
            routeName: b.routeName,
            busRouteId: b.busRouteId,
            busType: seoulBisTypeToOdsayBusType(b.busRouteType),
            startStation: b.startStation,
            endStation: b.endStation,
          }));
          setNodes(prev =>
            prev.map(n => (n.id === nodeId ? { ...n, busLines: mappedLines } : n))
          );
        } catch {
          // 실패 시 수동 입력
        }
      }
    } else {
      // subway
      const dir = payload.direction;
      const lineName = stop.laneName ?? '';
      const newNode: RouteNode = {
        id: nodeId,
        name: stop.name,
        type: 'subway',
        stepGroup,
        order: orderInGroup,
        stopId: stop.id,
        lat: stop.lat,
        lng: stop.lng,
        subwayLine: lineName,
        direction: dir.nextStop || undefined,
        // UnifiedStopPicker에서 받은 방향 정보 — 저장 시 우선 사용
        directionUpdn: dir.updn,
        directionNextStop: dir.nextStop || null,
        // ODsay search-stops 응답의 stop 단위 subwayCode 복사
        subwayCode: stop.subwayCode ?? null,
      };
      setNodes(prev => [...prev, newNode]);
      setAddingAlternativeToStep(null);
    }
  };

  const handleAutoSearch = async () => {
    if (!startPlace || !endPlace) return;
    setIsSearching(true);
    try {
      const routes = await searchRoutes(
        parseFloat(startPlace.x), parseFloat(startPlace.y),
        parseFloat(endPlace.x), parseFloat(endPlace.y),
      );
      const results = routes.map(apiRouteToSearchResult);
      setSearchResults(results);
      setSortKey('default');
      setShowAll(false);
      if (results.length > 0) setExpandedRoutes(new Set([results[0].routeId]));
    } catch (e) {
      showApiErrorToast(e, '경로 검색에 실패했어요');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleRoute = (routeId: string) => {
    const next = new Set(expandedRoutes);
    next.has(routeId) ? next.delete(routeId) : next.add(routeId);
    setExpandedRoutes(next);
  };

  /**
   * 검색 결과 노드를 경로에 추가.
   * targetStepGroup 이 있으면 해당 스텝의 대안 정류장으로, 없으면 새 스텝으로 추가.
   */
  const handleAddNodeFromSearch = async (node: SearchNodeData, targetStepGroup?: number, forcedNewGroup?: number) => {
    const nodeId = newNodeId();
    const isAlternative = targetStepGroup !== undefined;
    const stepGroup = isAlternative
      ? targetStepGroup
      : (forcedNewGroup ?? nextStepGroupOf(nodes));
    const orderInGroup = isAlternative
      ? nodes.filter(n => n.stepGroup === stepGroup).length + 1
      : 1;

    const baseNode: RouteNode = {
      id: nodeId,
      name: node.name,
      type: node.type,
      stepGroup,
      order: orderInGroup,
      stopId: node.stopId,
      arsId: node.arsId,
      lat: node.lat,
      lng: node.lng,
      busNumbers: node.type === 'bus' ? (node.availableBuses ?? []) : undefined,
      busLines: node.busLines,
      subwayLine: node.subwayLine,
      direction: node.direction,
      way: node.way ?? null,
      wayCode: node.wayCode ?? null,
      endName: node.endName ?? null,
      subwayCode: node.subwayCode ?? null,
    };
    setNodes(prev => [...prev, baseNode]);

    if (node.type === 'bus' && node.arsId) {
      try {
        const buses = await getStopBuses(node.arsId);
        const stopBusLines = buses.map(b => ({ routeName: b.routeName, busRouteId: b.busRouteId, busType: seoulBisTypeToOdsayBusType(b.busRouteType), startStation: b.startStation, endStation: b.endStation }));
        setNodes(prev => prev.map(n => {
          if (n.id !== nodeId) return n;
          // 기존 busLines(route search busType 포함) + stop-buses 결과 merge, 중복은 기존 우선
          const merged = [...(n.busLines ?? [])];
          for (const sb of stopBusLines) {
            if (!merged.some(l => l.routeName === sb.routeName)) merged.push(sb);
          }
          return { ...n, busLines: merged };
        }));
      } catch {
        // 실패 시 기존 busLines 유지
      }
    }
  };

  const handleAddAllNodes = async (route: SearchRouteResult) => {
    // 이미 추가된 stopId 집합
    const existingStopIds = new Set(nodes.map(n => n.stopId).filter(Boolean));
    const newNodes = route.nodes.filter(n => !n.stopId || !existingStopIds.has(n.stopId));
    if (newNodes.length === 0) {
      toast.info('이미 모든 정류장이 추가되어 있습니다');
      return;
    }
    // 각 노드를 새 스텝으로 추가하기 위해 명시적으로 stepGroup 증가시켜 전달
    // (handleAddNodeFromSearch가 stale `nodes` 클로저를 보면 모든 노드가 같은 stepGroup이 되어 alternative로 들어가는 버그 방지)
    let nextGroup = nextStepGroupOf(nodes);
    for (const node of newNodes) {
      await handleAddNodeFromSearch(node, undefined, nextGroup);
      nextGroup += 1;
    }
    toast.success(`정류장 ${newNodes.length}개를 추가했어요`);
  };

  /**
   * 노드 제거 후 stepGroup 번호를 연속적으로 재정렬.
   * 같은 stepGroup 내 order도 재정렬.
   */
  const handleRemoveNode = (nodeId: string) => {
    setNodes(prev => {
      const filtered = prev.filter(n => n.id !== nodeId);
      const uniqueGroups = [...new Set(filtered.map(n => n.stepGroup))].sort((a, b) => a - b);
      const groupMap = new Map(uniqueGroups.map((g, i) => [g, i + 1]));
      const result: RouteNode[] = [];
      for (const oldGroup of uniqueGroups) {
        const newGroup = groupMap.get(oldGroup)!;
        filtered
          .filter(n => n.stepGroup === oldGroup)
          .forEach((n, idx) => result.push({ ...n, stepGroup: newGroup, order: idx + 1 }));
      }
      return result;
    });
  };

  /**
   * 같은 stepGroup 두 노드의 order를 교환 — Home 가로 2분할 좌/우 순서 변경.
   * 저장 버튼을 눌러야 BE에 반영됨 (로컬 state만 업데이트).
   */
  const handleSwapGroupOrder = (stepGroup: number) => {
    setNodes(prev => {
      const groupNodes = prev.filter(n => n.stepGroup === stepGroup);
      if (groupNodes.length !== 2) return prev;
      const [first, second] = groupNodes;
      return prev.map(n => {
        if (n.id === first.id) return { ...n, order: second.order };
        if (n.id === second.id) return { ...n, order: first.order };
        return n;
      });
    });
  };

  const handleUpdateBusNumbers = (nodeId: string, busNumbers: string[]) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, busNumbers } : n));
  };

  const sortedResults = useMemo<SearchRouteResult[]>(() => {
    if (sortKey === 'default') return searchResults;
    return [...searchResults].sort((a, b) => {
      if (sortKey === 'time') return a.totalTime - b.totalTime;
      if (sortKey === 'transfer') {
        const ta = a.totalTransferCount ?? Infinity;
        const tb = b.totalTransferCount ?? Infinity;
        return ta - tb;
      }
      if (sortKey === 'walk') {
        const wa = a.totalWalkMeters ?? Infinity;
        const wb = b.totalWalkMeters ?? Infinity;
        return wa - wb;
      }
      return 0;
    });
  }, [searchResults, sortKey]);

  const INITIAL_VISIBLE = 3;
  const visibleResults = showAll ? sortedResults : sortedResults.slice(0, INITIAL_VISIBLE);
  const remainingCount = sortedResults.length - INITIAL_VISIBLE;

  /** nodes를 stepGroup으로 묶어 정렬된 배열로 반환 */
  const groupedNodes = useMemo(() => {
    const groups = new Map<number, RouteNode[]>()
    for (const n of nodes) {
      if (!groups.has(n.stepGroup)) groups.set(n.stepGroup, [])
      groups.get(n.stepGroup)!.push(n)
    }
    // stepGroup 오름차순 + 그룹 내 order 오름차순 정렬 (swap 즉시 반영을 위해)
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([sg, gNodes]) => [sg, [...gNodes].sort((a, b) => a.order - b.order)] as [number, RouteNode[]])
  }, [nodes])

  /** bus 노드 중 선택된 노선이 없는 노드가 있는지 검사 */
  const hasBusNodeWithoutRoute = nodes.some(
    n => n.type === 'bus' && (!n.busNumbers || n.busNumbers.length === 0)
  );

  const handleSave = async () => {
    if (!routeName.trim() || nodes.length === 0) return;
    if (hasBusNodeWithoutRoute) return;
    if (savingLockRef.current) return;
    savingLockRef.current = true;
    setIsSaving(true);
    try {
      const jwt = await getJwt();
      if (!jwt) throw new Error('로그인이 필요합니다');

      const stops = nodes.map(node => ({
        odsayStopId: node.stopId ?? node.id,
        stopName: node.name,
        stopType: node.type,
        sequence: node.order,
        stepGroup: node.stepGroup,
        arsId: node.arsId,
        lat: node.lat,
        lng: node.lng,
        ...(node.type === 'subway' && {
          directionHeadsign: null, // D11: 저장 안 함
          // UnifiedStopPicker 경유 수동 추가면 directionUpdn/directionNextStop 직접 사용
          // 자동 검색(route-search) 경유라면 wayCode → updn 변환
          directionUpdn: node.directionUpdn ?? wayCodeToUpdn(node.wayCode),
          directionNextStop: node.directionNextStop ?? node.endName ?? null,
        }),
        stopRoutes: node.type === 'subway'
          ? [{
              odsayRouteId: node.stopId ?? node.id,
              routeName: node.subwayLine ?? '',
              stationName: node.name,
              subwayCode: node.subwayCode ?? null,
            }]
          : (node.busNumbers ?? []).map(busNum => {
              const lineInfo = node.busLines?.find(l => l.routeName === busNum);
              return {
                odsayRouteId: lineInfo?.busRouteId ?? busNum,
                routeName: busNum,
                busRouteId: lineInfo?.busRouteId ?? node.busRouteId,
                busType: lineInfo?.busType,
              };
            }),
      }));

      // 수동 등록 시 startPlace/endPlace는 null일 수 있음 → null로 전송 (placeholder string 저장 금지)
      const originName = startPlace?.name?.trim() || null;
      const destinationName = endPlace?.name?.trim() || null;

      await saveRoute({
        name: routeName.trim(),
        originName,
        destinationName,
        originCoords: startPlace ? { lat: parseFloat(startPlace.y), lng: parseFloat(startPlace.x) } : undefined,
        destinationCoords: endPlace ? { lat: parseFloat(endPlace.y), lng: parseFloat(endPlace.x) } : undefined,
        stops,
      }, jwt);

      queryClient.invalidateQueries({ queryKey: ['routes'] });

      const reverseState: ReverseOfState = { fromName: destinationName, toName: originName };
      toast.success('경로를 저장했어요', {
        description: '반대 방향 경로도 등록하시겠어요?',
        action: {
          label: '등록하기',
          onClick: () => {
            navigate('/setup', { state: { reverseOf: reverseState }, replace: false });
          },
        },
        duration: 6000,
      });
      navigate('/');
    } catch (e) {
      showApiErrorToast(e, '저장에 실패했어요');
    } finally {
      setIsSaving(false);
      savingLockRef.current = false;
    }
  };

  const reverseBadge = reverseOf ? (
    <span className="px-2 py-0.5 rounded-chip bg-surface-info-soft text-text-info text-caption font-medium">
      반대 방향 등록 중
    </span>
  ) : undefined;

  return (
    <PageShell reserveStickyFooter>
      <PageHeader back title="경로 등록" badge={reverseBadge} />

      <div className="max-w-[var(--page-max-width)] mx-auto px-[var(--page-padding-x)] pt-4 space-y-3">
        {/* 기본 정보 */}
        <Card className="p-5 rounded-card border border-border-subtle shadow-card bg-surface-card space-y-4">
          <div>
            <Label htmlFor="routeName" className="text-label font-medium text-text-primary mb-2 block">
              경로 이름
            </Label>
            <Input
              id="routeName"
              placeholder="출근 경로"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              className="rounded-control border-border-subtle h-11 text-body"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PlacePicker
              label="출발지"
              placeholder={startPlaceholderHint}
              value={startPlace}
              onChange={setStartPlace}
            />
            <PlacePicker
              label="도착지"
              placeholder={endPlaceholderHint}
              value={endPlace}
              onChange={setEndPlace}
            />
          </div>
        </Card>

        {/* 추가된 노드 — stepGroup 단위 렌더링 */}
        {nodes.length > 0 && (
          <Card className="p-4 rounded-card border border-border-subtle shadow-card bg-surface-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-body font-semibold text-text-primary">
                내 경로 ({groupedNodes.length}스텝 / {nodes.length}개 정류장)
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setNodes([]); setAddingAlternativeToStep(null); }}
                className="text-caption h-auto p-0 text-text-secondary hover:text-text-primary"
              >
                전체 삭제
              </Button>
            </div>
            <div className="space-y-3">
              {groupedNodes.map(([stepGroup, groupNodes]) => (
                <div key={stepGroup} className="relative">
                  {/* 스텝 레이블 (그룹이 2개 이상인 경우 시각 구분) */}
                  {groupNodes.length > 1 && (
                    <div className="flex items-center justify-between mb-1 px-1">
                      <span className="text-caption text-text-tertiary font-medium">
                        스텝 {stepGroup} — 빠른 버스 탑승
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSwapGroupOrder(stepGroup)}
                        className="rounded-control hover:bg-surface-muted w-9 h-9"
                        aria-label="정류장 순서 바꾸기"
                        title="정류장 순서 바꾸기 (Home 좌/우 위치 변경)"
                      >
                        <ArrowLeftRight className="w-[18px] h-[18px] text-text-secondary" strokeWidth={2} />
                      </Button>
                    </div>
                  )}
                  <div className={`space-y-1.5 ${groupNodes.length > 1 ? 'pl-2 border-l-2 border-surface-info-border' : ''}`}>
                    {groupNodes.map(node => (
                      <RouteNodeCard
                        key={node.id}
                        node={node}
                        onRemove={() => handleRemoveNode(node.id)}
                        onUpdateBusNumbers={(busNumbers) => handleUpdateBusNumbers(node.id, busNumbers)}
                        showGrip={groupNodes.length === 1}
                      />
                    ))}
                  </div>

                  {/* 대안 추가 버튼: 같은 스텝에 bus가 1개일 때만 노출 */}
                  {groupNodes.length < 2 && groupNodes[0]?.type === 'bus' && (
                    addingAlternativeToStep === stepGroup ? (
                      <button
                        onClick={() => setAddingAlternativeToStep(null)}
                        className="w-full mt-1.5 py-1.5 text-caption text-text-info border border-dashed border-surface-info-border rounded-control bg-surface-info-soft transition-colors"
                      >
                        대안 추가 취소
                      </button>
                    ) : (
                      <button
                        onClick={() => setAddingAlternativeToStep(stepGroup)}
                        className="w-full mt-1.5 py-1.5 text-caption text-text-secondary border border-dashed border-border-default rounded-control hover:bg-surface-input transition-colors"
                      >
                        + 대안 정류장 추가
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>

            {/* 대안 추가 모드 안내 */}
            {addingAlternativeToStep !== null && (
              <div className="mt-3 px-3 py-2.5 rounded-control bg-surface-info-soft border border-surface-info-border">
                <p className="text-caption text-text-info font-medium">
                  스텝 {addingAlternativeToStep}의 대안 정류장을 추가하세요
                </p>
                <p className="text-caption text-text-info mt-0.5 opacity-80">
                  아래 수동 등록 탭에서 정류장을 선택하거나, 자동 검색 결과에서 추가하세요
                </p>
              </div>
            )}
          </Card>
        )}

        {/* 노드 추가 */}
        <Tabs defaultValue="auto">
          <TabsList className="grid w-full grid-cols-2 bg-surface-card rounded-control border border-border-subtle p-1">
            <TabsTrigger
              value="auto"
              className="rounded-chip data-[state=active]:bg-text-primary data-[state=active]:text-white text-label font-medium"
            >
              자동 검색
            </TabsTrigger>
            <TabsTrigger
              value="manual"
              className="rounded-chip data-[state=active]:bg-text-primary data-[state=active]:text-white text-label font-medium"
            >
              수동 등록
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auto" className="space-y-3 mt-3">
            <Card className="p-4 rounded-card border border-border-subtle shadow-card bg-surface-card">
              <p className="text-label text-text-secondary mb-3">
                출발지·도착지를 선택하면 경로를 검색합니다
              </p>
              <Button
                onClick={handleAutoSearch}
                className="w-full bg-text-primary hover:bg-text-primary/90 rounded-control h-11 text-body font-medium text-white"
                disabled={!startPlace || !endPlace || isSearching}
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
                {/* 정렬 칩 */}
                <div className="flex gap-2 flex-wrap">
                  {([
                    { key: 'default', label: '추천' },
                    { key: 'time', label: '시간 짧은 순' },
                    { key: 'transfer', label: '환승 적은 순' },
                    { key: 'walk', label: '도보 적은 순' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => { setSortKey(key); setShowAll(false); }}
                      className={`px-3 py-1.5 rounded-pill text-caption font-medium transition-colors ${
                        sortKey === key
                          ? 'bg-text-primary text-white'
                          : 'bg-surface-muted text-text-secondary hover:bg-surface-muted/70'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {visibleResults.map((route, routeIdx) => (
                  <Card key={route.routeId} className="overflow-hidden rounded-card border border-border-subtle shadow-card bg-surface-card">
                    <Collapsible
                      open={expandedRoutes.has(route.routeId)}
                      onOpenChange={() => toggleRoute(route.routeId)}
                    >
                      <div className="px-4 pt-4 pb-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <CollapsibleTrigger asChild>
                            <button className="flex-1 text-left group">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-body font-semibold text-text-primary">추천 {routeIdx + 1}</span>
                                {expandedRoutes.has(route.routeId) ? (
                                  <ChevronUp className="w-4 h-4 text-text-tertiary" strokeWidth={2} />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-text-tertiary" strokeWidth={2} />
                                )}
                              </div>
                              {/* 부가 정보 chip */}
                              <div className="flex flex-wrap gap-1.5">
                                <span className="text-caption text-text-secondary bg-surface-muted px-2 py-0.5 rounded-chip">
                                  {route.totalTime}분
                                </span>
                                {route.totalTransferCount !== null && (
                                  <span className="text-caption text-text-secondary bg-surface-muted px-2 py-0.5 rounded-chip">
                                    {route.totalTransferCount === 0 ? '직통' : `환승 ${route.totalTransferCount}회`}
                                  </span>
                                )}
                                {route.totalWalkMeters !== null && (
                                  <span className="text-caption text-text-secondary bg-surface-muted px-2 py-0.5 rounded-chip">
                                    {formatWalkDistance(route.totalWalkMeters)}
                                  </span>
                                )}
                                {route.paymentWon !== null && (
                                  <span className="text-caption text-text-secondary bg-surface-muted px-2 py-0.5 rounded-chip">
                                    {route.paymentWon.toLocaleString()}원
                                  </span>
                                )}
                              </div>
                            </button>
                          </CollapsibleTrigger>

                          {/* 전체 경로 추가 버튼 */}
                          <button
                            onClick={() => handleAddAllNodes(route)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-control bg-text-primary hover:bg-text-primary/90 text-white text-caption font-medium transition-colors flex-shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                            전체 추가
                          </button>
                        </div>
                      </div>

                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-2 space-y-2 border-t border-border-subtle mt-2">
                          {route.nodes.map((node) => (
                            <SearchResultNode
                              key={node.id}
                              node={node}
                              routeIndex={routeIdx}
                              onAdd={(n) => handleAddNodeFromSearch(n, addingAlternativeToStep ?? undefined)}
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                ))}

                {/* 더보기 버튼 */}
                {!showAll && remainingCount > 0 && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="w-full py-3 rounded-card border border-border-subtle bg-surface-card text-label text-text-secondary font-medium hover:bg-surface-input transition-colors"
                  >
                    더보기 (남은 {remainingCount}개)
                  </button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 mt-3">
            <Card className="p-4 rounded-card border border-border-subtle shadow-card bg-surface-card">
              {addingAlternativeToStep !== null && (
                <p className="text-caption text-text-info font-medium mb-3">
                  스텝 {addingAlternativeToStep} 대안 정류장 검색
                </p>
              )}
              <UnifiedStopPicker
                onComplete={handleManualPickerComplete}
                onCancel={() => setAddingAlternativeToStep(null)}
              />
            </Card>
          </TabsContent>
        </Tabs>

      </div>

      {/* Sticky 저장 버튼 — BottomNav 위에 고정 */}
      {nodes.length > 0 && (
        <div
          className="fixed left-0 right-0 z-20 px-4 pb-3 pt-2"
          style={{
            bottom: 'calc(var(--bottom-nav-total) + var(--keyboard-inset-height, 0px))',
            background: 'linear-gradient(to top, var(--surface-page) 60%, transparent)',
          }}
        >
          <div className="max-w-[var(--page-max-width)] mx-auto space-y-1.5">
            {hasBusNodeWithoutRoute && (
              <p className="text-center text-caption text-text-danger font-medium">
                모든 정류장에 노선을 선택해주세요
              </p>
            )}
            <Button
              onClick={handleSave}
              className="w-full rounded-control h-12 text-body font-medium text-white shadow-floating disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: hasBusNodeWithoutRoute || !routeName.trim() ? 'var(--text-tertiary)' : 'var(--text-primary)',
              }}
              size="lg"
              disabled={!routeName.trim() || isSaving || hasBusNodeWithoutRoute}
            >
              {isSaving ? (
                <Loader2 className="w-[18px] h-[18px] mr-2 animate-spin" />
              ) : (
                <MapPin className="w-[18px] h-[18px] mr-2" strokeWidth={2} />
              )}
              경로 저장하기
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
