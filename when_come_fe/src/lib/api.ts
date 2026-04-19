import type {
  ApiStop,
  ApiRouteOption,
  ApiBusArrival,
  ApiSubwayArrivalItem,
  ApiRoute,
} from '@/types/api'

const BASE_URL = 'https://kifxccvqofsdyonbhmnc.supabase.co/functions/v1'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error((error as { message?: string }).message ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
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

export function getBusArrival(
  stId: string,
  busRouteId: string,
  ord: string,
): Promise<ApiBusArrival | null> {
  return apiFetch<ApiBusArrival | null>(
    `/arrival-info?type=bus&stId=${stId}&busRouteId=${busRouteId}&ord=${ord}`,
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
  stopRoutes: Array<{
    odsayRouteId: string
    routeName: string
    stId?: string
    busRouteId?: string
    stationOrd?: number
    stationName?: string
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

export function deleteRoute(id: string, jwt: string): Promise<void> {
  return apiFetch<{ ok: boolean }>(`/routes/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${jwt}` },
  }).then(() => undefined)
}
