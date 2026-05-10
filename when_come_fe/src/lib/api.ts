import type {
  ApiPlace,
  ApiStop,
  ApiRouteOption,
  ApiOdsayArrival,
  ApiBusArrival,
  ApiBusArrivalByStopId,
  ApiSubwayArrivalItem,
  ApiRoute,
  ApiStopBus,
  SubwayStationDirectionsResponse,
  ApiFavoriteStop,
} from '@/types/api'
import { getJwt } from './supabase'

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

/**
 * API 에러 클래스.
 *
 * - `code`: BE `_shared/errorCodes.ts`에 정의된 ErrorCode 문자열.
 *   구조화 응답이 없으면 `'UNKNOWN'`.
 *   code 매핑 메시지는 `src/lib/errorMessages.ts` 참조.
 * - `message`: BE가 내려준 원본 메시지 (dev 토스트 fallback용).
 * - `status`: HTTP 응답 상태 코드.
 *
 * catch 블록에서 직접 toast.error를 호출하지 말고
 * `showApiErrorToast` / `getErrorMessage` 헬퍼를 사용한다.
 * 정책: ADR-002, .claude/rules/error-handling.md FE 규칙 1
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 신형 구조화 에러 응답: { "error": { "code": "...", "message": "...", "detail": "..." } } */
interface StructuredErrorBody {
  error: {
    code: string
    message: string
    detail?: string
  }
}

/** 구형 에러 응답: { "error": "string 메시지" } 또는 { "message": "..." } */
interface LegacyErrorBody {
  error?: string
  message?: string
}

function isStructuredError(val: unknown): val is StructuredErrorBody {
  return (
    typeof val === 'object' &&
    val !== null &&
    'error' in val &&
    typeof (val as Record<string, unknown>).error === 'object' &&
    (val as Record<string, unknown>).error !== null &&
    'code' in ((val as Record<string, unknown>).error as object)
  )
}

function isLegacyError(val: unknown): val is LegacyErrorBody {
  return typeof val === 'object' && val !== null
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getJwt()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}))
    if (isStructuredError(body)) {
      throw new ApiError(body.error.code, body.error.message, res.status)
    }
    const msg = isLegacyError(body)
      ? (body.message ?? body.error ?? `HTTP ${res.status}`)
      : `HTTP ${res.status}`
    throw new ApiError('UNKNOWN', msg, res.status)
  }
  if (res.status === 204 || res.headers.get('Content-Length') === '0') {
    return undefined as T
  }
  return res.json() as Promise<T>
}

export function searchPlaces(q: string): Promise<ApiPlace[]> {
  return apiFetch<ApiPlace[]>(`/place-search?q=${encodeURIComponent(q)}`)
}

export function searchStops(q: string): Promise<ApiStop[]> {
  return apiFetch<ApiStop[]>(`/search-stops?q=${encodeURIComponent(q)}`)
}

export function searchRoutes(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Promise<ApiRouteOption[]> {
  return apiFetch<ApiRouteOption[]>('/route-search', {
    method: 'POST',
    body: JSON.stringify({ startX, startY, endX, endY }),
  })
}

export function getStopBuses(arsId: string): Promise<ApiStopBus[]> {
  return apiFetch<ApiStopBus[]>(`/stop-buses?arsId=${encodeURIComponent(arsId)}`)
}

export function getOdsayArrival(stationId: string): Promise<ApiOdsayArrival[]> {
  return apiFetch<ApiOdsayArrival[]>(
    `/arrival-info?type=odsay&stationId=${encodeURIComponent(stationId)}`,
  )
}

export function getBusArrival(params: {
  busRouteId: string
  arsId: string
}): Promise<ApiBusArrival | null> {
  const q = new URLSearchParams({ type: 'bus', busRouteId: params.busRouteId, arsId: params.arsId })
  return apiFetch<ApiBusArrival | null>(`/arrival-info?${q.toString()}`)
}

/** 신 경로: stopId(route_stops.id) 기반 버스 도착 조회 — BE가 provider 자동 분기 */
export function getArrivalByStopId(stopId: string): Promise<ApiBusArrivalByStopId> {
  return apiFetch<ApiBusArrivalByStopId>(
    `/arrival-info?stopId=${encodeURIComponent(stopId)}`,
  )
}

export function getSubwayArrival(stationName: string, subwayCode?: string | null): Promise<ApiSubwayArrivalItem[]> {
  const params = new URLSearchParams({ type: 'subway', stationName })
  if (subwayCode) params.set('subwayCode', subwayCode)
  return apiFetch<ApiSubwayArrivalItem[]>(`/arrival-info?${params.toString()}`)
}

export function listRoutes(jwt: string): Promise<ApiRoute[]> {
  return apiFetch<ApiRoute[]>('/routes', {
    headers: { Authorization: `Bearer ${jwt}` },
  })
}

export interface SaveRouteStop {
  odsayStopId: string
  stopName: string
  stopType: 'bus' | 'subway'
  sequence: number
  stepGroup: number
  arsId?: string
  directionHeadsign?: string | null
  directionUpdn?: 'up' | 'down' | null
  directionNextStop?: string | null
  // multi-region: 좌표를 보내면 BE가 provider 자동 판별 (권장)
  lat?: number
  lng?: number
  stopRoutes: Array<{
    odsayRouteId: string
    routeName: string
    stId?: string
    busRouteId?: string
    stationOrd?: number
    stationName?: string
    busType?: number | null
    /** 지하철 노선 매칭 키. 버스 row는 null/undefined. */
    subwayCode?: string | null
  }>
}

export interface SaveRouteRequest {
  name: string
  originName: string
  destinationName: string
  originCoords?: { lat: number; lng: number }
  destinationCoords?: { lat: number; lng: number }
  stops: SaveRouteStop[]
}

export function saveRoute(data: SaveRouteRequest, jwt: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>('/routes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(data),
  })
}

export function updateRoute(
  id: string,
  data: { is_active?: boolean; name?: string; displayOrder?: number },
): Promise<void> {
  return apiFetch<{ ok: boolean }>(`/routes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }).then(() => undefined)
}

export function deleteRoute(id: string, jwt: string): Promise<void> {
  return apiFetch<{ ok: boolean }>(`/routes/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
  }).then(() => undefined)
}

export function getSubwayStationDirections(stationId: string): Promise<SubwayStationDirectionsResponse> {
  return apiFetch<SubwayStationDirectionsResponse>(
    `/subway-station-directions?stationId=${encodeURIComponent(stationId)}`,
  )
}

// ──────────────────────── Favorite Stops ────────────────────────

export interface FavoriteStopRouteInput {
  odsayRouteId: string
  routeName: string
  busType?: number | null
  stId?: string | null
  busRouteId?: string | null
  stationOrd?: number | null
  stationName?: string | null
  gbisRouteId?: string | null
  gbisStaOrder?: number | null
  /** 지하철 노선 매칭 키. 버스 row는 null/undefined. */
  subwayCode?: string | null
}

export interface CreateFavoriteStopRequest {
  odsayStopId: string
  stopName: string
  stopType: 'bus' | 'subway'
  arsId?: string | null
  lat?: number | null
  lng?: number | null
  directionHeadsign?: string | null
  directionUpdn?: 'up' | 'down' | null
  directionNextStop?: string | null
  alias?: string | null
  routes: FavoriteStopRouteInput[]
}

export interface UpdateFavoriteStopRequest {
  alias?: string | null
  displayOrder?: number
  routes?: FavoriteStopRouteInput[]
}

export function listFavoriteStops(jwt: string): Promise<ApiFavoriteStop[]> {
  return apiFetch<ApiFavoriteStop[]>('/favorite-stops', {
    headers: { Authorization: `Bearer ${jwt}` },
  })
}

export function createFavoriteStop(body: CreateFavoriteStopRequest, jwt: string): Promise<ApiFavoriteStop> {
  return apiFetch<ApiFavoriteStop>('/favorite-stops', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  })
}

export function updateFavoriteStop(id: string, body: UpdateFavoriteStopRequest, jwt: string): Promise<ApiFavoriteStop> {
  return apiFetch<ApiFavoriteStop>(`/favorite-stops/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(body),
  })
}

export function deleteFavoriteStop(id: string, jwt: string): Promise<void> {
  return apiFetch<void>(`/favorite-stops/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
  }).then(() => undefined)
}

export function updateRouteStopAlias(id: string, alias: string | null, jwt: string): Promise<{ id: string; alias: string | null }> {
  return apiFetch<{ id: string; alias: string | null }>(`/route-stops/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ alias }),
  })
}
