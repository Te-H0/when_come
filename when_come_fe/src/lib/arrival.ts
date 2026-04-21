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

// arrmsg에 경과 시간을 반영해 카운트다운 ("5분26초후[2번째 전]" → "4분55초후[2번째 전]")
export function applyCountdownToArrmsg(arrmsg: string, elapsedSec: number): string {
  const minMatch = arrmsg.match(/(\d+)분/)
  const secMatch = arrmsg.match(/(\d+)초/)
  if (!minMatch && !secMatch) return arrmsg

  const baseSec = (minMatch ? parseInt(minMatch[1]) * 60 : 0) + (secMatch ? parseInt(secMatch[1]) : 0)
  const remainSec = Math.max(0, baseSec - elapsedSec)
  const suffix = arrmsg.match(/(\[.*?\])/)?.[0] ?? ''

  if (remainSec < 60) return `곧 도착${suffix ? ' ' + suffix : ''}`
  const mins = Math.floor(remainSec / 60)
  const secs = Math.floor(remainSec % 60)
  const timeStr = secs > 0 ? `${mins}분${secs}초후` : `${mins}분후`
  return `${timeStr}${suffix}`
}

function getRawArrmsg(stop: TransitStop, line: string, idx: number, arrival: ArrivalData, which: 1 | 2): string | null {
  if (!arrival) return null

  if (arrival.type === 'subway') {
    const match = arrival.items.find(item => subwayApiCodeToLineName(item.lineName) === line) ?? arrival.items[idx]
    return match ? (which === 1 ? match.arrmsg1 : match.arrmsg2) : null
  }

  if (arrival.type === 'odsay') {
    const match = arrival.items.find(item => item.routeName === line) ?? arrival.items[idx]
    if (!match) return null
    const t = which === 1 ? match.arrivalTime1 : match.arrivalTime2
    return t != null ? `${t}분` : null
  }

  if (arrival.type === 'bus') {
    const item = arrival.items[idx] ?? arrival.items[0]
    if (!item) return null
    if (which === 1) {
      if (item.arrivalSec1 != null) return `${Math.ceil(item.arrivalSec1 / 60)}분후`
      return item.arrmsg1 || null
    } else {
      if (item.arrivalSec2 != null) return `${Math.ceil(item.arrivalSec2 / 60)}분후`
      return item.arrmsg2 || null
    }
  }

  return null
}

export function getArrivalDisplay(stop: TransitStop, line: string, idx: number, arrival: ArrivalData): string {
  return getRawArrmsg(stop, line, idx, arrival, 1) ?? '--'
}

export function getArrivalDisplay2(stop: TransitStop, line: string, idx: number, arrival: ArrivalData): string | null {
  return getRawArrmsg(stop, line, idx, arrival, 2)
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
    const callableRoutes = stop.stopRoutes
      .filter(r => r.busRouteId)
      .slice(0, MAX_BUS_ROUTES)
    if (callableRoutes.length > 0) {
      if (!stop.arsId) return null
      const results = await Promise.all(
        callableRoutes.map(r =>
          getBusArrival({ busRouteId: r.busRouteId!, arsId: stop.arsId! }).catch(() => null)
        )
      )
      return { type: 'bus', items: results }
    }
  }

  return null
}
