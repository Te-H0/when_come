import { AppError } from "./error.ts"
import { realtimeStation, OdsayArrival } from "./odsayClient.ts"
import { getGbisBusArrivalList, GbisArrivalRaw } from "./gbisClient.ts"

// ─── 도메인 타입 ────────────────────────────────────────────────────────────

/** 도착 조회 결과 — 기존 BusArrivalResponse 구조 그대로 (스키마 통일). */
export interface BusArrivalItem {
  busRouteId: string          // provider별 routeId — FE는 식별자로만 사용
  busRouteAbrv: string        // 노선 약칭 ("11", "643")
  arrmsg1: string             // "3분후[2번째 전]" — provider별 포맷터가 통일
  arrmsg2: string | null
  traTime1: number | null     // 초 (없으면 null)
  traTime2: number | null
  busType: number | null      // ODsay busType / GBIS routeTypeCd (보존만)
  // 옵셔널 (provider별 보강 필드)
  remainSeatCnt1?: number | null
  remainSeatCnt2?: number | null
  crowded1?: 1 | 2 | 3 | 4 | null
  crowded2?: 1 | 2 | 3 | 4 | null
  lowPlate1?: 0 | 1 | 2 | null
  lowPlate2?: 0 | 1 | 2 | null
}

export interface BusArrivalResponse {
  items: BusArrivalItem[]
  provider: "seoul" | "gyeonggi" | "odsay_fallback"  // FE inline 안내용
  fetchedAt: string           // ISO 8601 (캐시 진단용)
}

/** Provider가 받는 입력. DB에서 조회한 stop row 그대로. */
export interface ArrivalQueryContext {
  stopType: "bus" | "subway"
  // 서울 버스
  arsId: string | null
  // 경기 버스
  gbisStationId: string | null
  gbisRouteId: string | null      // 단일 노선 조회 시 필터용
  gbisStaOrder: number | null
  // ODsay fallback
  odsayStopId: string | null
  // 지하철 (참고 — 본 PRD 범위 밖이지만 시그니처 통일)
  stationName: string | null
  subwayCode: string | null
}

/**
 * 지역별 도착 조회 책임을 갖는 단일 인터페이스.
 * 구현체는 stateless. 의존성(env, fetch)은 생성자 주입.
 */
export interface ArrivalProvider {
  readonly name: "seoul" | "gyeonggi" | "odsay_fallback"

  /** 이 provider가 ctx를 처리할 수 있는지 (선결 검증용) */
  canHandle(ctx: ArrivalQueryContext): boolean

  /** 실제 도착 조회. 실패는 throw — error.ts 표준 에러 사용. */
  fetchArrivals(ctx: ArrivalQueryContext): Promise<BusArrivalResponse>
}

// ─── 서울 버스 API 원시 응답 타입 ───────────────────────────────────────────
interface SeoulBusStationByUidItem {
  busRouteId: string
  busRouteAbrv: string
  arrmsg1: string
  arrmsg2: string
  traTime1: string
  traTime2: string
  busRouteType?: string
}

interface SeoulBusStationByUidResponse {
  msgBody?: { itemList?: SeoulBusStationByUidItem[] }
  msgHeader?: { headerCd?: string; headerMsg?: string }
}

export function isSeoulBusResponse(val: unknown): val is SeoulBusStationByUidResponse {
  return (
    typeof val === "object" &&
    val !== null &&
    "msgBody" in val
  )
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
function parseArrivalSec(val: unknown): number | null {
  const n = Number(val)
  return !isNaN(n) && n > 0 ? n : null
}

function nowIso(): string {
  return new Date().toISOString()
}

// ─── SeoulBusProvider ────────────────────────────────────────────────────────

function seoulBusApiKey(): string {
  const key = Deno.env.get("SEOUL_BUS_API_KEY")
  if (!key) throw new AppError("SEOUL_BUS_API_KEY not configured", 500)
  return key
}

function toSeoulUnifiedItem(raw: SeoulBusStationByUidItem): BusArrivalItem {
  return {
    busRouteId: raw.busRouteId,
    busRouteAbrv: raw.busRouteAbrv,
    arrmsg1: raw.arrmsg1 ?? "정보없음",
    arrmsg2: raw.arrmsg2 ?? null,
    traTime1: parseArrivalSec(raw.traTime1),
    traTime2: parseArrivalSec(raw.traTime2),
    busType: raw.busRouteType ? parseInt(raw.busRouteType) : null,
  }
}

export class SeoulBusProvider implements ArrivalProvider {
  readonly name = "seoul" as const

  canHandle(ctx: ArrivalQueryContext): boolean {
    return ctx.stopType === "bus" && !!ctx.arsId
  }

  async fetchArrivals(ctx: ArrivalQueryContext): Promise<BusArrivalResponse> {
    if (!ctx.arsId) throw new AppError("SeoulBusProvider: arsId 필요", 400)

    const url =
      `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid` +
      `?ServiceKey=${seoulBusApiKey()}&arsId=${ctx.arsId}&resultType=json`

    const res = await fetch(url)
    if (!res.ok) throw new AppError("서울 버스 API 정류장 조회 실패", 502)

    const data: unknown = await res.json()
    if (!isSeoulBusResponse(data)) throw new AppError("서울 버스 API 응답 형식 오류", 502)

    const items = data.msgBody?.itemList ?? []
    return {
      items: items.map(toSeoulUnifiedItem),
      provider: "seoul",
      fetchedAt: nowIso(),
    }
  }
}

// ─── GyeonggiBusProvider ─────────────────────────────────────────────────────

/**
 * GBIS flag/stateCd 기반 도착 메시지 포맷.
 * SDD §6.2 formatGbisArrmsg 그대로.
 */
function formatGbisArrmsg(
  sec: number | null | undefined,
  locationNo: number | null | undefined,
  flag: string,
  stateCd: number | null | undefined,
): string {
  if (flag === "STOP") return "운행종료"
  if (flag === "WAIT") return "회차지 대기"
  if (stateCd === 1) return "곧 도착"
  if (sec == null) return "정보없음"
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  const timeText = min > 0 ? `${min}분${remSec > 0 ? ` ${remSec}초` : ""}` : `${remSec}초`
  const locText = locationNo ? `[${locationNo}번째 전]` : ""
  return `${timeText}후${locText}`
}

function normalizeCrowded(val: number | null | undefined): 1 | 2 | 3 | 4 | null {
  if (val === 1 || val === 2 || val === 3 || val === 4) return val
  return null
}

function normalizeLowPlate(val: number | null | undefined): 0 | 1 | 2 | null {
  if (val === 0 || val === 1 || val === 2) return val
  return null
}

function toGyeonggiUnifiedItem(raw: GbisArrivalRaw): BusArrivalItem {
  return {
    busRouteId: String(raw.routeId),
    busRouteAbrv: raw.routeName,
    arrmsg1: formatGbisArrmsg(raw.predictTimeSec1, raw.locationNo1, raw.flag, raw.stateCd1),
    arrmsg2: raw.predictTimeSec2 != null
      ? formatGbisArrmsg(raw.predictTimeSec2, raw.locationNo2, raw.flag, raw.stateCd2)
      : null,
    traTime1: raw.predictTimeSec1 ?? null,
    traTime2: raw.predictTimeSec2 ?? null,
    busType: raw.routeTypeCd ?? null,
    remainSeatCnt1: raw.remainSeatCnt1 === -1 ? null : (raw.remainSeatCnt1 ?? null),
    remainSeatCnt2: raw.remainSeatCnt2 === -1 ? null : (raw.remainSeatCnt2 ?? null),
    crowded1: normalizeCrowded(raw.crowded1),
    crowded2: normalizeCrowded(raw.crowded2),
    lowPlate1: normalizeLowPlate(raw.lowPlate1),
    lowPlate2: normalizeLowPlate(raw.lowPlate2),
  }
}

export class GyeonggiBusProvider implements ArrivalProvider {
  readonly name = "gyeonggi" as const

  canHandle(ctx: ArrivalQueryContext): boolean {
    return ctx.stopType === "bus" && !!ctx.gbisStationId
  }

  async fetchArrivals(ctx: ArrivalQueryContext): Promise<BusArrivalResponse> {
    if (!ctx.gbisStationId) throw new AppError("GyeonggiBusProvider: gbisStationId 필요", 400)

    const rawList = await getGbisBusArrivalList(ctx.gbisStationId)
    const allItems = rawList.map(toGyeonggiUnifiedItem)

    // gbisRouteId 있으면 해당 노선만 필터 (SDD §6.2)
    const items = ctx.gbisRouteId
      ? allItems.filter((i) => i.busRouteId === ctx.gbisRouteId)
      : allItems

    return {
      items,
      provider: "gyeonggi",
      fetchedAt: nowIso(),
    }
  }
}

// ─── OdsayBusProvider ────────────────────────────────────────────────────────

function toOdsayUnifiedItem(raw: OdsayArrival): BusArrivalItem {
  return {
    busRouteId: raw.routeID,
    busRouteAbrv: raw.routeName,
    arrmsg1: raw.arrivalTime1 != null ? `${raw.arrivalTime1}분후` : "정보없음",
    arrmsg2: raw.arrivalTime2 != null ? `${raw.arrivalTime2}분후` : null,
    traTime1: raw.arrivalTime1 != null ? raw.arrivalTime1 * 60 : null,
    traTime2: raw.arrivalTime2 != null ? raw.arrivalTime2 * 60 : null,
    busType: raw.type ?? null,
  }
}

export class OdsayBusProvider implements ArrivalProvider {
  readonly name = "odsay_fallback" as const

  canHandle(ctx: ArrivalQueryContext): boolean {
    return ctx.stopType === "bus" && !!ctx.odsayStopId
  }

  async fetchArrivals(ctx: ArrivalQueryContext): Promise<BusArrivalResponse> {
    if (!ctx.odsayStopId) throw new AppError("OdsayBusProvider: odsayStopId 필요", 400)

    const arrivals = await realtimeStation(ctx.odsayStopId)
    return {
      items: arrivals.map(toOdsayUnifiedItem),
      provider: "odsay_fallback",
      fetchedAt: nowIso(),
    }
  }
}

// ─── Provider 팩토리 ─────────────────────────────────────────────────────────

/**
 * provider name → 구현체 인스턴스 (stateless 싱글턴).
 * SDD T3: pickProvider 팩토리.
 */
export function pickProvider(
  name: "seoul" | "gyeonggi" | "odsay_fallback",
): ArrivalProvider {
  switch (name) {
    case "seoul":
      return new SeoulBusProvider()
    case "gyeonggi":
      return new GyeonggiBusProvider()
    case "odsay_fallback":
      return new OdsayBusProvider()
    default: {
      // exhaustive check
      const _: never = name
      throw new AppError(`알 수 없는 provider: ${_}`, 500)
    }
  }
}
