# API 계약 — 즐겨찾기 + 별명 (favorites-and-aliases)

- **상태:** 초안 (2026-05-08) — 검토 대기
- **작성일:** 2026-05-08
- **관련:** `docs/specs/favorites-and-aliases/PRD.md`, `SDD.md`, `TASKS.md`, `docs/api/contracts/routes.md`, `docs/api/contracts/arrival-info.md`, `docs/collab-notes.md`

---

## 0. 변경 요약

`favorite_stops` 도메인 신규 + 정류장 별명 + 경로/즐겨찾기 정렬을 위한 컬럼·필드 추가.

| 변경 | 종류 | Breaking? |
|------|------|-----------|
| `GET/POST/PATCH/DELETE /favorite-stops` 신규 | 추가 | No |
| `PATCH /routes/:id` 신규 (부분 수정 — `active` 토글 포함) | 추가 | No (기존 PUT 유지) |
| `PATCH /route-stops/:id` 신규 (alias 전용) | 추가 | No |
| `GET /routes` 응답 `display_order`, `active`, `route_stops[].alias` | 추가 | No (옵셔널) |
| `GET /arrival-info?stopId=` lookup 범위 — `favorite_stops` 추가 | 확장 | No (route_stops 케이스 변경 없음) |
| `GET /subway-station-directions` 신규 (D11) | 추가 | No |

### 핵심 결정 (PRD §8 D1~D10 요약)

- **D1.** arrival-info `stopId`는 `route_stops` ∪ `favorite_stops` **통합 uuid 풀**. BE가 두 테이블 모두 lookup, FE는 분기를 모른다.
- **D2.** `routes.active` 컬럼 신규 추가 (boolean NOT NULL DEFAULT true). 기존 row는 `UPDATE routes SET active = true` backfill. PATCH /routes/:id에서 토글.
- **D3.** 별명은 **컨텍스트별 분리**. 같은 정류장이 경로/즐겨찾기 양쪽에 있어도 `route_stops.alias`와 `favorite_stops.alias`는 별도. 동기화 없음.
- **D5.** 즐겨찾기 노선 **1개 이상 필수**. POST/PATCH `/favorite-stops`에서 `routes: []`/누락 시 400 `FAVORITE_ROUTES_REQUIRED`. FE는 저장 버튼 disabled로 보조 검증.
- **D10.** 공용 `<UnifiedStopPicker>` + 지하철 호선/방향 선택 단계. POST `/favorite-stops`에서 `stopType === 'subway'`이면 `directionUpdn` + `directionNextStop` 권장 (NULL 허용 — graceful fallback). 호선/방향 정보는 신규 `GET /subway-station-directions`로 제공 (D11으로 확정).
- **D11.** 양방향 다음 역 1개씩 + 종착지 동적 노출. **`directionHeadsign`은 저장 안 함(NULL)** — 매 도착 응답 item의 `headsign`(이미 동봉)으로 카드 시점 표시. 양 종착지 N개 캐시/cron/정적 매핑 모두 폐기. 단일 endpoint `GET /subway-station-directions` 사용. 응답: `{ stationName, lineName, subwayId, directions: [{updn, nextStop}, ...] }` (1~2개).

> 모든 신규 필드 옵셔널. 구 클라이언트는 무시 가능.

---

## 1. GET /favorite-stops — 즐겨찾기 목록

### 1.1 인증

Bearer JWT 필수.

### 1.2 응답 — 200 OK

```ts
interface ApiFavoriteStop {
  id: string                            // uuid (arrival-info의 stopId로 그대로 사용)
  user_id: string

  // 정류장 정보 (route_stops와 같은 형태)
  odsay_stop_id: string
  stop_name: string
  stop_type: 'bus' | 'subway'
  ars_id: string | null
  lat: number | null
  lng: number | null

  // 지하철 방향 (옵셔널)
  direction_headsign: string | null
  direction_updn: 'up' | 'down' | null
  direction_next_stop: string | null

  // multi-region
  provider: 'seoul' | 'gyeonggi' | 'odsay_fallback'
  gbis_station_id: string | null

  // 즐겨찾기 전용
  alias: string | null                  // 별명 (NULL = 별명 없음)
  display_order: number                 // 0-based, 사용자 단위

  favorite_stop_routes: ApiFavoriteStopRoute[]

  created_at: string
  updated_at: string
}

interface ApiFavoriteStopRoute {
  id: string
  favorite_stop_id: string

  // stop_routes와 동일 셋
  odsay_route_id: string
  route_name: string                    // "11", "643", "1호선"
  bus_type: number | null
  st_id: string | null
  bus_route_id: string | null
  station_ord: number | null
  station_name: string | null
  gbis_route_id: string | null
  gbis_sta_order: number | null

  // 노선 단위 provider
  provider: 'seoul' | 'gyeonggi' | 'odsay_fallback' | null
}
```

### 1.3 정렬 (서버 책임)

`order by display_order asc, created_at asc`

### 1.4 응답 예시

```json
[
  {
    "id": "uuid-fav-1",
    "user_id": "uuid-user",
    "odsay_stop_id": "87103",
    "stop_name": "광명사거리역",
    "stop_type": "bus",
    "ars_id": "85019",
    "lat": 37.4807,
    "lng": 126.8615,
    "direction_headsign": null,
    "direction_updn": null,
    "direction_next_stop": null,
    "provider": "gyeonggi",
    "gbis_station_id": "200000177",
    "alias": "회사 가는 길",
    "display_order": 0,
    "favorite_stop_routes": [
      {
        "id": "uuid-fsr-1",
        "favorite_stop_id": "uuid-fav-1",
        "odsay_route_id": "...",
        "route_name": "11",
        "bus_type": 13,
        "st_id": null,
        "bus_route_id": null,
        "station_ord": null,
        "station_name": "광명사거리역",
        "gbis_route_id": "234000016",
        "gbis_sta_order": 12,
        "provider": "gyeonggi"
      }
    ],
    "created_at": "2026-05-09T12:34:56.789Z",
    "updated_at": "2026-05-09T12:34:56.789Z"
  }
]
```

### 1.5 에러

| HTTP | 코드 |
|------|------|
| 401 | 인증 헤더 없음 |

---

## 2. POST /favorite-stops — 즐겨찾기 추가

### 2.1 인증

Bearer JWT 필수.

### 2.2 입력 DTO

```ts
interface CreateFavoriteStopRequest {
  // 정류장 정보
  odsayStopId: string
  stopName: string
  stopType: 'bus' | 'subway'
  arsId?: string
  lat?: number
  lng?: number

  // 지하철 방향 (옵셔널)
  directionHeadsign?: string | null
  directionUpdn?: 'up' | 'down' | null
  directionNextStop?: string | null

  // 즐겨찾기 전용
  alias?: string | null                 // 빈 문자열 → null 정규화
                                        // (BE가 정규화. FE도 trim 권장)
                                        // 별명은 컨텍스트별 분리(D3) — route_stops.alias와 동기화 없음

  // 노선 (1개 이상 필수 — D5. 0개 시 BE가 400 reject)
  routes: FavoriteStopRouteInput[]
}

interface FavoriteStopRouteInput {
  odsayRouteId: string
  routeName: string                     // "11", "1호선"
  busType?: number | null

  // 서울 버스 매핑 (옵셔널)
  stId?: string | null
  busRouteId?: string | null
  stationOrd?: number | null
  stationName?: string | null

  // 경기 버스 매핑 (옵셔널)
  gbisRouteId?: string | null
  gbisStaOrder?: number | null
}
```

### 2.3 BE 처리 흐름

1. **노선 0개 reject (D5):** `routes` 배열이 비어 있거나 누락이면 400 `FAVORITE_ROUTES_REQUIRED`. 이후 단계 진행 안 함.
2. `alias` 정규화: trim 후 빈 문자열이면 `null`
3. **지하철 방향 필드 (D10 + D11):** `stopType === 'subway'`이면 D11에 따라 FE는 `directionUpdn` + `directionNextStop`을 채워 보낸다. **`directionHeadsign`은 NULL 저장 (D11 — 매 도착 응답 item의 `headsign`으로 동적 표시).** 모두 NULL이어도 저장은 허용 — 호선/방향 정보 미제공 graceful fallback. `route_stops`와 동일하게 카드 표시 시점에 "방향 정보 없음" inline 안내. **`directionUpdn`이 `'up'`/`'down'` 외 값이면 400.** BE는 받은 그대로 저장 (FE 책임).
4. 좌표 기반 `resolveStopProvider(lat, lng)` 호출 (경로 저장과 동일 헬퍼)
5. `display_order = (현 사용자 max + 1)`로 자동 부여
6. `favorite_stops` insert
7. `favorite_stop_routes` bulk insert (provider는 `routeIdToProvider(odsayRouteId)`로 자동 결정)
8. 응답: 생성된 row 전체 (§1.2 형식)

### 2.3-a 검증 위치 정리 (D10)

| 검증 | 1차 (FE) | 2차 (BE) |
|------|---------|---------|
| 노선 0개 reject (D5) | 저장 버튼 disabled | 400 `FAVORITE_ROUTES_REQUIRED` (필수 방어선) |
| 지하철 방향 미선택 (D10 + D11) | `<UnifiedStopPicker>`에서 방향 chip 미선택 시 done 못 함. 양방향 다음 역 1개씩 chip 표시. 호선/방향 정보 fetch 실패 시 사용자 동의 후 NULL payload 허용 | 형식 검증만 (`updn ∈ {'up','down'} ∪ null`). NULL 자체는 허용. `directionHeadsign`은 NULL 정상 (D11) |
| `subwayCode` 필수성 | 지하철은 호선 선택 후 자동 동봉 (`routes[0].odsayRouteId`로 매핑). | route 검증의 일부 — 지하철 stop인데 routes 항목에 호선이 없으면 400 (FE 버그) |
| alias 길이 ≤ 20 | input maxLength | 400 |

### 2.4 응답 — 201 Created

§1.2의 `ApiFavoriteStop` 단일 객체.

### 2.5 입력 예시

```json
{
  "odsayStopId": "87103",
  "stopName": "광명사거리역",
  "stopType": "bus",
  "arsId": "85019",
  "lat": 37.4807,
  "lng": 126.8615,
  "alias": "회사 가는 길",
  "routes": [
    {
      "odsayRouteId": "...",
      "routeName": "11",
      "busType": 13
    }
  ]
}
```

### 2.6 에러

| HTTP | 코드 | 케이스 |
|------|------|--------|
| 400 | (구조화 에러 적용 후) | 필수 필드 누락 (odsayStopId, stopName, stopType) |
| 400 | `FAVORITE_ROUTES_REQUIRED` | `routes` 배열이 비었거나 누락 (D5) |
| 400 | | alias 길이 초과 (>20) |
| 401 | | 인증 헤더 없음 |
| 502 | `ARRIVAL_PROVIDER_ERROR` | GBIS 매핑 호출 실패 (가능하면 fallback 처리) |

---

## 3. PATCH /favorite-stops/:id — 부분 수정

### 3.1 인증

Bearer JWT 필수.

### 3.2 입력 DTO (모두 옵셔널)

```ts
interface UpdateFavoriteStopRequest {
  alias?: string | null                 // 빈 문자열 → null
  displayOrder?: number
  routes?: FavoriteStopRouteInput[]     // 전체 교체
}
```

### 3.3 BE 처리

- `alias`만: 단일 update
- `displayOrder`만: 단일 update — **여러 row 정렬은 클라이언트가 변경된 row 각각 PATCH** (Promise.all)
- `routes`: 트랜잭션 (기존 favorite_stop_routes delete + insert)
  - **빈 배열(`routes: []`) reject (D5):** 400 `FAVORITE_ROUTES_REQUIRED`. 노선 모두 비우려면 DELETE /favorite-stops/:id 사용.

### 3.4 응답 — 200 OK

수정된 `ApiFavoriteStop` 전체.

### 3.5 에러

| HTTP | 코드 | 케이스 |
|------|------|--------|
| 400 | | alias 길이 초과 / displayOrder 음수 / routes 형식 오류 |
| 400 | `FAVORITE_ROUTES_REQUIRED` | `routes: []` (빈 배열) — D5 |
| 401 | | 인증 없음 |
| 404 | | 해당 id의 favorite_stop 없음 |
| 403 | | 다른 사용자의 row (RLS — 실질 404로 응답할 수 있음) |

### 3.6 입력 예시 — 별명 변경

```json
{ "alias": "회사 가는 길 (회사 앞)" }
```

### 3.7 입력 예시 — 별명 삭제

```json
{ "alias": null }
```

또는 빈 문자열도 허용:

```json
{ "alias": "" }
```

### 3.8 입력 예시 — 정렬 변경 (단일 row)

```json
{ "displayOrder": 2 }
```

---

## 4. DELETE /favorite-stops/:id

### 4.1 인증

Bearer JWT 필수.

### 4.2 응답 — 204 No Content

자식 `favorite_stop_routes`는 cascade로 자동 삭제.

### 4.3 에러

| HTTP | 케이스 |
|------|--------|
| 401 | 인증 없음 |
| 404 | 없는 id |

---

## 5. PATCH /routes/:id — 부분 수정 (확장)

### 5.1 인증

Bearer JWT 필수.

### 5.2 입력 DTO (모두 옵셔널)

```ts
interface UpdateRouteRequest {
  name?: string
  displayOrder?: number
  active?: boolean                      // PRD D2 — routes.active 컬럼 신설로 활성 토글 지원
  stops?: RouteStopInput[]              // 전체 교체 (기존 PUT 시맨틱)
}
```

### 5.3 BE 처리

- `name`/`displayOrder`/`active`만: 단일 row update
- `stops` 들어오면: 기존 PUT 동작 (route_stops/stop_routes 재생성 + provider 재매핑)
- **`active` 토글 (D2):** boolean 단일 update. 비활성 경로도 GET /routes 응답에 포함됨 — FE가 `active === true`인 항목만 홈에 노출.

### 5.4 응답 — 200 OK

수정된 `ApiRoute` 전체 (`docs/api/contracts/routes.md` §1.4 참조). `active` 필드 포함.

### 5.5 에러

| HTTP | 케이스 |
|------|--------|
| 400 | stops 형식 오류 |
| 401 | 인증 없음 |
| 404 | 없는 id |

### 5.6 입력 예시 — active 토글

```json
{ "active": false }
```

```json
{ "active": true }
```

---

## 5.5 [D11] 지하철 호선/방향 정보 — `GET /subway-station-directions`

`<UnifiedStopPicker>`의 호선/방향 선택 단계에 필요한 데이터.

**D11 결정 (2026-05-08):** 양 종착지 N개 표시 → **양방향 다음 역 1개씩**으로 단순화. ODsay `subwayStationInfo`의 `prevOBJ`/`nextOBJ`(단일 호출)를 사용. 새 cron/캐시 테이블/정적 매핑 모두 폐기. 종착지(headsign)는 도착 카드에서 매 item의 `headsign`(2026-05-08 BE 작업으로 이미 동봉)으로 동적 표시.

### 5.5.1 endpoint

```
GET /subway-station-directions?stationId={odsayStationId}
```

**인증:** anon 허용 (검색 흐름의 일부 — `search-stops`와 동일 정책)

### 5.5.2 응답 200

```ts
interface SubwayStationDirectionsResponse {
  stationName: string                  // 정규화된 본명 (예: "서울역")
  lineName: string                     // 표시용 (예: "수도권 1호선")
  subwayId: string                     // 서울 지하철 API 형식 ("1001", "1002"...)
  directions: SubwayDirection[]        // 1~2개 — 종착역은 1개
}

interface SubwayDirection {
  updn: 'up' | 'down'
  nextStop: string                     // 다음 역명 (예: "남영")
}
```

### 5.5.3 응답 예시 (서울역 1호선 — 양방향)

```json
{
  "stationName": "서울역",
  "lineName": "수도권 1호선",
  "subwayId": "1001",
  "directions": [
    { "updn": "up",   "nextStop": "시청" },
    { "updn": "down", "nextStop": "남영" }
  ]
}
```

### 5.5.4 응답 예시 (종착역 — 단방향)

```json
{
  "stationName": "오이도",
  "lineName": "수도권 4호선",
  "subwayId": "1004",
  "directions": [
    { "updn": "up", "nextStop": "정왕" }
  ]
}
```

### 5.5.5 에러

| HTTP | 코드 | 케이스 |
|------|------|--------|
| 400 | | `stationId` 누락 |
| 404 | `STATION_NOT_FOUND` | ODsay에 일치 역 없음 |
| 502 | `ARRIVAL_PROVIDER_ERROR` | 외부 ODsay API 장애 |

### 5.5.6 환승역 처리 — 호선당 1회 호출

ODsay `subwayStationID`는 호선별로 다른 ID를 부여하므로(서울역 1호선과 4호선은 서로 다른 stationId), 환승역에서 호선 row를 분리해 보여주는 것은 `search-stops` 응답이 책임. 본 endpoint는 **stationId 1개 = 호선 1개의 directions** 반환. 사용자가 호선 chip 선택 → 해당 호선의 stationId로 본 endpoint 호출.

> 검색 결과의 호선 분리 노출은 별개 트랙(search-stops `laneName`/`subwayId` 노출). 본 spec D11에서는 직접 결합하지 않음 — `<UnifiedStopPicker>`는 search-stops가 호선 단위 row를 주거나, 클릭 후 본 endpoint 호출로 호선 정보 자동 결정 둘 다 가능.

### 5.5.7 BE 처리 흐름

1. `stationId` 검증 (누락 → 400)
2. ODsay `subwayStationInfo` 호출 (외부 API 장애 → 502)
3. 응답에서 추출:
   - `stationName` ← `stationName` (정규화)
   - `lineName` ← `laneName`
   - `subwayId` ← 서울 지하철 API 형식 매핑 (transitColors 매핑 기준 또는 `_shared` 헬퍼)
   - `directions[]`:
     - `prevOBJ` 존재 시 → `{ updn: 'up', nextStop: prevOBJ.stationName }`
     - `nextOBJ` 존재 시 → `{ updn: 'down', nextStop: nextOBJ.stationName }`
     - 시점역/종점역은 한쪽만 존재 가능
   - `directions.length === 0`인 경우는 미관측이지만 발생 시 502 처리 (데이터 이상)
4. 응답 200

> ODsay `prevOBJ`/`nextOBJ`의 상하행 매핑은 ODsay 내부 정의를 따름. 시군 경계나 역방향 운행이 있는 호선(예: 2호선 순환)은 향후 검증 필요 — 초기 구현은 단순 prev=up / next=down 매핑.

### 5.5.8 FE 사용 시 graceful fallback

endpoint 호출 실패/404 시 FE는:
1. `<UnifiedStopPicker>`에 "방향 정보를 가져올 수 없어요. 그대로 추가하시겠어요?" 확인
2. 사용자 동의 시 `direction_*` 필드 NULL로 done payload 산출
3. POST /favorite-stops는 §2.3 처리 흐름대로 NULL 저장 허용 (legacy fallback)
4. 카드에는 "방향 정보 없음 — 경로를 다시 등록하면 더 정확해요" inline 안내 (기존 정책)

### 5.5.9 종착지(headsign)는 도착 응답에서 동적 표시

본 endpoint는 종착지(`headsign`)를 응답에 포함하지 않는다. 대신 매 도착 item의 `headsign`(2026-05-08 BE 작업으로 `arrival-info` 지하철 응답에 이미 동봉됨)을 사용해 도착 카드 시점에 "인천행 3분 후 / 동인천행 8분 후 / 서동탄행 14분 후" 형태로 자연스럽게 노출된다. 사용자는 본 호선의 모든 종착지 N개를 미리 외울 필요 없음.

### 5.5.10 폐기된 옵션 (참고)

이전 초안의 옵션 A/B/C는 D11 결정으로 다음과 같이 정리됨:

- ~~옵션 A — 신규 endpoint `GET /subway-station-info` + `terminals: { up, down }` (양 종착지 N개)~~ → **D11으로 단순화. 본 §5.5의 `subway-station-directions`로 대체**
- ~~옵션 A' — `subway_line_headsigns` 캐시 테이블 + cron + ODsay `searchSubwaySchedule`~~ → **폐기 (D11)**
- ~~옵션 B (양 종착지 N개를 search-stops 응답에 인라인)~~ → **폐기 (D11)**. 단, search-stops에 `laneName`/`subwayId` 노출은 별개 트랙으로 유지(호선 row 분리용).
- ~~옵션 C 정적 매핑 (`_shared/subway-line-map.ts`)~~ → **폐기 (D11)**

---

## 6. PATCH /route-stops/:id — 별명 전용

### 6.1 인증

Bearer JWT 필수.

### 6.2 입력 DTO

```ts
interface UpdateRouteStopRequest {
  alias?: string | null
}
```

### 6.3 BE 처리

- `alias` 정규화 (빈 문자열 → null)
- 부모 route의 user_id 검증 (RLS)

### 6.4 응답 — 200 OK

```ts
ApiRouteStop  // routes 계약 §2.2 + alias 필드
```

```json
{
  "id": "uuid-stop-1",
  "route_id": "uuid-route-1",
  "sequence": 0,
  "stop_name": "테헤란로.한국기술센터",
  "stop_type": "bus",
  "ars_id": "23156",
  "alias": "회사 앞",
  "...": "..."
}
```

### 6.5 에러

| HTTP | 케이스 |
|------|--------|
| 400 | alias 길이 초과 |
| 401 | 인증 없음 |
| 404 | 없는 id |

---

## 7. GET /routes — 응답 확장

### 7.1 추가 필드

```ts
interface ApiRoute {
  // 기존 필드 모두 유지
  display_order?: number               // 신규 (마이그레이션 후 NOT NULL)
  active?: boolean                     // 신규 — D2, 마이그레이션 후 NOT NULL DEFAULT true
  // ...
  route_stops: ApiRouteStop[]
}

interface ApiRouteStop {
  // 기존 필드 모두 유지
  alias?: string | null                // 신규 — 별명 (컨텍스트별 분리, D3)
  // ...
}
```

### 7.2 정렬 (서버 책임)

`order by display_order asc, created_at asc`

### 7.3 active 필터링 정책

비활성 경로(`active === false`)도 GET 응답에 포함된다. FE가 활성 여부로 홈 노출 결정.
RouteManagement 화면에서는 활성/비활성 모두 노출하고, 토글로 상태 변경 가능.

---

## 8. GET /arrival-info?stopId={uuid} — lookup 범위 확장 (D1 통합)

### 8.1 변경

`stopId`는 `route_stops` ∪ `favorite_stops` 통합 uuid 풀에서 발급된 값. BE가 두 테이블 모두 lookup.

```
arrival-info 처리:
  1. route_stops + stop_routes 조회 → 발견 시 기존 흐름 (provider 분기)
  2. 미발견 시 favorite_stops + favorite_stop_routes 조회 → 동일 provider 분기 알고리즘
  3. 둘 다 미발견 → 404 ARRIVAL_STOP_NOT_FOUND
```

> FE는 stopId가 어느 테이블에 속하는지 모른다. uuid 풀이 같으므로 충돌 가능성 무시 가능.

### 8.2 응답

변경 없음 — 기존 `BusArrivalResponse` / 지하철 응답 그대로.

### 8.3 에러

| HTTP | 코드 | 케이스 |
|------|------|--------|
| 404 | `ARRIVAL_STOP_NOT_FOUND` | stopId가 두 테이블 모두에서 미발견 |

---

## 9. DB 스키마 (참고 — SDD §2 상세)

### 9.1 favorite_stops

```
id                  uuid PK
user_id             uuid FK → auth.users
odsay_stop_id       text
stop_name           text
stop_type           text   ('bus' | 'subway')
ars_id              text  NULL
lat                 double precision NULL
lng                 double precision NULL
direction_headsign  text  NULL
direction_updn      text  NULL CHECK ('up' | 'down')
direction_next_stop text  NULL
provider            text  NOT NULL DEFAULT 'seoul' CHECK (...)
gbis_station_id     text  NULL
alias               text  NULL
display_order       int   NOT NULL DEFAULT 0
created_at          timestamptz
updated_at          timestamptz
```

### 9.2 favorite_stop_routes

```
id                  uuid PK
favorite_stop_id    uuid FK → favorite_stops (cascade)
odsay_route_id      text
route_name          text
bus_type            int  NULL
st_id               text NULL
bus_route_id        text NULL
station_ord         int  NULL
station_name        text NULL
gbis_route_id       text NULL
gbis_sta_order      int  NULL
provider            text NULL CHECK (...)
created_at          timestamptz
```

### 9.3 route_stops 추가

```
alias               text NULL                    [신규]
```

### 9.4 routes 추가

```
display_order       int     NOT NULL DEFAULT 0     [신규, 백필 후 NOT NULL]
active              boolean NOT NULL DEFAULT true  [신규 D2, backfill: UPDATE routes SET active = true]
```

---

## 10. 변경 이력

- 2026-05-08 — 신규 작성 (초안)
- 2026-05-08 — Open Questions 5개 결정 반영
  - D1: arrival-info `stopId` 통합 lookup 확정 (§8)
  - D2: `routes.active` 컬럼 신설 + PATCH 토글 (§5, §7, §9.4)
  - D3: 별명 컨텍스트 분리 명시 (§0, §2.2)
  - D5: 즐겨찾기 노선 0개 reject — POST/PATCH 모두 `FAVORITE_ROUTES_REQUIRED` (§2.3, §2.6, §3.3, §3.5)
- 2026-05-08 — D10 추가: 공용 `<UnifiedStopPicker>` + 지하철 호선/방향 선택 단계
  - §0 변경 요약에 호선/방향 endpoint 추가
  - §2.3 BE 처리에 지하철 방향 NULL graceful fallback 명시
  - §2.3-a 검증 위치 정리 표 추가
  - §5.5 신설: 호선/방향 정보 endpoint 명세 (옵션 A / B / C 중 1택, T10-a 조사 후 확정)
  - 영향: SetupRoute 수동 검색도 동일 컴포넌트 사용 → 지하철 노드 `direction_*` NULL 저장 한계 해소 (재등록 시점)
- 2026-05-08 — D11 추가: 양방향 다음 역 1개씩 + 종착지 동적 노출
  - §0 변경 요약에서 "옵션 A 또는 B" → 단일 `GET /subway-station-directions` endpoint로 정리
  - §0 핵심 결정에 D11 추가
  - §2.3 BE 처리에서 `directionHeadsign`은 NULL 저장(D11 — 도착 카드에서 동적) 명시
  - §2.3-a 검증 표에서 양방향 다음 역 1개씩 chip 표시로 변경
  - §5.5 전면 재작성: 옵션 A/B/C 폐기 → `GET /subway-station-directions` 단일 endpoint 명세
  - 영향: BE Phase 2-2 단순화 (cron/캐시 테이블 폐기). 도착 카드는 매 item `headsign`으로 종착지 표시 (이미 BE 작업 완료, FE 표시 작업 완료)
