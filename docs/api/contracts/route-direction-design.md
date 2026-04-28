# Route Direction — API 계약 / 데이터 모델 설계

> 작성일: 2026-04-28  
> 최근 갱신: 2026-04-28  
> 상태: 구현 완료 (2026-04-28) — Phase 1·2·3·4 완료. Open Questions QA 검증은 `when_come_be/docs/tech-notes/route-direction-open-questions.md`에서 진행  
> 관련: `ADR-001-subway-direction-model.md`, `docs/specs/route-direction/`, `when_come_be/docs/tech-notes/route-direction-open-questions.md`

## 0. TL;DR

저장된 경로의 도착 정보를 표시할 때 **방향(direction) 정보가 빠져 있어** 사용자가 "내가 타야 할 차"를 매번 판단해야 하는 문제가 있다.

- **버스**는 ARS ID가 방향별로 분리되므로 추가 작업 없이 단방향이다(현재 동작 유지).
- **지하철**은 같은 역명에 양방향이 동시 도착하므로 명시적 저장이 필요하다.

본 설계는 **`route_stops`에 두 개의 컬럼(`direction_headsign`, `direction_updn`)을 추가**하고, **저장 단계에서 ODsay route-search의 `endName`(=종착·다음 정거장 이름)과 `wayCode`를 함께 보존**한다. 도착 매칭은 **FE에서 수행**한다(BE는 서울 지하철 API 응답을 그대로 프록시).

---

## 1. 각 외부 API의 "방향" 표현 정리

### 1.1 ODsay `searchPubTransPathT` (route-search) — 지하철 subPath

ODsay 공식 응답에서 지하철 구간(`trafficType: 1`)의 subPath에 들어오는 방향 관련 필드:

| 필드 | 타입 | 의미 | 비고 |
|------|------|------|------|
| `startName` | string | 승차역명 | 예: `"석남"` |
| `startID` | number | ODsay 정류장 ID | |
| `endName` | string | 환승/하차역명 | **이 노선에서 사용자가 내릴 다음 역** — 방향 추정 핵심 |
| `endID` | number | ODsay 정류장 ID | |
| `wayCode` | number | 1=상행/내선, 2=하행/외선 | ODsay subPath 레벨 필드. 일부 케이스 누락 가능 |
| `way` | string | 종착역명 (path 종착 아님, 노선 종점) | 예: `"장암"`, `"석남"` — 옵션, 미제공 케이스 있음 |
| `door` | string | 하차문 정보 | 방향 결정에는 무관 |
| `lane[].name` | string | 호선 표기 (`"수도권 7호선"`) | |
| `lane[].subwayCode` | number | ODsay 호선 코드 | |

> **확인 필요(BE 구현 시점):** ODsay 응답에 `way`/`wayCode`가 모든 path에 들어오는지, 광역(GTX/신분당) 같은 노선에서도 일관된지 실제 호출 후 검증한다. 현재 `OdsaySubPath` 타입(`when_come_be/_shared/odsayClient.ts`)에는 두 필드가 정의돼 있지 않으므로, **신규 필드 추가가 첫 단계**이다.

**핵심 인사이트:** `endName`은 **사용자가 입력한 출/도착지 좌표 사이에서 내릴 환승/하차역**이며, 실제 노선 종점이 아니다. 따라서 `endName`만으로는 헤드사인(`"장암행"`)을 만들 수 없다 — 환승역 정보가 종점은 아니기 때문. 다만 **방향(상/하행)은 100% 결정**되므로, 매칭에는 충분하다.

### 1.2 ODsay `searchStation` (search-stops)

응답에는 정류장 자체 메타데이터만 있고 방향 정보는 없다. **이 단계에서 방향을 결정하는 것은 불가능** — 정류장 검색 시점엔 사용자가 어느 방향으로 갈지 모르므로 자연스럽다.

```json
{ "stationID": 87103, "stationName": "개봉역", "type": 2, "arsID": "21003" }
```

→ 결론: 방향 필드는 search-stops 응답에 추가하지 않는다.

### 1.3 서울 지하철 `realtimeStationArrival`

BE `arrival-info?type=subway`가 그대로 매핑하는 필드:

| 응답 필드 | 매핑된 FE 필드 | 예시 | 의미 |
|-----------|---------------|------|------|
| `subwayId` | `lineName` | `"1007"` | 호선 코드 (route-search `subwayCode`와 직접 비교 가능) |
| `trainLineNm` | `direction` | `"장암행 - 산곡방면"` | "행선지(종점) - 직전 주요역" 형태 |
| `arvlMsg2` | `arrmsg1` | `"2분 40초 후"` / `"전역 출발"` / `"도착"` | 도착 텍스트 |
| `arvlMsg3` | `arrmsg2` | `"서초"` | 직전 정차역명 (= 현재 열차가 어디 있는지) |
| `updnLine` | `updnLine` | `"상행"` / `"하행"` / `"내선"` / `"외선"` | 방향 코드 |

**파싱 가능한 부분:**
- `trainLineNm`은 `"{종점}행 - {방면}방면"` 패턴 → `headsign = "장암행"`, `via = "산곡"` 분리 가능
- `updnLine`은 정규화된 enum (4개 값) — 가장 안정적인 매칭 키

### 1.4 서울 버스 API (`getStationByUid`, `getRouteByStation`)

| 응답 필드 | 의미 |
|-----------|------|
| `arsId` | 5자리 정류장 고유번호 — **양방향 정류장이 별개 ARS로 분리됨** |
| `busRouteId` | 노선 ID (양방향 공통, 같은 노선이면 동일) |
| `busRouteAbrv` | 노선 약칭 |
| `direction` | (응답에 없음) |

→ 결론: **버스는 `arsId`만 저장하면 자연스럽게 단방향**. 추가 방향 필드 불필요.

### 1.5 매칭 매트릭스

| 저장 후보 | route-search에 있나 | arrival 응답과 매칭 가능한가 |
|-----------|---------------------|------------------------------|
| 종점 헤드사인 (`"장암행"`) | △ `way` 필드, 부정확 가능 | ◎ `trainLineNm`에 부분 일치 (`startsWith`) |
| 다음 역 이름 (`endName`) | ◎ 항상 존재 | ✗ 직접 매칭 안 됨 (도출용) |
| 상/하행 (`wayCode` → `updn`) | △ `wayCode` 필드, 일부 누락 가능 | ◎ `updnLine`과 직접 매핑 |
| 종점역 ODsay station ID | ✗ subPath endID는 환승역, 종점 아님 | ✗ |

---

## 2. 저장 모델 결정

### 2.1 옵션 비교

#### A. 헤드사인 텍스트만 저장 (`headsign: "장암행"`)
- **장점:** arrival API의 `trainLineNm`과 직접 부분 일치 — 매우 정확
- **단점:** ODsay route-search가 종점명을 항상 주는지 불명확. 본선/지선 분기(7호선 도봉산행 vs 장암행)에서 `endName`이 종점이 아닐 때 자체 도출 불가
- **quirky 케이스:** 2호선 순환선은 헤드사인이 `"성수행"`/`"신도림행"` 식으로 모호 — 동일 역에서 같은 방향으로도 다른 헤드사인 가능

#### B. 다음 역 이름만 저장 (`next_stop_name: "산곡"`)
- **장점:** ODsay `endName`(승하차 사이의 다음 환승/하차역)에서 항상 추출 가능. 직관적
- **단점:** arrival API 응답과 직접 매칭 안 됨 — `trainLineNm`/`updnLine`에 다음 역 정보가 없음. 별도 노선 좌표 DB 필요 (보유 안 함)
- **quirky:** 환승역에서는 `endName`이 환승역이고, 사용자는 그 환승역 이전에 내리지 않으므로 방향성은 보존

#### C. 상/하행 코드만 저장 (`updn: "up" | "down"`)
- **장점:** 매우 단순, `updnLine` 직접 매핑 (`"상행"→"up"`, `"하행"→"down"`, `"내선"→"up"`, `"외선"→"down"`이 통상)
- **단점:** 2호선 본선/성수지선/신정지선 → 같은 "상행"이라도 의미 다름. 그러나 사용자가 등록한 역에서는 거의 항상 1방향만 유효
- **quirky:** 내/외선 매핑이 노선마다 약간 다를 수 있음(2호선 외선=시계반대=신도림→성수). ODsay `wayCode`가 1/2 → 내/외선으로 변환되는 규칙은 노선별 검증 필요

#### D. **헤드사인 + 상하행 + 다음역 조합 (권장)**
- **저장:** `direction_headsign` (텍스트, nullable), `direction_updn` (`"up"|"down"`, nullable), `direction_next_stop` (텍스트, nullable, 디버그/감사용)
- **매칭 규칙 (FE):**
  1. `direction_updn` 있으면 `updnLine` 매핑하여 비교 (1차)
  2. `direction_headsign` 있으면 `trainLineNm.startsWith(headsign)` 비교 (2차 보강)
  3. 둘 다 매칭되는 결과만 표시. 한쪽만 있으면 그것만 사용
- **fallback:** 모두 null이면 기존처럼 전체 표시 (legacy 데이터 호환)

### 2.2 결정: **옵션 D 채택**

이유:
1. `wayCode`가 누락되더라도 헤드사인으로 보강 가능, 반대도 마찬가지 → 단일 키 옵션보다 robust
2. 2호선 순환·7호선 분기 등 quirky 케이스 모두 커버 (둘 중 하나는 살아남음)
3. 추가 컬럼 비용은 작고(text 2~3개), nullable이라 마이그레이션 안전
4. 도착 매칭이 1차 필터(updn) → 2차 필터(headsign)로 단계적이라 디버깅 용이

ADR에 결정 근거 상세 기록 → `docs/decisions/ADR-001-subway-direction-model.md`.

---

## 3. 데이터 흐름 설계

```
[search-stops]                — 방향 정보 없음 (정류장 메타데이터만)
       ↓
[route-search]                — ODsay subPath의 endName/wayCode/way를 보존하여 응답에 추가
       ↓
[SetupRoute (FE)]             — 사용자가 경로를 선택 → 지하철 stop에 한해 방향 필드 채움
       ↓
[POST /routes]                — direction_headsign / direction_updn / direction_next_stop 저장
       ↓
[GET /routes]                 — route_stops에 방향 필드 포함하여 반환
       ↓
[arrival-info?type=subway]    — 그대로 (BE 변경 없음, 전체 도착 목록 반환)
       ↓
[Home (FE)]                   — 저장된 방향과 arrival 응답을 매칭하여 필터
```

### 3.1 단계별 변경

#### a) `search-stops` — **변경 없음**
정류장 검색 시점엔 방향이 미정. 응답 형태 유지.

#### b) `route-search` — 응답에 방향 필드 추가 (소규모 BE 변경)

**현재 응답:**
```json
{
  "type": "subway",
  "startName": "석남(거북시장)",
  "startOdsayId": 217001144,
  "endName": "산곡",
  "endOdsayId": 217001143,
  "lines": [{ "routeName": "수도권 7호선", "subwayCode": "1007", ... }]
}
```

**변경 후 (지하철 segment에 한정해서 의미 있음, 버스도 동일 스키마이지만 null):**
```json
{
  "type": "subway",
  "startName": "석남(거북시장)",
  "endName": "산곡",
  "way": "장암",
  "wayCode": 2,
  "lines": [...]
}
```

| 신규 필드 | 타입 | 의미 |
|-----------|------|------|
| `way` | `string \| null` | ODsay `subPath.way` (노선 종점역명, 미제공 가능) |
| `wayCode` | `1 \| 2 \| null` | ODsay `subPath.wayCode` (1=상행/내선, 2=하행/외선) |

> 버스 segment에서는 두 필드 모두 `null`로 둔다(어차피 ARS로 단방향 처리되므로 사용 안 함).

#### c) `SetupRoute` (FE) — 저장 페이로드 빌드

`apiRouteToSearchResult`가 `SearchNodeData`에 `way`/`wayCode`를 함께 실어서, `RouteNode`로 그대로 전달. `handleSave`에서 다음과 같이 매핑:

```ts
const directionUpdn = nodeWayCodeToUpdn(node.wayCode)  // 1→'up', 2→'down', null→null
const directionHeadsign = node.way ? `${node.way}행` : null
const directionNextStop = node.endName ?? null   // 환승·하차역명, 디버그용
```

**버스 stop**에서는 세 필드 모두 미전송(BE에서 nullable로 저장).

#### d) `POST /routes` 요청 DTO — `RouteStopInput` 확장

```ts
interface RouteStopInput {
  odsayStopId: string
  stopName: string
  stopType: 'bus' | 'subway'
  sequence: number
  arsId?: string

  // ─── 신규 (subway only, 모두 optional) ─────────
  directionHeadsign?: string | null  // 예: "장암행"
  directionUpdn?: 'up' | 'down' | null
  directionNextStop?: string | null  // 예: "산곡"

  stopRoutes: StopRouteInput[]
}
```

BE는 받은 값을 `route_stops` 테이블의 신규 컬럼에 그대로 저장. 검증은 "subway일 때 셋 중 적어도 하나는 권장(경고만, reject 안 함)" 정도. legacy 호환을 위해 reject하지 않는다.

#### e) `GET /routes` 응답 — `ApiRouteStop`에 필드 추가

```ts
interface ApiRouteStop {
  // ... 기존
  ars_id?: string | null
  direction_headsign?: string | null   // 신규
  direction_updn?: 'up' | 'down' | null  // 신규
  direction_next_stop?: string | null  // 신규 (디버그용, FE 노출 선택)
  stop_routes: ApiStopRoute[]
}
```

#### f) `arrival-info?type=subway` — **변경 없음**

서울 지하철 API가 어차피 해당 역의 모든 호선·방향 열차를 다 반환하므로, BE에서 필터링하면 routes/stop 메타와 JOIN 또는 추가 파라미터가 필요해 결합도가 올라간다. **FE에서 필터하는 편이 깔끔**:
- BE는 도메인 무관 프록시로 유지
- arrival-info 캐시 키가 `(stationName)`으로 단순 — 같은 역의 양방향 사용자가 캐시 공유 가능
- 필터 로직 변경/디버깅이 FE 한 곳에서 가능

→ **결정: FE에서 매칭 (옵션 d-FE)**

#### g) `Home.tsx` 도착 매칭 (FE) — `arrival.ts` 개선

```ts
function matchSubwayArrival(
  items: ApiSubwayArrivalItem[],
  line: string,                             // 호선 코드 "1007"
  direction: { headsign: string | null; updn: 'up' | 'down' | null }
): ApiSubwayArrivalItem[] {
  const candidates = items.filter(i => i.lineName === line)
  return candidates.filter(i => {
    const okUpdn = direction.updn ? mapsToUpdn(i.updnLine) === direction.updn : true
    const okHead = direction.headsign ? i.direction.startsWith(direction.headsign) : true
    return okUpdn && okHead
  })
}

function mapsToUpdn(updnLine: string): 'up' | 'down' | null {
  // "상행" / "내선" → up, "하행" / "외선" → down
  if (updnLine === '상행' || updnLine === '내선') return 'up'
  if (updnLine === '하행' || updnLine === '외선') return 'down'
  return null
}
```

매칭 결과가 0건이면 fallback으로 호선만 일치하는 전체를 보여준다(legacy 데이터 + 매칭 실패 안전망).

---

## 4. DB 스키마 변경

### 4.1 신규 마이그레이션 (SQL 골격, 텍스트 명세)

> 마이그레이션 파일은 SDD 승인 후 BE 에이전트가 생성. 본 문서에는 골격만.

```
-- migrations/20260428000000_add_direction_to_route_stops.sql

alter table route_stops
  add column if not exists direction_headsign  text,
  add column if not exists direction_updn      text
    check (direction_updn in ('up', 'down')),
  add column if not exists direction_next_stop text;

comment on column route_stops.direction_headsign  is
  '지하철 진행 방향 헤드사인 (예: "장암행"). subway stop에만 의미 있음.';
comment on column route_stops.direction_updn      is
  '상/하행 코드 (up/down). 서울 지하철 updnLine 정규화: 상행/내선→up, 하행/외선→down.';
comment on column route_stops.direction_next_stop is
  'ODsay route-search subPath.endName (환승/하차역명, 디버그/감사용).';
```

- 모두 nullable → 기존 row 그대로 동작
- `direction_updn`만 enum-like CHECK
- 인덱스 추가 불필요 (필터는 FE에서 수행, route별 stop 수가 작음)

### 4.2 기존 데이터 백필 전략

사용자가 명시한 대로 **데이터가 적어 마이그레이션 후 빈 상태 허용**.

- 기존 route_stops 모두 세 컬럼 NULL → FE 매칭 로직이 fallback(전체 표시)으로 동작
- 사용자에게 "방향 정보 없음 → 경로 재등록 권장" 토스트 1회 노출 옵션은 PRD 검토 사항

---

## 5. UI 정리 방향

### 5.1 도착 카드 표시 규칙

현재 문제:
- "석남(거북시장)" 7호선 도착 카드에 양방향(상행 장암행 2건 + 하행 석남행 2건) 4건이 다 노출
- `arrmsg1` / `arrmsg2` 중복 패턴 (같은 열차의 1·2번째 메시지가 한 카드에 두 줄로 보임)
- 방향(headsign) 텍스트가 어디에도 안 보임

### 5.2 결정

**1. 호선당 표시 건수: 최대 2건 (현재 차량 + 다음 차량)**
- 매칭된 `direction` 필터 결과 중 도착 임박 순 상위 2개
- 카드 1행 = 1편 열차. arrmsg1·2가 둘 다 같은 열차의 1번째·2번째 메시지인 경우 대신, **상위 2개 열차의 arrmsg1만 사용**한다
- (현재 `getRawArrmsg(... which: 1|2)`가 같은 item의 arrmsg1/arrmsg2를 두 줄로 표시하는 부분을 변경)

**2. 헤드사인 노출**
- 노선번호/호선 옆에 작은 배지로 `"장암행"` 또는 `"성수행"` 표시
- 저장된 `direction_headsign`이 있으면 이를 우선, 없으면 매칭된 arrival의 `trainLineNm`에서 첫 토큰 추출하여 표시

**3. 도착 메시지 정규화**
- `"전역 출발"` / `"도착"` / `"곧 도착"` 같은 상태 메시지는 그대로 노출, 카운트다운 적용 안 함
- `"3분 12초 후"` 같이 숫자가 있으면 `applyCountdownToArrmsg` 적용 (현재 동작 유지)
- `"운행종료"` / `"정보없음"` → 회색, 1건만 표시

**4. 매칭 실패 시**
- 호선만 일치하는 결과를 모두 표시 + 카드 헤더에 "방향 정보 없음 — 경로를 다시 저장해 주세요" 작은 inline 알림

### 5.3 ARS·odsayStopId 노출 정리

현재 카드 헤더에 `arsId` 또는 `odsayStopId`가 mono-font로 노출되는데, 사용자에게 의미 없음. 디버그 모드(`localStorage.debug=true`)에서만 노출하도록 조건부 처리 (선택사항, 별도 task로 분리 가능).

---

## 6. 변경 영향도 / Breaking Changes

| 변경 | 영향 | Breaking? |
|------|------|-----------|
| `route-search` 응답에 `way`/`wayCode` 추가 | FE: 옵셔널 필드, 기존 코드 무영향 | No (additive) |
| `POST /routes` 요청에 `directionHeadsign` 등 추가 | FE: optional 필드, 기존 호출 무영향 | No (additive) |
| `GET /routes` 응답에 direction_* 추가 | FE: optional, mappers 확장 | No (additive) |
| `route_stops` 신규 컬럼 3개 | 기존 row 모두 nullable 유지 | No |
| `arrival-info` | 변경 없음 | — |
| FE `arrival.ts` 매칭 로직 변경 | route_stops에 방향 없으면 fallback (전체) | No (legacy safe) |

---

## 7. 구현 체크리스트 (요약)

세부는 `docs/specs/route-direction/TASKS.md` 참고.

### BE
- [ ] `OdsaySubPath` 타입에 `way?: string`, `wayCode?: number` 추가 (`_shared/odsayClient.ts`)
- [ ] `route-search` 응답 DTO에 `way: string | null`, `wayCode: number | null` 추가
- [ ] route-search 테스트 보강 (way/wayCode 필드 매핑)
- [ ] 마이그레이션 추가: `route_stops` 신규 3컬럼 (`direction_headsign`, `direction_updn`, `direction_next_stop`)
- [ ] `routes` POST 핸들러 — 신규 입력 필드 → DB 컬럼 매핑
- [ ] `routes` GET — select 절에 신규 컬럼 추가
- [ ] routes_test.ts: 방향 정보 저장/조회 케이스 추가

### FE
- [ ] `ApiRouteSegment`에 `way`/`wayCode` 옵셔널 추가
- [ ] `ApiRouteStop`에 `direction_*` 옵셔널 추가
- [ ] `SaveRouteStop`에 `directionHeadsign`/`directionUpdn`/`directionNextStop` 옵셔널 추가
- [ ] `SearchResultNode`/`RouteNode`에 방향 필드 전파
- [ ] `SetupRoute.handleSave` — subway stop 저장 시 방향 필드 채움
- [ ] `mappers.ts` — `mapApiRoute`가 direction_* 보존
- [ ] `lib/arrival.ts` — `matchSubwayArrival` 추가, `getRawArrmsg` 시그니처에 stop의 방향 인자 전달
- [ ] `Home.tsx` — 헤드사인 배지, 매칭 실패 안내, 카드 표시 규칙 적용

---

## 8. Open Questions (구현 시 확인)

1. ODsay `subPath.way`가 분기 노선(7호선 도봉산행 vs 장암행)에서 어떤 값이 오는지 — 실제 API 1회 호출로 검증 필수
2. 2호선 내·외선 → up/down 매핑이 ODsay `wayCode`와 일관적인지 — 강남역 시계반대(외선) 케이스 확인
3. 광역철도(GTX, 신분당선)에서 `updnLine`이 어떤 문자열로 오는지 — `상행`/`하행` 외 케이스 발견 시 매핑 추가
4. 환승역(예: 신도림 1·2호선)에서 호선이 다르면 자연스럽게 분리되지만, 같은 호선의 다른 분기(2호선 본선/지선)는 헤드사인으로만 구분 가능 — 사용자 경로에서 실제 발생 빈도 추적
