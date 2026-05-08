# SDD — 즐겨찾기(단일 정류장) + 별명 (favorites-and-aliases)

- **상태:** 초안 (2026-05-08)
- **작성일:** 2026-05-08
- **작성자:** architect
- **선행:** `PRD.md`
- **관련:** `TASKS.md`, `docs/api/contracts/favorites.md` (예정), `docs/api/contracts/routes.md`, `docs/api/contracts/arrival-info.md`

---

## 1. 시스템 다이어그램

### 1.1 즐겨찾기/수동 검색 정류장 추가 흐름 (공용 `<UnifiedStopPicker>`, D10)

> AddFavorite와 SetupRoute(수동 검색 분기) 모두 동일 컴포넌트 사용. 지하철은 호선/방향 선택 단계가 추가됨.

```
┌─────────────────────┐    GET /search-stops?q=...        ┌──────────────────┐
│ <UnifiedStopPicker> │ ─────────────────────────────────▶│ search-stops EF  │
│  state: searching   │ ◀─────────────────────────────────│ (ODsay 프록시)    │
└──────────┬──────────┘    stops[]                        └──────────────────┘
           │ 사용자 결과 선택 → stopType 분기
           │
   ┌───────┴────────────────────────┐
   ▼ (bus)                          ▼ (subway)
┌────────────────┐               ┌──────────────────────┐
│ state:         │               │ state: lineSelecting │
│   resultSelected│              │ — 호선 1개면 자동 진행 │
└──────┬─────────┘               └──────────┬───────────┘
       │ GET /stop-routes?arsId             │ GET /subway-station-directions?stationId=
       │   ?? (또는 ODsay 노선 prefetch)    │   (D11: 단일 호출, prev/next 1개씩)
       ▼                                    ▼
┌────────────────┐               ┌──────────────────────┐
│ 노선 다중 선택  │               │ 호선 선택            │
│ (체크박스)      │               │ (chip 버튼: 1호선/4… )│
└──────┬─────────┘               └──────────┬───────────┘
       │                                    │ 사용자 선택 (단일호선역은 자동 통과)
       │                                    ▼
       │                         ┌──────────────────────┐
       │                         │ state:               │
       │                         │   directionSelecting │
       │                         └──────────┬───────────┘
       │                                    │ 양방향 다음 역 chip 2개
       │                                    │ (예: "시청 방향(상행)" / "남영 방향(하행)")
       │                                    ▼
       │                         ┌──────────────────────┐
       │                         │ subwayCode +         │
       │                         │ directionHeadsign +  │
       │                         │ directionUpdn 결정   │
       │                         └──────────┬───────────┘
       │                                    │
       └───────────┬────────────────────────┘
                   ▼ state: done
        ┌─────────────────────┐
        │ onComplete(payload) │ — 호출자가 별명 입력/저장 처리
        │  payload 형식 §4.2  │
        └─────────────────────┘
```

> 공용 컴포넌트의 책임은 **`{ stop, routes, subwayLine?, direction? }` payload 산출까지**. 별명 입력·저장 액션은 호출자(AddFavorite / SetupRoute)에 위임 — 두 진입점의 후처리가 다름(즐겨찾기는 즉시 POST, SetupRoute는 노드 카드로 추가 후 일괄 저장).

### 1.1-b 즐겨찾기 추가 — 호출 측 흐름 (D10 후)

```
<AddFavorite>
  ├─ <UnifiedStopPicker mode="single" stopType="any" />
  │     ↓ onComplete(payload)
  ├─ 별명 입력 input (선택)
  └─ POST /favorite-stops
       body = mapPickerPayloadToCreateRequest(payload, alias)
            → odsayStopId / stopName / stopType / arsId / lat / lng
            → directionUpdn / directionNextStop (지하철, D11)
            → directionHeadsign: null (D11 — 도착 카드에서 동적)
            → routes[] (버스: 다중, 지하철: 1개 — subwayCode 포함)
            → alias
       응답 → /favorites navigate
```

### 1.2 즐겨찾기 도착 조회 흐름 (기존 arrival-info 재사용)

```
┌─────────────────┐ GET /arrival-info?stopId={uuid}┌──────────────────┐
│ Favorites 카드   │ ──────────────────────────────▶│ arrival-info EF  │
└─────────────────┘                                └─────────┬────────┘
                                                             │ DB lookup (통합)
                                              ┌──────────────┴──────────────┐
                                              ▼                              ▼
                                  ┌──────────────────┐         ┌──────────────────────┐
                                  │ route_stops에 있음│         │ favorite_stops에 있음 │
                                  │ → 기존 분기 그대로│         │ → 동일 provider 분기  │
                                  └──────────────────┘         │   알고리즘 적용       │
                                                               └──────────────────────┘
```

> **핵심 결정 (PRD D1 확정):** 즐겨찾기도 정류장 단위 uuid를 발급받아 **`route_stops` ∪ `favorite_stops` 통합 uuid 풀**을 공유한다. BE는 lookup 시 두 테이블 모두 조회 (`route_stops` 우선 — 발견 시 즉시 분기, 미발견 시 `favorite_stops` 조회). FE는 어느 쪽인지 모른 채 `stopId` 하나만 들고 있으면 된다. uuid는 `gen_random_uuid()` 풀에서 발급되므로 두 테이블 간 충돌 가능성 없음 (수학적으로 무시 가능).

### 1.3 별명 편집 흐름

```
┌──────────────────────┐ 연필 아이콘 탭        ┌─────────────────────┐
│ <StopName>           │ ─────────────────────▶│ <AliasEditor> 인라인 │
│ (본명 + 별명 표시)    │ ◀─────────────────────│ (input + 저장/삭제)  │
└──────────────────────┘    저장 액션            └──────────┬──────────┘
                                                            │
                          ┌─────────────────────────────────┴─────────────────────┐
                          ▼                                                       ▼
            PATCH /route-stops/:id                          PATCH /favorite-stops/:id
            (경로 정류장의 별명)                                (즐겨찾기 정류장의 별명)
                          │                                                       │
                          ▼                                                       ▼
              optimistic update (TanStack Query)             optimistic update
                + invalidate routes 키                        + invalidate favorite-stops 키
```

---

## 2. DB 스키마 변경

### 2.1 신규 테이블 — `favorite_stops`

```sql
create table favorite_stops (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- 정류장 정보 (route_stops와 같은 형태)
  odsay_stop_id   text not null,
  stop_name       text not null,
  stop_type       text not null check (stop_type in ('bus', 'subway')),
  ars_id          text,
  lat             double precision,
  lng             double precision,

  -- 지하철 방향 (옵셔널, route_stops와 동일)
  direction_headsign  text,
  direction_updn      text check (direction_updn in ('up', 'down')),
  direction_next_stop text,

  -- multi-region (route_stops와 동일)
  provider        text not null default 'seoul'
                  check (provider in ('seoul', 'gyeonggi', 'odsay_fallback')),
  gbis_station_id text,

  -- 즐겨찾기 전용
  alias           text,                  -- 별명 (NULL = 별명 없음)
  display_order   int not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index favorite_stops_user_id_order_idx
  on favorite_stops(user_id, display_order);

-- RLS
alter table favorite_stops enable row level security;
create policy "owner read" on favorite_stops
  for select using (auth.uid() = user_id);
create policy "owner write" on favorite_stops
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 2.2 신규 테이블 — `favorite_stop_routes`

`route_stops` ↔ `stop_routes` 관계와 동일한 추상화 유지 (PRD OQ1 결정: 분리).

```sql
create table favorite_stop_routes (
  id              uuid primary key default gen_random_uuid(),
  favorite_stop_id uuid not null references favorite_stops(id) on delete cascade,

  -- stop_routes와 동일 컬럼 셋
  odsay_route_id  text not null,
  route_name      text not null,
  bus_type        int,
  st_id           text,
  bus_route_id    text,
  station_ord     int,
  station_name    text,
  gbis_route_id   text,
  gbis_sta_order  int,

  -- 노선 단위 provider (stop_routes와 동일 — 2026-05-03 결정 따름)
  provider        text check (provider in ('seoul', 'gyeonggi', 'odsay_fallback')),

  created_at      timestamptz not null default now()
);

create index favorite_stop_routes_stop_idx
  on favorite_stop_routes(favorite_stop_id);

-- RLS: 부모 favorite_stops의 user_id 기반
alter table favorite_stop_routes enable row level security;
create policy "owner read" on favorite_stop_routes
  for select using (
    exists (
      select 1 from favorite_stops fs
      where fs.id = favorite_stop_routes.favorite_stop_id
        and fs.user_id = auth.uid()
    )
  );
create policy "owner write" on favorite_stop_routes
  for all using (
    exists (
      select 1 from favorite_stops fs
      where fs.id = favorite_stop_routes.favorite_stop_id
        and fs.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from favorite_stops fs
      where fs.id = favorite_stop_routes.favorite_stop_id
        and fs.user_id = auth.uid()
    )
  );
```

### 2.3 컬럼 추가 — `route_stops.alias`

```sql
alter table route_stops add column alias text;
-- nullable. 빈 문자열 저장 = NULL로 정규화 (BE 책임).
```

### 2.4 컬럼 추가 — `routes.display_order`

```sql
alter table routes add column display_order int;

-- 기존 row 백필 (사용자별 created_at 순서)
with ordered as (
  select id,
         row_number() over (partition by user_id order by created_at) - 1 as ord
  from routes
)
update routes r
   set display_order = ordered.ord
  from ordered
 where r.id = ordered.id;

alter table routes alter column display_order set not null;
alter table routes alter column display_order set default 0;

create index routes_user_id_order_idx
  on routes(user_id, display_order);
```

> 0-based로 통일 (FE 정렬 알고리즘과 일관). 새 항목은 `max(display_order) + 1`.

### 2.5 컬럼 추가 — `routes.active` (PRD D2 신규)

토글로 비활성화된 경로를 보존하면서 홈 노출 여부만 끄기 위한 컬럼. 기존엔 클라이언트 zustand 추정에만 의존했으나, 본 spec에서 서버 권위 데이터로 승격.

```sql
alter table routes add column active boolean;

-- 기존 row 백필 (모두 활성)
update routes set active = true where active is null;

alter table routes alter column active set not null;
alter table routes alter column active set default true;
```

> default `true` — 신규 경로는 자동 활성. PATCH /routes/:id로 토글.

### 2.6 마이그레이션 파일명 (예정)

- `20260509000000_create_favorite_stops.sql` — 2.1 + 2.2
- `20260509000100_add_alias_to_route_stops.sql` — 2.3
- `20260509000200_add_display_order_to_routes.sql` — 2.4
- `20260509000300_add_active_to_routes.sql` — 2.5 (신규, PRD D2)

---

## 3. API 계약 (요약 — 상세는 `docs/api/contracts/favorites.md`)

### 3.1 GET /favorite-stops

- **인증:** Bearer JWT
- **응답 200:**
```ts
interface ApiFavoriteStop {
  id: string                           // uuid (arrival-info의 stopId로 사용 가능)
  user_id: string
  odsay_stop_id: string
  stop_name: string
  stop_type: 'bus' | 'subway'
  ars_id: string | null
  lat: number | null
  lng: number | null
  direction_headsign: string | null
  direction_updn: 'up' | 'down' | null
  direction_next_stop: string | null
  provider: 'seoul' | 'gyeonggi' | 'odsay_fallback'
  gbis_station_id: string | null
  alias: string | null
  display_order: number
  favorite_stop_routes: ApiFavoriteStopRoute[]
  created_at: string
  updated_at: string
}
```
- **정렬:** `order by display_order asc, created_at asc` (서버 책임)

### 3.2 POST /favorite-stops

- **요청:**
```ts
interface CreateFavoriteStopRequest {
  odsayStopId: string
  stopName: string
  stopType: 'bus' | 'subway'
  arsId?: string
  lat?: number
  lng?: number
  directionHeadsign?: string | null
  directionUpdn?: 'up' | 'down' | null
  directionNextStop?: string | null
  alias?: string | null
  routes: FavoriteStopRouteInput[]    // 1개 이상 필수 (PRD D5)
}
```
- **BE 처리:**
  1. **노선 0개 reject (PRD D5):** `routes` 배열이 비어 있거나 누락이면 400 `FAVORITE_ROUTES_REQUIRED`. 이후 단계 진행 안 함.
  2. 좌표 기반 `resolveStopProvider` 호출 (경로 저장과 동일 알고리즘)
  3. `display_order = (현 사용자 max + 1)`로 자동 부여
  4. `alias` 빈 문자열 → `null` 정규화
  5. `favorite_stops` insert → `favorite_stop_routes` bulk insert
  6. 응답: 생성된 row 전체 (GET 응답 형식)
- **FE 보조 검증 (PRD D5):** 저장 버튼은 `routes.length >= 1`일 때만 enabled. BE 검증은 최종 방어선.

### 3.3 PATCH /favorite-stops/:id

- **요청 (모두 옵셔널, 부분 수정):**
```ts
interface UpdateFavoriteStopRequest {
  alias?: string | null               // 빈 문자열 = 삭제
  displayOrder?: number
  routes?: FavoriteStopRouteInput[]   // 전체 교체 (간단함 우선)
}
```
- **BE 처리:**
  - `alias` 들어오면 빈 문자열 → null 정규화 후 update
  - `displayOrder`는 단일 row만 update — 전체 reorder는 클라이언트가 변경된 row 각각 PATCH (또는 §3.6 bulk PATCH)
  - `routes` 들어오면 기존 favorite_stop_routes delete + insert (트랜잭션). **빈 배열 reject (PRD D5)** — 400 `FAVORITE_ROUTES_REQUIRED`. 노선을 모두 비우려면 favorite_stop 자체를 DELETE하라.
- **FE 보조 검증 (PRD D5):** 노선 편집 UI에서 마지막 1개 노선은 unselect 불가 (또는 저장 버튼 disabled).

### 3.4 DELETE /favorite-stops/:id

- **응답 204.** 자식 `favorite_stop_routes`는 cascade로 자동 삭제.

### 3.5 PATCH /routes/:id (확장)

기존 PUT/DELETE에 더해 **부분 수정용 PATCH** 추가.

- **요청 (옵셔널):**
```ts
interface UpdateRouteRequest {
  name?: string
  displayOrder?: number
  active?: boolean                    // 활성화 토글 (PRD D2 — routes.active 컬럼 신설)
  stops?: RouteStopInput[]            // 전체 교체 (기존 PUT과 동일 시맨틱)
}
```
- **BE 처리:**
  - `displayOrder`/`name`/`active`만 들어오면 stops는 건드리지 않음 (단일 row update)
  - `stops` 들어오면 기존 PUT 동작 (전체 재생성 + provider 재매핑)
  - **`active` 토글 (PRD D2 확정):** boolean 단일 update. RLS는 user_id 기반 그대로. 활성/비활성 전환은 데이터 보존 — 비활성화된 경로도 GET /routes 응답에 포함되며 FE가 활성 여부로 노출 결정.

> 기존 PUT은 한 사이클 호환을 위해 유지. 새 흐름은 PATCH 사용 권장.

### 3.6 PATCH /route-stops/:id (신규, 별명 전용)

경로 전체 수정 없이 정류장 별명만 바꾸는 가벼운 엔드포인트.

- **요청:**
```ts
interface UpdateRouteStopRequest {
  alias?: string | null
}
```
- **응답 200:** 갱신된 `ApiRouteStop`

### 3.7-pre 지하철 호선/방향 정보 (PRD D10 + D11 확정)

`<UnifiedStopPicker>`의 호선 선택 / 방향 선택 단계에 필요한 데이터를 BE가 공급한다.

**D11 결정 (2026-05-08):** 양방향 종착지 N개 → **양방향 다음 역 1개씩**으로 단순화. ODsay `subwayStationInfo`의 `prevOBJ`/`nextOBJ`(단일 호출, prev/next 한 칸씩)을 사용. 새 cron/캐시 테이블 불필요.

#### 채택: 신규 endpoint `GET /subway-station-directions`

```
GET /subway-station-directions?stationId={odsayStationId}
```

**응답 200:**
```ts
interface SubwayStationDirectionsResponse {
  stationName: string                       // 정규화된 본명 (예: "서울역")
  lineName: string                          // 표시용 ("수도권 1호선")
  subwayId: string                          // 서울 지하철 API 형식 ("1001", "1002"...)
  directions: SubwayDirection[]             // 1~2개 — 종착지/시종점역은 1개일 수 있음
}

interface SubwayDirection {
  updn: 'up' | 'down'
  nextStop: string                          // 예: "남영"
}
```

**예시 (서울역 1호선):**
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

- `directions`는 ODsay `subwayStationInfo`의 `prevOBJ`(상행 다음 역)와 `nextOBJ`(하행 다음 역)에서 한 칸씩 추출.
- 종착역은 한 방향만 존재 (`directions.length === 1`).
- **종착지(headsign)는 응답에 포함 안 함** — 매 도착 item의 `headsign`(이미 BE 응답 동봉)으로 카드 시점에 동적 표시.

#### 폐기 옵션

- **옵션 A 폐기 (`/subway-line-headsigns` + cron + `subway_line_headsigns` 캐시 테이블 + ODsay `searchSubwaySchedule`):** 양방향 종착지 N개 표시를 위한 시간표 API 캐시는 D11로 불필요. 새 테이블/cron 만들지 않음.
- **옵션 C 폐기 (정적 매핑):** ODsay `subwayStationInfo` 단일 호출이 가능하므로 hardcode 불필요.

#### 보조 — 옵션 B: `search-stops` 응답 확장 (호선 row 노출용으로만 유지)

기존 검토에서 search-stops 응답에 `laneName`, `subwayId` 추가는 별개 트랙으로 유지(환승역 호선 row 분리 노출용). 본 spec D11과 직접 결합하지 않음 — `<UnifiedStopPicker>`의 호선 선택 단계는 `search-stops` 응답이 호선 단위로 row를 분리해 주거나, 검색 결과 클릭 후 `subway-station-directions` 호출로 호선 1개를 받아 자동 진행 둘 다 가능. 본 spec 범위에서는 **호선 단계와 방향 단계 모두 `subway-station-directions` 응답으로 결정** — 응답에 `lineName`/`subwayId`가 동봉되므로 추가 호출 불필요.

> **데이터 폴백 (D10 그대로):** endpoint 호출 실패/404 시 FE는 호선/방향 단계를 스킵하고 사용자 동의 후 NULL로 저장. 외부 API 일시 장애에도 흐름이 막히지 않음.

> **DB 영향:** 없음. `route_stops`/`favorite_stops`의 기존 `direction_headsign`/`direction_updn`/`direction_next_stop` 컬럼에 그대로 저장. **D11에 따라 `direction_headsign`은 NULL로 저장** — 도착 카드에서 매 item `headsign`으로 동적 표시.

> **마이그레이션 영향:** 없음. `subway_line_headsigns` 테이블/마이그레이션 신설 불필요(폐기).

### 3.7 도착 조회 — lookup 통합 (PRD D1 확정)

`GET /arrival-info?stopId={uuid}`. BE가 `route_stops` ∪ `favorite_stops` 통합 lookup.

```
arrival-info 처리:
  1. stopId로 route_stops 조회 (+ stop_routes join 기존 그대로)
       → 발견 시: 기존 흐름 (provider 분기 → SeoulBus / GyeonggiBus / Odsay merge)
  2. 미발견 시 favorite_stops 조회 (+ favorite_stop_routes join)
       → 발견 시: 동일 provider 분기 알고리즘 (favorite_stop_routes의 provider/odsay_route_id 사용)
  3. 둘 다 미발견 → 404 ARRIVAL_STOP_NOT_FOUND
```

- **응답 형식:** 변경 없음. 기존 `BusArrivalResponse` / 지하철 응답 그대로 사용. FE는 stopId가 어느 테이블에 속하는지 모른다.
- **충돌 가능성:** uuid 풀(`gen_random_uuid()`)이 같으므로 두 테이블 row uuid 간 충돌은 무시 가능 (수학적으로 0에 수렴).
- **lookup 순서:** `route_stops` 먼저 (홈/경로 화면이 호출 빈도 높음). 발견 시 즉시 분기, `favorite_stops`는 fallback lookup이라 비용 절감.
- **테스트:** `route_stops` 케이스 회귀 + `favorite_stops` 케이스 정상 + 둘 다 미발견 404 (TASKS T10).

---

## 4. FE 컴포넌트 구조

### 4.1 신규 라우트

```
/                  Home
/setup             SetupRoute (신규 경로)
/setup?routeId=:id SetupRoute (경로 수정 — PRD OQ5 결정 따름)
/routes            RouteManagement (두 섹션: 경로 + 즐겨찾기)
/favorites         Favorites (신규)
/favorites/add     AddFavorite (신규)
```

### 4.2 신규/수정 컴포넌트

#### `<StopName>` (신규, 공용)

`src/components/StopName.tsx`

```tsx
interface StopNameProps {
  name: string                  // 본명
  alias?: string | null         // 별명 (있으면 옆에 작게)
  size?: 'sm' | 'md' | 'lg'     // 카드 크기별 변형
  editable?: boolean            // true면 연필 아이콘 노출
  onEditAlias?: (next: string | null) => void | Promise<void>
}
```

- 본명 옆에 별명을 inline-block으로 작게 표시 (크기 토큰: 본명의 0.75)
- `editable && onEditAlias`이면 우측 연필 아이콘 → 클릭 시 `<AliasEditor>` 열림
- 별명 표시 규칙: 별명만 있고 본명 없는 경우는 없음 (항상 본명이 primary)

> 모든 정류장 자리(홈 도착 카드, 즐겨찾기 카드, 도착 상세 카드, 검색 결과, 내 경로 항목)에서 이 컴포넌트만 사용. 단일 진입점으로 표시 규칙 통제.

#### `<AliasEditor>` (신규)

`src/components/AliasEditor.tsx`

```tsx
interface AliasEditorProps {
  initialValue: string | null
  onSave: (next: string | null) => Promise<void>
  onCancel: () => void
  maxLength?: number            // 기본 20
}
```

- 인라인 input + "저장" + "삭제(휴지통)" + "취소(X)"
- 빈 문자열 저장 → `onSave(null)`로 정규화 후 호출
- 저장/삭제 호출 후 자동 닫힘
- 키보드: Enter = 저장, Esc = 취소

#### `features/favorite/pages/Favorites.tsx`

- 데이터: `useFavoriteStops()` (TanStack Query, key `['favorite-stops']`)
- 빈 상태: 가이드 카피 + `+` 강조 (Home 빈 상태와 동일 톤)
- 카드 리스트: `<FavoriteStopCard>` × N
- 정렬: 길게 누름 → 이동 모드 → 드롭 시 변경된 항목들만 PATCH
  - 본 spec에서 새 dnd 인프라를 처음부터 구축 (PRD D4): 모바일 터치 지원이 필수이므로 `react-dnd-multi-backend` 또는 `react-dnd-touch-backend`(HTML5+Touch dual-backend) 도입. 기존 `react-dnd` + HTML5 backend 단독은 모바일 미지원이라 부적합.
  - SetupRoute의 dnd 제거는 의도적이었으며 백로그 #B3은 무효 처리됨 — 본 spec은 그것과 무관하게 새로 구현.
- 상단 우측 `+` → `/favorites/add`

#### `features/favorite/pages/AddFavorite.tsx`

- 공용 `<UnifiedStopPicker>` (D10) 사용. 별도 검색 UI 직접 보유하지 않음.
- 흐름: `<UnifiedStopPicker>` 완료 payload 수신 → 별명 입력(선택) → POST /favorite-stops → `/favorites` navigate
- 에러 토스트 (BE의 `FAVORITE_ROUTES_REQUIRED` 응답 포함 핸들링)

#### `features/favorite/components/FavoriteStopCard.tsx`

- `<StopName editable>` (별명 인라인 편집 진입점)
- 노선별 도착 정보 (홈 카드와 동일 형식 — `<TransitCard>` 또는 동일 추상화 재사용)
- 카드 우측: 햄버거 메뉴(수정/삭제) — 별도 화면 없이 인라인

#### `features/stop-picker/components/UnifiedStopPicker.tsx` (신규, D10)

> 기존 SDD에 있던 `<StopSearchPanel>` 추출 계획을 **흡수·확장**한다. SetupRoute 수동 검색 + AddFavorite 양쪽에서 동일 컴포넌트를 사용.

```tsx
type StopPickerStep =
  | 'searching'           // 키워드 검색 + 결과 리스트
  | 'resultSelected'      // (bus) 결과 선택됨, 노선 다중 선택 단계
  | 'lineSelecting'       // (subway) 호선 선택 — 환승역만 노출, 단일호선 자동 통과
  | 'directionSelecting'  // (subway) 방향 선택 — 두 종착지 chip
  | 'done'                // payload 산출 완료

interface UnifiedStopPickerProps {
  // 호출자 정책
  busRouteSelectionMode?: 'multi' | 'single'   // 기본 'multi' (즐겨찾기/SetupRoute 모두 다중)
  initialKeyword?: string

  onComplete: (payload: StopPickerPayload) => void | Promise<void>
  onCancel?: () => void
}

interface StopPickerPayload {
  stop: TransitStop                            // 본명/타입/좌표/arsId 등
  routes: StopRoute[]                          // 버스: 다중. 지하철: 1개 노선(subwayCode 포함)
  subway?: {
    subwayCode: string                         // "1001" 등
    lineName: string                           // "1호선"
    direction: {
      updn: 'up' | 'down'
      nextStop: string                         // "남영" — D11: 다음 역명만 저장
      // headsign 없음 — D11: 도착 카드 시점에 매 item.headsign으로 동적 표시
    }
  }
}
```

**상태 머신**

```
searching ─(stop 선택, bus)─▶ resultSelected ─(노선 ≥ 1 체크)─▶ done
            │
            └─(stop 선택, subway)─▶ lineSelecting
                                     │ (lines.length === 1 → 자동 진행)
                                     ▼
                                 directionSelecting ─(방향 선택)─▶ done
```

**에러/폴백 (D10):**
- 호선/방향 정보 fetch 실패 → "방향 정보를 가져올 수 없어요. 그대로 추가하시겠어요?" 확인 → 진행 시 `subway`/`direction` 없이 done payload 산출 (NULL 저장 동작 — legacy fallback 유지).
- 단일 호선역은 `lineSelecting` 자동 통과(시각적으로는 그대로 보여주되 자동 next, 또는 스킵 — UX 결정은 구현 시).
- ODsay 미제공 역(예: 신설역)에 대한 graceful degradation은 위 폴백과 동일.

**SetupRoute 통합 (D10):**
- SetupRoute의 수동 검색 진입점을 이 컴포넌트로 교체. 단, SetupRoute는 한 노드 = 한 stop이므로 done payload 도착 시 `RouteNodeCard` 추가 후 picker는 검색 단계로 자동 리셋(연속 추가 UX 보존).
- 기존 `<StopSearchPanel>` 추출 task(T16)는 본 컴포넌트로 흡수 — 검색만 분리하지 않고 전 단계를 한 컴포넌트로 캡슐화.

**호출 위치:**
- `features/favorite/pages/AddFavorite.tsx`
- `features/setup/pages/SetupRoute.tsx` (수동 검색 분기. route-search 결과로 한 번에 노드들을 추가하는 분기는 영향 없음)

#### `features/route/pages/RouteManagement.tsx` (개편)

- 두 섹션:
  - **내 경로** — 항목 카드 + 활성화 토글 + 항목 탭 → 액션 시트 (수정/삭제/활성)
  - **즐겨찾기** — 항목 카드 + 별명 인라인 편집 + 항목 탭 → 액션 시트 (수정/삭제)
- 항목 메뉴는 `...` 단일 진입점에서 통합 (PRD OQ4 결정)

#### `features/home/pages/Home.tsx` (소폭)

- 상단 경로 칩 영역에 `react-dnd` 적용. 드래그 정렬 → 드롭 시 PATCH

### 4.3 폴더 구조 (after)

```
src/
├── components/
│   ├── ui/
│   ├── BottomNav.tsx
│   ├── StopName.tsx          [NEW]
│   ├── AliasEditor.tsx       [NEW]
│   └── figma/
├── features/
│   ├── home/
│   ├── setup/
│   │   ├── components/
│   │   │   ├── RouteNodeCard.tsx
│   │   │   └── SearchResultNode.tsx
│   │   └── pages/SetupRoute.tsx        [모디파이 — 수동 검색을 UnifiedStopPicker로 교체]
│   ├── stop-picker/                    [NEW — D10 공용 컴포넌트]
│   │   └── components/
│   │       └── UnifiedStopPicker.tsx
│   ├── route/
│   │   ├── components/
│   │   └── pages/RouteManagement.tsx   [모디파이]
│   └── favorite/                       [NEW]
│       ├── components/
│       │   └── FavoriteStopCard.tsx
│       └── pages/
│           ├── Favorites.tsx
│           └── AddFavorite.tsx
├── lib/
│   ├── api.ts                          [+ favorite-stops 함수들]
│   └── ...
└── hooks/                              [선택 — useFavoriteStops 등]
```

---

## 5. 상태 관리 (TanStack Query)

| Key | 용도 | invalidate 트리거 |
|-----|------|------------------|
| `['favorite-stops']` | 즐겨찾기 목록 | POST/PATCH/DELETE favorite-stops |
| `['routes']` | 내 경로 목록 (기존) | PATCH/POST/DELETE routes, PATCH route-stops (별명 변경) |
| `['arrival-info', stopId]` | 도착 정보 (기존) | 변경 없음 |

### 5.1 Optimistic Update 패턴

#### 별명 편집 (`PATCH /route-stops/:id` 또는 `/favorite-stops/:id`)

```
1. 사용자 저장 클릭
2. queryClient.setQueryData(['routes'], oldData → 별명 즉시 반영)
3. mutate (서버 PATCH)
4. onError → rollback + 토스트
5. onSuccess → invalidate (서버 권위 데이터로 재동기화)
```

#### 정렬 변경 (드래그 드롭)

```
1. 사용자 드롭
2. setQueryData로 새 order 즉시 반영
3. mutate — 변경된 항목들만 PATCH (Promise.all)
4. onError → rollback + 토스트
5. onSuccess → invalidate
```

---

## 6. 드래그 정렬 알고리즘

본 spec에서 dnd 인프라를 새로 도입한다 (PRD D4). 후보:
- **`react-dnd-multi-backend`** (권장) — HTML5 + Touch 자동 전환. 모바일/데스크톱 동시 지원.
- **`react-dnd-touch-backend`** — 터치 단일. 데스크톱 미사용 시.

> 기존 `react-dnd` + `react-dnd-html5-backend` 단독은 모바일 터치 미지원이라 그대로 사용하지 않는다. SetupRoute의 dnd 제거는 의도적 결정이었음 — 백로그 #B3은 무효 처리됨. 본 spec의 정렬 기능은 위 새 인프라 위에서 처음부터 구현한다.

### 6.1 변경 항목 계산

```
oldOrder: [A, B, C, D, E]   (display_order: 0,1,2,3,4)
newOrder: [A, D, B, C, E]   (드래그 후)
            ↑    ↑
         바뀐 항목만 PATCH

변경된 항목:
  D: 3 → 1
  B: 1 → 2
  C: 2 → 3
```

### 6.2 PATCH 호출

```ts
const changed = computeOrderDiff(oldOrder, newOrder)
await Promise.all(
  changed.map(item =>
    api.patchFavoriteStop(item.id, { displayOrder: item.newOrder })
  )
)
queryClient.invalidateQueries(['favorite-stops'])
```

> 이동 중 매 step마다 PATCH 하지 않음. 드롭 시점 한 번만.

---

## 7. 별명 표시 일관 규칙 (구현 체크리스트)

`<StopName>` 컴포넌트가 그려져야 하는 자리 (모두 동일 컴포넌트):

- [ ] `Home.tsx` — 도착 상세 카드 헤더
- [ ] `Home.tsx` — 다음 스텝 미니 카드
- [ ] `Home.tsx` — accordion 펼친 상세
- [ ] `Favorites.tsx` — 즐겨찾기 카드 헤더
- [ ] `RouteManagement.tsx` — 경로 항목 카드 (각 정류장 미리보기)
- [ ] `RouteManagement.tsx` — 즐겨찾기 항목 카드
- [ ] `SetupRoute.tsx` — 추가된 노드 카드
- [ ] `SetupRoute.tsx` — 검색 결과 항목 (검색 단계에서는 별명 없음 — 새로 추가하는 시점이라서. 빈 상태로 컴포넌트만 통일)
- [ ] `AddFavorite.tsx` — 검색 결과 + 선택된 정류장 미리보기

**편집 가능한 자리** (`editable` prop true):
- 모든 카드 자리에서 편집 허용 (단, 검색 결과는 제외 — 아직 저장 전이라 alias 대상 row가 없음)

---

## 8. 라우팅 변경

### 8.1 BottomNav 변경

```
Before:
  Home (/)
  경로 등록 (/setup)
  내 경로 (/routes)

After:
  Home (/)
  즐겨찾기 (/favorites)
  내 경로 (/routes)
```

`+` 진입점:
- Home 상단: `/setup` (경로 추가) — 기존 동작 유지
- Favorites 상단: `/favorites/add`
- RouteManagement: 추가 진입점 없음 (PRD §3 합의)

### 8.2 SetupRoute의 편집 모드

`SetupRoute?routeId={id}` 또는 `/setup/:routeId` (라우터 컨벤션 따름).

- 진입 시 GET /routes/:id로 기존 데이터 prefill
- 저장 시 PATCH /routes/:id (또는 PUT — §3.5 결정 따름) 호출
- "경로 수정 중" 헤더 표시

---

## 9. provider 매핑 (즐겨찾기)

경로 저장과 동일하게 `_shared/regionMapper`/`resolveStopProvider` 재사용.

```
POST /favorite-stops
  ├─ for each stop (here: 1개) :
  │   ├─ detectRegion(lat, lng)
  │   ├─ region=gyeonggi → findGbisStationFromDB → verifyMapping
  │   └─ provider 결정 → favorite_stops.provider 저장
  └─ for each route (favorite_stop_routes):
      ├─ routeIdToProvider(odsay_route_id 첫 자리)
      └─ favorite_stop_routes.provider 저장
```

> 기존 `routes` POST와 동일 헬퍼만 재사용. 별도 알고리즘 신설 없음.

---

## 10. 테스트 전략

### 10.1 BE (deno test)

- `favorite-stops_test.ts`
  - GET 정상 / 401 / 빈 목록
  - POST 정상 / 400 (필수 필드 누락) / 401
  - **POST 노선 0개 reject (PRD D5) — `routes: []` 또는 누락 시 400 `FAVORITE_ROUTES_REQUIRED`**
  - POST provider 매핑 검증 (서울 / 경기 / fallback 케이스)
  - POST 별명 빈 문자열 → null 정규화
  - PATCH alias / displayOrder / routes 각각
  - **PATCH 노선 0개 reject (PRD D5) — `routes: []` 시 400 `FAVORITE_ROUTES_REQUIRED`**
  - PATCH 빈 문자열 alias → null
  - DELETE 정상 / 404 / 401 / RLS 위반 (다른 사용자 id)
  - OPTIONS preflight
- `routes_patch_test.ts` (확장)
  - PATCH name / displayOrder / active 각각 (active는 PRD D2 신설 컬럼)
  - PATCH active=false → GET 응답에 active 필드 false로 반영
  - PATCH stops로 전체 교체 (provider 재매핑)
- `route-stops_patch_test.ts` (신규)
  - alias 변경 정상 / 401 / 다른 사용자 RLS 위반 / 빈 문자열 정규화
- `arrival-info_test.ts` (확장)
  - stopId가 favorite_stops를 가리키는 케이스 → 정상 응답
  - stopId가 둘 다 없는 케이스 → 404 ARRIVAL_STOP_NOT_FOUND
- `subway-station-directions_test.ts` (D11 — 신규)
  - 정상 — `directions: [{updn:'up',nextStop}, {updn:'down',nextStop}]` 형태로 1~2개 반환
  - 종착역 케이스 — `directions.length === 1` (한 방향만 존재)
  - `stationId` 누락 → 400
  - 존재하지 않는 stationId → 404 `STATION_NOT_FOUND`
  - 외부 ODsay API 장애 → 502 `ARRIVAL_PROVIDER_ERROR`
  - OPTIONS preflight
  - 응답에 `stationName`/`lineName`/`subwayId`/`directions` 모두 포함 검증
- ~~`subway-line-headsigns_test.ts` (옵션 A 시간표 캐시) — 폐기 (D11)~~
- ~~`sync-subway-headsigns_test.ts` (cron) — 폐기 (D11)~~

### 10.2 FE (수동 QA — vitest 도입 전)

PRD §6 성공 지표 + 별명 표시 8개 자리 체크리스트 (§7).

---

## 11. 마이그레이션 순서

1. T1 마이그레이션 적용 (`favorite_stops`, `favorite_stop_routes`)
2. T2 마이그레이션 적용 (`route_stops.alias`)
3. T3 마이그레이션 적용 (`routes.display_order` + 백필 SQL)
4. **T3-a 마이그레이션 적용 (`routes.active` + backfill `UPDATE routes SET active = true`) — PRD D2 신설**
5. BE 신규 EF 배포 (`favorite-stops`, `route-stops PATCH`, `routes PATCH`, **`subway-station-directions` — D11**)
6. FE 배포 — `<StopName>` 도입 + 즐겨찾기 페이지 + RouteManagement 개편
7. 사용자 검증 → 한 사이클 후 PUT /routes는 deprecated 안내 (선택)

> **D11 추가 (2026-05-08):** `subway_line_headsigns` 캐시 테이블/cron 마이그레이션은 폐기. ODsay `subwayStationInfo` 단일 호출로 `subway-station-directions` endpoint가 prev/next 다음 역 1개씩 반환하므로 DB 스키마 변경/cron 신설 없음.

---

## 12. 결정 사항 (2026-05-08 확정)

PRD §8 결정 사항(D1~D9)이 정답. 본 SDD는 그것을 따른다. 이전 OQ-S1 ~ OQ-S5는 다음과 같이 처리:

- **OQ-S1 (`routes.active` 컬럼) → 결정 D2:** **신규 추가 확정.** §2.5 마이그레이션 명세 + §3.5 PATCH active 처리.
- **OQ-S2 (검색 결과 별명 미리보기) → 결정 D3:** **보여주지 않음 확정.** 별명은 컨텍스트별 분리. 검색 결과는 ODsay 응답 그대로. 추가 후 카드에서만 표시.
- **OQ-S3 (PATCH routes 전체 교체 vs add/remove):** 그대로 — 단순함 우선 전체 교체. 단 빈 배열은 reject (D5).
- **OQ-S4 (별명 길이 20자):** 그대로 — 표시 컴포넌트에서 ellipsis 처리.
- **OQ-S5 (즐겨찾기 새로고침 단위):** 그대로 — 페이지 전체.

### 별명 컨텍스트 분리 (D3 명시)

같은 정류장이 경로/즐겨찾기 양쪽에 있을 때:
- `route_stops.alias`와 `favorite_stops.alias`는 **별도 컬럼, 별도 값**.
- 한쪽 변경이 다른 쪽에 자동 반영되지 않음 (의도적).
- 사용자는 같은 정류장에 컨텍스트별 다른 별명을 줄 수 있음 (예: 경로에선 "회사 앞", 즐겨찾기에선 "점심 정류장").
- BE/FE 모두 동기화 시도하지 않음. 검색 결과에 별명 미리보기 없음.

### 공용 StopPicker + 지하철 호선/방향 선택 (D10 명시)

- `<UnifiedStopPicker>` 하나가 AddFavorite와 SetupRoute(수동 검색)를 모두 담당. 별도 검색 패널 추출 task(T16)는 본 컴포넌트로 흡수.
- 지하철역 결과 선택 시 호선 선택 → 방향 선택 단계가 추가됨. 단일호선역은 호선 단계 자동 통과.
- 한 카드/노드 = 한 호선 + 한 방향. 환승역에서 두 호선 단골은 별개 카드/노드 두 개로 등록(N6 비목표 유지).
- BE는 호선/방향 정보를 신규 `GET /subway-station-directions`로 제공 (D11). 옵션 A(`/subway-line-headsigns` cron)/옵션 C(정적 매핑)는 폐기.
- 정보 미제공/외부 장애 시 FE는 NULL 저장 graceful fallback (legacy 동작) — 흐름이 막히지 않음.
- 기존 NULL 저장 row는 자동 백필 안 함. 사용자 재등록 시점에만 정확한 값으로 갱신.

### 양방향 다음 역 1개씩 + 종착지 동적 노출 (D11 명시)

- 호선의 양방향 종착지 N개 표시 → **양방향 다음 역 1개씩**으로 단순화. 두 칩 (예: "시청 방향(상행)" / "남영 방향(하행)").
- 데이터 출처: ODsay `subwayStationInfo`의 `prevOBJ`/`nextOBJ` (단일 호출, prev/next 한 칸씩). 새 cron/캐시 테이블 불필요.
- 새 endpoint: `GET /subway-station-directions?stationId=` (D11 채택안). 응답 형식은 §3.7-pre 참조.
- 저장 모델:
  - `directionUpdn`: `'up'` 또는 `'down'`
  - `directionNextStop`: 다음 역명 (예: "남영")
  - `directionHeadsign`: **NULL** (저장 안 함)
- 종착지(headsign)는 도착 카드에서 매 item의 `headsign`(2026-05-08 BE 작업으로 이미 동봉)으로 동적 표시. "인천행 3분 후 / 동인천행 8분 후 / 서동탄행 14분 후" 형태로 자연스럽게 노출.
- 종착역 케이스: ODsay `prevOBJ` 또는 `nextOBJ`만 존재 → `directions.length === 1`.
- 매칭 흐름은 기존 `matchSubwayItems`의 `directionUpdn` 필터링 그대로 — 변경 없음.
