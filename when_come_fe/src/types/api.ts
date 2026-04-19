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
  subwayCode: number | null
}

export interface ApiRouteSegment {
  type: 'bus' | 'subway'
  sectionMinutes: number
  startName: string
  endName: string
  lines: ApiRouteLine[]
}

export interface ApiRouteOption {
  id: string
  totalMinutes: number
  transferCount: number
  segments: ApiRouteSegment[]
}

export interface ApiStopRoute {
  id: string
  odsay_route_id: string
  route_name: string
  st_id: string | null
  bus_route_id: string | null
  station_ord: number | null
  station_name: string | null
}

export interface ApiRouteStop {
  id: string
  odsay_stop_id: string
  stop_name: string
  stop_type: 'bus' | 'subway'
  sequence: number
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
