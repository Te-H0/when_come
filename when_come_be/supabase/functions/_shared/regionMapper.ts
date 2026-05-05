import { SupabaseClient } from "npm:@supabase/supabase-js@2"
import {
  searchGbisStationByArs,
  searchGbisStationByBbox,
  searchGbisRoute,
  getBusRouteStationList,
  getGbisBusArrivalList,
  GbisStationCandidate,
} from "./gbisClient.ts"

// ─── 타입 ────────────────────────────────────────────────────────────────────

export interface OdsayStopForMapping {
  stationID: string | number
  stationName: string
  x: number           // 경도 (lng)
  y: number           // 위도 (lat)
  arsID?: string | null
  stopType?: "bus" | "subway"
}

export interface StopRouteForMapping {
  odsayRouteId: string
  routeName: string
  busType?: number | null
  stId?: string | null
  busRouteId?: string | null
  stationOrd?: number | null
  stationName?: string | null
  gbisRouteId?: string | null
  gbisStaOrder?: number | null
}

export type ProviderFallbackReason = "unsupported_region" | "mapping_failed" | "verify_failed"

export interface ResolvedStopProvider {
  provider: "seoul" | "gyeonggi" | "odsay_fallback"
  fallbackReason?: ProviderFallbackReason | null
  arsId: string | null
  gbisStationId: string | null
  gbisStationSigunNm: string | null   // mapGbisRoutes의 regionName 필터에 사용
  odsayStopId: string | null
}

export interface MappedStopRoute extends StopRouteForMapping {
  gbisRouteId: string | null
  gbisStaOrder: number | null
}

// ─── 지역 판별 (SDD §3.2) ───────────────────────────────────────────────────

/**
 * 좌표 기반 지역 판별.
 * 서울 bounding box 1차, 경기도 bounding box 2차.
 */
export function detectRegion(coords: { lng: number; lat: number }): "seoul" | "gyeonggi" | "unknown" {
  const { lng, lat } = coords

  // 서울 bounding box (대략): 126.764~127.184, 37.413~37.715
  const inSeoul = lng >= 126.764 && lng <= 127.184 && lat >= 37.413 && lat <= 37.715
  if (inSeoul) return "seoul"

  // 경기도 bounding box: 126.376~127.872, 36.893~38.295 (서울 제외)
  const inGyeonggi =
    lng >= 126.376 && lng <= 127.872 && lat >= 36.893 && lat <= 38.295 && !inSeoul
  if (inGyeonggi) return "gyeonggi"

  return "unknown"
}

// ─── Haversine 거리 계산 (미터) ─────────────────────────────────────────────
export function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6_371_000 // 지구 반경 m
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── 이름 유사도 (char trigram Jaccard) ─────────────────────────────────────
/**
 * 문자 tri-gram 기반 Jaccard 유사도.
 * 외부 의존성 없이 구현 (Levenshtein 회피).
 * 문자열 길이 < 3인 경우 단순 포함 비교로 fallback.
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0

  // 공통 이름 정규화: 공백 제거, 소문자화
  const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase()
  const na = normalize(a)
  const nb = normalize(b)

  if (na === nb) return 1.0

  // 짧은 문자열은 포함 여부로 처리
  // 단, 길이가 같은 경우에만 0.8 부여 (길이 다른 경우 포함은 되지만 다른 단어일 수 있음)
  if (na.length < 3 || nb.length < 3) {
    if (na === nb) return 1.0  // 이미 위에서 처리되지만 안전망
    if (na.includes(nb) || nb.includes(na)) {
      return na.length === nb.length ? 0.8 : 0.5
    }
    return 0
  }

  const getTrigrams = (s: string): Set<string> => {
    const set = new Set<string>()
    for (let i = 0; i <= s.length - 3; i++) {
      set.add(s.slice(i, i + 3))
    }
    return set
  }

  const ta = getTrigrams(na)
  const tb = getTrigrams(nb)

  let intersection = 0
  for (const t of ta) {
    if (tb.has(t)) intersection++
  }
  const union = ta.size + tb.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ─── STEP 1: findGbisStationFromDB (SDD §3.3) ────────────────────────────────

/**
 * gbis_stations 자체 DB 검색 — 외부 API 호출 0회.
 *
 * 1차: ARS 매칭 (단일 매칭 → 확정 / 다중 → 좌표 가장 가까운 것)
 * 2차: bbox 사전 필터 + Haversine 200m + 이름 유사도 0.7
 */
export async function findGbisStationFromDB(
  db: SupabaseClient,
  odsayStop: { stationName: string; x: number; y: number; arsID?: string | null },
): Promise<GbisStationCandidate | null> {
  // ── 1차: ARS 매칭 ────────────────────────────────────────────────────────
  if (odsayStop.arsID) {
    const arsRows = await searchGbisStationByArs(db, odsayStop.arsID)

    if (arsRows.length === 1) {
      return arsRows[0]
    }

    if (arsRows.length > 1) {
      // 다중 매칭(시군 경계 등): 좌표로 가장 가까운 것 선택
      const withDistance = arsRows
        .map((r) => ({
          ...r,
          distance: haversineMeters(odsayStop.x, odsayStop.y, r.x, r.y),
        }))
        .sort((a, b) => a.distance - b.distance)

      if (withDistance[0].distance <= 200) {
        return withDistance[0]
      }
    }
  }

  // ── 2차: 좌표 bbox + Haversine + 이름 유사도 ────────────────────────────
  const bboxRows = await searchGbisStationByBbox(db, odsayStop.y, odsayStop.x, 0.01)

  const scored = bboxRows
    .map((c) => ({
      ...c,
      distance: haversineMeters(odsayStop.x, odsayStop.y, c.x, c.y),
      nameSim: nameSimilarity(c.stationName, odsayStop.stationName),
    }))
    .filter((c) => c.distance <= 200 && c.nameSim >= 0.7)
    .sort((a, b) => a.distance - b.distance)

  if (scored.length > 0) {
    return scored[0]
  }

  return null
}

// ─── STEP 2: mapGbisRoutes (SDD §3.4) ───────────────────────────────────────

/**
 * regionName 부분 매칭 헬퍼.
 * 예: sigunNm="광명시" ↔ regionName="광명" → 부분 포함 → true
 */
function isSameRegion(regionName: string | null | undefined, sigunNm: string | null | undefined): boolean {
  if (!regionName || !sigunNm) return false
  const r = regionName.replace(/\s/g, "")
  const s = sigunNm.replace(/\s/g, "")
  return s.includes(r) || r.includes(s)
}

/**
 * ODsay 노선 목록 → GBIS routeId + stationSeq 매핑.
 * getBusRouteListv2(keyword) → regionName 필터 → getBusRouteStationListv2(routeId) 조합.
 * getBusRouteStationListv2는 5분 캐시 적용됨.
 */
export async function mapGbisRoutes(
  station: GbisStationCandidate,
  expectedRoutes: StopRouteForMapping[],
): Promise<MappedStopRoute[]> {
  return Promise.all(
    expectedRoutes.map(async (er) => {
      try {
        // 2-1. 노선번호로 후보 검색
        const candidates = await searchGbisRoute(er.routeName)

        // 2-2. regionName 1차 필터
        const regional = candidates.filter((c) => isSameRegion(c.regionName, station.sigunNm))

        // 2-3. 각 후보 정류소 시퀀스 확인 → stationId 포함 여부
        for (const cand of regional) {
          const stationList = await getBusRouteStationList(cand.routeId)
          const hit = stationList.find((s) => s.stationId === station.stationId)
          if (hit) {
            return {
              ...er,
              gbisRouteId: cand.routeId,
              gbisStaOrder: hit.stationSeq,
            }
          }
        }

        // 후보 없음 → 매핑 실패 (이 노선만)
        return { ...er, gbisRouteId: null, gbisStaOrder: null }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(
          JSON.stringify({ level: "warn", event: "gbis-route-map-single-failed", routeName: er.routeName, error: msg }),
        )
        return { ...er, gbisRouteId: er.gbisRouteId ?? null, gbisStaOrder: er.gbisStaOrder ?? null }
      }
    }),
  )
}

// ─── STEP 3: verifyGbisMapping (SDD §3.5) ───────────────────────────────────

/**
 * GBIS 도착 1회 호출 → 매핑된 routeId 교집합 50% 이상이면 검증 통과.
 * GBIS 일시 장애 시 → true (매핑 유지).
 */
export async function verifyGbisMapping(
  stationId: string,
  expectedRouteIds: string[],
): Promise<boolean> {
  if (expectedRouteIds.length === 0) return true

  try {
    const arrivals = await getGbisBusArrivalList(stationId)
    const actualRouteIds = new Set(arrivals.map((a) => String(a.routeId)))
    const intersection = expectedRouteIds.filter((id) => actualRouteIds.has(id))
    const passes = intersection.length >= Math.ceil(expectedRouteIds.length * 0.5)
    if (!passes) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "gbis-verify-failed",
          stationId,
          expected: expectedRouteIds,
          actual: [...actualRouteIds],
          intersection,
        }),
      )
    }
    return passes
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(
      JSON.stringify({ level: "warn", event: "gbis-verify-exception", stationId, error: msg }),
    )
    // GBIS 일시 장애 시 매핑 유지
    return true
  }
}

// ─── 최상위 provider 결정 (SDD §3.2) ─────────────────────────────────────────

/**
 * ODsay stop을 받아 provider + gbis 식별자를 결정.
 * db: Supabase 클라이언트 (gbis_stations 검색에 사용)
 *
 * - subway: 본 PRD 범위 밖 → provider='seoul' 고정
 * - seoul 좌표: provider='seoul'
 * - gyeonggi 좌표: DB 검색 → 검증 → 'gyeonggi' 또는 'odsay_fallback'
 * - unknown: 'odsay_fallback'
 */
export async function resolveStopProvider(
  db: SupabaseClient,
  odsayStop: OdsayStopForMapping,
  expectedRoutes: StopRouteForMapping[],
): Promise<ResolvedStopProvider> {
  const stationID = String(odsayStop.stationID)

  // 지하철은 본 PRD 범위 밖 — provider='seoul' 고정
  if (odsayStop.stopType === "subway") {
    return {
      provider: "seoul",
      arsId: odsayStop.arsID ?? null,
      gbisStationId: null,
      gbisStationSigunNm: null,
      odsayStopId: stationID,
    }
  }

  // 좌표 없으면 서울 가정 (legacy 호환)
  if (odsayStop.x == null || odsayStop.y == null) {
    console.warn(JSON.stringify({ level: "warn", event: "resolve-no-coords", stationID }))
    return {
      provider: "seoul",
      arsId: odsayStop.arsID ?? null,
      gbisStationId: null,
      gbisStationSigunNm: null,
      odsayStopId: stationID,
    }
  }

  const region = detectRegion({ lng: odsayStop.x, lat: odsayStop.y })

  // 경기 노선 힌트: ODsay ID 2xxx 또는 busType===6(경기버스)이면
  // 서울 bbox이더라도 경기 정류소일 수 있음 (ADR-002 D3-supplement, 2026-05-05)
  const hasGyeonggiRouteHint = expectedRoutes.some(
    (r) => String(r.odsayRouteId ?? "").startsWith("2") || r.busType === 6,
  )

  if (region === "seoul" && !hasGyeonggiRouteHint) {
    console.log(
      JSON.stringify({ level: "info", event: "provider-resolved", provider: "seoul", stationID }),
    )
    return {
      provider: "seoul",
      arsId: odsayStop.arsID ?? null,
      gbisStationId: null,
      gbisStationSigunNm: null,
      odsayStopId: stationID,
    }
  }

  if (region === "gyeonggi" || hasGyeonggiRouteHint) {
    // STEP 1: 자체 DB 검색
    const station = await findGbisStationFromDB(db, {
      stationName: odsayStop.stationName,
      x: odsayStop.x,
      y: odsayStop.y,
      arsID: odsayStop.arsID,
    })

    if (!station) {
      // 서울 bbox 안에 있는 경기 노선 경유 정류소 → 서울 BIS로 fallback (서울에 등록된 정류소)
      const fallbackProvider = region === "seoul" ? "seoul" : "odsay_fallback"
      console.log(
        JSON.stringify({
          level: "info",
          event: "provider-resolved",
          provider: fallbackProvider,
          reason: "gbis-station-not-found-in-db",
          stationID,
        }),
      )
      return {
        provider: fallbackProvider,
        fallbackReason: fallbackProvider === "odsay_fallback" ? "mapping_failed" : null,
        arsId: odsayStop.arsID ?? null,
        gbisStationId: null,
        gbisStationSigunNm: null,
        odsayStopId: stationID,
      }
    }

    // STEP 2: 노선 매핑
    const mappedRoutes = await mapGbisRoutes(station, expectedRoutes)

    // STEP 3: 검증 (매핑된 routeId 50% 교집합)
    const mappedRouteIds = mappedRoutes.filter((r) => r.gbisRouteId != null).map((r) => r.gbisRouteId!)
    const verified = await verifyGbisMapping(station.stationId, mappedRouteIds)

    if (!verified) {
      console.log(
        JSON.stringify({
          level: "info",
          event: "provider-resolved",
          provider: "odsay_fallback",
          reason: "verify-failed",
          stationID,
          gbisStationId: station.stationId,
        }),
      )
      return {
        provider: "odsay_fallback",
        fallbackReason: "verify_failed",
        arsId: null,
        gbisStationId: null,
        gbisStationSigunNm: null,
        odsayStopId: stationID,
      }
    }

    console.log(
      JSON.stringify({
        level: "info",
        event: "provider-resolved",
        provider: "gyeonggi",
        stationID,
        gbisStationId: station.stationId,
        gbisStationSigunNm: station.sigunNm ?? null,
      }),
    )
    return {
      provider: "gyeonggi",
      arsId: null,
      gbisStationId: station.stationId,
      gbisStationSigunNm: station.sigunNm ?? null,  // DB row에서 읽은 실제 sigunNm
      odsayStopId: stationID,
    }
  }

  // unknown (강원, 충청 등) → fallback
  console.log(
    JSON.stringify({
      level: "info",
      event: "provider-resolved",
      provider: "odsay_fallback",
      reason: "unknown-region",
      stationID,
    }),
  )
  return {
    provider: "odsay_fallback",
    fallbackReason: "unsupported_region",
    arsId: null,
    gbisStationId: null,
    gbisStationSigunNm: null,
    odsayStopId: stationID,
  }
}
