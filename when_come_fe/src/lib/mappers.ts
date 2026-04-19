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
      .sort((a, b) => a.sequence - b.sequence)
      .map(stop => ({
        id: stop.id,
        order: stop.sequence,
        stop: {
          id: stop.id,
          name: stop.stop_name,
          type: stop.stop_type,
          lines: stop.stop_routes.map(r => r.route_name),
          arrivalTimes: [],
          odsayStopId: stop.odsay_stop_id,
          stopRoutes: stop.stop_routes.map(r => ({
            odsayRouteId: r.odsay_route_id,
            routeName: r.route_name,
            stId: r.st_id,
            busRouteId: r.bus_route_id,
            stationOrd: r.station_ord,
            stationName: r.station_name,
          })),
        },
      })),
  }
}
