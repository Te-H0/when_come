# PRD — 경로 방향 정보 (route-direction)

- **상태:** 구현 완료 (2026-04-28) — Phase 1·2·3 완료, Phase 4 문서 정리 완료. 수동 QA(T17/T24) 및 OQ1~OQ3 검증은 별도 노트(`when_come_be/docs/tech-notes/route-direction-open-questions.md`)에서 진행
- **작성일:** 2026-04-28
- **최근 갱신:** 2026-04-28
- **관련:** `SDD.md`, `TASKS.md`, `docs/api/contracts/route-direction-design.md`, `docs/decisions/ADR-001-subway-direction-model.md`

---

## 1. 문제 정의

저장된 경로의 도착 정보를 표시할 때 **사용자가 타야 할 차의 방향이 구분되지 않아** 매번 본인이 판단해야 한다.

### 사용자 시나리오 (현재)

> 사용자 A는 매일 출근길에 "석남(거북시장) 7호선" 정류장에서 부평구청 방향 열차를 탄다.  
> 앱에서 도착 정보를 보면 **양방향 4건**이 모두 표시된다 (장암행 2건 + 석남행 2건).  
> 사용자는 "내가 타야 하는 게 위에 두 개? 아래 두 개?"를 매번 판단해야 한다. → 앱의 핵심 가치(빠른 통근 의사결정) 훼손.

### 비대칭 — 버스는 이미 해결되어 있음

- 버스: 양방향 정류장이 별개 ARS ID로 분리됨 → 저장된 `arsId`로 자동 단방향
- 지하철: 한 역명 = 양방향 동시 도착 → 명시적 방향 저장 필요

본 PRD는 **지하철 stop의 방향 저장·매칭 도입**을 다룬다.

---

## 2. 목표 / 비목표

### 목표
- 저장된 지하철 stop에 사용자가 진행할 방향 정보를 보존
- 도착 정보 표시 시 **해당 방향 열차만** 노출 (또는 다른 방향과 명확히 구분)
- 기존 저장 경로(방향 정보 없음)도 깨지지 않고 동작 — 기존 동작으로 fallback
- 헤드사인을 카드에 작은 배지로 노출하여 사용자가 "어느 방향 열차인지" 즉시 확인 가능

### 비목표
- 버스 방향 처리 추가 (이미 ARS로 해결됨)
- ODsay 외 추가 외부 API 도입
- 환승 시 노선별 방향 자동 학습/추천 (단순 저장만)
- 노선별 정거장 시퀀스 DB 구축

---

## 3. 사용자 가치

| Before | After |
|--------|-------|
| 도착 카드에 양방향 4건이 섞여 표시 | 본인 방향 1~2건만 표시 + 헤드사인 배지 |
| 매번 방향 판단 필요 | 앱이 알아서 필터링 |
| `arrmsg1`/`arrmsg2`가 같은 카드 두 줄로 노출(중복 인상) | 상위 2개 열차의 첫 번째 메시지로 정리 |

---

## 4. 성공 지표

정량 지표는 사용자 수가 적어 측정 어려움. 대신 **품질 게이트**로 정의:

1. 저장된 경로(석남 7호선 부평구청 방향)에서 도착 카드에 부평구청 방향 열차만 노출
2. 기존 저장 경로(방향 정보 없는 row)에서 도착 정보가 비어버리지 않고 기존처럼 전체 표시
3. ODsay route-search 응답에 `way`/`wayCode`가 누락되더라도 저장·표시가 정상 동작 (한쪽만으로도 매칭)
4. 2호선·7호선 분기 노선에서 분기 방향 차량이 섞여 들어오지 않음 (manual QA)

---

## 5. 핵심 결정 (요약)

ADR-001에 상세. 핵심:

- 저장 모델: **헤드사인 + 상하행 + 다음역** 3 필드 조합 (옵션 D)
- 매칭 위치: **FE** (BE arrival-info는 프록시 유지)
- API 변경: 모두 **additive (Breaking 없음)**
- DB 변경: `route_stops` 신규 3컬럼, 모두 nullable

---

## 6. 영향 범위

### BE
- `_shared/odsayClient.ts` — `OdsaySubPath` 타입 확장
- `route-search/index.ts` — 응답 DTO 확장
- `routes/index.ts` — POST 입력·GET 출력 확장
- 마이그레이션 1건
- 테스트: route-search, routes 보강

### FE
- `types/api.ts` — DTO 확장
- `lib/api.ts` — `SaveRouteStop` 확장
- `lib/mappers.ts` — direction_* 보존
- `lib/arrival.ts` — `matchSubwayArrival` 추가
- `features/setup/components/SearchResultNode.tsx`/`RouteNodeCard.tsx` — 방향 필드 전파
- `features/setup/pages/SetupRoute.tsx` — 저장 페이로드 확장
- `features/home/pages/Home.tsx` — 헤드사인 배지, 매칭 후 표시 규칙

### DB
- `route_stops` 컬럼 3개 추가 (nullable, 1개 CHECK)

### 외부 API
- 신규 호출 없음

---

## 7. 리스크 / Open Questions

| 리스크 | 완화 |
|--------|------|
| ODsay `way`/`wayCode`가 일부 노선에서 누락 | nullable + 양쪽 키 조합으로 한쪽 누락 시 다른 쪽이 매칭 |
| 2호선 내·외선 ↔ wayCode 매핑이 불일치할 가능성 | 구현 시 실호출 검증 (Open Question) — 필요 시 매핑 테이블 추가 |
| 기존 저장 경로가 매칭 0건이 되어 도착 정보 사라짐 | fallback: 매칭 0건이면 호선만 일치하는 전체 표시 |
| 사용자가 헤드사인을 모름 | UI에 배지로 노출 (`"장암행"`) — 익숙한 표현 |

상세 Open Questions: ADR-001 참고.

---

## 8. 마일스톤

- M0 (검토): PRD/SDD/TASKS 승인 ← **현 단계**
- M1 (BE): 마이그레이션 + route-search/routes 확장 + 테스트
- M2 (FE): 타입/매핑/저장/표시 구현
- M3 (QA): 석남 7호선 + 2호선 강남 + 환승역 1곳 수동 검증
- M4 (롤아웃): 사용자에게 "재등록 권장" 안내 (선택)

각 마일스톤은 `TASKS.md`에서 체크리스트로 분해.
