# TASKS — 경로 방향 정보 (route-direction)

- **상태:** Phase 1 완료 (2026-04-28), Phase 2 완료 (2026-04-28), Phase 3 진행 중 (2026-04-28), Phase 4 대기
- **선행 문서:** PRD.md, SDD.md, ADR-001
- **승인 후 위임:** be-agent (T1~T8) → fe-agent (T9~T17) — be-agent 완료 후 순차

> 각 task 완료 시 체크박스 + 완료일 표기 (rule: docs-maintenance.md).

---

## Phase 1 — BE 타입·DB 토대 (be-agent)

- [x] **T1.** `_shared/odsayClient.ts` `OdsaySubPath`에 `way?: string`, `wayCode?: number` 옵셔널 필드 추가 (완료일: 2026-04-28)
- [x] **T2.** route-search 테스트 작성 (TDD): 지하철 subPath에 way/wayCode 있는 ODsay 응답 → 응답 segments에 정상 매핑되는지. 케이스 3건:
  - way + wayCode 모두 있음 → 그대로 매핑
  - 둘 다 없음 → 둘 다 null
  - 버스 segment → 둘 다 null
  (완료일: 2026-04-28)
- [x] **T3.** route-search `RouteSegment`에 `way: string \| null`, `wayCode: 1 \| 2 \| null` 추가하여 T2 통과 (완료일: 2026-04-28)
- [x] **T4.** 마이그레이션 작성: `20260428000000_add_direction_to_route_stops.sql`
  - `direction_headsign text`, `direction_updn text`, `direction_next_stop text` 추가
  - CHECK constraint: `direction_updn is null or direction_updn in ('up','down')`
  - 컬럼 comment 추가
  (완료일: 2026-04-28)
- [x] **T5.** routes 테스트 추가 (TDD): POST 페이로드에 `directionHeadsign`/`directionUpdn`/`directionNextStop` 포함 → DB insert mock에 정확히 전달되는지. 케이스:
  - 정상 subway stop (3 필드 모두 채움)
  - subway stop 일부 필드 누락 (null 저장)
  - 잘못된 updn 값 (`"left"`) → null 저장
  - bus stop 필드 미전송 → 모두 null
  (완료일: 2026-04-28)
- [x] **T6.** routes_test GET: route_stops에 direction_* 포함된 mock → 응답 JSON에 `direction_headsign` 등 노출 (완료일: 2026-04-28)
- [x] **T7.** routes/index.ts `RouteStopInput` DTO 확장 + `createRoute` insert에 신규 컬럼 매핑 + `listRoutes` select 절에 신규 컬럼 추가 → T5/T6 통과 (완료일: 2026-04-28)
- [x] **T8.** route-search 응답 매핑 코드에 `way`/`wayCode` 매핑 추가 → T2 통과 (T3 후 코드 작성) (완료일: 2026-04-28)

> Phase 1 완료 후: 통합 deno test 통과 + collab-notes.md 변경 이력 확인

---

## Phase 2 — FE 타입·저장 (fe-agent, BE 배포 후)

- [x] **T9.** `src/types/api.ts`:
  - `ApiRouteSegment`에 `way?: string \| null`, `wayCode?: 1 \| 2 \| null` 추가
  - `ApiRouteStop`에 `direction_headsign`/`direction_updn`/`direction_next_stop` 옵셔널 추가
  (완료일: 2026-04-28)
- [x] **T10.** `src/lib/api.ts` `SaveRouteStop`에 `directionHeadsign`/`directionUpdn`/`directionNextStop` 옵셔널 추가 (완료일: 2026-04-28)
- [x] **T11.** `src/lib/mockData.ts` `TransitStop`에 동일 3 필드 옵셔널 추가 (완료일: 2026-04-28)
- [x] **T12.** `src/lib/mappers.ts` `mapApiRoute`가 direction_* 필드를 `TransitStop`에 보존 (완료일: 2026-04-28)
- [x] **T13.** `SearchResultNode`/`RouteNodeCard`의 `SearchNodeData`/`RouteNode` 타입에 `way`/`wayCode`/`endName` 옵셔널 추가 (완료일: 2026-04-28)
- [x] **T14.** `SetupRoute.apiRouteToSearchResult` — 지하철 segment의 `way`/`wayCode`/`endName`을 `SearchNodeData`에 실음 (완료일: 2026-04-28)
- [x] **T15.** `SetupRoute.handleAddNodeFromSearch` — `SearchNodeData`의 방향 필드를 `RouteNode`에 전파 (완료일: 2026-04-28)
- [x] **T16.** `SetupRoute.handleSave` — 지하철 stop 저장 시 다음 변환 적용:
  - `directionHeadsign = node.way ? \`${node.way}행\` : null`
  - `directionUpdn = wayCodeToUpdn(node.wayCode)` (1→up, 2→down, else null)
  - `directionNextStop = node.endName ?? null`
  (완료일: 2026-04-28)
- [ ] **T17.** 수동 QA: 석남 7호선 부평구청 방향 + 강남 2호선 외선 — 저장 성공 확인 (DB row에 direction_* 채워졌는지 Supabase Studio에서 확인)

---

## Phase 3 — FE 도착 매칭·표시 (fe-agent, T17 후)

- [x] **T18.** `src/lib/arrival.ts`에 `mapsUpdnLineToCode(updnLine)` 헬퍼 추가 (완료일: 2026-04-28)
- [x] **T19.** `src/lib/arrival.ts`에 `matchSubwayItems(items, line, direction)` 추가 (매칭 0건 시 호선 일치 전체로 fallback) (완료일: 2026-04-28)
- [x] **T20.** `getRawArrmsg`/`getArrivalDisplay`/`getArrivalDisplay2`/`getArrivalMin`이 stop의 `directionHeadsign`/`directionUpdn`을 읽어 `matchSubwayItems`에 전달하도록 수정 (완료일: 2026-04-28)
- [x] **T21.** 카드 표시 규칙 변경: 같은 item의 arrmsg1/arrmsg2 두 줄 → 상위 2개 매칭 item의 arrmsg1만 두 줄 (완료일: 2026-04-28)
- [x] **T22.** `Home.tsx` 호선 row에 `direction_headsign` 배지 추가 (지하철 only) (완료일: 2026-04-28)
- [x] **T23.** `Home.tsx` — 매칭이 fallback(방향 NULL)으로 동작 중인 stop에 inline 안내 ("방향 정보 없음 — 경로를 다시 등록하면 더 정확해요") (완료일: 2026-04-28)
- [ ] **T24.** 수동 QA 시나리오 (dev 서버에서 직접 확인 필요):
  - (a) 석남 7호선 부평구청 방향 등록 → 도착 카드에 부평구청행만 (장암행 없음)
  - (b) 강남 2호선 외선(시계반대) 등록 → 외선 차량만
  - (c) 기존 저장 경로(방향 NULL) → 전체 표시 + 안내 노출
  - (d) 7호선 분기 (도봉산행 vs 장암행) — 사용자가 선택한 헤드사인만 노출
  - (e) 환승역(예: 신도림 1·2호선)에서 호선 자체가 다른 카드는 영향 없음

---

## Phase 4 — 정리 / 문서

- [ ] **T25.** `when_come_be/docs/architecture/overview.md` — DB 테이블 섹션에 `route_stops`의 방향 컬럼 언급 추가
- [ ] **T26.** `when_come_fe/docs/architecture/overview.md` — "실시간 도착정보 조회 전략" 섹션에 매칭 규칙 추가
- [ ] **T27.** `when_come_be/docs/external-apis/odsay.md` — `searchPubTransPathT` 응답 표에 `way`, `wayCode` 추가
- [ ] **T28.** Open Question 검증 결과(2호선 wayCode 매핑, GTX updnLine 형태)를 `when_come_be/docs/tech-notes/`에 기록
- [ ] **T29.** PRD/SDD 상태를 "완료"로 갱신

---

## 검증 기준 (Definition of Done)

다음 모두 만족 시 PR 머지 가능:

1. Deno test 전체 통과 (route-search, routes 신규 케이스 포함)
2. 수동 QA 5개 시나리오(T24) 모두 통과
3. collab-notes.md 변경 이력 갱신 (이미 작성됨, 구현 후 응답 예시 보강)
4. ADR/PRD/SDD/TASKS 모두 상태 "완료"
5. 마이그레이션 적용 후 기존 사용자 경로의 도착 카드가 깨지지 않음 (fallback 동작 확인)

---

## 의존성 / 순서 요약

```
T1 ──▶ T2 ──▶ T3
              │
              ▼
T4 ──▶ T5 ──▶ T6 ──▶ T7
                    │
T8 ──────────────── ┘  (T2와 T3가 통과되면 T8과 T7는 병렬 가능)

(BE 배포 완료 후)

T9 → T10 → T11 → T12 → T13 → T14 → T15 → T16 → T17
                                                  │
                                                  ▼
                       T18 → T19 → T20 → T21 → T22 → T23 → T24
                                                                 │
                                                                 ▼
                                              T25 → T26 → T27 → T28 → T29
```
