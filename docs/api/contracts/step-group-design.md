# 설계 — Step Group (한 스텝에 최대 2개 대안 정류장)

- **상태:** 설계 확정 — 구현 대기
- **작성일:** 2026-05-03
- **작성:** architect
- **관련:** `docs/api/contracts/routes.md`, `docs/api/contracts/arrival-info.md`, `when_come_be/supabase/migrations/20260503100000_add_step_group_to_route_stops.sql`

---

## 0. 한 줄 요약

`route_stops`의 unique key를 `(route_id, sequence)` → `(route_id, step_group, sequence)`로 바꾸고,
같은 `step_group`에 묶인 최대 2개 정류장을 도착 조회에서 **병렬 fetch + 빠른 쪽 우선 표시**한다.

---

## 1. 배경 / 문제

- 현재 `route_stops`는 `(route_id, sequence)` 1:1로 평탄(flat). 한 논리 스텝 = 한 정류장.
- 실제 사용 패턴: "버스정류장 A에서 11번을 타거나, 30m 옆 정류장 B에서 643번을 타도 같은 회사로 간다." 이런 대안을 같은 스텝 안에 묶고 싶다.
- 도착 조회 시 두 곳을 동시에 보고 "어느 쪽이 더 빨리 오는지"를 사용자가 즉시 판단하길 원함.

---

## 2. 모델 결정

### 2.1 데이터 모델

`route_stops`에 `step_group INTEGER NOT NULL DEFAULT 1`을 추가하고, 유니크 제약을 다음으로 교체.

```
(route_id, step_group, sequence)  UNIQUE
```

- `step_group`: 1부터 시작하는 정수. **사용자가 보는 "논리 스텝 번호"**.
- `sequence`:   `step_group` 내부의 ordering. 단일 정류장이면 `1`, 두 개면 `1`/`2`.

다른 안과 비교:

| 대안 | 채택? | 이유 |
|------|------|------|
| **A. step_group 컬럼 추가 (채택)** | O | 기존 테이블 형태 유지, 마이그레이션·쿼리 단순. ORDER BY 두 컬럼이면 끝. |
| B. `route_stop_alternatives` 별도 테이블 | X | 1:1과 1:2를 다르게 다뤄야 해서 BE 분기가 늘어남. 가치 대비 복잡. |
| C. 기존 `sequence`로 `1.1`, `1.2` 같은 소수 인코딩 | X | 정렬·범위 쿼리·인덱스 모두 깨짐. 안티 패턴. |
| D. JSONB로 stops를 묶어 저장 | X | 노선 단위 RLS·JOIN(`stop_routes`) 깨짐. 도착 조회 성능 회귀. |

### 2.2 도메인 규칙 (BE 검증)

- 한 `step_group`당 최대 **2개** stop. (DB CHECK으로 강제하지 않음 — 트리거 비용 > 이득)
- `step_group`은 1부터 연속 — gap 없음. (예: `[1,2,3]` OK, `[1,3]` 금지 → 400)
- 한 `step_group` 내부 `sequence`는 1부터 연속 — `[1]` 또는 `[1,2]` 만 허용.
- 같은 `step_group` 안 두 stop의 `stop_type`은 **동일**해야 함 (bus + subway 혼합 금지). 도착 비교가 의미 없음.

### 2.3 마이그레이션 전략

- 기존 dev 데이터 영향 없음 — `routes` 통째 `TRUNCATE ... CASCADE` (사용자 합의됨).
- 새 컬럼 default `1`로 들어가 single-stop 스텝이 자연스럽게 표현됨 → 코드 경로가 간단해짐(특수 케이스 없음).
- 인덱스 `(route_id, step_group)` 추가. 도착 조회 시 step 단위 묶음 fetch에 사용.

---

## 3. API 계약 변경

### 3.1 POST /routes — 입력 DTO

```ts
interface RouteStopInput {
  // 기존 필드 모두 유지
  odsayStopId: string
  stopName: string
  stopType: 'bus' | 'subway'
  arsId?: string | null
  directionHeadsign?: string | null
  directionUpdn?: 'up' | 'down' | null
  directionNextStop?: string | null
  lat?: number | null
  lng?: number | null
  provider?: 'seoul' | 'gyeonggi' | 'odsay_fallback' | null
  gbisStationId?: string | null
  stopRoutes: StopRouteInput[]

  // 변경: 1-based 정수
  sequence: number      // 같은 step_group 안 ordering (1 또는 2)
  stepGroup: number     // 신규 — 1부터 시작하는 논리 스텝 번호 (필수)
}
```

> **주의:** 기존 contract(`docs/api/contracts/routes.md`)에서 `sequence`는 0-based로 명시되어 있었으나, 신규 모델에서는 일관성을 위해 **1-based**로 통일한다(BE 내부에서도 `step_group`/`sequence` 모두 ≥ 1). 기존 데이터는 TRUNCATE되므로 호환성 부담 없음. 동시에 `routes.md` §1.2 / §1.5 / §1.6 / §4.1 도 함께 갱신해야 함.

### 3.2 POST /routes — 검증 (BE)

요청 도착 시 다음을 모두 통과해야 함, 아니면 400:

1. `stops`이 비어있지 않음.
2. 각 stop의 `stepGroup` 정수 ≥ 1, `sequence` 정수 ≥ 1.
3. `stepGroup` 집합이 1부터 연속 (gap 없음).
4. 각 `stepGroup`의 `sequence` 집합이 `[1]` 또는 `[1, 2]`. (다른 형태 금지 — `[2]`나 `[1,3]` 등)
5. 같은 `stepGroup`에 묶인 stop들의 `stopType`이 동일.
6. 같은 `stepGroup`에 stop이 2개 초과로 들어오면 400.

오류 메시지 예: `"step_group 2의 sequence가 비연속입니다: [1, 3]"`

### 3.3 GET /routes — 응답 DTO

```ts
interface ApiRouteStop {
  // 기존 필드 모두 유지
  id: string
  route_id: string
  sequence: number          // 1-based
  step_group: number        // 신규 — 1-based
  stop_name: string
  stop_type: 'bus' | 'subway'
  ars_id: string | null
  // ... direction_*, provider, gbis_station_id, stop_routes ...
}
```

응답 정렬은 BE에서 **`step_group ASC, sequence ASC`**로 미리 정렬해 내려준다(현재 sequence만으로 정렬하던 로직 교체).

### 3.4 GET /arrival-info — 변경 없음 (호출부만 영향)

도착 조회 자체는 stop 단위 그대로. **그룹 단위 도착 비교는 FE 책임**으로 둔다(아래 §4.2).
이유: BE가 그룹 fetch를 묶으면 캐시·실패 격리·로깅 모두 복잡해지고, FE가 이미 stop 단위 polling을 가짐.

---

## 4. FE 영향

### 4.1 RouteNode 타입

```ts
interface RouteNode {
  id: string
  // 기존 필드 유지 (stopName, stopType, arsId, provider, direction*, stopRoutes ...)

  sequence: number     // 1-based, 같은 stepGroup 안 ordering
  stepGroup: number    // 1-based, 논리 스텝 번호 (필수)
}
```

### 4.2 그룹핑 / 렌더 / 도착 조회

- `SetupRoute.tsx`: flat list → `groupBy(stepGroup)` 후 그룹 박스 안에 1~2개 카드. "대안 추가" 버튼은 그룹 내 stop이 1개일 때만 노출.
- `Home.tsx`: 그룹 단위 카드. 같은 그룹의 두 stop을 **병렬 fetch** 후 다음 규칙으로 표시.
  - 두 stop 모두 응답 → 첫 도착(arrmsg1 기준) 빠른 쪽을 큰 글씨, 다른 쪽은 보조 표기.
  - 한쪽 실패 → 성공한 쪽만 표시 + 실패 stop에 작은 경고 아이콘.
  - 둘 다 실패 → 그룹 전체 에러 상태.
- 드래그앤드롭: stepGroup 단위로 이동(그룹째 위/아래), 그룹 내부 두 stop 간 순서 swap은 별개 인터랙션.

(상세 UX는 별도 PRD에서 다룸 — 본 문서는 데이터/계약 결정에 한정)

---

## 5. BE 영향 (요약)

`when_come_be/supabase/functions/routes/index.ts` 변경 포인트:

1. `RouteStopInput`에 `stepGroup: number` 추가, `sequence` 의미 재정의(1-based, group-local).
2. `createRoute`에 §3.2 검증 6단계 추가.
3. `stopsPayload`에 `step_group: stop.stepGroup` 매핑.
4. `listRoutes` SELECT에 `step_group` 추가, 정렬 `(step_group ASC, sequence ASC)`.
5. `stop_routes` 매핑 시 `inserted.sequence`로 매칭하던 로직을 `(step_group, sequence)` 복합 키로 매칭하도록 수정 — **버그 회피 핵심**(같은 sequence가 다른 step_group에 존재 가능).

---

## 6. 핵심 결정사항 (구현 시 필독)

| # | 결정 | 이유 |
|---|------|------|
| D1 | `step_group` 별도 컬럼 + 복합 unique | 별도 테이블·소수 인코딩·JSONB 모두 회귀 비용이 큼 |
| D2 | `step_group`/`sequence` 모두 1-based | 사용자 노출 번호와 DB 표현 통일, 0/1 혼용 버그 차단 |
| D3 | "최대 2개"는 BE 검증 (DB CHECK 안 함) | 트리거/CHECK 비용 대비 이득 적음 |
| D4 | step_group 1부터 연속 강제 | gap 허용 시 UI 표시·정렬 케이스가 폭발적으로 늘어남 |
| D5 | 같은 step_group 내 `stopType` 동일 강제 | 두 도착 시간을 비교 표시할 의미가 있어야 함 |
| D6 | 그룹 단위 fetch는 FE 책임, BE는 stop 단위 그대로 | 캐시/실패 격리/로깅 복잡도 회피, 기존 arrival 계약 보존 |
| D7 | 기존 데이터 TRUNCATE | dev 단계, 사용자 합의됨 — 점진 마이그레이션 비용 회피 |
| D8 | `stop_routes` 매핑은 `(step_group, sequence)` 복합 키로 | 단일 sequence로는 충돌 가능 — 회귀 버그 가장 큰 위험 |

---

## 7. 후속 (이 문서 범위 외)

- `docs/api/contracts/routes.md` 본 변경에 맞춰 갱신 (1-based 통일, `step_group` 필드 추가, 예시 갱신).
- `docs/collab-notes.md`에 breaking change 요약 추가.
- FE/BE 양쪽 PRD/SDD/TASKS는 `/spec` 스킬로 별도 진행.
- 그룹 단위 도착 표시 UX 디테일(라벨링, 강조 규칙, 색상)은 product-advisor와 별도 논의.
