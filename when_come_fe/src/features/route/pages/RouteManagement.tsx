import { useMemo, useState, Fragment } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, MoreVertical, Trash2, Bus, Train, Loader2,
  Pencil, Star, Map as MapIcon, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import EmptyState from "@/components/EmptyState";
import PageShell from "@/components/PageShell";
import PageHeader from "@/components/PageHeader";
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
import { showApiErrorToast } from "@/lib/errorToast";

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
      <DialogContent className="max-w-sm rounded-card">
        <DialogHeader>
          <DialogTitle className="text-card-title">경로 이름 수정</DialogTitle>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="경로 이름"
          className="rounded-control h-11 text-body"
          disabled={isPending}
          autoFocus
        />
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="rounded-control flex-1"
          >
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !value.trim()}
            className="bg-text-primary hover:bg-text-primary/90 rounded-control flex-1"
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
    <Card className="overflow-hidden rounded-card border border-border-subtle shadow-card bg-surface-card">
      {/* 카드 헤더 */}
      <div className="p-4 border-b border-border-subtle">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-card-title truncate">{route.name}</h3>
              {route.isActive && (
                <span className="px-2 py-0.5 rounded-chip bg-text-primary text-white text-caption font-medium shrink-0">
                  활성
                </span>
              )}
            </div>
            <p className="text-body text-text-secondary">
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
                <Button variant="ghost" size="icon" className="rounded-control w-8 h-8">
                  <MoreVertical className="w-[18px] h-[18px] text-text-secondary" strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-control border-border-subtle">
                <DropdownMenuItem
                  onClick={onRename}
                  className="text-body"
                >
                  <Pencil className="w-4 h-4 mr-2" strokeWidth={2} />
                  이름 수정
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-body text-text-danger"
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
        <h4 className="text-label text-text-secondary">
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
                    : 'var(--text-secondary)';

                return (
                  <div
                    key={segment.id}
                    className={`flex items-start gap-3 ${group.length > 1 ? 'flex-1 min-w-0 p-2 rounded-control bg-surface-input border border-surface-info-border' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-control bg-surface-card flex items-center justify-center flex-shrink-0">
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
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {segment.stop.lines.map(line => (
                          <span
                            key={line}
                            className="text-caption px-1.5 py-0.5 rounded-chip bg-surface-muted text-text-secondary font-medium"
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
                <div className="w-px h-4 bg-border-strong" />
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
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-input transition-colors">
      {/* 아이콘 */}
      <div className="w-9 h-9 rounded-control bg-surface-input flex items-center justify-center flex-shrink-0">
        {isSubway ? (
          <Train className="w-[18px] h-[18px] text-text-secondary" strokeWidth={2} />
        ) : (
          <Bus className="w-[18px] h-[18px] text-text-secondary" strokeWidth={2} />
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
        <div className="text-caption mt-0.5">
          {fav.favorite_stop_routes.map(r => r.route_name).join(' · ')}
        </div>
      </div>

      {/* 삭제 버튼 */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-control w-8 h-8 flex-shrink-0">
            <MoreVertical className="w-[18px] h-[18px] text-text-secondary" strokeWidth={2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-control border-border-subtle">
          <DropdownMenuItem
            onClick={onDelete}
            className="text-body text-text-danger"
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
    onError: (e) => showApiErrorToast(e, '변경에 실패했어요'),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateRoute(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      setRenameTarget(null);
      toast.success('경로 이름을 수정했어요');
    },
    onError: (e) => showApiErrorToast(e, '이름 수정에 실패했어요'),
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
      toast.success('경로를 삭제했어요');
    },
    onError: (e) => {
      setPendingDeleteId(null);
      showApiErrorToast(e, '삭제에 실패했어요. 잠시 후 다시 시도해주세요');
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
      toast.success('즐겨찾기를 삭제했어요');
    },
    onError: (e) => {
      setPendingFavDeleteId(null);
      showApiErrorToast(e, '삭제에 실패했어요. 잠시 후 다시 시도해주세요');
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
      showApiErrorToast(e, '저장에 실패했어요');
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
      showApiErrorToast(e, '저장에 실패했어요');
    }
  };

  const isLoading = routesLoading || favsLoading;

  // 탭 바 (PageHeader bottom 슬롯)
  const tabBar = (
    <div className="flex border-b border-border-subtle">
      {(
        [
          { key: 'routes' as TabKey, label: '경로', icon: MapIcon },
          { key: 'favorites' as TabKey, label: '즐겨찾기', icon: Star },
        ] as const
      ).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-body font-medium border-b-2 transition-colors ${
            activeTab === key
              ? 'border-text-primary text-text-primary'
              : 'border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          <Icon className="w-4 h-4" strokeWidth={2} />
          {label}
          {key === 'routes' && routes.length > 0 && (
            <span className={`text-caption px-1.5 py-0.5 rounded-pill font-medium ${
              activeTab === key ? 'bg-text-primary text-white' : 'bg-surface-muted text-text-tertiary'
            }`}>
              {routes.length}
            </span>
          )}
          {key === 'favorites' && favorites.length > 0 && (
            <span className={`text-caption px-1.5 py-0.5 rounded-pill font-medium ${
              activeTab === key ? 'bg-text-primary text-white' : 'bg-surface-muted text-text-tertiary'
            }`}>
              {favorites.length}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
        </div>
      </PageShell>
    );
  }

  if (routesError || favsError) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center p-4 py-16">
          <Card className="max-w-md w-full p-8 text-center rounded-card border border-border-subtle shadow-card bg-surface-card">
            <p className="text-text-danger text-body">데이터를 불러오지 못했습니다</p>
            <Button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['routes'] });
                queryClient.invalidateQueries({ queryKey: ['favorite-stops'] });
              }}
              className="mt-4 bg-text-primary hover:bg-text-primary/90 rounded-control"
            >
              다시 시도
            </Button>
          </Card>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        back={() => navigate('/')}
        title="내 경로"
        right={
          activeTab === 'routes' ? (
            <Button
              onClick={() => navigate('/setup')}
              className="bg-text-primary hover:bg-text-primary/90 rounded-control h-9 px-4 text-button"
            >
              <Plus className="w-[16px] h-[16px] mr-1.5" strokeWidth={2} />
              새 경로
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/favorites/add')}
              className="bg-text-primary hover:bg-text-primary/90 rounded-control h-9 px-4 text-button"
            >
              <Plus className="w-[16px] h-[16px] mr-1.5" strokeWidth={2} />
              즐겨찾기 추가
            </Button>
          )
        }
        bottom={tabBar}
      />

      <div className="max-w-[var(--page-max-width)] mx-auto px-[var(--page-padding-x)] pt-4 space-y-3">
        {/* ─── 경로 탭 ─── */}
        {activeTab === 'routes' && (
          <>
            {routes.length === 0 ? (
              <EmptyState
                icon={<MapPin className="w-8 h-8 text-white" strokeWidth={1.5} />}
                title="저장된 경로가 없어요"
                description="홈 화면에서 새로운 경로를 추가해보세요"
                cta={{ label: '경로 등록하기', onClick: () => navigate('/setup') }}
              />
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
              <EmptyState
                icon={<Star className="w-8 h-8 text-white" strokeWidth={1.5} />}
                title="즐겨찾기가 없어요"
                description="자주 가는 정류장을 등록해보세요"
                cta={{ label: '즐겨찾기 추가', onClick: () => navigate('/favorites/add') }}
              />
            ) : (
              <Card className="overflow-hidden rounded-card border border-border-subtle shadow-card bg-surface-card divide-y divide-border-subtle">
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
              className="bg-text-danger hover:bg-text-danger/80 text-white"
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
              className="bg-text-danger hover:bg-text-danger/80 text-white"
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
    </PageShell>
  );
}
