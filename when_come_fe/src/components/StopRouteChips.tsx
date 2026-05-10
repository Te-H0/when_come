import { getBusTypeByOdsay, getSubwayColor, normalizeSubwayLineName } from "@/utils/transitColors";

interface RouteChipItem {
  /** 화면에 표시할 노선 이름 */
  routeName: string;
  /** ODsay busType 코드 (null이면 번호 기반 추론) */
  busType?: number | null;
}

interface StopRouteChipsProps {
  stopType: "bus" | "subway";
  routes: RouteChipItem[];
}

/**
 * 정류장에 속한 노선 목록을 chip 형태로 나열합니다.
 * - 버스: 노선마다 chip 1개, busType(ODsay 코드)으로 색상 결정
 * - 지하철: 호선명을 정규화("수도권 4호선" → "4호선")해 chip 1개
 *
 * transitColors.ts의 색상 매핑을 사용하므로 hex 임의값 클래스 없음.
 */
export default function StopRouteChips({ stopType, routes }: StopRouteChipsProps) {
  if (routes.length === 0) return null;

  if (stopType === "subway") {
    // 지하철은 노선이 1개. 여러 개라면 중복 없이 호선명 chip 나열.
    const seen = new Set<string>();
    const chips = routes
      .map((r) => normalizeSubwayLineName(r.routeName))
      .filter((name) => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });

    return (
      <div className="flex flex-wrap gap-1 mt-0.5">
        {chips.map((lineName) => {
          const colorInfo = getSubwayColor(lineName);
          return (
            <span
              key={lineName}
              className="text-caption px-1.5 py-0.5 rounded-chip border font-medium"
              style={{
                backgroundColor: colorInfo.bgColor,
                color: colorInfo.textColor,
                borderColor: `${colorInfo.color}33`,
              }}
            >
              {lineName}
            </span>
          );
        })}
      </div>
    );
  }

  // 버스
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {routes.map((r, idx) => {
        const colorInfo = getBusTypeByOdsay(r.busType ?? null, r.routeName);
        return (
          <span
            key={`${r.routeName}-${idx}`}
            className="text-caption px-1.5 py-0.5 rounded-chip border font-medium"
            style={{
              backgroundColor: colorInfo.bgColor,
              color: colorInfo.color,
              borderColor: `${colorInfo.color}33`,
            }}
          >
            {r.routeName}번
          </span>
        );
      })}
    </div>
  );
}
