import type { ApiRoute, ApiFavoriteStop } from '@/types/api'
import type { SavedRoute, TransitStop } from '@/lib/mockData'
import { formatStationName } from '@/utils/stationName'

/** ApiFavoriteStop → TransitStop 변환. arrival.ts의 fetchArrival에 재사용 가능 */
export function mapApiFavoriteStopToTransitStop(fav: ApiFavoriteStop): TransitStop {
  return {
    id: fav.id,
    name: fav.stop_name,
    displayName: fav.stop_type === 'subway'
      ? formatStationName(fav.stop_name)
      : fav.stop_name,
    type: fav.stop_type,
    lines: fav.favorite_stop_routes.map(r => r.route_name),
    arrivalTimes: [],
    odsayStopId: fav.odsay_stop_id,
    arsId: fav.ars_id ?? undefined,
    stopRoutes: fav.favorite_stop_routes.map(r => ({
      odsayRouteId: r.odsay_route_id,
      routeName: r.route_name,
      stId: r.st_id,
      busRouteId: r.bus_route_id,
      stationOrd: r.station_ord,
      stationName: r.station_name,
      busType: r.bus_type,
    })),
    directionHeadsign: fav.direction_headsign ?? null,
    directionUpdn: fav.direction_updn ?? null,
    directionNextStop: fav.direction_next_stop ?? null,
    provider: fav.provider ?? null,
  }
}

export function mapApiRoute(route: ApiRoute): SavedRoute {
  return {
    id: route.id,
    name: route.name,
    from: route.origin_name,
    to: route.destination_name,
    isActive: route.is_active,
    segments: route.route_stops
      .slice()
      .sort((a, b) => (a.step_group ?? 0) - (b.step_group ?? 0) || a.sequence - b.sequence)
      .map((stop, idx) => ({
        id: stop.id,
        order: stop.sequence,
        stepGroup: stop.step_group ?? idx + 1,
        stop: {
          id: stop.id,
          name: stop.stop_name,
          displayName: stop.stop_type === 'subway'
            ? formatStationName(stop.stop_name)
            : stop.stop_name,
          type: stop.stop_type,
          lines: stop.stop_routes.map(r => r.route_name),
          arrivalTimes: [],
          odsayStopId: stop.odsay_stop_id,
          arsId: stop.ars_id ?? undefined,
          stopRoutes: stop.stop_routes.map(r => ({
            odsayRouteId: r.odsay_route_id,
            routeName: r.route_name,
            stId: r.st_id,
            busRouteId: r.bus_route_id,
            stationOrd: r.station_ord,
            stationName: r.station_name,
            busType: r.bus_type,
          })),
          directionHeadsign: stop.direction_headsign ?? null,
          directionUpdn: stop.direction_updn ?? null,
          directionNextStop: stop.direction_next_stop ?? null,
          provider: stop.provider ?? null,
          alias: stop.alias ?? null,
        },
      })),
  }
}
