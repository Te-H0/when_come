import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, MoreVertical, Pencil, Trash2, Bus, Train, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BottomNav from "@/components/BottomNav";
import { getBusTypeByOdsay, getSubwayColor } from "@/utils/transitColors";
import { listRoutes, deleteRoute, updateRoute } from "@/lib/api";
import { getJwt } from "@/lib/supabase";
import { mapApiRoute } from "@/lib/mappers";
import type { SavedRoute } from "@/lib/mockData";
import { toast } from "sonner";

export default function RouteManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: apiRoutes, isLoading, isError } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => {
      const jwt = await getJwt();
      if (!jwt) throw new Error('로그인이 필요합니다');
      return listRoutes(jwt);
    },
  });

  const routes = useMemo<SavedRoute[]>(() => (apiRoutes ?? []).map(mapApiRoute), [apiRoutes]);

  const toggleMutation = useMutation({
    mutationFn: (route: SavedRoute) =>
      updateRoute(route.id, { is_active: !route.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routes'] }),
    onError: () => toast.error('변경에 실패했습니다'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const jwt = await getJwt();
      if (!jwt) throw new Error('로그인이 필요합니다');
      return deleteRoute(id, jwt);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      toast.success('경로가 삭제되었습니다');
    },
    onError: () => {
      toast.error('삭제에 실패했습니다');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center pb-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#6B7280]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex items-center justify-center p-4 pb-20">
        <Card className="max-w-md w-full p-8 text-center rounded-2xl border border-black/5 shadow-sm">
          <p className="text-[#DC2626] text-[15px]">경로를 불러오지 못했습니다</p>
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['routes'] })}
            className="mt-4 bg-[#111827] hover:bg-[#1F2937] rounded-xl"
          >
            다시 시도
          </Button>
        </Card>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] pb-24">
      {/* 헤더 */}
      <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-10 border-b border-black/5">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-xl w-9 h-9">
              <ArrowLeft className="w-5 h-5" strokeWidth={2} />
            </Button>
            <h1 className="text-[17px] font-semibold text-[#111827]">경로 관리</h1>
          </div>
          <Button
            onClick={() => navigate('/setup')}
            className="bg-[#111827] hover:bg-[#1F2937] rounded-xl h-9 px-4 text-[14px] font-medium"
          >
            <Plus className="w-[16px] h-[16px] mr-1.5" strokeWidth={2} />
            새 경로
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {routes.length === 0 ? (
          <Card className="p-8 text-center rounded-2xl border border-black/5 shadow-sm bg-white">
            <div className="w-12 h-12 bg-[#F1F3F5] rounded-xl flex items-center justify-center mx-auto mb-4">
              <Plus className="w-6 h-6 text-[#6B7280]" strokeWidth={2} />
            </div>
            <h3 className="text-[17px] font-semibold text-[#111827] mb-2">등록된 경로가 없습니다</h3>
            <p className="text-[14px] text-[#6B7280] mb-4">새로운 경로를 등록해보세요</p>
            <Button
              onClick={() => navigate('/setup')}
              className="bg-[#111827] hover:bg-[#1F2937] rounded-xl h-11 px-6 text-[15px] font-medium"
            >
              경로 등록하기
            </Button>
          </Card>
        ) : (
          routes.map((route) => (
            <Card key={route.id} className="overflow-hidden rounded-2xl border border-black/5 shadow-sm bg-white">
              {/* 헤더 */}
              <div className="p-4 border-b border-black/5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-[17px] font-semibold text-[#111827]">{route.name}</h3>
                      {route.isActive && (
                        <span className="px-2 py-0.5 rounded-md bg-[#111827] text-white text-[11px] font-medium">
                          활성
                        </span>
                      )}
                    </div>
                    <p className="text-[14px] text-[#6B7280]">
                      {route.from} → {route.to}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-xl w-8 h-8">
                        <MoreVertical className="w-[18px] h-[18px] text-[#6B7280]" strokeWidth={2} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl border-black/5">
                      <DropdownMenuItem onClick={() => navigate('/setup')} className="text-[14px]">
                        <Pencil className="w-4 h-4 mr-2" strokeWidth={2} />
                        수정
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteMutation.mutate(route.id)}
                        className="text-[14px] text-[#DC2626]"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 mr-2" strokeWidth={2} />
                        삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[14px] text-[#6B7280]">활성화</span>
                  <Switch
                    checked={route.isActive}
                    onCheckedChange={() => toggleMutation.mutate(route)}
                    disabled={toggleMutation.isPending}
                  />
                </div>
              </div>

              {/* 경로 상세 */}
              <div className="p-4 space-y-3">
                <h4 className="text-[13px] font-medium text-[#6B7280]">
                  경로 ({route.segments.length}단계)
                </h4>

                {route.segments.map((segment, idx) => {
                  const isSubway = segment.stop.type === 'subway';
                  const firstStopRoute = segment.stop.stopRoutes?.[0];
                  const nodeColor = isSubway && segment.stop.lines.length > 0
                    ? getSubwayColor(segment.stop.lines[0]).color
                    : !isSubway && segment.stop.lines.length > 0
                      ? getBusTypeByOdsay(firstStopRoute?.busType, segment.stop.lines[0]).color
                      : '#6B7280';

                  return (
                    <div key={segment.id}>
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#F9FAFB] flex items-center justify-center flex-shrink-0">
                          {segment.stop.type === 'bus' ? (
                            <Bus className="w-[18px] h-[18px]" strokeWidth={2} style={{ color: nodeColor }} />
                          ) : (
                            <Train className="w-[18px] h-[18px]" strokeWidth={2} style={{ color: nodeColor }} />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[15px] font-medium text-[#111827]">
                              {segment.stop.name}
                            </span>
                            <span className="text-[12px] text-[#9CA3AF]">
                              {segment.order}단계
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {segment.stop.lines.map(line => (
                              <span
                                key={line}
                                className="text-[12px] px-1.5 py-0.5 rounded bg-[#F1F3F5] text-[#6B7280] font-medium"
                              >
                                {isSubway ? line : `${line}번`}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      {idx < route.segments.length - 1 && (
                        <div className="flex justify-center my-2 ml-5">
                          <div className="w-px h-4 bg-[#E5E7EB]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
