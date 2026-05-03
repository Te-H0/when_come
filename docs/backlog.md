# 통합 백로그

> 마지막 업데이트: 2026-04-29
> BE 전용 항목은 `when_come_be/docs/backlog.md` 참고.

## 🔴 High

- [ ] #B1 | [bug] 길찾기(route-search) 결과가 이상함 — 사용자 보고. 어떤 입력에서 어떤 결과가 이상한지 재현 + ODsay 응답 raw 확인 필요. `when_come_be/supabase/functions/route-search/`, FE `SetupRoute` 검색 흐름 점검 | 2026-04-29
- [ ] #B2 | [bug] SetupRoute 수동 검색에서 **지하철 검색 안 됨** — 정류장 검색 시 지하철역이 결과에 안 뜨는지, 검색되는데 클릭/추가가 안 되는지 재현. `search-stops` API + ODsay `searchStation` 응답 + FE `StopPicker`/`PlacePicker` 점검 | 2026-04-29
- [ ] #B3 | [bug] 경로 노드 **드래그앤드롭 안 됨** — `::` 핸들은 보이는데 실제 드래그 동작 X. `react-dnd` 통합 점검, RouteNodeCard의 useDrag/useDrop 훅 + DndProvider 누락 여부 확인 | 2026-04-29

## 🟡 Medium

- [ ] #2 | [chore] 서울 버스 API `arrive` 외 서비스 권한 확인 — getArrInfoByRoute 실제 동작 검증 필요 | 2026-04-19

## 🟢 Low

## ✅ 완료
- [x] #1 | [feat] GET /stop-routes — 정류장 노선 목록 API (서울 버스 API `getRouteByStation` 권한 승인 확인 + 테스트 완료) | 2026-04-21
