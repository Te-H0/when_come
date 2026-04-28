# ADR-001 — 지하철 방향 저장 모델

- **상태:** Accepted (2026-04-28) — 구현 완료 (마이그레이션 적용, BE/FE 통합). Open Questions(아래 §"Open Questions") QA 검증은 `when_come_be/docs/tech-notes/route-direction-open-questions.md`에서 진행
- **최근 갱신:** 2026-04-28
- **관련 문서:** `docs/api/contracts/route-direction-design.md`, `docs/specs/route-direction/`, `when_come_be/docs/tech-notes/route-direction-open-questions.md`
- **결정자:** architect (사용자 승인 완료)

---

## Context

when_come 앱은 사용자가 저장한 출퇴근 경로의 도착 정보를 표시한다. 그러나 현재 **경로 저장 시 방향(direction) 정보가 빠져 있어**, 같은 역에 양방향 열차가 동시 도착할 때 사용자는 매번 본인이 타야 할 차를 판단해야 한다.

### 비대칭

- **버스:** 양방향 정류장이 별개 `arsId`로 분리됨 → `route_stops.ars_id` 저장만으로 단방향 보장 (현재 동작 OK)
- **지하철:** 한 역명 = 한 API 응답에 모든 방향 → 명시적 방향 저장 필요

### 매칭 가능한 외부 API 필드

| 출처 | 필드 | 용도 |
|------|------|------|
| ODsay route-search subPath | `wayCode` (1/2), `way` (종점역명, 옵션), `endName` (다음 환승역) | 저장 시 방향 도출 |
| 서울 지하철 API arrival | `updnLine` ("상행"/"하행"/"내선"/"외선"), `trainLineNm` ("장암행 - 산곡방면"), `subwayId` | 도착 표시 매칭 |

`searchStation`(정류장 검색)에는 방향 정보 없음 — 검색 시점 미정이라 자연스러움.

---

## Decision

**지하철 방향을 다중 필드 조합으로 저장한다 (옵션 D).**

`route_stops` 테이블에 다음 3개 컬럼을 추가:

| 컬럼 | 타입 | 의미 |
|------|------|------|
| `direction_headsign` | text NULL | 헤드사인 (예: `"장암행"`). ODsay `way`로부터 `${way}행` 합성 |
| `direction_updn` | text NULL CHECK in `('up','down')` | 상하행 정규화. ODsay `wayCode`(1/2)에서 매핑 |
| `direction_next_stop` | text NULL | ODsay `subPath.endName` (디버그/감사용) |

**FE에서 매칭한다.** BE `arrival-info`는 도메인 무관 프록시 유지.

매칭 알고리즘 (FE):
1. `subwayId === lineName` 1차 필터
2. 저장된 `direction_updn` 있으면 → `updnLine` 정규화 결과와 비교 (`상행/내선→up`, `하행/외선→down`)
3. 저장된 `direction_headsign` 있으면 → `trainLineNm.startsWith(headsign)` 비교
4. 두 키가 모두 있으면 둘 다 만족하는 것만, 한쪽만 있으면 그것만 적용
5. 매칭 결과 0건 → 호선만 일치하는 전체로 fallback + 사용자에게 inline 안내

---

## Alternatives Considered

### 옵션 A — 헤드사인 텍스트 단독 (`headsign: "장암행"`)
- **장점:** arrival `trainLineNm`과 직접 부분 일치 — 매칭 정확도 매우 높음
- **단점:**
  - ODsay `subPath.way`가 항상 제공되는지 불명확 (광역철도/일부 노선 누락 가능성)
  - 2호선 순환 — 헤드사인이 `"성수행"`/`"신도림행"` 등 같은 방향에서도 다양 → 단순 startsWith로 놓치는 경우 발생
- **기각 사유:** 단일 키라 누락/불일치 시 fallback 없음

### 옵션 B — 다음 역 이름만 (`next_stop_name: "산곡"`)
- **장점:** ODsay `endName`은 항상 존재 → 저장 시 도출 100%
- **단점:** arrival API 응답에 다음 역 정보가 없어 **직접 매칭 불가**. 별도 노선 인접역 DB가 필요한데 보유 안 함
- **기각 사유:** 매칭 자체가 불가능

### 옵션 C — 상/하행 코드만 (`updn: "up" | "down"`)
- **장점:** 매우 단순. `updnLine` 직접 매핑
- **단점:**
  - ODsay `wayCode`가 일부 케이스 누락 가능
  - 2호선 본선/지선·신정지선 등 같은 "상행"이 의미 다른 quirky 케이스 → 본선 사용자도 지선 열차가 보임
  - 광역철도(GTX) `updnLine` 값 형태 미검증
- **기각 사유:** 분기 노선 quirky 케이스 미해결

### 옵션 D — 헤드사인 + 상하행 + 다음역 조합 [채택]
- **장점:**
  - `wayCode` 누락 시 헤드사인이, 헤드사인 누락 시 wayCode가 보강 → robust
  - 분기 노선(7호선 도봉산/장암)은 헤드사인이 구분, 단방향이지만 헤드사인 다양한 노선(2호선 순환)은 wayCode가 구분
  - 모두 nullable이라 legacy 호환 + 부분 정보 데이터도 동작
- **단점:**
  - 저장 컬럼 3개 추가, FE 매핑 로직 복잡도 약간 증가
- **선택 사유:** 단일 옵션의 quirky 케이스를 상호 보강. 컬럼 비용은 작고 nullable이라 안전.

---

## Consequences

### 긍정
- 양방향 도착이 한 카드에 섞여 보이는 UX 깨짐이 해결됨
- BE `arrival-info`는 그대로(프록시 책임 단일) — 캐시 키 단순, route 메타와 결합도 0
- 옵셔널 필드라 기존 데이터·기존 클라이언트와 호환 (additive change)
- 마이그레이션 위험 낮음 (CHECK constraint 외 enum/FK/index 추가 없음)

### 부정 / 트레이드오프
- 저장 시점 방향 도출 책임이 FE의 `SetupRoute.handleSave`로 들어감 → ODsay 응답 변화 시 FE에서 수정 필요
- 매칭 fallback 로직이 FE `arrival.ts`에 두 단계로 존재 → 로직 분기 살짝 늘어남
- ODsay `way`/`wayCode` 실제 응답 정확도가 검증 안 됨 → 구현 시 1회 실호출 검증 필요 (Open Question)

### 후속 영향
- BE: `OdsaySubPath` 타입에 `way`/`wayCode` 추가. `route-search` 응답·`routes` 입출력에 신규 필드. 마이그레이션 1건
- FE: `ApiRouteSegment`/`ApiRouteStop`/`SaveRouteStop`/`RouteNode`/`SearchNodeData` 타입 확장. `arrival.ts` 매칭 로직 추가. `Home.tsx` 헤드사인 배지·표시 규칙 변경
- 기존 데이터: 모두 NULL → fallback(전체 표시) — 사용자에게 "재등록 권장" 안내(선택)

---

## Open Questions (구현 단계 검증)

1. ODsay `subPath.way`가 7호선 분기(도봉산/장암)에서 어떤 값이 오는가?
2. 2호선 내·외선이 ODsay `wayCode` 1/2와 어떻게 매핑되는가?
3. GTX-A·신분당선 `updnLine`이 `"상행"`/`"하행"` 외 형태로도 오는가?

---

## References

- `docs/api/contracts/route-direction-design.md` — 전체 설계
- `when_come_be/docs/external-apis/odsay.md` — `searchPubTransPathT` 응답 스펙
- `when_come_be/docs/external-apis/seoul-subway.md` — `realtimeStationArrival` 응답 스펙
- `when_come_be/supabase/functions/_shared/odsayClient.ts` — 현재 `OdsaySubPath` 타입
