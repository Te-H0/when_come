# 통합 백로그

> 마지막 업데이트: 2026-05-10
> BE 전용 항목은 `when_come_be/docs/backlog.md` 참고.

## 🔴 High

- [ ] #B1 | [bug] 길찾기(route-search) 결과가 이상함 — 사용자 보고. 어떤 입력에서 어떤 결과가 이상한지 재현 + ODsay 응답 raw 확인 필요. `when_come_be/supabase/functions/route-search/`, FE `SetupRoute` 검색 흐름 점검 | 2026-04-29

## 🟡 Medium

- [ ] #2 | [chore] 서울 버스 API `arrive` 외 서비스 권한 확인 — getArrInfoByRoute 실제 동작 검증 필요 | 2026-04-19
- [ ] #3 | [chore] 지하철 별칭 일괄 사전검증 스크립트 — 서울 열린데이터 `SearchInfoBySubwayNameService`로 전체 역명(~700) 가져옴 → 도착 API 호출해서 0건인 역만 수집 → 별칭 후보 (`{역명}(인근지명)`) 시도 → 매칭되는 거 `SUBWAY_NAME_OVERRIDES`에 일괄 등록. 1회성 스크립트 (`scripts/probe-subway-aliases.ts` 등). 결과는 CSV/JSON으로 저장하고 OVERRIDES 자동 생성. 현재 해결책은 군자 1건만 hardcode + ad-hoc 발견 방식 → 사전 차단 필요. | 2026-05-06
- [ ] #4 | [test] `arrival.ts` 단위 테스트 — vitest 도입 후 1순위. 노선 매칭 인덱스 버그(2026-05-08 수정) 회귀 방지. 케이스: BE items 순서가 stop.lines와 다를 때 / "643" vs "643번" suffix / 중복 노선번호 traTime1 최솟값 / 매칭 실패 시 null | 2026-05-08
- [ ] #5 | [chore] GBIS `routeName` 실제 형식 검증 — 경기 버스 도착 응답의 `routeName`이 "3000"인지 "직행좌석 3000"인지 실 응답 로그로 확인. 후자라면 `arrival.ts:matchBusItem`의 매칭 로직에 prefix 정규화 추가 필요. | 2026-05-08
- [ ] #6 | [chore] 매칭용 사전 데이터 일괄 저장 + 미커버 노선 검증 (주말 작업) — 1) 괄호 별칭 역명(군자→군자(능동) 류) 사전 차단 스크립트(`#3`과 통합 가능). 2) 경기 버스 노선/정류소 사전 인덱스 — `gbis_stations` 외에 `gbis_routes`도 일 1회 동기화. 3) 지하철 도착정보 미커버 노선 실 검증 — 인천 1/2호선(인천교통공사), 코레일 외곽 1호선 신창 방면, GTX-A. 서울 열린데이터 통합 API에 응답이 들어오는지 / 별도 API 필요한지 확인. | 2026-05-08
- [ ] #7 | [refactor] SetupRoute `handleAddNodeFromSearch` stepGroup 결정 책임 정리 — 현재 `forcedNewGroup` 인자로 stale 클로저 회피 중인데, 이는 "stale closure 문제의 증거". `setNodes`를 functional 패턴(`setNodes(prev => [...prev, makeNode(prev, node, opts)])`) + `getStopBuses` await을 별도 effect로 분리 리팩터. post-prod. | 2026-05-08
- [ ] #8 | [refactor] `getArrivalDisplay` 반환값에 isStatusLabel 플래그 명시 — 현재 displayMsg("진입중" 등)와 시간 메시지("5분 후")를 같은 string으로 반환하고 caller가 `applyCountdownToArrmsg`로 무차별 처리. 분/초 정규식 미스 의존이라 implicit. `{ text, isStatusLabel }` 객체 반환으로 명시화. | 2026-05-08
- [ ] #9 | [chore] ODsay stationID ↔ 서울 지하철 API statnId 매핑 인프라 (주말 작업, #6과 통합 가능) — 도착정보 호출의 stationName 의존 제거. "서울역 4호선" 같은 환승역에서 stationNm="서울역" 호출 시 GTX-A만 매칭되는 quirk 근본 해결. 매핑 데이터 빌드: 서울 열린데이터 `SearchInfoBySubwayNameService`로 전체 역 statnId 확보 → ODsay 검색 응답과 좌표/이름 fuzzy match → `route_stops`/`favorite_stops`에 `subway_statn_id` 컬럼 추가해 영속화. 임시 해결(stationName + subwayCode fallback 트리거 — 2026-05-09)이 동작하는 동안 별도 트랙. | 2026-05-09

## 🟢 Low

- [ ] #10 | [test] `gbisClient_test.ts` / `regionMapper_test.ts` 타이머 누수 수정 — 전체 테스트 실행 시 5분 캐시 interval cross-test 누수로 flaky 실패. 단독 실행은 통과. `supabaseTest()` 헬퍼 또는 명시적 `clearInterval` 패턴 적용 필요. ADR-002 작업 중 발견(코드 리뷰 D-5). | 2026-05-10
- [ ] #11 | [refactor] `place-search/index.ts:73` `await res.json() as NaverLocalResponse` `as` 단언 제거 — 타입 가드 함수(`isNaverLocalResponse`)로 대체. typescript-conventions 규칙 위반. ADR-002 코드 리뷰 F-3. | 2026-05-10
- [ ] #12 | [chore] `anomaly_logs` 적재량 모니터링 자동화 — ADR-002 §5.2 SQL을 cron 또는 대시보드로 주기 실행. 임계치 초과 시 알람. 현재는 수동 확인. | 2026-05-10
- [ ] #13 | [refactor] dnd-kit 마이그레이션 — Home 칩, Favorites 카드 드래그앤드롭. react-dnd HTML5Backend는 모바일 터치 미지원 + ghost preview 빈약. 풀스택 마이그레이션 후 우선순위 검토. | 2026-05-10
- [ ] #14 | [feat] 전철 급행 표시 (예: "급 용산행" 빨간 배지 + 행선지) — BE `arrival-info`가 `trainLineNm`에서 "급행" 키워드 추출해 `isExpress` 또는 `trainType` 필드 응답 추가, FE `transitColors.ts:rapid` 토큰 재사용해 배지 렌더. | 2026-05-10

## ✅ 완료
- [x] #B2 | [bug] SetupRoute 수동 검색에서 지하철 검색 안 됨 — `search-stops`에서 ODsay 응답을 subway-first 안정 정렬로 수정. 원인: ODsay가 `[버스, 지하철]` 순으로 merge → FE `slice(0, 10)` cap에서 지하철 잘림 (완료일: 2026-05-09)
- [x] #B3 | [bug] 경로 노드 드래그앤드롭 안 됨 — 의도적으로 제거된 기능이었음. 무효 처리 (완료일: 2026-05-09)
- [x] #1 | [feat] GET /stop-routes — 정류장 노선 목록 API (서울 버스 API `getRouteByStation` 권한 승인 확인 + 테스트 완료) | 2026-04-21
