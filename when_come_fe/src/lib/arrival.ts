import { getSubwayArrival, getBusArrival, getOdsayArrival } from '@/lib/api'
import type { TransitStop } from '@/lib/mockData'
import type { ApiSubwayArrivalItem, ApiBusArrival, ApiOdsayArrival } from '@/types/api'
import { subwayApiCodeToLineName } from '@/utils/transitColors'

export type ArrivalData =
  | { type: 'subway'; items: ApiSubwayArrivalItem[] }
  | { type: 'odsay'; items: ApiOdsayArrival[] }
  | { type: 'bus'; items: Array<ApiBusArrival | null> }
  | null

const MAX_BUS_ROUTES = 3

export function parseArrivalMin(arrmsg: string): number | null {
  const minMatch = arrmsg.match(/(\d+)분/)
  const secMatch = arrmsg.match(/(\d+)초/)
  if (!minMatch && !secMatch) return null
  const mins = minMatch ? parseInt(minMatch[1]) : 0
  const secs = secMatch ? parseInt(secMatch[1]) : 0
  return mins + (secs > 0 ? 1 : 0)
}

export function getArrivalDisplay(stop: TransitStop, line: string, idx: number, arrival: ArrivalData): string {
  if (!arrival) return '--'

  if (arrival.type === 'subway') {
    const match = arrival.items.find(
      item => subwayApiCodeToLineName(item.lineName) === line
    ) ?? arrival.items[idx]
    if (match) return match.arrmsg1
  }

  if (arrival.type === 'odsay') {
    const match = arrival.items.find(item => item.routeName === line) ?? arrival.items[idx]
    if (match?.arrivalTime1 != null) return `${match.arrivalTime1}분`
  }

  if (arrival.type === 'bus') {
    const item = arrival.items[idx] ?? arrival.items[0]
    if (item?.arrivalSec1 != null) return `${Math.ceil(item.arrivalSec1 / 60)}분`
    if (item?.arrmsg1) return item.arrmsg1
  }

  return '--'
}

export function getArrivalMin(stop: TransitStop, line: string, idx: number, arrival: ArrivalData): number | null {
  if (!arrival) return null

  if (arrival.type === 'subway') {
    const match = arrival.items.find(
      item => subwayApiCodeToLineName(item.lineName) === line
    ) ?? arrival.items[idx]
    return match ? parseArrivalMin(match.arrmsg1) : null
  }

  if (arrival.type === 'odsay') {
    const match = arrival.items.find(item => item.routeName === line) ?? arrival.items[idx]
    return match?.arrivalTime1 ?? null
  }

  if (arrival.type === 'bus') {
    const item = arrival.items[idx] ?? arrival.items[0]
    if (item?.arrivalSec1 != null) return Math.ceil(item.arrivalSec1 / 60)
    if (item?.arrmsg1) return parseArrivalMin(item.arrmsg1)
  }

  return null
}

export async function fetchArrival(stop: TransitStop): Promise<ArrivalData> {
  if (stop.type === 'subway') {
    const items = await getSubwayArrival(stop.name)
    return { type: 'subway', items }
  }

  // ODsay stationId가 있으면 ODsay 도착 API 우선 사용 (결과 있을 때만 반환)
  if (stop.odsayStopId) {
    try {
      const items = await getOdsayArrival(stop.odsayStopId)
      if (items.length > 0) return { type: 'odsay', items }
    } catch {
      // ODsay 실패 시 서울 버스 API로 fallback
    }
  }

  // fallback: 서울 버스 API
  if (stop.stopRoutes) {
    // stId+stationOrd 있는 것 우선, 없으면 busRouteId+stationName으로 조회
    const callableRoutes = stop.stopRoutes
      .filter(r => r.busRouteId && (
        (r.stId && r.stationOrd != null) || stop.name
      ))
      .slice(0, MAX_BUS_ROUTES)
    if (callableRoutes.length > 0) {
      const results = await Promise.all(
        callableRoutes.map(r => getBusArrival({
          busRouteId: r.busRouteId!,
          ...(r.stId && r.stationOrd != null
            ? { stId: r.stId, ord: String(r.stationOrd) }
            : { stationName: stop.name }
          ),
        }))
      )
      return { type: 'bus', items: results }
    }
  }

  return null
}
