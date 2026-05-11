export interface ApiPlace {
  name: string
  address: string
  x: string  // longitude
  y: string  // latitude
}

export interface ApiStop {
  id: string
  name: string
  type: 'bus' | 'subway'
  lat: number
  lng: number
  arsId?: string
  laneName?: string | null
  subwayCode?: string | null
}

export interface SubwayStationDirectionsResponse {
  stationName: string
  lineName: string | null
  subwayCode: string | null
  directions: Array<{ updn: 'up' | 'down'; nextStop: string }>
}

export interface ApiRouteLine {
  routeName: string
  busRouteId: string | null
  subwayCode: string | null
  busType: number | null
}

export interface ApiRouteSegment {
  type: 'bus' | 'subway'
  sectionMinutes: number
  startName: string
  startOdsayId?: number | null
  startArsId?: string | null
  endName: string
  endOdsayId?: number | null
  endArsId?: string | null
  way?: string | null
  wayCode?: 1 | 2 | null
  lines: ApiRouteLine[]
}

export interface ApiStopBus {
  routeName: string
  busRouteId: string
  busRouteType: number | null
  startStation: string | null
  endStation: string | null
}

export interface ApiRouteOption {
  id: string
  totalMinutes: number
  transferCount: number
  segments: ApiRouteSegment[]
  pathType?: number | null
  totalWalkMeters?: number | null
  totalDistanceMeters?: number | null
  paymentWon?: number | null
  busTransferCount?: number | null
  subwayTransferCount?: number | null
  totalTransferCount?: number | null
  totalStationCount?: number | null
}

export interface ApiStopRoute {
  id: string
  odsay_route_id: string
  route_name: string
  st_id: string | null
  bus_route_id: string | null
  station_ord: number | null
  station_name: string | null
  bus_type: number | null
  // multi-region (신규)
  gbis_route_id?: string | null
  gbis_sta_order?: number | null
  /** 지하철 노선 매칭 키 — 서울 지하철 API lineName 형식 ("1001"~"1031"). 버스 row는 null. */
  subway_code?: string | null
}

export interface ApiRouteStop {
  id: string
  odsay_stop_id: string
  stop_name: string
  stop_type: 'bus' | 'subway'
  sequence: number
  step_group?: number | null
  ars_id?: string | null
  direction_headsign?: string | null
  direction_updn?: 'up' | 'down' | null
  direction_next_stop?: string | null
  // multi-region (신규)
  provider?: 'seoul' | 'gyeonggi' | 'odsay_fallback' | null
  gbis_station_id?: string | null
  /** 사용자 지정 별명 */
  alias?: string | null
  stop_routes: ApiStopRoute[]
}

export interface ApiRoute {
  id: string
  name: string
  origin_name: string | null
  destination_name: string | null
  origin_coords: { lat: number; lng: number } | null
  destination_coords: { lat: number; lng: number } | null
  is_active: boolean
  display_order?: number | null
  created_at: string
  route_stops: ApiRouteStop[]
}

/** GET /arrival-info?stopId={uuid} 응답 — BusArrivalResponse (SDD §2.1) */
export interface ApiBusArrivalItem {
  busRouteId: string
  busRouteAbrv: string
  arrmsg1: string
  arrmsg2: string | null
  traTime1: number | null
  traTime2: number | null
  busType: number | null
  // 옵셔널 (GBIS 한정)
  remainSeatCnt1?: number | null
  remainSeatCnt2?: number | null
  crowded1?: 1 | 2 | 3 | 4 | null
  crowded2?: 1 | 2 | 3 | 4 | null
  lowPlate1?: 0 | 1 | 2 | null
  lowPlate2?: 0 | 1 | 2 | null
}

export interface ApiBusArrivalByStopId {
  items: ApiBusArrivalItem[]
  provider: 'seoul' | 'gyeonggi' | 'odsay_fallback'
  fetchedAt: string
}

export interface ApiOdsayArrival {
  routeID: string
  routeName: string
  arrivalTime1: number | null  // 분 단위
  arrivalTime2: number | null
  type: number  // ODsay 버스 타입 코드
}

export interface ApiBusArrival {
  routeName: string
  arrmsg1: string
  arrmsg2: string
  arrivalSec1: number | null
  arrivalSec2: number | null
}

export interface ApiSubwayArrivalItem {
  lineName: string
  direction: string
  arrmsg1: string
  arrmsg2: string
  updnLine: string
  /** BE가 arvlCd를 짧은 한국어 라벨로 매핑한 값. null이면 기존 arrmsg1 사용 */
  displayMsg?: string | null
  /** BE가 응답에 동봉하는 행선지 (예: "온수", "인천공항2터미널"). null이면 fallback */
  headsign?: string | null
  /** 서울 지하철 API `btrainSttus` raw — "급행"|"ITX"|"특급"|"일반"|"" 또는 미지의 값. (2026-05-11~) */
  trainType?: string | null
  /** 종착역명 (`bstatnNm`). direction 파싱 실패 시 fallback. */
  destinationName?: string | null
  /** 도착 예정 초 (정수). arrmsg1 정규식 우회용. */
  arrivalSeconds?: number | null
  /** API 데이터 생성 시각 "YYYY-MM-DD HH:mm:ss" KST. 지연 보정용. */
  dataTimestamp?: string | null
  /** 막차 여부. true일 때 화면에 "막차" 라벨. BE 미반영 응답에선 누락될 수 있으므로 옵셔널 + 사용처에서 truthy 체크. */
  isLastTrain?: boolean | undefined
}

// ──────────────────────── Favorite Stops ────────────────────────

export interface ApiFavoriteStopRoute {
  id: string
  favorite_stop_id: string
  odsay_route_id: string
  route_name: string
  bus_type: number | null
  st_id: string | null
  bus_route_id: string | null
  station_ord: number | null
  station_name: string | null
  gbis_route_id: string | null
  gbis_sta_order: number | null
  provider: 'seoul' | 'gyeonggi' | 'odsay_fallback' | null
  /** 지하철 노선 매칭 키 — 서울 지하철 API lineName 형식 ("1001"~"1031"). 버스 row는 null. */
  subway_code?: string | null
}

export interface ApiFavoriteStop {
  id: string
  user_id: string
  odsay_stop_id: string
  stop_name: string
  stop_type: 'bus' | 'subway'
  ars_id: string | null
  lat: number | null
  lng: number | null
  direction_headsign: string | null
  direction_updn: 'up' | 'down' | null
  direction_next_stop: string | null
  provider: 'seoul' | 'gyeonggi' | 'odsay_fallback'
  gbis_station_id: string | null
  alias: string | null
  display_order: number
  favorite_stop_routes: ApiFavoriteStopRoute[]
  created_at: string
  updated_at: string
}
