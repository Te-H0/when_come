import { Check, Circle } from "lucide-react";
import type { RouteSegment } from "@/lib/mockData";

interface RouteProgressProps {
  segments: RouteSegment[];
  currentSegmentId: string;
}

export default function RouteProgress({ segments, currentSegmentId }: RouteProgressProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg">
      {segments.map((segment, idx) => {
        const isPassed = segment.order < segments.find(s => s.id === currentSegmentId)!.order;
        const isCurrent = segment.id === currentSegmentId;
        
        return (
          <div key={segment.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg ${
                isPassed ? 'bg-gradient-to-br from-green-400 to-emerald-500' : 
                isCurrent ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 
                'bg-gray-200'
              }`}>
                {isPassed ? (
                  <Check className="w-5 h-5 text-white" />
                ) : (
                  <Circle className={`w-4 h-4 ${isCurrent ? 'text-white' : 'text-gray-400'}`} />
                )}
              </div>
              <span className={`text-xs mt-2 font-semibold ${
                isCurrent ? 'text-indigo-600' : isPassed ? 'text-green-600' : 'text-gray-400'
              }`}>
                {segment.stop.type === 'bus' ? '버스' : '전철'}
              </span>
            </div>
            
            {idx < segments.length - 1 && (
              <div className={`flex-1 h-2 mx-3 rounded-full ${
                isPassed ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gray-200'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}