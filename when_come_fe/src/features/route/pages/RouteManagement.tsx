import { useMemo, useState, Fragment } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, MoreVertical, Trash2, Bus, Train, Loader2,
  Pencil, Star, Map,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import BottomNav from "@/components/BottomNav";
import StopName from "@/components/StopName";
import AliasEditor from "@/components/AliasEditor";
import { getBusTypeByOdsay, getSubwayColor } from "@/utils/transitColors";
import {
  listRoutes,
  deleteRoute,
  updateRoute,
  listFavoriteStops,
  deleteFavoriteStop,
  updateFavoriteStop,
  updateRouteStopAlias,
} from "@/lib/api";
import { getJwt } from "@/lib/supabase";
import { mapApiRoute } from "@/lib/mappers";
import type { SavedRoute } from "@/lib/mockData";
import type { ApiFavoriteStop } from "@/types/api";
import { toast } from "sonner";

// ──────────────────────── 탭 타입 ────────────────────────

type TabKey = 'routes' | 'favorites';

// ──────────────────────── 경로 섹션 ────────────────────────

interface RouteRenameDialogProps {
  open: boolean;
  currentName: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
  isPending: boolean;
}

function RouteRenameDialog({
  open,
  currentName,
  onConfirm,
  onClose,
  isPending,
}: RouteRenameDialogProps) {
  const [value, setValue] = useState(currentName);

  // Dialog가 열릴 때마다 currentName으로 초기화
  const handleOpenChange = (o: boolean) => {
    if (o) setValue(currentName);
    if (!o) onClose();
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[17px]">경로 이름 수정</DialogTitle>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="경로 이름"
          className="rounded-xl h-11 text-[15px]"
          disabled={isPending}
          autoFocus
        />
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl flex-1"
          >
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !value.trim()}
            className="bg-[#111827] hover:bg-[#1F2937] rounded-xl flex-1"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────── 경로 카드 ────────────────────────

interface RouteCardProps {
  route: SavedRoute;
  onToggle: () => void;
  onDelete: () => void;
  onRename: () => void;
  onUpdateStopAlias: (stopId: string, alias: string | null) => Promise<void>;
  isTogglePending: boolean;
  isDeletePending: boolean;
}

function RouteCard({
  route,
  onToggle,
  onDelete,
  onRename,
  onUpdateStopAlias,
  isTogglePending,
  isDeletePending,
}: RouteCardProps) {
  // stepGroup 단위로 그룹핑
  const groupedSegs = useMemo(() => {
    const groups = new Map<number, typeof route.segments>();
    for (const seg of route.segments) {
      const g = seg.stepGroup ?? seg.order;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(seg);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([, segs]) => segs);
  }, [route.segments]);

  return (
    <Card className="overflow-hidden rounded-2xl border border-black/5 shadow-sm bg-white">
      {/* 카드 헤더 */}
      <div className="p-4 border-b border-black/5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[17px] font-semibold text-[#111827] truncate">{route.name}</h3>
              {route.isActive && (
                <span className="px-2 py-0.5 rounded-md bg-[#111827] text-white text-[11px] font-medium shrink-0">
                  활성
                </span>
              )}
            </div>
            <p className="text-[14px] text-[#6B7280]">
              {route.from} → {route.to}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Switch
              checked={route.isActive}
              onCheckedChange={onToggle}
              disabled={isTogglePending}
            />
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl w-8 h-8">
                  <MoreVertical className="w-[18px] h-[18px] text-[#6B7280]" strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl border-black/5">
                <DropdownMenuItem
                  onClick={onRename}
                  className="text-[14px]"
                >
                  <Pencil className="w-4 h-4 mr-2" strokeWidth={2} />
                  이름 수정
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-[14px] text-[#DC2626]"
                  disabled={isDeletePending}
                >
                  <Trash2 className="w-4 h-4 mr-2" strokeWidth={2} />
                  삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* 경로 상세 — stepGroup 단위 */}
      <div className="p-4 space-y-3">
        <h4 className="text-[13px] font-medium text-[#6B7280]">
          경로 ({groupedSegs.length}단계 / {route.segments.length}개 정류장)
        </h4>

        {groupedSegs.map((group, groupIdx) => (
          <Fragment key={groupIdx}>
            <div className={group.length > 1 ? "flex gap-2" : ""}>
              {group.map((segment) => {
                const isSubway = segment.stop.type === 'subway';
                const firstStopRoute = segment.stop.stopRoutes?.[0];
                const nodeColor = isSubway && segment.stop.lines.length > 0
                  ? getSubwayColor(segment.stop.lines[0]).color
                  : !isSubway && segment.stop.lines.length > 0
                    ? getBusTypeByOdsay(firstStopRoute?.busType, segment.stop.lines[0]).color
                    : '#6B7280';

                return (
                  <div
                    key={segment.id}
                    className={`flex items-start gap-3 ${group.length > 1 ? 'flex-1 min-w-0 p-2 rounded-xl bg-[#F9FAFB] border border-[#DBEAFE]' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                      {segment.stop.type === 'bus' ? (
                        <Bus className="w-[18px] h-[18px]" strokeWidth={2} style={{ color: nodeColor }} />
                      ) : (
                        <Train className="w-[18px] h-[18px]" strokeWidth={2} style={{ color: nodeColor }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <StopName
                          name={segment.stop.displayName ?? segment.stop.name}
                          alias={segment.stop.alias ?? undefined}
                          size="sm"
                        />
                        <AliasEditor
                          initialAlias={segment.stop.alias ?? null}
                          onSave={(alias) => onUpdateStopAlias(segment.id, alias)}
                        />
                        {group.length === 1 && (
                          <span className="text-[12px] text-[#9CA3AF] flex-shrink-0">
                            {segment.order}단계
                          </span>
                        )}
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
                );
              })}
            </div>
            {groupIdx < groupedSegs.length - 1 && (
              <div className="flex justify-center my-2 ml-5">
                <div className="w-px h-4 bg-[#E5E7EB]" />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </Card>
  );
}

// ──────────────────────── 즐겨찾기 섹션 ────────────────────────

interface FavoriteRowProps {
  fav: ApiFavoriteStop;
  onUpdateAlias: (alias: string | null) => Promise<void>;
  onDelete: () => void;
}

function FavoriteRow({ fav, onUpdateAlias, onDelete }: FavoriteRowProps) {
  const isSubway = fav.stop_type === 'subway';

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors">
      {/* 아이콘 */}
      <div className="w-9 h-9 rounded-lg bg-[#F9FAFB] flex items-center justify-center flex-shrink-0">
        {isSubway ? (
          <Train className="w-[18px] h-[18px] text-[#6B7280]" strokeWidth={2} />
        ) : (
          <Bus className="w-[18px] h-[18px] text-[#6B7280]" strokeWidth={2} />
        )}
      </div>

      {/* 정류장명 + 별명 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StopName
            name={fav.stop_name}
            alias={fav.alias ?? undefined}
            size="sm"
          />
          <AliasEditor initialAlias={fav.alias} onSave={onUpdateAlias} />
        </div>
        <div className="text-[12px] text-[#9CA3AF] mt-0.5">
          {fav.favorite_stop_routes.map(r => r.route_name).join(' · ')}
        </div>
      </div>

      {/* 삭제 버튼 */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-xl w-8 h-8 flex-shrink-0">
            <MoreVertical className="w-[18px] h-[18px] text-[#6B7280]" strokeWidth={2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl border-black/5">
          <DropdownMenuItem
            onClick={onDelete}
            className="text-[14px] text-[#DC2626]"
          >
            <Trash2 className="w-4 h-4 mr-2" strokeWidth={2} />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ──────────────────────── 메인 페이지 ────────────────────────

export default function RouteManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>('routes');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingFavDeleteId, setPendingFavDeleteId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<SavedRoute | null>(null);

  // ── 경로 쿼리 ──
  const { data: apiRoutes, isLoading: routesLoading, isError: routesError } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => {
      const jwt = await getJwt();
      if (!jwt) throw new Error('로그인이 필요합니다');
      return listRoutes(jwt);
    },
  });

  const routes = useMemo<SavedRoute[]>(() => (apiRoutes ?? []).map(mapApiRoute), [apiRoutes]);

  // ── 즐겨찾기 쿼리 ──
  const { data: favData, isLoading: favsLoading, isError: favsError } = useQuery({
    queryKey: ['favorite-stops'],
    queryFn: async () => {
      const jwt = await getJwt();
      if (!jwt) throw new Error('로그인이 필요합니다');
      return listFavoriteStops(jwt);
    },
  });

  const favorites = favData ?? [];

  // ── 뮤테이션들 ──
  const toggleMutation = useMutation({
    mutationFn: (route: SavedRoute) =>
      updateRoute(route.id, { is_active: !route.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routes'] }),
    onError: () => toast.error('변경에 실패했습니다'),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateRoute(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      setRenameTarget(null);
      toast.success('경로 이름을 수정했어요');
    },
    onError: () => toast.error('이름 수정에 실패했습니다'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const jwt = await getJwt();
      if (!jwt) throw new Error('로그인이 필요합니다');
      return deleteRoute(id, jwt);
    },
    onSuccess: () => {
      setPendingDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      toast.success('경로가 삭제되었습니다');
    },
    onError: (err) => {
      setPendingDeleteId(null);
      toast.error(`삭제 실패: ${(err as Error).message}`);
    },
  });

  const deleteFavMutation = useMutation({
    mutationFn: async (id: string) => {
      const jwt = await getJwt();
      if (!jwt) throw new Error('로그인이 필요합니다');
      return deleteFavoriteStop(id, jwt);
    },
    onSuccess: () => {
      setPendingFavDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['favorite-stops'] });
      toast.success('즐겨찾기가 삭제되었습니다');
    },
    onError: (err) => {
      setPendingFavDeleteId(null);
      toast.error(`삭제 실패: ${(err as Error).message}`);
    },
  });

  const handleUpdateStopAlias = async (stopId: string, alias: string | null) => {
    try {
      const jwt = await getJwt();
      if (!jwt) throw new Error('인증 실패');
      await updateRouteStopAlias(stopId, alias, jwt);
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      toast.success('별명을 저장했어요');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했습니다');
    }
  };

  const handleUpdateFavAlias = async (fav: ApiFavoriteStop, alias: string | null) => {
    try {
      const jwt = await getJwt();
      if (!jwt) throw new Error('인증 실패');
      await updateFavoriteStop(fav.id, { alias }, jwt);
      queryClient.invalidateQueries({ queryKey: ['favorite-stops'] });
      toast.success('별명을 저장했어요');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장에 실패했습니다');
    }
  };

  const isLoading = routesLoading || favsLoading;

  if (isLoading) {
    return (
      <div className="h-dvh bg-[#F6F7F9] flex items-center justify-center pb-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#6B7280]" />
        <BottomNav />
      </div>
    );
  }

  if (routesError || favsError) {
    return (
      <div className="h-dvh bg-[#F6F7F9] flex items-center justify-center p-4 pb-20">
        <Card className="max-w-md w-full p-8 text-center rounded-2xl border border-black/5 shadow-sm">
          <p className="text-[#DC2626] text-[15px]">데이터를 불러오지 못했습니다</p>
          <Button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['routes'] });
              queryClient.invalidateQueries({ queryKey: ['favorite-stops'] });
            }}
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
    <div className="h-dvh overflow-y-auto bg-[#F6F7F9] pb-24">
      {/* 헤더 */}
      <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-10 border-b border-black/5">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-xl w-9 h-9">
              <ArrowLeft className="w-5 h-5" strokeWidth={2} />
            </Button>
            <h1 className="text-[17px] font-semibold text-[#111827]">내 경로</h1>
          </div>
          {activeTab === 'routes' && (
            <Button
              onClick={() => navigate('/setup')}
              className="bg-[#111827] hover:bg-[#1F2937] rounded-xl h-9 px-4 text-[14px] font-medium"
            >
              <Plus className="w-[16px] h-[16px] mr-1.5" strokeWidth={2} />
              새 경로
            </Button>
          )}
          {activeTab === 'favorites' && (
            <Button
              onClick={() => navigate('/favorites/add')}
              className="bg-[#111827] hover:bg-[#1F2937] rounded-xl h-9 px-4 text-[14px] font-medium"
            >
              <Plus className="w-[16px] h-[16px] mr-1.5" strokeWidth={2} />
              즐겨찾기 추가
            </Button>
          )}
        </div>

        {/* 탭 */}
        <div className="max-w-2xl mx-auto px-4 pb-0 flex border-b border-black/5">
          {(
            [
              { key: 'routes' as TabKey, label: '경로', icon: Map },
              { key: 'favorites' as TabKey, label: '즐겨찾기', icon: Star },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[14px] font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-[#111827] text-[#111827]'
                  : 'border-transparent text-[#9CA3AF] hover:text-[#6B7280]'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={2} />
              {label}
              {key === 'routes' && routes.length > 0 && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                  activeTab === key ? 'bg-[#111827] text-white' : 'bg-[#F1F3F5] text-[#9CA3AF]'
                }`}>
                  {routes.length}
                </span>
              )}
              {key === 'favorites' && favorites.length > 0 && (
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                  activeTab === key ? 'bg-[#111827] text-white' : 'bg-[#F1F3F5] text-[#9CA3AF]'
                }`}>
                  {favorites.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {/* ─── 경로 탭 ─── */}
        {activeTab === 'routes' && (
          <>
            {routes.length === 0 ? (
              <Card className="p-8 text-center rounded-2xl border border-black/5 shadow-sm bg-white">
                <div className="w-12 h-12 bg-[#F1F3F5] rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-6 h-6 text-[#6B7280]" strokeWidth={2} />
                </div>
                <h3 className="text-[17px] font-semibold text-[#111827] mb-2">저장된 경로가 없어요</h3>
                <p className="text-[14px] text-[#6B7280] mb-4">홈 화면에서 새로운 경로를 추가해보세요</p>
                <Button
                  onClick={() => navigate('/setup')}
                  className="bg-[#111827] hover:bg-[#1F2937] rounded-xl h-11 px-6 text-[15px] font-medium"
                >
                  경로 등록하기
                </Button>
              </Card>
            ) : (
              routes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  onToggle={() => toggleMutation.mutate(route)}
                  onDelete={() => setPendingDeleteId(route.id)}
                  onRename={() => setRenameTarget(route)}
                  onUpdateStopAlias={handleUpdateStopAlias}
                  isTogglePending={toggleMutation.isPending}
                  isDeletePending={deleteMutation.isPending}
                />
              ))
            )}
          </>
        )}

        {/* ─── 즐겨찾기 탭 ─── */}
        {activeTab === 'favorites' && (
          <>
            {favorites.length === 0 ? (
              <Card className="p-8 text-center rounded-2xl border border-black/5 shadow-sm bg-white">
                <div className="w-12 h-12 bg-[#F1F3F5] rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Star className="w-6 h-6 text-[#6B7280]" strokeWidth={1.5} />
                </div>
                <h3 className="text-[17px] font-semibold text-[#111827] mb-2">즐겨찾기가 없어요</h3>
                <p className="text-[14px] text-[#6B7280] mb-4">즐겨찾기 탭에서 자주 가는 정류장을 등록해보세요</p>
                <Button
                  onClick={() => navigate('/favorites/add')}
                  className="bg-[#111827] hover:bg-[#1F2937] rounded-xl h-11 px-6 text-[15px] font-medium"
                >
                  즐겨찾기 추가
                </Button>
              </Card>
            ) : (
              <Card className="overflow-hidden rounded-2xl border border-black/5 shadow-sm bg-white divide-y divide-black/5">
                {favorites.map((fav) => (
                  <FavoriteRow
                    key={fav.id}
                    fav={fav}
                    onUpdateAlias={(alias) => handleUpdateFavAlias(fav, alias)}
                    onDelete={() => setPendingFavDeleteId(fav.id)}
                  />
                ))}
              </Card>
            )}
          </>
        )}
      </div>

      <BottomNav />

      {/* 경로 삭제 확인 */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>경로를 삭제하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const target = routes.find((r) => r.id === pendingDeleteId);
                return target
                  ? `경로 '${target.name}'을(를) 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
                  : '이 작업은 되돌릴 수 없습니다.';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingDeleteId) deleteMutation.mutate(pendingDeleteId); }}
              disabled={deleteMutation.isPending}
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 즐겨찾기 삭제 확인 */}
      <AlertDialog
        open={pendingFavDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingFavDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>즐겨찾기를 삭제하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const target = favorites.find((f) => f.id === pendingFavDeleteId);
                return target
                  ? `'${target.stop_name}'을(를) 즐겨찾기에서 삭제합니다.`
                  : '이 작업은 되돌릴 수 없습니다.';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingFavDeleteId) deleteFavMutation.mutate(pendingFavDeleteId); }}
              disabled={deleteFavMutation.isPending}
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 경로 이름 수정 다이얼로그 */}
      {renameTarget && (
        <RouteRenameDialog
          open={true}
          currentName={renameTarget.name}
          onConfirm={(name) => renameMutation.mutate({ id: renameTarget.id, name })}
          onClose={() => setRenameTarget(null)}
          isPending={renameMutation.isPending}
        />
      )}
    </div>
  );
}
