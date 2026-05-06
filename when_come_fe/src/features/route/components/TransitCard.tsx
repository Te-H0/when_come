import { Bus, Train, Clock, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TransitStop } from "@/lib/mockData";

interface TransitCardProps {
  stop: TransitStop;
  isNext?: boolean;
  showDistance?: boolean;
}

export default function TransitCard({ stop, isNext = false, showDistance = false }: TransitCardProps) {
  const Icon = stop.type === "bus" ? Bus : Train;
  
  return (
    <Card className={`p-5 rounded-3xl border-0 shadow-lg transition-all hover:shadow-xl ${
      isNext 
        ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white ring-4 ring-indigo-200' 
        : 'bg-white/80 backdrop-blur-sm'
    }`}>
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-2xl ${
          stop.type === 'bus' 
            ? isNext ? 'bg-white/20' : 'bg-gradient-to-br from-green-400 to-emerald-500' 
            : isNext ? 'bg-white/20' : 'bg-gradient-to-br from-blue-400 to-cyan-500'
        } shadow-lg`}>
          <Icon className={`w-6 h-6 ${isNext ? 'text-white' : 'text-white'}`} />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className={`font-bold text-lg ${isNext ? 'text-white' : 'text-gray-900'}`}>
              {stop.displayName}
            </h3>
            {isNext && (
              <Badge className="bg-white/30 text-white border-0 backdrop-blur-sm font-semibold">
                다음 🚀
              </Badge>
            )}
          </div>
          
          {showDistance && (
            <div className={`flex items-center gap-1 text-sm mb-3 ${isNext ? 'text-white/90' : 'text-gray-500'}`}>
              <MapPin className="w-4 h-4" />
              <span className="font-medium">150m</span>
            </div>
          )}
          
          <div className="space-y-2">
            {stop.lines.map((line, idx) => (
              <div 
                key={line} 
                className={`flex items-center justify-between p-3 rounded-2xl ${
                  isNext 
                    ? 'bg-white/20 backdrop-blur-sm' 
                    : 'bg-gradient-to-r from-gray-50 to-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className={`font-mono font-bold text-base px-3 py-1 rounded-xl ${
                      isNext 
                        ? 'bg-white text-indigo-600 border-0' 
                        : 'bg-white border-2 border-gray-200'
                    }`}
                  >
                    {line}
                  </Badge>
                  {stop.type === 'bus' && (
                    <span className={`text-sm font-medium ${isNext ? 'text-white/90' : 'text-gray-600'}`}>
                      번 버스
                    </span>
                  )}
                  {stop.type === 'subway' && (
                    <span className={`text-sm font-medium ${isNext ? 'text-white/90' : 'text-gray-600'}`}>
                      호선
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <Clock className={`w-5 h-5 ${
                    stop.arrivalTimes[idx] <= 3 
                      ? 'text-red-400' 
                      : isNext ? 'text-white/80' : 'text-orange-500'
                  }`} />
                  <span className={`font-bold text-lg ${
                    stop.arrivalTimes[idx] <= 3 
                      ? 'text-red-400' 
                      : isNext ? 'text-white' : 'text-gray-900'
                  }`}>
                    {stop.arrivalTimes[idx]}분
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}