# SDD — 멀티-지역 버스 도착 Provider (multi-region-bus-arrival)

- **상태:** 갱신 (2026-05-02 — 캐싱 패턴 도입 v2)
- **작성일:** 2026-05-02 (초안) → 2026-05-02 (v2 갱신)
- **관련:** `PRD.md`, `TASKS.md`, `docs/api/contracts/arrival-info.md`, `docs/api/contracts/routes.md`, `docs/api/contracts/sync-gbis-stations.md`, `docs/decisions/ADR-002-multi-region-arrival-provider.md`, `docs/decisions/ADR-003-gbis-station-caching.md`

## 변경 이력

- **2026-05-02 (v1)** — 초안. ODsay→GBIS 실시간 매핑(이름 검색 + 좌표 거리). gbisClient에 `searchGbisStation` / `getGbisStationDetail` 가정.
- **2026-05-02 (v2 — 본 문서)** — **캐싱 패턴 도입.** GBIS 노선조회 OpenAPI(15080662) 명세 확정 + 경기도 정류소 현황 OpenAPI(GG OpenAPI) 명세 확정 반영. 정류소 검색 API 부재로 인해 일 1회 cron으로 경기 전체 정류소를 자체 DB(`gbis_stations`)에 캐싱. 매핑은 ARS 우선 + 좌표/이름 보조. `getGbisStationDetail` 폐기 → `getBusRouteStationListv2` 기반 노선 매핑으로 대체. 신규 Edge Function `sync-gbis-stations` + GitHub Actions 워크플로 추가. 환경변수 `GYEONGGI_OPENAPI_KEY` 추가. ADR-003 신설.

---

## 1. 시스템 다이어그램

### 1.1 정류소 캐싱 (cron, 일 1회)

```
┌──────────────────────┐            ┌────────────────────────┐
│ GitHub Actions       │  19:00 UTC │ supabase functions     │
│ sync-gbis-stations.yml├──────────▶│ invoke                 │
│ (cron 04:00 KST)     │            │ sync-gbis-stations     │
└──────────────────────┘            └─────────┬──────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────────┐
                                  │ 경기도 OpenAPI              │
                                  │ /BusStation                │
                                  │ (시군 페이징 다운로드)      │
                                  └─────────┬──────────────────┘
                                            │ upsert (PK STATION_ID)
                                            ▼
                                  ┌────────────────────────────┐
                                  │ DB: gbis_stations          │
                                  │ (자체 정류소 캐시)          │
                                  └────────────────────────────┘
```

### 1.2 저장 단계 (POST /routes)

```
┌────────────────┐      ┌────────────────────┐      ┌─────────────────────────┐
│ FE SetupRoute  │─────▶│ POST /routes       │─────▶│ resolveStopProvider()    │
│ ODsay 데이터    │      │ stops[].lat/lng    │      │ (지역 + DB 검색)         │
└────────────────┘      └────────────────────┘      └────────┬────────────────┘
                                                              │
                          ┌───────────────────────────────────┤
                          ▼                                   ▼
                  ┌──────────────┐                ┌──────────────────────┐
                  │ region=seoul │                │ region=gyeonggi      │
                  └──────┬───────┘                └────────┬─────────────┘
                         │                                 │
                         ▼                                 ▼
              ┌────────────────────┐         ┌──────────────────────────────┐
              │ provider='seoul'   │         │ gbis_stations 검색            │
              │ ars_id 그대로 사용  │         │  1차: ARS 매칭                │
              │ stop_routes 그대로  │         │  2차: 좌표 200m + 이름 0.7   │
              └────────────────────┘         └────────┬─────────────────────┘
                                                      │ stationId 확정
                                                      ▼
                                          ┌──────────────────────────────┐
                                          │ getBusRouteListv2            │
                                          │  (keyword=routeName)         │
                                          │ + regionName 필터             │
                                          │ + getBusRouteStationListv2   │
                                          │  (각 후보 routeId, 캐시 5분)  │
                                          │  → stationId 포함 노선 선별   │
                                          │  → stationSeq 추출            │
                                          └────────┬─────────────────────┘
                                                   │
                                                   ▼
                                          ┌──────────────────────────────┐
                                          │ verifyMapping (1회)          │
                                          │ getBusArrivalListv2          │
                                          │ → routeId 교집합 ≥ 50%       │
                                          └────────┬─────────────────────┘
                                                   │
                                  ┌────────────────┴───────────────┐
                                  ▼                                ▼
                          ┌────────────────────┐      ┌──────────────────────┐
                          │ provider='gyeonggi'│      │ provider='odsay_     │
                          │ + gbis_station_id  │      │            fallback' │
                          │ stop_routes:        │      │ (검증 실패 / 매핑    │
                          │  + gbis_route_id    │      │  실패)               │
                          │  + gbis_sta_order   │      └──────────────────────┘
                          └────────────────────┘
```

### 1.3 조회 단계 (GET /arrival-info) — v1과 동일

```
┌──────────────┐                       ┌────────────────────┐
│ FE Home      │ GET /arrival-info?    │ arrival-info Edge  │
│ refresh tick │   stopId={uuid}       │ Function           │
└──────────────┘──────────────────────▶└────────┬───────────┘
                                                │
                                                ▼
                                     ┌─────────────────────────┐
                                     │ DB: route_stops 조회     │
                                     │ → provider 분기 키 획득  │
                                     └────────┬────────────────┘
                                              │
                ┌─────────────────────────────┼──────────────────────┐
                ▼                             ▼                      ▼
       ┌────────────────┐           ┌──────────────────┐    ┌──────────────────┐
       │SeoulBusProvider│           │GyeonggiBusProv.  │    │OdsayBusProvider  │
       │getStationByUid │           │getBusArrivalList │    │realtimeStation   │
       │(arsId)         │           │v2(stationId)     │    │(stationID)       │
       └───────┬────────┘           └────────┬─────────┘    └─────────┬────────┘
               │                             │                        │
               └─────────────────┬───────────┴────────────────────────┘
                                 ▼
                       ┌─────────────────────┐
                       │ BusArrivalResponse  │  (포맷 통일)
                       └─────────────────────┘
```

> **핵심 결정:** FE는 `provider`를 모른다. `stopId`만 BE에 보내고, BE가 DB에서 provider 결정 후 분기. (이유: §4)

---

## 2. ArrivalProvider 인터페이스

### 2.1 인터페이스 정의 (`_shared/arrivalProvider.ts`)

```ts
/** 도착 조회 결과 — 기존 BusArrivalResponse 구조 그대로 (스키마 통일). */
export interface BusArrivalItem {
  busRouteId: string         // provider별 routeId — FE는 식별자로만 사용
  busRouteAbrv: string       // 노선 약칭 ("11", "643")
  arrmsg1: string            // "3분후[2번째 전]" — provider별 포맷터가 통일
  arrmsg2: string | null
  traTime1: number | null    // 초 (없으면 null)
  traTime2: number | null
  busType: number | null     // ODsay busType / GBIS routeTypeCd (보존만)
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
  provider: 'seoul' | 'gyeonggi' | 'odsay_fallback'
  fetchedAt: string          // ISO 8601 (캐시 진단용)
}

export interface ArrivalQueryContext {
  stopType: 'bus' | 'subway'
  arsId: string | null
  gbisStationId: string | null
  gbisRouteId: string | null
  gbisStaOrder: number | null
  odsayStopId: string | null
  stationName: string | null
  subwayCode: string | null
}

export interface ArrivalProvider {
  readonly name: 'seoul' | 'gyeonggi' | 'odsay_fallback'
  canHandle(ctx: ArrivalQueryContext): boolean
  fetchArrivals(ctx: ArrivalQueryContext): Promise<BusArrivalResponse>
}
```

### 2.2 Provider 책임 분담

| Provider | 사용 외부 API | 입력 키 | 비고 |
|----------|---------------|---------|------|
| `SeoulBusProvider` | 서울 `getStationByUid` | `arsId` | 기존 로직 그대로 이전 |
| `GyeonggiBusProvider` | GBIS `getBusArrivalListv2` | `gbisStationId` (+ `gbisRouteId` 필터) | `predictTimeSec1` → `traTime1`, `predictTime1`/`locationNo` → `arrmsg1` 포맷팅 |
| `OdsayBusProvider` | ODsay `realtimeStation` | `odsayStopId` | 응답 분 단위만 → `arrmsg1` = `"{N}분후"` 합성 |

---

## 3. ODsay → GBIS 매핑 알고리즘 (저장 시 / v2 갱신)

### 3.1 입력 / 출력

```
input:
  ODsay stop {
    name: string,
    x: number (lng),
    y: number (lat),
    arsId: string | null,
    stopRoutes: { routeName: string }[]   // ODsay 검색 또는 stop-routes로 알고 있는 노선 목록
  }
  context: { sigunHint?: string }        // ODsay 응답에서 추정 가능 시

output:
  | { provider: 'seoul', arsId }
  | { provider: 'gyeonggi',
      gbisStationId,
      stopRoutes: [{ ...input, gbisRouteId, gbisStaOrder }] }
  | { provider: 'odsay_fallback', odsayStopId }
```

### 3.2 단계별 알고리즘 (의사코드)

```
async function resolveStopProvider(odsayStop, context) {
  if (odsayStop.stopType === 'subway') {
    return { provider: 'seoul', ...passthrough }   // 본 PRD 범위 밖
  }

  const region = detectRegion(odsayStop)            // 'seoul' | 'gyeonggi' | 'unknown'
  if (region === 'seoul')   return { provider: 'seoul', arsId: odsayStop.arsId }
  if (region === 'unknown') return { provider: 'odsay_fallback', odsayStopId: odsayStop.id }

  // region === 'gyeonggi'
  // ───────────────────────────────────────────────────────────
  // STEP 1) 자체 DB(gbis_stations) 검색 — 캐시 활용
  // ───────────────────────────────────────────────────────────
  const station = await findGbisStationFromDB(odsayStop)
  if (!station) {
    return { provider: 'odsay_fallback', odsayStopId: odsayStop.id }
  }

  // ───────────────────────────────────────────────────────────
  // STEP 2) 노선 매핑 — getBusRouteListv2 + getBusRouteStationListv2
  // ───────────────────────────────────────────────────────────
  const mappedRoutes = await mapGbisRoutes(station, odsayStop.stopRoutes)

  // ───────────────────────────────────────────────────────────
  // STEP 3) 검증
  // ───────────────────────────────────────────────────────────
  const verified = await verifyGbisMapping(
    station.stationId,
    mappedRoutes.filter(r => r.gbisRouteId).map(r => r.gbisRouteId!)
  )
  if (!verified) {
    return { provider: 'odsay_fallback', odsayStopId: odsayStop.id }
  }

  return {
    provider: 'gyeonggi',
    gbisStationId: station.stationId,
    stopRoutes: mappedRoutes,
  }
}
```

### 3.3 STEP 1 — `findGbisStationFromDB` (gbis_stations 자체 검색)

캐시된 자체 DB만 조회. 외부 API 호출 0회.

```
async function findGbisStationFromDB(odsayStop) {
  // 1차: ARS 매칭
  if (odsayStop.arsId) {
    const rows = await db.from('gbis_stations')
      .select('*')
      .eq('ars_no', odsayStop.arsId)
    if (rows.length === 1) return rows[0]   // 단일 매칭 → 확정

    // 다중 매칭(드물지만 시군 경계 등): 좌표로 가장 가까운 것
    if (rows.length > 1) {
      const nearest = sortByDistance(rows, odsayStop.x, odsayStop.y)[0]
      if (nearest.distance <= 200) return nearest
    }
  }

  // 2차: 좌표 + 이름 유사도 매칭 (ARS 매칭 실패/모호 시)
  const candidates = await db.from('gbis_stations')
    .select('*')
    .filter(           // bbox 1km 사전 필터 (인덱스 활용)
      `lat between ${odsayStop.y - 0.01} and ${odsayStop.y + 0.01}
       and lng between ${odsayStop.x - 0.012} and ${odsayStop.x + 0.012}`
    )
  const scored = candidates
    .map(c => ({
      ...c,
      distance: haversine(odsayStop.x, odsayStop.y, c.lng, c.lat),
      nameSim:  levenshteinSim(c.station_name, odsayStop.name),
    }))
    .filter(c => c.distance <= 200 && c.nameSim >= 0.7)
    .sort((a, b) => a.distance - b.distance)

  return scored[0] ?? null
}
```

**거리 계산:** Haversine 공식 (m). PostgreSQL `earthdistance` 모듈 도입은 후속 — 현재는 bbox 사전 필터 + 앱 레이어 정렬로 충분.

**Levenshtein 유사도:** `1 - editDistance / max(len)`. 0.7 임계값은 `광명사거리역` ↔ `광명사거리` 같은 일반 변형을 허용하는 수준.

### 3.4 STEP 2 — `mapGbisRoutes` (노선조회 OpenAPI)

```
async function mapGbisRoutes(station, expectedRoutes) {
  // expectedRoutes: ODsay에서 알고 있는 [{ routeName, ... }, ...]

  return Promise.all(expectedRoutes.map(async (er) => {
    // 2-1. 노선번호로 후보 검색
    const candidates = await gbis.getBusRouteListv2({ keyword: er.routeName })
    // 응답: busRouteList[] { routeId, routeName, regionName, districtCd, startStationName, endStationName, routeTypeCd, ... }

    // 2-2. regionName 1차 필터 (정류소의 sigunNm/regionName과 매칭)
    const regional = candidates.filter(c => isSameRegion(c.regionName, station.sigunNm))

    // 2-3. 각 후보의 정류소 시퀀스 가져와서 우리 stationId 포함 여부 확인 (캐시 5분)
    for (const cand of regional) {
      const stationList = await gbis.getBusRouteStationListv2({ routeId: cand.routeId })
      // 응답: busRouteStationList[] { stationId, stationName, stationSeq, mobileNo, x, y, ... }

      const hit = stationList.find(s => s.stationId === station.stationId)
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
  }))
}
```

**캐시:** `getBusRouteStationListv2(routeId)` 응답을 메모리/Deno KV에 5분 TTL 저장. 같은 정류장에 여러 노선이 있을 때 동일 routeId 중복 호출을 방지하기 위함은 아니지만, 같은 사용자가 여러 stop을 한 번에 저장할 때 흔히 같은 routeId가 반복됨.

**`isSameRegion`:** 단순 문자열 매칭. 예: 정류소 `sigunNm="광명시"` ↔ 노선 `regionName="광명"` → 부분 포함으로 매칭. 명확한 매칭 함수는 후속 보강.

### 3.5 STEP 3 — `verifyGbisMapping` (변경 없음)

```
async function verifyGbisMapping(stationId, expectedRouteIds) {
  if (expectedRouteIds.length === 0) return true  // 매핑할 노선 없음 — 정류소만 저장

  try {
    const arrivals = await gbis.getBusArrivalListv2(stationId)
    const actualRouteIds = new Set(arrivals.map(a => String(a.routeId)))
    const intersection = expectedRouteIds.filter(id => actualRouteIds.has(id))
    return intersection.length >= Math.ceil(expectedRouteIds.length * 0.5)
  } catch (e) {
    log('warn', 'verify-mapping-failed', { stationId, error: e.message })
    return true  // GBIS 일시 장애 시 매핑 유지
  }
}
```

> 50% 임계값은 운행 종료 / 막차 이후 빈 응답을 고려한 보수적 값. Phase 1 QA에서 조정.

### 3.6 detectRegion (v1과 동일, 참고)

```ts
function detectRegion(odsayStop: { x: number; y: number }):
  'seoul' | 'gyeonggi' | 'unknown' {
  const { x: lng, y: lat } = odsayStop
  const inSeoul = lng >= 126.764 && lng <= 127.184 && lat >= 37.413 && lat <= 37.715
  if (inSeoul) return 'seoul'
  const inGyeonggi =
    lng >= 126.376 && lng <= 127.872 && lat >= 36.893 && lat <= 38.295 && !inSeoul
  if (inGyeonggi) return 'gyeonggi'
  return 'unknown'
}
```

> bounding box 좌표는 한국 행정안전부 공개 자료 기준. 다각형 매칭은 후속 ADR.

---

## 4. arrival-info 라우팅 (v1과 동일)

### 4.1 신/구 입력

| 입력 | 신/구 | 비고 |
|------|-------|------|
| `?stopId={uuid}` | 신 | 권장. 인증 필요 (route_stops 소유권). |
| `?type=bus&arsId&busRouteId` | 구 (한 사이클 호환) | SeoulBusProvider 직접 호출 |
| `?type=subway&stationName` | 구 (변경 없음) | 본 PRD 범위 밖 |
| `?type=odsay&stationId` | 구 (변경 없음) | OdsayBusProvider 직접 호출 |

### 4.2 결정 — stopId 기반 BE 분기

**이유:**
1. **단일 진입점:** FE는 stopId만 알면 됨. provider 추가 시 FE 변경 0.
2. **권한·검증 단일화:** stopId 소유권 확인이 BE에 모임.
3. **provider 컬럼이 BE 캐시 키에 자연스럽게 합류.**
4. **FE의 정보 노출 최소화:** GBIS stationId 같은 내부 식별자를 클라이언트에 흘리지 않음.

### 4.3 라우터 의사코드 (`arrival-info/index.ts`)

```ts
serve(async (req) => {
  const url = new URL(req.url)
  const stopId = url.searchParams.get('stopId')
  const legacyType = url.searchParams.get('type')

  if (stopId) {
    const stop = await db.getRouteStop(stopId, userId)  // 권한 검증 포함
    if (!stop) return notFound()

    const provider = pickProvider(stop.provider)
    if (!provider.canHandle(stopToCtx(stop))) return badGateway('provider mismatch')
    const result = await provider.fetchArrivals(stopToCtx(stop))
    if (stop.gbis_route_id) {
      result.items = result.items.filter(i => i.busRouteId === stop.gbis_route_id)
    }
    return ok(result)
  }

  if (legacyType === 'bus') {
    const arsId = url.searchParams.get('arsId')
    if (!arsId) return badRequest('arsId required')
    const result = await new SeoulBusProvider().fetchArrivals({ stopType: 'bus', arsId, /*...*/ })
    return ok(result)
  }

  if (legacyType === 'subway' || legacyType === 'odsay') {
    // 기존 로직 그대로
  }

  return badRequest()
})
```

---

## 5. DB 스키마

### 5.1 기존 마이그레이션 (`20260502000000_add_provider_to_route_stops.sql`)

이미 적용됨 — `route_stops`에 `provider`/`gbis_station_id`, `stop_routes`에 `gbis_route_id`/`gbis_sta_order` 추가.

### 5.2 신규 마이그레이션 — `gbis_stations` (v2 추가)

파일명(예시): `supabase/migrations/20260503000000_create_gbis_stations.sql`

```sql
-- gbis_stations: 경기도 정류소 자체 캐시
create table if not exists gbis_stations (
  station_id        text primary key,                 -- STATION_ID
  station_name      text not null,                    -- STATION_NM_INFO
  ars_no            text,                             -- STATION_MANAGE_NO (ARS, 서울과 다른 체계지만 ODsay arsId와 매칭 가능)
  lat               numeric(9, 6) not null,           -- WGS84_LAT
  lng               numeric(9, 6) not null,           -- WGS84_LOGT
  sigun_nm          text,                             -- SIGUN_NM
  sigun_cd          text,                             -- SIGUN_CD
  district_cd       text,                             -- (추후 보강용)
  station_div_nm    text,                             -- 정류소 구분명
  jurisd_inst_nm    text,                             -- 관할기관명
  locplc_loc        text,                             -- 위치설명
  synced_at         timestamptz not null default now()
);

-- 매핑 1차 키 (ARS) 인덱스
create index if not exists gbis_stations_ars_no_idx
  on gbis_stations (ars_no)
  where ars_no is not null;

-- 좌표 사전 필터용 bbox 인덱스 (lat, lng 합성)
create index if not exists gbis_stations_latlng_idx
  on gbis_stations (lat, lng);

-- 시군 필터용
create index if not exists gbis_stations_sigun_nm_idx
  on gbis_stations (sigun_nm);

-- (선택, 추후 도입 검토) earthdistance / PostGIS 도입 시 위 인덱스 대체
-- create extension if not exists cube;
-- create extension if not exists earthdistance;
-- create index gbis_stations_earth_idx on gbis_stations using gist (
--   ll_to_earth(lat::float8, lng::float8)
-- );

comment on table gbis_stations is
  '경기도 정류소 캐시. sync-gbis-stations Edge Function이 일 1회 cron으로 갱신. 매핑 알고리즘(regionMapper)이 ARS/좌표/이름으로 검색.';
comment on column gbis_stations.ars_no is
  'STATION_MANAGE_NO. ODsay arsId와 동일 체계로 사용 (1차 매칭 키).';
comment on column gbis_stations.synced_at is
  '마지막 cron 갱신 시각. 14일 이상 된 row는 운영팀 알림.';
```

**RLS:** `gbis_stations`는 read-only public 정보 → RLS 비활성 또는 anon read 허용. write는 service role만.

### 5.3 인덱스 운영 노트

- ARS 인덱스는 partial(WHERE ars_no IS NOT NULL) — 일부 정류소는 ARS 미할당.
- 좌표 검색은 앱 레이어에서 0.01도(약 1km) bbox 사전 필터 후 Haversine으로 정렬. 데이터셋 크기(약 35,000 row 추정)에서 충분히 빠름.
- 운영 중 검색 지연 200ms 이상 관측 시 PostGIS/earthdistance 도입 검토.

---

## 6. sync-gbis-stations Edge Function (신규)

**자세한 계약은:** `docs/api/contracts/sync-gbis-stations.md`

### 6.1 책임

- 경기도 OpenAPI `https://openapi.gg.go.kr/BusStation` 호출
- SIGUN_NM 미지정 → 31개 시군 전체 페이징 다운로드
- 응답을 `gbis_stations` 테이블에 upsert (PK `station_id`)
- 통계 응답 반환 (`{ synced, errors[] }`)

### 6.2 인증

- 인증 헤더: Service Role JWT (Supabase SERVICE_ROLE_KEY 발급)
- GitHub Actions에서만 호출. 일반 사용자/anon은 401.

### 6.3 동작 흐름

```
1) 시군 목록 결정
   - body.sigun_nm 지정 → 단일 시군만
   - 미지정 → 31개 시군 순회

2) 각 시군에 대해 페이징
   pIndex=1, pSize=100
   while (totalCount 미달) {
     fetch openapi.gg.go.kr/BusStation?KEY=&Type=json&pIndex=&pSize=&SIGUN_NM=
     totalCount = LIST_TOTAL_COUNT
     rows = response.row[]
     upsertChunk(rows)   // 100개씩 supabase upsert
     pIndex++
   }

3) 통계 집계 + 응답
   { synced: number, sigun: { '광명시': 412, ... }, errors: [{sigun, message}] }
```

### 6.4 시간초과 / 분할 옵션

Supabase Edge Functions의 wall-time 한계(현재 ~150초) 고려:

- 31개 시군 × 평균 ~1,000개 row × 페이지당 100개 = 시군당 ~10 페이지
- 각 시군 처리 ~3~5초 → 전체 ~120초 추정 (안전 마진 < 30초)
- **분할 모드:** body로 `sigun_nm: '광명시'` 또는 `sigun_cd_in: ['41210', ...]` 지원 → 워크플로에서 시군별 병렬 invoke 가능
- 본 SDD는 **단일 invoke 전체 일괄**을 권장 (운영 단순). 시간초과 관측 시 분할로 전환.

### 6.5 에러 처리

| 케이스 | 처리 |
|--------|------|
| 경기 OpenAPI 5xx / network | 해당 시군 errors[]에 누적 후 다음 시군 진행 (전체 실패 X) |
| 경기 OpenAPI `CODE != INFO-000` | errors[]에 추가, 200 응답 유지 |
| Supabase upsert 실패 | 즉시 throw — cron 실패로 판정 (재시도 다음날) |
| 환경변수 미설정 | 500 + clear message |

### 6.6 호출 비용

- 경기 OpenAPI **호출 제한 없음** (확정 정보).
- Supabase write 비용: ~35,000 upsert/일 = 무시 가능.

---

## 7. GitHub Actions 워크플로 (신규)

파일: `.github/workflows/sync-gbis-stations.yml`

```yaml
name: Sync GBIS stations
on:
  schedule:
    - cron: '0 19 * * *'   # UTC 19:00 = KST 04:00
  workflow_dispatch:        # 수동 트리거 (디버그용)

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Invoke Edge Function
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          curl -fsS -X POST "$SUPABASE_URL/functions/v1/sync-gbis-stations" \
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Content-Type: application/json" \
            -d '{}' \
            --max-time 300
```

### 7.1 GitHub Secrets

- `SUPABASE_URL` — Supabase 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key

### 7.2 실패 처리

- `curl -f` 실패 시 GitHub Actions 자동 알림 (Watch 설정 또는 후속 PR로 Slack hook)
- 14일 연속 실패 시 매핑 정확도 저하 가능 → tech-note에 운영 가이드 작성 필요

---

## 8. Provider 구현 상세 (v1과 동일, 변경 없음 요약)

### 8.1 GyeonggiBusProvider — `getBusRouteStationListv2`로 변경된 부분만

**v1**에서는 `getGbisStationDetail(stationId)`로 정류소의 노선 목록을 가져온다는 가정이 있었다. **v2**에서는 이 API 명세가 GBIS에 존재하지 않음이 확인됨 → 폐기.

대신 매핑은 §3.4의 방식(`getBusRouteListv2` + `getBusRouteStationListv2` 조합)으로 수행한다. 노선 매핑은 **저장 시점 1회**만 — 도착 조회 시에는 `getBusArrivalListv2` 한 번만 호출한다 (할당량 보호).

### 8.2 SeoulBusProvider / OdsayBusProvider — 변경 없음

v1 SDD §6.1, §6.3 그대로.

---

## 9. API 계약 요약

상세는 `docs/api/contracts/`. 본 v2에서 신규 추가:

- `docs/api/contracts/sync-gbis-stations.md` — 신규
- `docs/api/contracts/arrival-info.md` — v1 그대로
- `docs/api/contracts/routes.md` — v1 그대로 (입력 `lat`/`lng` 권장)

---

## 10. 환경변수

| 변수 | 시스템 | 용도 |
|------|--------|------|
| `GYEONGGI_BUS_API_KEY` | 공공데이터포털 (apis.data.go.kr) | 도착(busarrivalservice/v2) + 노선조회(busrouteservice/v2) |
| `GYEONGGI_OPENAPI_KEY` | 경기도 자체 OpenAPI (openapi.gg.go.kr) | 정류소현황 다운로드 — `sync-gbis-stations`만 사용 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | sync-gbis-stations 인증 + upsert |
| (기존) `ODSAY_API_KEY` 등 | — | 변경 없음 |

> **두 시스템 키는 별도다.** 공공데이터포털 키는 도착·노선조회에, 경기도 자체 OpenAPI 키는 정류소현황에 사용. 신청 절차도 별개.

---

## 11. 마이그레이션 / 호환성

| 항목 | 처리 |
|------|------|
| 기존 서울 사용자 데이터 | 마이그레이션 백필로 `provider='seoul'` 일괄 → 동작 변화 없음 |
| 신규 BE + 구 FE | FE가 `?type=bus`로 호출 → legacy 분기로 SeoulBusProvider 직접 → 정상 동작 |
| 구 BE + 신규 FE | FE가 `?stopId`로 호출 → 구 BE는 400 → FE는 legacy 호출로 fallback |
| 매핑 실패 row | `provider='odsay_fallback'` 저장 + FE에 inline 안내 |
| GBIS 일시 장애 (도착 조회) | 502 — FE는 토스트 / 카드 회색 |
| **gbis_stations 미동기화** (cron 미실행) | **모든 경기 stop이 odsay_fallback으로 격하 — 운영 알람 필요** |

**초기 부트스트랩:** 첫 배포 시 `workflow_dispatch`로 수동 1회 실행 → 캐시 생성 후 사용자에게 신규 매핑 가능.

---

## 12. 에러 처리 / 로깅

### 12.1 에러 매트릭스

| 케이스 | HTTP | 위치 |
|--------|------|------|
| stopId 누락 / 잘못된 형식 | 400 | arrival-info |
| stopId가 사용자 소유 아님 | 404 | arrival-info |
| provider 분기 후 ctx 불일치 | 502 | arrival-info |
| 외부 API HTTP 오류 | 502 | provider |
| 외부 API 결과 없음 (`resultCode=4`, `-98`) | 200 + items=[] | provider |
| 매핑 실패 (저장 시) | 201 + provider='odsay_fallback' (실패 아님, 격하) | routes |
| `sync-gbis-stations` 외부 API 일부 실패 | 200 + errors[] (부분 성공 허용) | sync |
| `sync-gbis-stations` 인증 실패 | 401 | sync |
| `gbis_stations` 빈 테이블 (cron 미실행) | 매핑 실패 → odsay_fallback (사용자 영향 부드러움) | regionMapper |

### 12.2 로깅 정책

- `info`: provider 분기 결과, 매핑 성공/격하, sync 통계
- `warn`: 좌표 거리 임계값 초과, 매핑 검증 실패, sync 부분 실패
- `error`: 외부 API 502, 매핑 알고리즘 예외, sync 전체 실패

`console.log(JSON.stringify({ level, event, ...meta }))` 형식 (`edge-function-rules.md`).

---

## 13. 테스트 전략

### 13.1 BE (Deno)

| 테스트 파일 | 케이스 |
|------------|--------|
| `gbisClient_test.ts` | (v2 갱신) `getBusRouteListv2` happy / `getBusRouteStationListv2` happy / 502 / resultCode=4 |
| `gbisStationsRepo_test.ts` | (신규) `findGbisStationFromDB` ARS hit / 좌표+이름 hit / miss |
| `arrivalProvider_test.ts` | 3개 Provider × happy + edge (canHandle, 매핑) |
| `arrival-info_test.ts` | 신 stopId 라우팅 / 권한 / legacy 호환 / 404 |
| `routes_test.ts` | POST 시 매핑 호출 / 검증 통과 / 검증 실패 → odsay_fallback |
| `regionMapper_test.ts` | (v2 갱신) DB mock 사용 — ARS 매칭, 좌표+이름 매칭, fallback |
| `syncGbisStations_test.ts` | (신규) 단일 시군 happy / 페이징 / 외부 API 5xx 부분 실패 / 401 / OPTIONS |

각 파일 커버리지 기준: `when_come_be/CLAUDE.md` 참고 (happy/400/401/502/404/OPTIONS).

### 13.2 FE

수동 QA — 변경 없음.

---

## 14. 롤아웃 (v2 갱신)

1. 사용자 액션:
   - 공공데이터포털 노선조회 데이터셋(15080662) 활용 신청 (`GYEONGGI_BUS_API_KEY` 동일 키)
   - 경기도 자체 OpenAPI 정류소현황 키 발급 (`GYEONGGI_OPENAPI_KEY` 신규)
2. `gbis_stations` 마이그레이션 적용
3. `sync-gbis-stations` Edge Function 배포
4. **GitHub Actions `workflow_dispatch` 수동 1회 실행 → 캐시 부트스트랩**
5. 캐시 row 수 검증 (시군별 합계 ≈ 35,000 예상)
6. cron 활성화 (`schedule` 트리거 자동)
7. `regionMapper` 갱신 + `routes` 매핑 통합 배포
8. 회귀 QA (서울 정상 + 광명·시흥 신규)
9. FE 배포 (stopId 사용)
10. (선택) BE legacy 분기 코드 제거

---

## 15. 참고

- 외부 API: `when_come_be/docs/external-apis/seoul-bus.md`, `when_come_be/docs/external-apis/gyeonggi-bus.md`(v2 갱신), `when_come_be/docs/external-apis/odsay.md`
- 기존 방향 매칭 SDD: `docs/specs/route-direction/SDD.md`
- ADR: `docs/decisions/ADR-002-multi-region-arrival-provider.md`, `docs/decisions/ADR-003-gbis-station-caching.md`
