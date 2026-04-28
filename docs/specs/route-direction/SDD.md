# SDD — 경로 방향 정보 (route-direction)

- **상태:** 구현 완료 (2026-04-28) — Phase 1·2·3 완료, Phase 4 문서 정리 완료. Open Questions 검증은 `when_come_be/docs/tech-notes/route-direction-open-questions.md`에서 진행
- **작성일:** 2026-04-28
- **최근 갱신:** 2026-04-28
- **관련:** `PRD.md`, `TASKS.md`, `docs/api/contracts/route-direction-design.md`, `docs/decisions/ADR-001`

---

## 1. 시스템 다이어그램 (변경 부분만)

```
┌─────────────┐                                ┌──────────────────────┐
│ ODsay       │     subPath.way / wayCode      │ route-search (BE)    │
│ /searchPub  │ ──────────────────────────────▶│ + way / wayCode 매핑 │
└─────────────┘                                └──────────────────────┘
                                                          │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │ FE SetupRoute    │
                                                 │ wayCode→updn 변환 │
                                                 │ way→headsign 합성 │
                                                 └──────────────────┘
                                                          │
                                                          ▼  POST /routes
                                              ┌────────────────────────┐
                                              │ routes (BE)            │
                                              │ direction_* 저장        │
                                              └────────────────────────┘
                                                          │
                                                          ▼
                                       ┌─────────────────────────────────┐
                                       │ route_stops                     │
                                       │ + direction_headsign            │
                                       │ + direction_updn (CHECK)        │
                                       │ + direction_next_stop           │
                                       └─────────────────────────────────┘
                                                          │
                                                          ▼  GET /routes
                                              ┌────────────────────────┐
                                              │ FE Home                │
                                              │ matchSubwayArrival     │
                                              │ headsign 배지 / 필터    │
                                              └────────────────────────┘
                                                          ▲
                                                          │
                              ┌─────────────────────┐     │
                              │ 서울 지하철 API       │     │ (BE arrival-info: 변경 없음)
                              │ realtimeStation     │ ────▶
                              └─────────────────────┘
```

---

## 2. BE 변경 상세

### 2.1 `_shared/odsayClient.ts` — `OdsaySubPath` 타입 확장

```ts
export interface OdsaySubPath {
  trafficType: number
  sectionTime: number
  startName?: string
  startID?: number
  startArsID?: string
  endName?: string
  endID?: number
  endArsID?: string
  way?: string         // 신규 — 노선 종점역명 (지하철 only)
  wayCode?: number     // 신규 — 1=상행/내선, 2=하행/외선 (지하철 only)
  lane?: OdsayLane[]
}
```

> ODsay raw 응답에 그대로 매핑. 미제공 시 `undefined`.

### 2.2 `route-search/index.ts` — 응답 DTO 확장

```ts
interface RouteSegment {
  type: "subway" | "bus"
  sectionMinutes: number
  startName: string
  startOdsayId: number | null
  startArsId: string | null
  endName: string
  endOdsayId: number | null
  endArsId: string | null
  way: string | null         // 신규
  wayCode: 1 | 2 | null      // 신규
  lines: RouteSegmentLine[]
}
```

매핑:
```ts
way: sub.way ?? null,
wayCode: sub.wayCode === 1 || sub.wayCode === 2 ? sub.wayCode : null,
```

> 버스 segment에서도 같은 스키마로 두되, 항상 `null`.

### 2.3 마이그레이션

파일명(예시): `supabase/migrations/20260428000000_add_direction_to_route_stops.sql`

내용 (텍스트 명세):

```sql
alter table route_stops
  add column if not exists direction_headsign  text,
  add column if not exists direction_updn      text,
  add column if not exists direction_next_stop text;

alter table route_stops
  add constraint route_stops_direction_updn_chk
  check (direction_updn is null or direction_updn in ('up','down'));

comment on column route_stops.direction_headsign  is
  '지하철 진행 방향 헤드사인 (예: "장암행"). subway stop만 사용.';
comment on column route_stops.direction_updn      is
  '상/하행 정규화 (up/down). 서울 지하철 updnLine: 상행/내선→up, 하행/외선→down.';
comment on column route_stops.direction_next_stop is
  'ODsay route-search subPath.endName (환승/하차역명, 디버그/감사용).';
```

- 인덱스 추가 없음 (필터는 FE)
- 기존 row 모두 NULL 허용 → no-op

### 2.4 `routes/index.ts` — POST 입력·GET 출력 확장

**Request DTO:**
```ts
interface RouteStopInput {
  // ... 기존
  arsId?: string
  directionHeadsign?: string | null
  directionUpdn?: 'up' | 'down' | null
  directionNextStop?: string | null
  stopRoutes: StopRouteInput[]
}
```

**`createRoute` insert 시:**
```ts
const stopsPayload = stops.map((s) => ({
  route_id: route.id,
  odsay_stop_id: s.odsayStopId,
  stop_name: s.stopName,
  stop_type: s.stopType,
  sequence: s.sequence,
  ars_id: s.arsId ?? null,
  direction_headsign: s.directionHeadsign ?? null,
  direction_updn:
    s.directionUpdn === 'up' || s.directionUpdn === 'down' ? s.directionUpdn : null,
  direction_next_stop: s.directionNextStop ?? null,
}))
```

> `directionUpdn` 검증: `'up' | 'down'` 외 값은 null로 저장 (방어).

**`listRoutes` select 절:**
```sql
... route_stops (
  id, odsay_stop_id, stop_name, stop_type, sequence, ars_id,
  direction_headsign, direction_updn, direction_next_stop,
  stop_routes (...)
)
```

### 2.5 BE 테스트 보강 (TDD)

**route-search_test.ts:**
- 지하철 subPath에 `way: "장암"`, `wayCode: 1` 포함된 ODsay 응답 → 응답 segments[0]에 `way === "장암"`, `wayCode === 1`
- `wayCode`가 `0` 또는 누락된 경우 → `null`
- 버스 segment → `way === null`, `wayCode === null`

**routes_test.ts:**
- POST: `directionHeadsign`/`directionUpdn`/`directionNextStop` 포함 페이로드 → DB insert mock에 해당 값 전달 검증
- POST: 잘못된 `directionUpdn` (`"left"`) → null 저장 (or 400, 결정 필요. 본 SDD는 **null로 저장**(방어적))
- GET: route_stops에 direction_* 포함된 mock → 응답에 그대로 노출

---

## 3. FE 변경 상세

### 3.1 타입 (`src/types/api.ts`)

```ts
export interface ApiRouteSegment {
  // ... 기존
  endArsId?: string | null
  way?: string | null         // 신규
  wayCode?: 1 | 2 | null      // 신규
  lines: ApiRouteLine[]
}

export interface ApiRouteStop {
  // ... 기존
  ars_id?: string | null
  direction_headsign?: string | null  // 신규
  direction_updn?: 'up' | 'down' | null  // 신규
  direction_next_stop?: string | null  // 신규
  stop_routes: ApiStopRoute[]
}
```

### 3.2 저장 페이로드 타입 (`src/lib/api.ts`)

```ts
export interface SaveRouteStop {
  odsayStopId: string
  stopName: string
  stopType: 'bus' | 'subway'
  sequence: number
  arsId?: string
  directionHeadsign?: string | null
  directionUpdn?: 'up' | 'down' | null
  directionNextStop?: string | null
  stopRoutes: Array<{...}>
}
```

### 3.3 SearchResultNode / RouteNode 데이터 모델 확장

`SearchNodeData`(검색 결과)와 `RouteNode`(추가된 노드)에 다음 필드 추가:

```ts
way?: string | null
wayCode?: 1 | 2 | null
endName?: string | null   // ODsay subPath.endName 그대로
```

`SetupRoute.apiRouteToSearchResult`에서 segment의 `way`/`wayCode`/`endName`을 `SearchNodeData`에 그대로 실음 (지하철에 한해).

### 3.4 SetupRoute.handleSave — 저장 페이로드 빌드

```ts
function wayCodeToUpdn(wayCode: 1 | 2 | null | undefined): 'up' | 'down' | null {
  if (wayCode === 1) return 'up'
  if (wayCode === 2) return 'down'
  return null
}

const stops = nodes.map(node => ({
  odsayStopId: node.stopId ?? node.id,
  stopName: node.name,
  stopType: node.type,
  sequence: node.order,
  arsId: node.arsId,
  ...(node.type === 'subway' && {
    directionHeadsign: node.way ? `${node.way}행` : null,
    directionUpdn: wayCodeToUpdn(node.wayCode),
    directionNextStop: node.endName ?? null,
  }),
  stopRoutes: /* 기존 그대로 */,
}))
```

### 3.5 mappers.ts — direction_* 보존

```ts
export function mapApiRoute(route: ApiRoute): SavedRoute {
  return {
    // ...
    segments: route.route_stops
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map(stop => ({
        id: stop.id,
        order: stop.sequence,
        stop: {
          // ... 기존
          directionHeadsign: stop.direction_headsign ?? null,
          directionUpdn: stop.direction_updn ?? null,
          directionNextStop: stop.direction_next_stop ?? null,
        },
      })),
  }
}
```

`TransitStop` 타입 (`src/lib/mockData.ts`)에도 동일 필드 옵셔널 추가.

### 3.6 arrival.ts — 매칭 로직

```ts
function mapsUpdnLineToCode(updnLine: string): 'up' | 'down' | null {
  if (updnLine === '상행' || updnLine === '내선') return 'up'
  if (updnLine === '하행' || updnLine === '외선') return 'down'
  return null
}

function matchSubwayItems(
  items: ApiSubwayArrivalItem[],
  line: string,
  direction: { headsign: string | null; updn: 'up' | 'down' | null },
): ApiSubwayArrivalItem[] {
  const sameLine = items.filter(i => i.lineName === line)
  const filtered = sameLine.filter(i => {
    const okUpdn = !direction.updn ? true : mapsUpdnLineToCode(i.updnLine) === direction.updn
    const okHead = !direction.headsign ? true : i.direction.startsWith(direction.headsign)
    return okUpdn && okHead
  })
  // 매칭 0건 → 호선 일치 전체로 fallback
  return filtered.length > 0 ? filtered : sameLine
}
```

기존 `getRawArrmsg` / `getArrivalDisplay` / `getArrivalMin`이 호출되는 시그니처에 `stop`이 이미 들어오므로, `stop.directionHeadsign`/`stop.directionUpdn`을 읽어 위 함수에 전달.

또한 **카드 표시 규칙 변경**: 현재는 같은 item의 `arrmsg1`/`arrmsg2`를 두 줄로 보여주는데, 이를 **상위 2개 item의 `arrmsg1`만 사용**하도록 한다.
- 호선당 2건까지 (현재 차량 + 다음 차량)
- 두 번째 줄은 두 번째 매칭 item의 `arrmsg1`을 표시 (없으면 숨김)

### 3.7 Home.tsx — 헤드사인 배지

각 호선 row 옆에 (지하철일 때만) `direction_headsign`이 있으면 배지로 표시:
```tsx
{stop.directionHeadsign && (
  <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#F1F3F5] text-[#6B7280]">
    {stop.directionHeadsign}
  </span>
)}
```

매칭 결과 0건이고 fallback으로 동작하는 경우 카드 헤더에 작은 inline 안내:
```tsx
{!stop.directionUpdn && !stop.directionHeadsign && stop.type === 'subway' && (
  <div className="text-[11px] text-[#9CA3AF]">
    방향 정보 없음 — 경로를 다시 등록하면 더 정확해요
  </div>
)}
```

---

## 4. 호환성 / 마이그레이션

| 항목 | 처리 |
|------|------|
| 기존 BE 호출 (구 클라이언트) | 신규 필드는 옵셔널이라 무시됨 — OK |
| 기존 저장 경로 (방향 NULL) | FE 매칭 fallback → 호선 일치 전체 표시 + 안내 메시지 |
| 신규 BE + 구 FE | GET 응답의 신규 필드는 구 FE에서 무시됨 — OK |
| 구 BE + 신규 FE (이론상) | 신규 필드 없음 → FE는 모두 `undefined`로 처리, fallback 동작 — OK |

---

## 5. 테스트 전략

### BE (Deno)
- route-search: way/wayCode 매핑 테스트 3건 (있음/없음/버스)
- routes: direction_* 입력 저장, GET 출력 노출, 잘못된 updn 방어
- 모두 happy + edge 케이스

### FE
- 테스트 인프라 없음 → 수동 QA 시나리오 (TASKS에 명시):
  1. 석남(거북시장) 7호선 부평구청 방향 등록 → 부평구청 방향만 노출
  2. 강남역 2호선 외선 등록 → 외선 차량만 노출
  3. 기존 저장 경로(방향 NULL) → 전체 표시 + 안내 노출
  4. 분기 노선(도봉산행 vs 장암행) → 헤드사인으로 구분

---

## 6. 롤아웃

1. 마이그레이션 적용 (다운타임 없음)
2. BE 배포 (route-search + routes)
3. FE 배포
4. (선택) 사용자에게 "기존 경로 재등록 권장" 토스트 안내

각 단계는 독립적이며 추가 필드는 옵셔널이라 단계간 부분 배포에도 안전.

---

## 7. 참고

- 매칭/엣지 케이스 상세: `docs/api/contracts/route-direction-design.md`
- 저장 모델 결정 근거: `docs/decisions/ADR-001-subway-direction-model.md`
