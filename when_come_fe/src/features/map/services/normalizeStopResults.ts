import { ApiError } from '@/lib/api';
import { isMapCoordinates } from '../types/map';
import type { ApiStop } from '@/types/api';

/** Missing coordinates stay in the discovery list; names and IDs are never inferred. */
export function normalizeStopResults(value: unknown): ApiStop[] {
  if (!Array.isArray(value)) throw new ApiError('STOP_PROVIDER_ERROR', '정류장 검색 결과를 확인하지 못했어요', 502);
  const stops: ApiStop[] = [];
  for (const row of value) {
    if (typeof row !== 'object' || row === null || !('id' in row) || typeof row.id !== 'string' || !row.id ||
      !('name' in row) || typeof row.name !== 'string' || !('type' in row) || (row.type !== 'bus' && row.type !== 'subway')) continue;
    const coordinates = isMapCoordinates(row) ? row : null;
    stops.push({
      id: row.id, name: row.name, type: row.type, lat: coordinates?.lat ?? null, lng: coordinates?.lng ?? null,
      arsId: 'arsId' in row && typeof row.arsId === 'string' ? row.arsId : null,
      laneName: 'laneName' in row && typeof row.laneName === 'string' ? row.laneName : null,
      subwayCode: 'subwayCode' in row && typeof row.subwayCode === 'string' ? row.subwayCode : null,
    });
  }
  if (value.length > 0 && stops.length === 0) throw new ApiError('STOP_PROVIDER_ERROR', '정류장 검색 결과를 확인하지 못했어요', 502);
  return stops;
}
