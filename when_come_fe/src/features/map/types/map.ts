/** Discovery identity survives missing coordinates; it must never be inferred from a name. */
export interface StopSummary {
  id: string;
  name: string;
  type: 'bus' | 'subway';
  lat: number | null;
  lng: number | null;
  arsId: string | null;
  laneName?: string | null;
  subwayCode?: string | null;
  directionLabel?: string | null;
}

export interface MapCoordinates {
  lat: number;
  lng: number;
}

export interface MappableStop extends StopSummary {
  lat: number;
  lng: number;
}

export function isMapCoordinates(value: unknown): value is MapCoordinates {
  return typeof value === 'object' && value !== null &&
    'lat' in value && typeof value.lat === 'number' && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 &&
    'lng' in value && typeof value.lng === 'number' && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180;
}

export function isMappableStop(stop: StopSummary): stop is MappableStop {
  return isMapCoordinates(stop);
}

export function stopKey(stop: Pick<StopSummary, 'id' | 'type'>): string {
  return `${stop.type}:${stop.id}`;
}
