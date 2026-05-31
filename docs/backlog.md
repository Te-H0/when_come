# 통합 백로그

> 마지막 업데이트: 2026-05-31 (세션 #N+4 — 경로 추가 UX 분석 #42 + swap 인터랙션 개선 #43)
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
- ~~[ ] #14 | [feat] 전철 급행 표시~~ → #31, #BB8로 통합 완료 (2026-05-11)
- [ ] #15 | [refactor] `PageHeader.back` prop → `onBack` 컨벤션 통일 — component-rules.md "콜백은 `on` 접두사" 규칙 위반. `back?: boolean | (() => void)` 유니온이라 어색하지만 `onBack?: () => void; showBack?: boolean` 분리 검토. ADR-003 코드리뷰 I-3. | 2026-05-10
- [ ] #16 | [feat] `PageShell.noHeader` prop 구현 — design-system.md §8.1 명세에는 있으나 미구현. 풀스크린 검색 모달/picker 패턴에서 필요. | 2026-05-10
- [ ] #17 | [chore] `text-label` 토큰 색상 정책 재검토 — 현재 `text-label`이 `color: text-secondary`를 포함하지만 코드에서 `text-label text-text-primary` 조합이 자주 등장. `text-label-strong` 별도 토큰 신설 또는 label에서 color 제거 후 조합 패턴으로 변경 검토. | 2026-05-10
- [ ] #18 | [chore] 구버전 컴포넌트 토큰 마이그레이션 — `src/features/route/components/TransitCard.tsx`, `RouteProgress.tsx`, `RouteOption.tsx`에 `text-gray-900`, `text-gray-500`, `text-gray-600` 잔존 (이번 ADR-003 작업 범위 밖이었음). 사용 여부 확인 후 토큰화 또는 deprecated 제거. | 2026-05-10
- [ ] #19 | [chore] `theme.css @layer base` html 블록 두 곳 병합 — overflow/scrollbar 블록(L232~)과 font-size 블록(L262~)이 분리됨. 동작 이상 없으나 미관 정리. | 2026-05-10
- [ ] #20 | [refactor] POST `/routes` / `/favorite-stops` display_order 자동 부여 race condition — 동시 POST 두 번이면 같은 max를 읽어 동률 INSERT 가능. 현재는 다음 PATCH로 정렬 가능하므로 무시. PostgreSQL sequence 또는 `INSERT ... SELECT max+1` 단일 쿼리로 atomic 처리. CORS 사고 작업 코드리뷰 I-2. | 2026-05-10
- [ ] #21 | [chore] `anomaly_logs` source='client' 자동 정리 cron — `/client-log` endpoint가 anon 호출 가능 + rate limit 없어 spam 시 `anomaly_logs` 폭증 위험. pg_cron으로 30일 이전 client 로그 삭제 또는 일별 per-user_id INSERT 제한 RLS. CORS 사고 작업 코드리뷰 I-1. | 2026-05-10
- [ ] #22 | [refactor] `PageShell` BottomNav 분리 — 현재 PageShell이 `<BottomNav />`를 자식으로 렌더하지만 BottomNav는 `fixed`라 flex layout에서 공간을 차지하지 않음. PageShell의 `paddingBottom: var(--bottom-nav-total)` 보정으로 동작은 OK이나 의도와 구현 불일치. App.tsx 최상위에서 BottomNav 렌더하는 구조로 검토. CORS 사고 작업 코드리뷰 I-8. | 2026-05-10
- [ ] #23 | [feat] vite-plugin-pwa 도입 — 오프라인 동작 + Service Worker 캐시 + Android WebAPK 자동 설치. 현재는 useVersionCheck 훅으로 새 버전 감지만. 오프라인 요구사항 올라올 때 진행. spa-version-check tech-note 참고. | 2026-05-10
- [ ] #24 | [feat] 경로 수정 기능 — `RouteManagement` ⋯ 메뉴에 "경로 수정" 추가 + `SetupRoute`에 `editingRouteId` 파라미터로 수정 모드. 기존 경로 GET → nodes 초기화 → 저장 시 `PATCH /routes/:id` (BE는 stops 부분 수정 PATCH 이미 지원). 헤더 타이틀 "경로 등록" → "경로 수정" 토글. 자동검색 결과로 만든 경로 수정 시 검색 결과 재사용 여부 결정 필요. | 2026-05-10
- [ ] #25 | [chore] Home `allSegments` polling 비용 최적화 — 2026-05-10에 isPast 펼침 통합 위해 fetch 범위를 nonPastSegments → allSegments로 확장. 현재 `handleRefresh`가 과거 정류장까지 refetch함. 옵션: (a) `handleRefresh`에서 nonPast만 refetch, (b) isPast는 펼친 경우만 동적 fetch. 경로가 길어질수록 비용 증가. | 2026-05-10
- [ ] #26 | [chore] AliasEditor focus ring 임의 색 토큰화 — `AliasEditor.tsx:91`의 `focus:ring-blue-500/30 focus:border-blue-400`이 ADR-003 시멘틱 토큰 정책 위반. `--ring-focus`/`--border-focus` 토큰 신설 후 적용. 다른 input 컴포넌트도 같은 패턴이면 일괄. | 2026-05-10
- [ ] #27 | [chore] `bg-text-primary` 사용처 text-white 강제 룰 — 시멘틱 타이포 utility(text-body/caption/label)가 색을 묶어 정의해 검은 배경 위에 글씨 사라지는 회귀 자주 발생. 디자인 시스템 룰 §9 code-reviewer 체크리스트에 항목 추가 + grep 기반 사전 검사 가능 (`grep "bg-text-primary" \| grep -v "text-white"`). 자세한 회고는 `docs/tech-notes/dark-button-text-disappear.md`. | 2026-05-10

- [ ] #28 | [feat] 미니카드 헤더와 펼침 첫 row 정보 중복 — isFuture 카드에서 fastest("전역 도착")가 헤더에 표시되고 펼치면 같은 line의 첫 row가 같은 텍스트 + 다음 차 정보. 호선 1개일 때 두 번 보임. 정책: 헤더는 fastest만, 펼침은 첫 차 행선지/시간 + 다음 차 + 3번째+. 또는 펼침에 노선 row 묶음 단순화. backlog #14(급행 표시)와 같이 처리. | 2026-05-11
- [ ] #29 | [chore] BottomNav 키보드 떴을 때 띄움 vs 숨김 정책 확정 — 현재 (b) 위로 띄움 채택. 실 디바이스 사용 후 (a) 숨김으로 전환 고려. iOS PWA standalone에서 상태바 잔상 quirk 모니터링. tech-notes/mobile-platform-policy.md 참고. | 2026-05-11
- [ ] #30 | [chore] 디자인 룰 §11 신설 — `<input>` 직접 사용 시 font-size ≥ 16px, sticky/fixed bottom 요소는 `+ var(--keyboard-inset-height, 0px)` 보정, 새 페이지는 PageShell+PageHeader 통과. design-system.md §8 옆에 추가. tech-notes/mobile-platform-policy.md 참고. | 2026-05-11
- ~~[ ] #31 | [feat] 급행 표시~~ → #BB8로 완료 (2026-05-11)

- [ ] #32 | [chore] manifest maskable 아이콘 safe zone 검증 — 현재 `icon_192.png`/`icon_512.png`를 `purpose: "any"`와 `purpose: "maskable"` 둘 다로 중복 등록. maskable.app 검증 후 안전 영역(80%) 위반이면 maskable 전용 파일(`icon_192_maskable.png`) 별도 준비. 미위반 시 그대로 유지. | 2026-05-11
- [ ] #33 | [chore] BE AppError code 누락 정리 — `arrival-info/index.ts`의 `busApiKey()`/`subwayApiKey()` 500 throw에 code 없음. ADR-002 신규 코드 필수 규칙 위반. 신규 코드라기보다 기존 잔재라 백로그. `COMMON_INTERNAL_ERROR` 부여. | 2026-05-11
- [ ] #34 | [refactor] `useSubmitGuard` 헬퍼 일괄 적용 또는 제거 — 현재 4곳 모두 inline `savingLockRef` 패턴. 헬퍼는 만들었지만 사용 안 함. 같은 컴포넌트 2핸들러 lock 공유 케이스(AddFavorite) 대응 후 일괄 적용하거나, 헬퍼 자체 제거. | 2026-05-11
- [ ] #35 | [chore] FE `safeStorage` 적용 확대 — 현재 Home의 SELECTED_ROUTE_KEY 1곳만. 향후 신규 localStorage 사용처 추가 시 반드시 `safeStorage`만 사용 — design-system.md 또는 typescript-conventions.md에 룰 추가. | 2026-05-11
- [ ] #36 | [feat] 막차(`isLastTrain`) UI 라벨 — BE 응답에 `isLastTrain: boolean` 도입됨. FE 도착 카드에 truthy일 때 "막차" 배지 추가 (예: 도착 시간 옆 회색 chip). 적용 위치: Home/Favorites 모든 도착 row. 운행 종료 후의 도착 0건 케이스와 구분에 도움. | 2026-05-11
- [ ] #37 | [feat] `arrivalSeconds` / `dataTimestamp` 활용 카운트다운 정밀도 — 현재 `arrmsg1`("2분 40초 후") 텍스트 정규식 파싱. 새로 들어온 `arrivalSeconds` 정수 + `dataTimestamp` 시각으로 지연 보정 (`now - dataTimestamp` 만큼 빼서 표시). 정확도 향상. arrival.ts `getArrivalMin`/`applyCountdownToArrmsg` 리팩터. | 2026-05-11
- [ ] #38 | [chore] 모바일 폭별 레이아웃 audit + 패턴 정착 (iPhone SE 320 ~ Pro Max 430) — 사용자 보고(2026-05-12): "기기마다 글씨 줄바뀜/짤림/버튼 가려짐". 현재 베이스 폭 명시 없음. 작업: (1) Chrome DevTools에서 320/360/375/414px 4개 폭으로 모든 페이지 audit. (2) 깨지는 곳 일괄 정리 — 정류장 이름/별명 `truncate min-w-0`, 도착 시간/호선 칩 `whitespace-nowrap flex-shrink-0` 유지, 부가 정보 `whitespace-normal`. (3) `design-system.md §11 Mobile width policy` 명문화 — 베이스 폭 375, 폭별 분기 금지 정책, truncate vs line-clamp 가이드. (4) 컨테이너 쿼리 도입 검토(중장기). 도착 카드 흩어진 `whitespace-nowrap`이 가장 의심. | 2026-05-12

- [ ] #39 | [refactor] `resolveStopRouteProviderOnSave` 중복 구현 통합 — `routes/index.ts`와 `favorite-stops/index.ts`에 거의 동일한 함수가 별도로 존재. 한쪽만 수정 시 동작이 갈라질 위험. `_shared/`로 추출해 단일 import. 경기버스 도착정보 fix(2026-05-12) 코드리뷰에서 발견. | 2026-05-12
- [ ] #40 | [refactor] arrival-info `resolveStopRouteProvider` 안전망 edge case — `sr.provider='gyeonggi'` + `gbis_station_id=NULL` + `arsId=NULL`인 경우 안전망 통과 → GBIS 호출 → canHandle false → 스킵으로 원래 버그 재현. 현실 빈도 낮으나 `arsId ? "seoul" : "odsay_fallback"` 패턴으로 명시화. 경기버스 fix(2026-05-12) 코드리뷰에서 발견. | 2026-05-12
- [ ] #41 | [refactor] `favorite-stops/index.ts:349` `as` 타입 단언 제거 — `existing.provider as "seoul" | "gyeonggi" | "odsay_fallback"`. typescript-conventions.md "`as` 단언 금지" 위반. `isStopProvider` 타입 가드 함수로 대체. 경기버스 fix(2026-05-12) 코드리뷰에서 발견. | 2026-05-12

- [ ] #42 | [feat/UX] 경로 추가 플로우 전면 개편 — 사용자 보고(2026-05-31): "경로 추가가 너무 불편하다". **P0-1 입력 UX 재정비**: 출발/도착 세로 스택, "집/회사" 즐겨찾기 단축(favorites 도메인 재활용), 현재 위치 버튼(Geolocation), 둘 다 채워지면 자동 검색 트리거, 경로 이름 `출발지 → 도착지` 자동 생성. **P0-2 ODsay 옵션 풀가동**(코드 결함 명확 — `route-search/index.ts:92`, `odsayClient.ts:222-228` SX/SY/EX/EY/apiKey만 보냄): `SearchPathType` 토글(전체/지하철만/버스만), 정렬 칩 → 서버 재호출(`OPT` 변경), 초기 검색 시 OPT=0(추천)+OPT=4(최소환승) 병렬 호출 후 merge+dedupe, "ODsay 기반이라 네이버와 다를 수 있어요" onboarding 1회. **P1-1 결과 카드 시각화(지도 옵션 A)**: subPath 미리보기 펼친 채로 한 줄 표시(`🚶5분 → 🚌146(8정거장) → 🚇2 강남→역삼 → 🚶3분`), 노선 색상 chip 가로 배치, SVG 폴리라인 미니맵(좌표 점만). **P1-2 "전체 추가" 의도 일치**: ODsay route-search 결과의 노선을 `busNumbers`에 자동 체크, 노선 미선택 노드 인라인 빨간 보더 즉시 표시(저장 누르기 전부터), 추가 후 첫 미선택 노드로 자동 스크롤. **P2 정적 지도 이미지(옵션 B)**: 네이버/카카오 Static Map API 도입, 결과 카드+RouteNodeCard 썸네일, 좌표쌍 1일 캐시. 작은 follow-up: PlacePicker 결과 8→20개 + 거리순, UnifiedStopPicker 지하철 방향 선택 복원. 상세 분석 conversation 참고. | 2026-05-31

## ✅ 완료
- [x] #BB8 | [feat] 지하철 급행 표시 (`(급)` prefix) — BE 응답 `btrainSttus` raw 동봉 (5종 enum + 미지 anomaly) + FE `formatTrainTypeShort` 헬퍼 + Home/Favorites 도착 카드 모든 위치(9곳)에 헤드사인 prefix. 색 강조 없이 일반 텍스트색. 추가로 4필드 (`destinationName`/`arrivalSeconds`/`dataTimestamp`/`isLastTrain`) 동시 도입. seoul-subway.md 전체 필드표 갱신. BE 테스트 6건. (완료일: 2026-05-11)
- [x] #BB9 | [chore] 모바일 보강 일괄 — M1(Dialog 키보드 회피 translate calc), M2(safeStorage), M3(usePageVisibility로 백그라운드 polling 정지), M4(savingLockRef 더블탭 가드 4곳), M5(manifest portrait + display_override + categories + maskable), M6(--border-focus/--ring-focus 토큰화 4곳), M8(UnifiedStopPicker IME composition), M9(Toaster safe-area-inset-top offset), M10(touch-action: manipulation 전역), M11(BottomNav backdrop-blur fallback alpha), M14(useOnlineStatus 오프라인 토스트). 백로그 #29/#30/#32/#33/#34/#35로 follow-up 분리. (완료일: 2026-05-11)
- [x] #BB1 | [bug] SetupRoute sticky 저장 버튼 검은 직사각형 (글씨 안 보임) — 어제 검은 버튼 일괄 fix(#27)에서 line 584(자동검색)만 적용되고 line 735(sticky 저장)가 누락. `text-white` 추가. (완료일: 2026-05-11)
- [x] #BB2 | [bug] AddFavorite BusRouteSelectStep 저장 버튼 검은 직사각형 (잠재) — line 145에 `text-white` 누락. 같은 회귀 패턴이라 함께 fix. (완료일: 2026-05-11)
- [x] #BB3 | [bug] Home 도착 상세 카드 3번째/4번째 행에 행선지(headsign) 누락 — `extraItems` 매핑에서 `item.headsign` 표시 안 함. isGrouped true/false 둘 다 추가. (완료일: 2026-05-11)
- [x] #BB4 | [bug] Home 미니카드 펼침 row에 지하철 headsign 누락 — 4호선처럼 양방향이 모두 표시되는 stop에서 어느 방향인지 분간 불가. `getMatchedSubwayItems` 적용해 첫 차/두 번째 차 headsign 표시. (완료일: 2026-05-11)
- [x] #BB5 | [bug] UnifiedStopPicker 검색 결과 row에 ARS 번호 누락 — 사용자 보고. 다른 화면(Home/Favorites/AddFavorite/RouteNodeCard/SearchResultNode)에는 다 표시되는데 picker만 빠짐. (완료일: 2026-05-11)
- [x] #BB6 | [chore] 모바일 플랫폼 정책 인프라 — `<meta color-scheme=light>` + `theme-color=#F6F7F9` + manifest + `interactive-widget=resizes-content` + `useKeyboardInset` 훅 + PageShell/BottomNav/SetupRoute sticky 키보드 회피. 자세한 내용은 `docs/tech-notes/mobile-platform-policy.md`. (완료일: 2026-05-11)
- [x] #BB7 | [chore] 직접 `<input>` font-size 16px 보장 — UnifiedStopPicker / AddFavorite alias input 2곳. iOS Safari zoom-in 차단. (완료일: 2026-05-11)

- [x] #B2 | [bug] SetupRoute 수동 검색에서 지하철 검색 안 됨 — `search-stops`에서 ODsay 응답을 subway-first 안정 정렬로 수정. 원인: ODsay가 `[버스, 지하철]` 순으로 merge → FE `slice(0, 10)` cap에서 지하철 잘림 (완료일: 2026-05-09)
- [x] #B3 | [bug] 경로 노드 드래그앤드롭 안 됨 — 의도적으로 제거된 기능이었음. 무효 처리 (완료일: 2026-05-09)
- [x] #1 | [feat] GET /stop-routes — 정류장 노선 목록 API (서울 버스 API `getRouteByStation` 권한 승인 확인 + 테스트 완료) | 2026-04-21
