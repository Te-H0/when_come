import { isMapCoordinates } from '@/features/map/types/map';
import type { ApiFavoriteStop, ApiFavoriteStopRoute, ApiRoute, ApiRouteStop, ApiStopRoute } from '@/types/api';
import type { CreateFavoriteStopRequest, FavoriteStopRouteInput, SaveRouteRequest, SaveRouteStop } from '@/lib/api';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isTextOrNull(value: unknown): value is string | null { return typeof value === 'string' || value === null; }
function isOptionalText(value: unknown): value is string | null | undefined { return value === undefined || isTextOrNull(value); }
function isNumberOrNull(value: unknown): value is number | null { return value === null || typeof value === 'number' && Number.isFinite(value); }
function isStopType(value: unknown): value is 'bus' | 'subway' { return value === 'bus' || value === 'subway'; }
function isProvider(value: unknown) { return value === 'seoul' || value === 'gyeonggi' || value === 'odsay_fallback'; }
function isSavedLine(value: unknown): value is ApiStopRoute {
  return isRecord(value) && typeof value.id === 'string' && typeof value.odsay_route_id === 'string' &&
    typeof value.route_name === 'string' && isTextOrNull(value.st_id) && isTextOrNull(value.bus_route_id) &&
    isNumberOrNull(value.station_ord) && isTextOrNull(value.station_name) && isNumberOrNull(value.bus_type) && isOptionalText(value.subway_code);
}
function isSavedStop(value: unknown): value is ApiRouteStop {
  return isRecord(value) && typeof value.id === 'string' && typeof value.odsay_stop_id === 'string' &&
    typeof value.stop_name === 'string' && isStopType(value.stop_type) && typeof value.sequence === 'number' &&
    isOptionalText(value.ars_id) && isOptionalText(value.alias) && isOptionalText(value.direction_headsign) &&
    isOptionalText(value.direction_next_stop) && (value.direction_updn == null || value.direction_updn === 'up' || value.direction_updn === 'down') &&
    Array.isArray(value.stop_routes) && value.stop_routes.every(isSavedLine);
}
export function isSavedRoute(value: unknown): value is ApiRoute {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' &&
    isTextOrNull(value.origin_name) && isTextOrNull(value.destination_name) && typeof value.is_active === 'boolean' &&
    (value.origin_coords === null || isMapCoordinates(value.origin_coords)) &&
    (value.destination_coords === null || isMapCoordinates(value.destination_coords)) &&
    (value.display_order == null || typeof value.display_order === 'number' && Number.isFinite(value.display_order)) &&
    typeof value.created_at === 'string' && Array.isArray(value.route_stops) && value.route_stops.every(isSavedStop);
}
function isFavoriteLine(value: unknown): value is ApiFavoriteStopRoute {
  return isSavedLine(value) && 'favorite_stop_id' in value && typeof value.favorite_stop_id === 'string';
}
export function isSavedFavorite(value: unknown): value is ApiFavoriteStop {
  return isRecord(value) && typeof value.id === 'string' && typeof value.user_id === 'string' &&
    typeof value.odsay_stop_id === 'string' && typeof value.stop_name === 'string' && isStopType(value.stop_type) &&
    isTextOrNull(value.ars_id) && isTextOrNull(value.alias) && isNumberOrNull(value.lat) && isNumberOrNull(value.lng) &&
    isTextOrNull(value.direction_headsign) && isTextOrNull(value.direction_next_stop) &&
    (value.direction_updn === null || value.direction_updn === 'up' || value.direction_updn === 'down') &&
    isProvider(value.provider) && typeof value.display_order === 'number' &&
    typeof value.created_at === 'string' && typeof value.updated_at === 'string' &&
    Array.isArray(value.favorite_stop_routes) && value.favorite_stop_routes.every(isFavoriteLine);
}
function isInputLine(value: unknown): value is FavoriteStopRouteInput {
  return isRecord(value) && typeof value.odsayRouteId === 'string' && value.odsayRouteId.length > 0 &&
    typeof value.routeName === 'string' && value.routeName.length > 0 && isOptionalText(value.busRouteId) &&
    isOptionalText(value.stId) && isOptionalText(value.stationName) && isOptionalText(value.subwayCode);
}
export function isInputStop(value: unknown): value is SaveRouteStop {
  return isRecord(value) && typeof value.odsayStopId === 'string' && value.odsayStopId.length > 0 &&
    typeof value.stopName === 'string' && value.stopName.trim().length > 0 && isStopType(value.stopType) &&
    typeof value.sequence === 'number' && Number.isInteger(value.sequence) && value.sequence > 0 &&
    typeof value.stepGroup === 'number' && Number.isInteger(value.stepGroup) && value.stepGroup > 0 &&
    Array.isArray(value.stopRoutes) && value.stopRoutes.length > 0 && value.stopRoutes.every(isInputLine);
}
export function isRouteInput(value: unknown): value is SaveRouteRequest {
  return isRecord(value) && typeof value.name === 'string' && value.name.trim().length > 0 &&
    isTextOrNull(value.originName) && isTextOrNull(value.destinationName) &&
    Array.isArray(value.stops) && value.stops.length > 0 && value.stops.every(isInputStop);
}
export function isFavoriteInput(value: unknown): value is CreateFavoriteStopRequest {
  return isRecord(value) && typeof value.odsayStopId === 'string' && typeof value.stopName === 'string' &&
    isStopType(value.stopType) && isOptionalText(value.arsId) && isOptionalText(value.alias) &&
    Array.isArray(value.routes) && value.routes.length > 0 && value.routes.every(isInputLine);
}
export function isInputLines(value: unknown): value is FavoriteStopRouteInput[] { return Array.isArray(value) && value.length > 0 && value.every(isInputLine); }
