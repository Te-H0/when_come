# 통합 백로그

> 마지막 업데이트: 2026-05-08
> BE 전용 항목은 `when_come_be/docs/backlog.md` 참고.

## 🔴 High

- [ ] #B1 | [bug] 길찾기(route-search) 결과가 이상함 — 사용자 보고. 어떤 입력에서 어떤 결과가 이상한지 재현 + ODsay 응답 raw 확인 필요. `when_come_be/supabase/functions/route-search/`, FE `SetupRoute` 검색 흐름 점검 | 2026-04-29
- [ ] #B2 | [bug] SetupRoute 수동 검색에서 **지하철 검색 안 됨** — 정류장 검색 시 지하철역이 결과에 안 뜨는지, 검색되는데 클릭/추가가 안 되는지 재현. `search-stops` API + ODsay `searchStation` 응답 + FE `StopPicker`/`PlacePicker` 점검 | 2026-04-29
- [ ] #B3 | [bug] 경로 노드 **드래그앤드롭 안 됨** — `::` 핸들은 보이는데 실제 드래그 동작 X. `react-dnd` 통합 점검, RouteNodeCard의 useDrag/useDrop 훅 + DndProvider 누락 여부 확인 | 2026-04-29

## 🟡 Medium

- [ ] #2 | [chore] 서울 버스 API `arrive` 외 서비스 권한 확인 — getArrInfoByRoute 실제 동작 검증 필요 | 2026-04-19
- [ ] #3 | [chore] 지하철 별칭 일괄 사전검증 스크립트 — 서울 열린데이터 `SearchInfoBySubwayNameService`로 전체 역명(~700) 가져옴 → 도착 API 호출해서 0건인 역만 수집 → 별칭 후보 (`{역명}(인근지명)`) 시도 → 매칭되는 거 `SUBWAY_NAME_OVERRIDES`에 일괄 등록. 1회성 스크립트 (`scripts/probe-subway-aliases.ts` 등). 결과는 CSV/JSON으로 저장하고 OVERRIDES 자동 생성. 현재 해결책은 군자 1건만 hardcode + ad-hoc 발견 방식 → 사전 차단 필요. | 2026-05-06
- [ ] #4 | [test] `arrival.ts` 단위 테스트 — vitest 도입 후 1순위. 노선 매칭 인덱스 버그(2026-05-08 수정) 회귀 방지. 케이스: BE items 순서가 stop.lines와 다를 때 / "643" vs "643번" suffix / 중복 노선번호 traTime1 최솟값 / 매칭 실패 시 null | 2026-05-08
- [ ] #5 | [chore] GBIS `routeName` 실제 형식 검증 — 경기 버스 도착 응답의 `routeName`이 "3000"인지 "직행좌석 3000"인지 실 응답 로그로 확인. 후자라면 `arrival.ts:matchBusItem`의 매칭 로직에 prefix 정규화 추가 필요. | 2026-05-08

## 🟢 Low

## ✅ 완료
- [x] #1 | [feat] GET /stop-routes — 정류장 노선 목록 API (서울 버스 API `getRouteByStation` 권한 승인 확인 + 테스트 완료) | 2026-04-21
