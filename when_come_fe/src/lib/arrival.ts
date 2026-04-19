import { getSubwayArrival, getBusArrival } from '@/lib/api'
import type { TransitStop } from '@/lib/mockData'
import type { ApiSubwayArrivalItem, ApiBusArrival } from '@/types/api'
import { subwayApiCodeToLineName } from '@/utils/transitColors'

export type ArrivalData =
  | { type: 'subway'; items: ApiSubwayArrivalItem[] }
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
  if (!arrival) return String(stop.arrivalTimes[idx] ?? '--')

  if (arrival.type === 'subway') {
    const match = arrival.items.find(
      item => subwayApiCodeToLineName(item.lineName) === line
    ) ?? arrival.items[idx]
    if (match) return match.arrmsg1
  }

  if (arrival.type === 'bus') {
    const item = arrival.items[idx] ?? arrival.items[0]
    if (item?.arrivalSec1 != null) return `${Math.ceil(item.arrivalSec1 / 60)}분`
    if (item?.arrmsg1) return item.arrmsg1
  }

  return String(stop.arrivalTimes[idx] ?? '--')
}

export function getArrivalMin(stop: TransitStop, line: string, idx: number, arrival: ArrivalData): number | null {
  if (!arrival) return stop.arrivalTimes[idx] ?? null

  if (arrival.type === 'subway') {
    const match = arrival.items.find(
      item => subwayApiCodeToLineName(item.lineName) === line
    ) ?? arrival.items[idx]
    return match ? parseArrivalMin(match.arrmsg1) : null
  }

  if (arrival.type === 'bus') {
    const item = arrival.items[idx] ?? arrival.items[0]
    if (item?.arrivalSec1 != null) return Math.ceil(item.arrivalSec1 / 60)
    if (item?.arrmsg1) return parseArrivalMin(item.arrmsg1)
  }

  return stop.arrivalTimes[idx] ?? null
}

export async function fetchArrival(stop: TransitStop): Promise<ArrivalData> {
  if (stop.type === 'subway') {
    const items = await getSubwayArrival(stop.name)
    return { type: 'subway', items }
  }

  if (stop.stopRoutes) {
    const busRoutes = stop.stopRoutes
      .filter(r => r.stId && r.busRouteId && r.stationOrd != null)
      .slice(0, MAX_BUS_ROUTES)
    if (busRoutes.length > 0) {
      const results = await Promise.all(
        busRoutes.map(r => getBusArrival(r.stId!, r.busRouteId!, String(r.stationOrd!)))
      )
      return { type: 'bus', items: results }
    }
  }

  return null
}
