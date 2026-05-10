import { Bus, Train, Clock, ArrowRight, Repeat } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface RouteSegment {
  id: string;
  name: string;
  type: 'bus' | 'subway';
  lines: string[];
}

export interface RouteOptionData {
  id: string;
  totalTime: number; // 분
  transferCount: number;
  segments: RouteSegment[];
  recommended?: boolean;
}

interface RouteOptionProps {
  route: RouteOptionData;
  onSelect: () => void;
}

export default function RouteOption({ route, onSelect }: RouteOptionProps) {
  return (
    <Card className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${
      route.recommended ? 'border-blue-500 border-2' : ''
    }`}>
      {route.recommended && (
        <Badge className="mb-3 bg-blue-500">추천 경로</Badge>
      )}
      
      {/* 경로 요약 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="font-semibold">{route.totalTime}분</span>
          </div>
          <div className="flex items-center gap-1">
            <Repeat className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-600">환승 {route.transferCount}회</span>
          </div>
        </div>
        <Button onClick={onSelect} size="sm">
          선택
        </Button>
      </div>

      {/* 경로 단계 미리보기 */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
        {route.segments.map((segment, idx) => (
          <div key={segment.id} className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1">
              <div className={`p-1.5 rounded ${segment.type === 'bus' ? 'bg-green-100' : 'bg-blue-100'}`}>
                {segment.type === 'bus' ? (
                  <Bus className="w-3 h-3 text-green-600" />
                ) : (
                  <Train className="w-3 h-3 text-blue-600" />
                )}
              </div>
              <div className="text-xs">
                <div className="font-medium truncate max-w-[80px]">{segment.name}</div>
                <div className="text-gray-500">{segment.lines[0]}</div>
              </div>
            </div>
            {idx < route.segments.length - 1 && (
              <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
