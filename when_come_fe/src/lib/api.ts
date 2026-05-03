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
} from '@/types/api'
import { getJwt } from './supabase'

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function isErrorPayload(val: unknown): val is { error?: string; message?: string } {
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
    const body = await res.json().catch(() => ({}))
    const msg = isErrorPayload(body)
      ? (body.message ?? body.error ?? `HTTP ${res.status}`)
      : `HTTP ${res.status}`
    throw new ApiError(msg, res.status)
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

export function getSubwayArrival(stationName: string): Promise<ApiSubwayArrivalItem[]> {
  return apiFetch<ApiSubwayArrivalItem[]>(
    `/arrival-info?type=subway&stationName=${encodeURIComponent(stationName)}`,
  )
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

export function updateRoute(id: string, data: { is_active: boolean }): Promise<void> {
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
