import { Bus, Train, X, Plus, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { getBusTypeByOdsay, getSubwayColor } from "@/utils/transitColors";
import { formatStationName } from "@/utils/stationName";
import StopName from "@/components/StopName";

export interface RouteNode {
  id: string;
  name: string;
  type: 'bus' | 'subway';
  stepGroup: number;     // 1-based. 같은 stepGroup = 같은 스텝의 대안 정류장
  order: number;         // stepGroup 내 순서 (1-based)
  stopId?: string;   // 버스: ARS ID, 지하철: ODsay 정류장 ID
  arsId?: string;
  lat?: number;
  lng?: number;
  busNumbers?: string[];
  busLines?: { routeName: string; busRouteId?: string; busType?: number | null; startStation?: string | null; endStation?: string | null }[];
  subwayLine?: string;
  direction?: string;
  busRouteId?: string;   // deprecated: busLines 사용
  // 지하철 방향 정보 (subway only)
  way?: string | null;
  wayCode?: 1 | 2 | null;
  endName?: string | null;
  // UnifiedStopPicker 경유 수동 추가 시 직접 저장
  directionUpdn?: 'up' | 'down' | null;
  directionNextStop?: string | null;
  /** 지하철 노선 매칭 키 — ODsay subwayCode. 버스 노드는 undefined. */
  subwayCode?: string | null;
}

interface RouteNodeCardProps {
  node: RouteNode;
  onRemove: () => void;
  onUpdateBusNumbers?: (busNumbers: string[]) => void;
  /** @deprecated 드래그 핸들 아이콘은 제거됨. prop은 하위 호환을 위해 유지 */
  showGrip?: boolean;
}

export default function RouteNodeCard({
  node,
  onRemove,
  onUpdateBusNumbers,
  showGrip: _showGrip = true,
}: RouteNodeCardProps) {
  const [isAddingBus, setIsAddingBus] = useState(false);
  const [newBusNumber, setNewBusNumber] = useState('');
  // 드롭다운 열릴 때 기존 선택 상태 스냅샷 (취소 시 복원용)
  const [draftBusNumbers, setDraftBusNumbers] = useState<string[]>([]);

  const handleAddBusNumber = () => {
    if (newBusNumber.trim() && onUpdateBusNumbers) {
      const updatedBuses = [...(node.busNumbers || []), newBusNumber.trim()];
      onUpdateBusNumbers(updatedBuses);
      setNewBusNumber('');
      setIsAddingBus(false);
    }
  };

  const handleRemoveBusNumber = (busNumber: string) => {
    if (onUpdateBusNumbers) {
      const updatedBuses = (node.busNumbers || []).filter(b => b !== busNumber);
      onUpdateBusNumbers(updatedBuses);
    }
  };

  /** 드롭다운 열 때 현재 선택 상태를 draft에 스냅샷 */
  const handleOpenDropdown = () => {
    setDraftBusNumbers([...(node.busNumbers ?? [])]);
    setIsAddingBus(true);
  };

  /** 드롭다운에서 노선 토글 */
  const handleToggleDraftBus = (routeName: string) => {
    setDraftBusNumbers(prev =>
      prev.includes(routeName)
        ? prev.filter(b => b !== routeName)
        : [...prev, routeName]
    );
  };

  /** 확인: draft 상태를 실제 선택에 반영 */
  const handleConfirmDropdown = () => {
    onUpdateBusNumbers?.(draftBusNumbers);
    setIsAddingBus(false);
  };

  /** 취소: 변경사항 버리고 닫힘 */
  const handleCancelDropdown = () => {
    setDraftBusNumbers([]);
    setIsAddingBus(false);
  };

  // 노선 색상 정보 가져오기
  const getNodeColor = () => {
    if (node.type === 'subway' && node.subwayLine) {
      return getSubwayColor(node.subwayLine).color;
    }
    if (node.type === 'bus' && node.busNumbers && node.busNumbers.length > 0) {
      const firstLine = node.busLines?.find(l => l.routeName === node.busNumbers![0]);
      return getBusTypeByOdsay(firstLine?.busType, node.busNumbers[0]).color;
    }
    return 'var(--text-secondary)';
  };

  return (
    <Card className="p-4 rounded-control border border-border-subtle shadow-card bg-surface-card hover:shadow-floating transition-shadow">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-control bg-surface-input flex items-center justify-center flex-shrink-0">
          {node.type === 'bus' ? (
            <Bus className="w-5 h-5" strokeWidth={2} style={{ color: getNodeColor() }} />
          ) : (
            <Train className="w-5 h-5" strokeWidth={2} style={{ color: getNodeColor() }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StopName
              name={node.type === 'subway' ? formatStationName(node.name) : node.name}
              size="md"
            />
            {node.order > 1 && (
              <span className="text-caption px-1.5 py-0.5 rounded-chip bg-surface-info-soft text-text-info font-medium">
                대안
              </span>
            )}
          </div>

          {node.type === 'bus' && (node.arsId || node.stopId) && (
            <div className="text-caption text-text-tertiary mb-2">
              {node.arsId ? node.arsId : node.stopId}
            </div>
          )}

          {node.type === 'subway' && (
            <div className="flex gap-1.5 mb-2">
              {node.subwayLine && (
                <span className="text-caption px-2 py-0.5 rounded-chip bg-surface-muted text-text-secondary font-medium">
                  {node.subwayLine}
                </span>
              )}
              {node.direction && (
                <span className="text-caption px-2 py-0.5 rounded-chip border border-border-subtle text-text-secondary">
                  {node.direction} 방향
                </span>
              )}
            </div>
          )}

          {node.type === 'bus' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {node.busNumbers?.map((busNum) => {
                  const lineInfo = node.busLines?.find(l => l.routeName === busNum);
                  const busInfo = getBusTypeByOdsay(lineInfo?.busType, busNum);
                  return (
                    <span
                      key={busNum}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-chip text-white text-caption font-medium"
                      style={{ backgroundColor: busInfo.color }}
                    >
                      {busNum}번
                      <button
                        onClick={() => handleRemoveBusNumber(busNum)}
                        className="hover:bg-white/20 rounded p-0.5 transition-colors"
                      >
                        <X className="w-3 h-3" strokeWidth={2} />
                      </button>
                    </span>
                  );
                })}
              </div>

              {isAddingBus ? (
                node.busLines && node.busLines.length > 0 ? (
                  <div className="rounded-control border border-border-default overflow-hidden">
                    {node.busLines.map(l => {
                      const busInfo = getBusTypeByOdsay(l.busType, l.routeName);
                      const isSelected = draftBusNumbers.includes(l.routeName);
                      return (
                        <button
                          key={l.routeName}
                          onClick={() => handleToggleDraftBus(l.routeName)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                            isSelected ? 'bg-surface-info-soft' : 'hover:bg-surface-input'
                          }`}
                        >
                          {/* 체크 표시 영역 */}
                          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border"
                            style={{
                              backgroundColor: isSelected ? busInfo.color : 'transparent',
                              borderColor: isSelected ? busInfo.color : 'var(--border-default)',
                            }}
                          >
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5l2.5 2.5 3.5-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: busInfo.color }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-label font-medium text-text-primary">{l.routeName}번</span>
                              <span className="text-caption text-text-tertiary">{busInfo.label}버스</span>
                            </div>
                            {(l.startStation || l.endStation) && (
                              <div className="text-caption text-text-tertiary truncate">
                                {l.startStation}{l.startStation && l.endStation ? ' ~ ' : ''}{l.endStation}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {/* 확인 / 취소 버튼 */}
                    <div className="flex border-t border-border-subtle">
                      <button
                        onClick={handleCancelDropdown}
                        className="flex-1 px-3 py-2 text-caption text-text-tertiary hover:bg-surface-input transition-colors border-r border-border-subtle"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleConfirmDropdown}
                        className="flex-1 px-3 py-2 text-caption font-medium text-text-primary hover:bg-surface-input transition-colors"
                      >
                        확인
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="버스 번호"
                      value={newBusNumber}
                      onChange={(e) => setNewBusNumber(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddBusNumber()}
                      className="h-9 text-label rounded-chip border-border-subtle"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={handleAddBusNumber}
                      className="h-9 px-3 rounded-chip bg-text-primary hover:bg-text-primary/90 text-caption"
                    >
                      추가
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setIsAddingBus(false); setNewBusNumber(''); }}
                      className="h-9 px-3 rounded-chip text-caption"
                    >
                      취소
                    </Button>
                  </div>
                )
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenDropdown}
                  className="h-8 text-caption rounded-chip border-border-subtle text-text-secondary hover:bg-surface-input hover:text-text-primary"
                >
                  {node.busLines && node.busLines.length > 0
                    ? <><ChevronDown className="w-3.5 h-3.5 mr-1" strokeWidth={2} />버스 선택</>
                    : <><Plus className="w-3.5 h-3.5 mr-1" strokeWidth={2} />버스 번호 추가</>
                  }
                </Button>
              )}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="flex-shrink-0 rounded-chip hover:bg-surface-danger-soft w-8 h-8"
        >
          <X className="w-4 h-4 text-text-danger" strokeWidth={2} />
        </Button>
      </div>
    </Card>
  );
}
