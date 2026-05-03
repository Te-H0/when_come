import type { ApiRoute } from '@/types/api'
import type { SavedRoute } from '@/lib/mockData'

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
        },
      })),
  }
}
