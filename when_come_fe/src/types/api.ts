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
  stop_routes: ApiStopRoute[]
}

export interface ApiRoute {
  id: string
  name: string
  origin_name: string
  destination_name: string
  origin_coords: { lat: number; lng: number } | null
  destination_coords: { lat: number; lng: number } | null
  is_active: boolean
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
}
