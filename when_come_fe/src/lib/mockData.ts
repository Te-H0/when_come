export interface StopRouteInfo {
  odsayRouteId: string
  routeName: string
  stId?: string | null
  busRouteId?: string | null
  stationOrd?: number | null
  stationName?: string | null
  busType?: number | null
  /** 지하철 노선 매칭 키 — 서울 지하철 API lineName 형식 ("1001"~"1031"). 버스 row는 null. */
  subwayCode?: string | null
}

export interface TransitStop {
  id: string;
  name: string;
  /**
   * 화면 표시용 정규화된 역명/정류장명.
   * 지하철: "군자(능동)" → "군자" (formatStationName 적용)
   * 버스: name 그대로 (괄호 제거 시 정보 손실 우려)
   * API 호출 시에는 원본 name을 사용할 것 (BE fallback 작동).
   */
  displayName: string;
  type: 'bus' | 'subway';
  lines: string[];
  arrivalTimes: number[]; // 분 단위
  // 실시간 API 호출에 필요한 메타데이터 (API 로드 시 채워짐)
  odsayStopId?: string;
  arsId?: string;
  stopRoutes?: StopRouteInfo[];
  // 지하철 방향 정보 (subway stop만 사용)
  directionHeadsign?: string | null;
  directionUpdn?: 'up' | 'down' | null;
  directionNextStop?: string | null;
  // multi-region: BE에서 결정된 도착 조회 provider
  provider?: 'seoul' | 'gyeonggi' | 'odsay_fallback' | null;
  /** 사용자 지정 별명 (예: "회사 앞") */
  alias?: string | null;
}

export interface RouteSegment {
  id: string;
  stop: TransitStop;
  order: number;
  stepGroup: number;
}

export interface SavedRoute {
  id: string;
  name: string;
  /** null이면 출발지 명시 안 함 (수동 등록). 헤더 표시 시 nullish이면 hide. */
  from: string | null;
  to: string | null;
  segments: RouteSegment[];
  isActive: boolean;
  displayOrder?: number;
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
        stepGroup: 1,
        stop: {
          id: "stop-1",
          name: "신림역 3번출구",
          displayName: "신림역 3번출구",
          type: "bus",
          lines: ["5524", "5413", "5516"],
          arrivalTimes: [2, 8, 15],
        },
      },
      {
        id: "seg-2",
        order: 2,
        stepGroup: 2,
        stop: {
          id: "stop-2",
          name: "신림역",
          displayName: "신림역",
          type: "subway",
          lines: ["2호선"],
          arrivalTimes: [3, 7, 11],
        },
      },
      {
        id: "seg-3",
        order: 3,
        stepGroup: 3,
        stop: {
          id: "stop-3",
          name: "강남역 5번출구",
          displayName: "강남역 5번출구",
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
        stepGroup: 1,
        stop: {
          id: "stop-4",
          name: "강남역 12번출구",
          displayName: "강남역 12번출구",
          type: "bus",
          lines: ["146", "360"],
          arrivalTimes: [3, 9],
        },
      },
      {
        id: "seg-5",
        order: 2,
        stepGroup: 2,
        stop: {
          id: "stop-5",
          name: "강남역",
          displayName: "강남역",
          type: "subway",
          lines: ["2호선", "신분당선"],
          arrivalTimes: [2, 5, 9],
        },
      },
      {
        id: "seg-6",
        order: 3,
        stepGroup: 3,
        stop: {
          id: "stop-6",
          name: "신림역 1번출구",
          displayName: "신림역 1번출구",
          type: "bus",
          lines: ["5524", "5413"],
          arrivalTimes: [4, 11],
        },
      },
    ],
  },
];

