import { Bus, Train, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBusTypeByOdsay, getSubwayColor } from "@/utils/transitColors";

export interface SearchNodeData {
  id: string;
  name: string;
  type: 'bus' | 'subway';
  stopId?: string;       // 버스: ARS ID, 지하철: ODsay 정류장 ID
  arsId?: string;
  lat?: number;
  lng?: number;
  availableBuses?: string[];
  busLines?: { routeName: string; busRouteId?: string; busType?: number | null }[];
  subwayLine?: string;
  direction?: string;
  busRouteId?: string;   // deprecated: busLines 사용
  // 지하철 방향 정보 (subway only)
  way?: string | null;
  wayCode?: 1 | 2 | null;
  endName?: string | null;
}

interface SearchResultNodeProps {
  node: SearchNodeData;
  routeIndex: number;
  onAdd: (node: SearchNodeData) => void;
}

export default function SearchResultNode({ node, routeIndex, onAdd }: SearchResultNodeProps) {
  const isSubway = node.type === 'subway';
  const nodeColor = isSubway && node.subwayLine
    ? getSubwayColor(node.subwayLine).color
    : node.busLines && node.busLines.length > 0
      ? getBusTypeByOdsay(node.busLines[0].busType, node.busLines[0].routeName).color
      : node.availableBuses && node.availableBuses.length > 0
        ? getBusTypeByOdsay(null, node.availableBuses[0]).color
        : '#6B7280';

  return (
    <div className="p-3 rounded-xl hover:bg-[#F9FAFB] transition-colors border border-black/5">
      <div className="flex items-start gap-3">
        <div 
          className="w-9 h-9 rounded-lg bg-[#F9FAFB] flex items-center justify-center flex-shrink-0"
        >
          {node.type === 'bus' ? (
            <Bus className="w-[18px] h-[18px]" strokeWidth={2} style={{ color: nodeColor }} />
          ) : (
            <Train className="w-[18px] h-[18px]" strokeWidth={2} style={{ color: nodeColor }} />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-[#111827] mb-1">
            {node.name}
          </div>

          {node.type === 'bus' && (node.arsId || node.stopId) && (
            <div className="text-[12px] text-[#9CA3AF] mb-1.5">
              {node.arsId ? node.arsId : node.stopId}
            </div>
          )}

          {node.type === 'bus' && node.availableBuses && (
            <div className="flex flex-wrap gap-1">
              {node.availableBuses.slice(0, 4).map((bus) => (
                <span key={bus} className="text-[12px] px-1.5 py-0.5 rounded bg-[#F1F3F5] text-[#6B7280] font-medium">
                  {bus}번
                </span>
              ))}
              {node.availableBuses.length > 4 && (
                <span className="text-[12px] text-[#9CA3AF]">
                  외 {node.availableBuses.length - 4}개
                </span>
              )}
            </div>
          )}

          {node.type === 'subway' && (
            <div className="flex gap-1.5">
              {node.subwayLine && (
                <span className="text-[12px] px-2 py-0.5 rounded-md bg-[#F1F3F5] text-[#6B7280] font-medium">
                  {node.subwayLine}
                </span>
              )}
              {node.direction && (
                <span className="text-[12px] px-2 py-0.5 rounded-md border border-black/5 text-[#6B7280]">
                  {node.direction} 방향
                </span>
              )}
            </div>
          )}
        </div>

        <Button
          size="sm"
          onClick={() => onAdd(node)}
          className="flex-shrink-0 h-8 px-3 rounded-lg bg-[#111827] hover:bg-[#1F2937] text-[13px]"
        >
          <Plus className="w-3.5 h-3.5 mr-1" strokeWidth={2} />
          추가
        </Button>
      </div>
    </div>
  );
}