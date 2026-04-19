export interface StopRouteInfo {
  odsayRouteId: string
  routeName: string
  stId?: string | null
  busRouteId?: string | null
  stationOrd?: number | null
  stationName?: string | null
}

export interface TransitStop {
  id: string;
  name: string;
  type: 'bus' | 'subway';
  lines: string[];
  arrivalTimes: number[]; // 분 단위
  // 실시간 API 호출에 필요한 메타데이터 (API 로드 시 채워짐)
  odsayStopId?: string;
  stopRoutes?: StopRouteInfo[];
}

export interface RouteSegment {
  id: string;
  stop: TransitStop;
  order: number;
}

export interface SavedRoute {
  id: string;
  name: string;
  from: string;
  to: string;
  segments: RouteSegment[];
  isActive: boolean;
}

// 모의 데이터
export const mockRoutes: SavedRoute[] = [
  {
    id: "route-1",
    name: "출근 경로",
    from: "집",
    to: "회사",
    isActive: true,
    segments: [
      {
        id: "seg-1",
        order: 1,
        stop: {
          id: "stop-1",
          name: "신림역 3번출구",
          type: "bus",
          lines: ["5524", "5413", "5516"],
          arrivalTimes: [2, 8, 15],
        },
      },
      {
        id: "seg-2",
        order: 2,
        stop: {
          id: "stop-2",
          name: "신림역",
          type: "subway",
          lines: ["2호선"],
          arrivalTimes: [3, 7, 11],
        },
      },
      {
        id: "seg-3",
        order: 3,
        stop: {
          id: "stop-3",
          name: "강남역 5번출구",
          type: "bus",
          lines: ["146", "360", "740"],
          arrivalTimes: [1, 5, 12],
        },
      },
    ],
  },
  {
    id: "route-2",
    name: "퇴근 경로",
    from: "회사",
    to: "집",
    isActive: false,
    segments: [
      {
        id: "seg-4",
        order: 1,
        stop: {
          id: "stop-4",
          name: "강남역 12번출구",
          type: "bus",
          lines: ["146", "360"],
          arrivalTimes: [3, 9],
        },
      },
      {
        id: "seg-5",
        order: 2,
        stop: {
          id: "stop-5",
          name: "강남역",
          type: "subway",
          lines: ["2호선", "신분당선"],
          arrivalTimes: [2, 5, 9],
        },
      },
      {
        id: "seg-6",
        order: 3,
        stop: {
          id: "stop-6",
          name: "신림역 1번출구",
          type: "bus",
          lines: ["5524", "5413"],
          arrivalTimes: [4, 11],
        },
      },
    ],
  },
];

