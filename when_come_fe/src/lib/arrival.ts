import { getSubwayArrival, getBusArrival, getOdsayArrival, getArrivalByStopId, ApiError } from '@/lib/api'
import type { TransitStop } from '@/lib/mockData'
import type { ApiSubwayArrivalItem, ApiBusArrival, ApiOdsayArrival, ApiBusArrivalByStopId } from '@/types/api'
import { subwayApiCodeToLineName, normalizeSubwayLineName } from '@/utils/transitColors'

// T18: 서울 지하철 API의 updnLine 값을 'up'/'down'으로 정규화
// 상행/내선 → 'up', 하행/외선 → 'down', 그 외 → null
function mapsUpdnLineToCode(updnLine: string): 'up' | 'down' | null {
  if (updnLine === '상행' || updnLine === '내선') return 'up'
  if (updnLine === '하행' || updnLine === '외선') return 'down'
  return null
}

interface SubwayDirection {
  headsign: string | null
  updn: 'up' | 'down' | null
}

/**
 * 서울 지하철 `btrainSttus`를 화면용 짧은 라벨로 변환.
 * "급행" → "급", "특급" → "특", "ITX" → "ITX", "일반"/"" → null (표시 안 함).
 * 미지의 값은 raw 그대로 노출 (BE가 anomaly 기록 + FE는 정보 손실 방지).
 */
export function formatTrainTypeShort(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  if (value === '' || value === '일반') return null
  if (value === '급행') return '급'
  if (value === '특급') return '특'
  if (value === 'ITX') return 'ITX'
  return value
}

// 서울 지하철 API가 동일 열차를 byte-identical row로 중복 반환하는 quirk 방어
// 다른 트레인이 우연히 같은 메시지를 갖는 경우는 서로 다른 row이므로 제거하지 않음
function dedupeSubwayItems(items: ApiSubwayArrivalItem[]): ApiSubwayArrivalItem[] {
  const seen = new Set<string>()
  const result: ApiSubwayArrivalItem[] = []
  for (const i of items) {
    const key = `${i.lineName}|${i.direction}|${i.arrmsg1}|${i.arrmsg2}|${i.updnLine}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(i)
  }
  return result
}

// T19: 지하철 도착 items에서 호선 + 방향으로 필터링
// 매칭 0건 시 호선만 일치하는 전체로 fallback (legacy 호환)
function matchSubwayItems(
  items: ApiSubwayArrivalItem[],
  line: string,
  direction: SubwayDirection,
  subwayCode?: string | null,
): ApiSubwayArrivalItem[] {
  const deduped = dedupeSubwayItems(items)
  // 1차 (신): subwayCode 있으면 item.lineName과 직접 비교 (서울 지하철 API 형식 "1001" 등)
  // 2차 (legacy fallback): subwayCode 없으면 normalize 비교 — 백필 완료 후 별도 PR(T21)에서 제거
  const sameLine = subwayCode
    ? deduped.filter(i => i.lineName === subwayCode)
    : deduped.filter(i => subwayApiCodeToLineName(i.lineName) === normalizeSubwayLineName(line))
  if (sameLine.length === 0) return []

  // 방향 정보가 없으면 전체 반환 (기존 경로 fallback)
  if (!direction.headsign && !direction.updn) return sameLine

  const filtered = sameLine.filter(i => {
    const updnCode = mapsUpdnLineToCode(i.updnLine)
    const okUpdn = !direction.updn ? true : updnCode === direction.updn
    const okHead = !direction.headsign ? true : i.direction.startsWith(direction.headsign)
    return okUpdn && okHead
  })

  // 매칭 0건 → 호선 일치 전체로 fallback
  return filtered.length > 0 ? filtered : sameLine
}

// 지하철 item 목록을 방향별로 분류 (updnLine 기준)
// 상행/내선 → up, 하행/외선 → down, 그 외 → other
export function groupSubwayItemsByDirection(items: ApiSubwayArrivalItem[]): {
  up: ApiSubwayArrivalItem[]
  down: ApiSubwayArrivalItem[]
  other: ApiSubwayArrivalItem[]
} {
  const up: ApiSubwayArrivalItem[] = []
  const down: ApiSubwayArrivalItem[] = []
  const other: ApiSubwayArrivalItem[] = []
  for (const item of items) {
    const code = mapsUpdnLineToCode(item.updnLine)
    if (code === 'up') up.push(item)
    else if (code === 'down') down.push(item)
    else other.push(item)
  }
  return { up, down, other }
}

// 지하철 매칭 item 전체를 외부에서 사용할 수 있도록 export
export function getMatchedSubwayItems(
  stop: TransitStop,
  line: string,
  arrival: ArrivalData,
): ApiSubwayArrivalItem[] {
  if (!arrival || arrival.type !== 'subway') return []
  const direction: SubwayDirection = {
    headsign: stop.directionHeadsign ?? null,
    updn: stop.directionUpdn ?? null,
  }
  const stopRoute = stop.stopRoutes?.find(r => r.routeName === line)
  const subwayCode = stopRoute?.subwayCode ?? null
  return matchSubwayItems(arrival.items, line, direction, subwayCode)
}

export type ArrivalData =
  | { type: 'subway'; items: ApiSubwayArrivalItem[] }
  | { type: 'odsay'; items: ApiOdsayArrival[] }
  | { type: 'bus'; items: Array<ApiBusArrival | null> }
  /** 신 경로: stopId 기반 도착 응답 — provider 포함 */
  | { type: 'bus_by_stopid'; data: ApiBusArrivalByStopId }
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
// mode === 'bus': 초 단위 제거 (가짜 정밀도 방지), 1분 미만 → "곧 도착"
// mode === 'subway': 기존 동작 유지 (초 표시)
export function applyCountdownToArrmsg(arrmsg: string, elapsedSec: number, mode: 'bus' | 'subway' = 'subway'): string {
  const minMatch = arrmsg.match(/(\d+)분/)
  const secMatch = arrmsg.match(/(\d+)초/)
  if (!minMatch && !secMatch) return arrmsg

  const baseSec = (minMatch ? parseInt(minMatch[1]) * 60 : 0) + (secMatch ? parseInt(secMatch[1]) : 0)
  const remainSec = Math.max(0, baseSec - elapsedSec)
  const suffix = arrmsg.match(/(\[.*?\])/)?.[0] ?? ''

  if (remainSec < 60) return `곧 도착${suffix ? ' ' + suffix : ''}`
  const mins = Math.floor(remainSec / 60)

  if (mode === 'bus') {
    // 버스는 분 단위만 표시 — 초 단위 제거
    return `${mins}분 후${suffix}`
  }

  const secs = Math.floor(remainSec % 60)
  const timeStr = secs > 0 ? `${mins}분${secs}초후` : `${mins}분후`
  return `${timeStr}${suffix}`
}

// 노선 매칭 — 같은 노선번호 item이 여러 개 들어오면(서울/경기 동일 번호 등) traTime1 최솟값 채택
function matchBusItem<T extends { busRouteAbrv: string; traTime1: number | null }>(
  items: T[],
  line: string,
): T | null {
  const matched = items.filter(
    i => i.busRouteAbrv === line || i.busRouteAbrv.replace(/번$/, '') === line,
  )
  if (matched.length === 0) return null
  if (matched.length === 1) return matched[0]
  return matched.reduce((best, cur) => {
    const bestT = best.traTime1 ?? Infinity
    const curT = cur.traTime1 ?? Infinity
    return curT < bestT ? cur : best
  })
}

function getRawArrmsg(stop: TransitStop, line: string, arrival: ArrivalData, which: 1 | 2): string | null {
  if (!arrival) return null

  if (arrival.type === 'subway') {
    const direction: SubwayDirection = {
      headsign: stop.directionHeadsign ?? null,
      updn: stop.directionUpdn ?? null,
    }
    const stopRoute = stop.stopRoutes?.find(r => r.routeName === line)
    const subwayCode = stopRoute?.subwayCode ?? null
    const matched = matchSubwayItems(arrival.items, line, direction, subwayCode)
    // which === 1 → 첫 번째 매칭 item의 arrmsg1
    // which === 2 → 두 번째 매칭 item의 arrmsg1 (다음 차량)
    // displayMsg가 있으면(짧은 상태 라벨) 우선 사용 — 카운트다운 미적용
    const item = matched[which - 1]
    return item ? (item.displayMsg ?? item.arrmsg1) : null
  }

  if (arrival.type === 'odsay') {
    const match = arrival.items.find(item => item.routeName === line)
    if (!match) return null
    const t = which === 1 ? match.arrivalTime1 : match.arrivalTime2
    return t != null ? `${t}분` : null
  }

  if (arrival.type === 'bus') {
    const item = arrival.items.find(i => i?.routeName === line) ?? null
    if (!item) return null
    if (which === 1) {
      if (item.arrivalSec1 != null) return `${Math.ceil(item.arrivalSec1 / 60)}분후`
      return item.arrmsg1 || null
    } else {
      if (item.arrivalSec2 != null) return `${Math.ceil(item.arrivalSec2 / 60)}분후`
      return item.arrmsg2 || null
    }
  }

  if (arrival.type === 'bus_by_stopid') {
    const item = matchBusItem(arrival.data.items, line)
    if (!item) return null
    if (which === 1) return item.arrmsg1 || null
    return item.arrmsg2 || null
  }

  return null
}

export function getArrivalDisplay(stop: TransitStop, line: string, arrival: ArrivalData): string {
  return getRawArrmsg(stop, line, arrival, 1) ?? '--'
}

export function getArrivalDisplay2(stop: TransitStop, line: string, arrival: ArrivalData): string | null {
  return getRawArrmsg(stop, line, arrival, 2)
}

export function getArrivalMin(stop: TransitStop, line: string, arrival: ArrivalData): number | null {
  if (!arrival) return null

  if (arrival.type === 'subway') {
    const direction: SubwayDirection = {
      headsign: stop.directionHeadsign ?? null,
      updn: stop.directionUpdn ?? null,
    }
    const stopRoute = stop.stopRoutes?.find(r => r.routeName === line)
    const subwayCode = stopRoute?.subwayCode ?? null
    const matched = matchSubwayItems(arrival.items, line, direction, subwayCode)
    const item = matched[0]
    if (!item) return null
    // displayMsg가 있으면 진입중/도착/출발 등 도착 임박 상태 → 0분으로 간주해 isUrgent 강조 동작 유지
    if (item.displayMsg != null) return 0
    return parseArrivalMin(item.arrmsg1)
  }

  if (arrival.type === 'odsay') {
    const match = arrival.items.find(item => item.routeName === line)
    return match?.arrivalTime1 ?? null
  }

  if (arrival.type === 'bus') {
    const item = arrival.items.find(i => i?.routeName === line) ?? null
    if (item?.arrivalSec1 != null) return Math.ceil(item.arrivalSec1 / 60)
    if (item?.arrmsg1) return parseArrivalMin(item.arrmsg1)
  }

  if (arrival.type === 'bus_by_stopid') {
    const item = matchBusItem(arrival.data.items, line)
    if (item?.traTime1 != null) return Math.ceil(item.traTime1 / 60)
    if (item?.arrmsg1) return parseArrivalMin(item.arrmsg1)
  }

  return null
}

export async function fetchArrival(stop: TransitStop): Promise<ArrivalData> {
  if (stop.type === 'subway') {
    const subwayCode = stop.stopRoutes?.[0]?.subwayCode ?? null
    const items = await getSubwayArrival(stop.name, subwayCode)
    return { type: 'subway', items }
  }

  // 신 경로: stopId 기반 도착 조회 — BE가 provider 자동 분기 (서울/경기/ODsay-fallback)
  // stop.id는 route_stops.id(uuid). BE가 배포됐을 때만 동작하며 실패 시 legacy로 fallback.
  try {
    const data = await getArrivalByStopId(stop.id)
    return { type: 'bus_by_stopid', data }
  } catch (err) {
    if (!(err instanceof ApiError)) {
      // 네트워크 오류(TypeError 등)도 throw
      throw err
    }
    // 구조화 에러(비즈니스 에러 코드)는 재시도/fallback 없이 그대로 throw
    const isBusinessError =
      err.code === 'ARRIVAL_UNSUPPORTED_REGION' ||
      err.code === 'ARRIVAL_MAPPING_FAILED' ||
      err.code === 'ARRIVAL_VERIFY_FAILED' ||
      err.code === 'ARRIVAL_PROVIDER_ERROR' ||
      err.code === 'ARRIVAL_STOP_NOT_FOUND'
    if (isBusinessError) throw err
    // 401(인증 만료), 5xx(서버 오류)는 그대로 throw
    if (err.status !== 404 && err.status !== 400 && err.status !== 405) throw err
    // 404 / 400 / 405 → BE 미지원 신호 → legacy fallback (한 사이클 호환)
  }

  // legacy fallback: ODsay 도착 API
  if (stop.odsayStopId) {
    try {
      const items = await getOdsayArrival(stop.odsayStopId)
      if (items.length > 0) return { type: 'odsay', items }
    } catch {
      // ODsay 실패 시 서울 버스 API로 fallback
    }
  }

  // legacy fallback: 서울 버스 API
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
