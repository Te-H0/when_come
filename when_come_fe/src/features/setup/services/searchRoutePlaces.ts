import { isMapCoordinates } from '@/features/map/types/map';
import { ApiError, searchPlaces, searchStops } from '@/lib/api';
import { subwayApiCodeToLineName } from '@/utils/transitColors';
import type { ApiPlace } from '@/types/api';

export interface RoutePlaceCandidate extends ApiPlace {
  stopLabel?: string;
}

export async function searchRoutePlaces(query: string, signal?: AbortSignal): Promise<RoutePlaceCandidate[]> {
  if (!(import.meta.env.DEV && import.meta.env.MODE === 'localdev' && import.meta.env.VITE_LOCAL_DEMO !== 'true')) {
    return searchPlaces(query, signal);
  }

  try {
    return await searchPlaces(query, signal);
  } catch (error) {
    if (!(error instanceof ApiError && error.code === 'UNKNOWN' && error.status === 500 &&
      (error.message === 'NAVER_SEARCH_CLIENT_ID not configured' ||
        error.message === 'NAVER_SEARCH_CLIENT_SECRET not configured'))) {
      throw error;
    }

    signal?.throwIfAborted();
    const stops = await searchStops(query, signal);
    signal?.throwIfAborted();
    return stops.flatMap(stop => {
      if (!isMapCoordinates(stop)) return [];
      const line = stop.laneName || (stop.subwayCode ? subwayApiCodeToLineName(stop.subwayCode) : null);
      const details = stop.type === 'subway'
        ? ['지하철역', line, `역 ID ${stop.id}`]
        : ['버스 정류장', stop.arsId ? `ARS ${stop.arsId}` : null, `정류장 ID ${stop.id}`];
      return [{
        name: stop.name,
        address: '',
        x: String(stop.lng),
        y: String(stop.lat),
        stopLabel: details.filter(Boolean).join(' · '),
      }];
    });
  }
}
