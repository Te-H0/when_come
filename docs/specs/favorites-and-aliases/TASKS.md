# TASKS — 즐겨찾기 + 별명 (favorites-and-aliases)

- **상태:** Phase 2 완료 (2026-05-09) — Phase 2-2(D11 subway-station-directions endpoint) + Phase 3(FE) 착수 가능. PRD D10 추가 (2026-05-08)로 T16 분리 + Phase 2-2 신설. **D11 추가 (2026-05-08)로 Phase 2-2 단순화 — T10-a/T10-b/T10-b' → T10-b'' 단일 task로 통합**
- **선행 문서:** `PRD.md`, `SDD.md`, `docs/api/contracts/favorites.md` (예정)
- **승인 후 위임:** be-agent (Phase 1~2) → fe-agent (Phase 3~5) → 정리 (Phase 6)

> 각 task 완료 시 체크박스 + 완료일 표기 (rule: docs-maintenance.md).
> 추정 분량 단위 — S: ~2시간 / M: ~반나절 / L: 1일 이상

---

## Phase 0 — 사전 정리 (선행)

- [ ] **U2.** PRD/SDD/계약서 사용자 승인 — Phase 1 착수 전.

> **제거됨 (2026-05-08 결정):**
> - ~~U1. 백로그 #B3 사전 해결~~ — PRD D4 결정으로 무효 처리. SetupRoute의 dnd 제거는 의도적이었으며, 본 spec의 정렬은 새 dnd 인프라로 처음부터 구현 (T20/T21에 통합).
> - ~~U3. `routes.active` 컬럼 존재 여부 확인~~ — PRD D2로 신규 추가 확정. T3-a로 마이그레이션 task 신설.

---

## Phase 1 — BE DB 마이그레이션 (be-agent)

### T1. `favorite_stops` + `favorite_stop_routes` 테이블 생성
- 파일: `supabase/migrations/20260509000000_create_favorite_stops.sql`
- 내용: SDD §2.1, §2.2 (테이블 + 인덱스 + RLS)
- **수용 기준:**
  - `supabase db push` 성공
  - anon select with auth.uid() 일치 시만 row 노출 검증
  - 다른 사용자 id로 select 0건 검증
- 의존: 없음
- 분량: M
- [x] 완료 (2026-05-09)

### T2. `route_stops.alias` 컬럼 추가
- 파일: `supabase/migrations/20260509000100_add_alias_to_route_stops.sql`
- 내용: SDD §2.3
- **수용 기준:**
  - 기존 row 영향 없음 (NULL로 채워짐)
  - GET /routes 응답에 alias 노출 (T6에서 확인)
- 의존: 없음
- 분량: S
- [x] 완료 (2026-05-09)

### T3. `routes.display_order` 컬럼 + 백필
- 파일: `supabase/migrations/20260509000200_add_display_order_to_routes.sql`
- 내용: SDD §2.4 (alter + backfill SQL + NOT NULL + index)
- **수용 기준:**
  - 기존 사용자 데이터 모두 백필 완료 (NULL row 0개)
  - 사용자별로 display_order가 0..N 연속 정수
  - GET /routes 응답에 display_order 노출 + 정렬 검증
- 의존: 없음
- 분량: M
- [x] 완료 (2026-05-09)

### T3-a. `routes.active` 컬럼 + 백필 (PRD D2)
- 파일: `supabase/migrations/20260509000300_add_active_to_routes.sql`
- 내용: SDD §2.5
  - `alter table routes add column active boolean;`
  - `update routes set active = true where active is null;`
  - `alter table routes alter column active set not null;`
  - `alter table routes alter column active set default true;`
- **수용 기준:**
  - 기존 row 모두 `active = true`로 백필 (NULL 0개)
  - 신규 routes insert 시 default `true`
  - GET /routes 응답에 `active` 필드 노출
- 의존: 없음 (T1/T2/T3과 병렬 가능)
- 분량: S
- [x] 완료 (2026-05-09)

---

## Phase 2 — BE Edge Functions (be-agent, TDD)

### T4. `favorite-stops` Edge Function — GET (목록)
- 파일: `supabase/functions/favorite-stops/index.ts`, `_tests/favorite-stops_test.ts`
- 내용: SDD §3.1 + 정렬 (display_order asc, created_at asc)
- **테스트:**
  - GET 정상 (빈 목록 + 1개 + N개)
  - 401 (인증 헤더 없음)
  - 다른 사용자의 데이터 노출 안 됨 (RLS)
  - OPTIONS preflight
- 의존: T1
- 분량: M
- [x] 완료 (2026-05-09)

### T5. `favorite-stops` POST (생성) + provider 매핑
- 같은 파일에 메서드 추가
- 내용: SDD §3.2 — `_shared/regionMapper.resolveStopProvider` 재사용
- **테스트:**
  - 정상 (서울 / 경기 / fallback 케이스 각각)
  - 별명 빈 문자열 → null 정규화 검증
  - 좌표 누락 시 'seoul' fallback (한 사이클 호환)
  - 400 (필수 필드 누락 — odsayStopId, stopName, stopType)
  - **400 노선 0개 reject (PRD D5) — `routes: []` 또는 `routes` 누락 시 `FAVORITE_ROUTES_REQUIRED`**
  - display_order 자동 부여 (max+1)
  - favorite_stop_routes bulk insert 트랜잭션 검증 (실패 시 favorite_stops도 롤백)
- 의존: T1, T4
- 분량: L
- [x] 완료 (2026-05-09)

### T6. `favorite-stops` PATCH (수정)
- 같은 파일에 메서드 추가
- 내용: SDD §3.3 — alias / displayOrder / routes 각각 부분 수정
- **테스트:**
  - alias 변경 (값 / null / 빈 문자열 → null)
  - displayOrder 변경 (단일 row)
  - routes 전체 교체 (트랜잭션 — 기존 favorite_stop_routes 삭제 후 재삽입)
  - **400 노선 0개 reject (PRD D5) — `routes: []` 시 `FAVORITE_ROUTES_REQUIRED`. 노선 모두 비우려면 DELETE 사용 안내**
  - 401 / 404 (없는 id) / RLS (다른 사용자 id)
- 의존: T1, T5
- 분량: M
- [x] 완료 (2026-05-09)

### T7. `favorite-stops` DELETE
- 같은 파일에 메서드 추가
- **테스트:**
  - 정상 204
  - cascade로 favorite_stop_routes 자동 삭제 검증
  - 401 / 404 / RLS
- 의존: T1
- 분량: S
- [x] 완료 (2026-05-09)

### T8. `routes` PATCH 확장
- 파일: `supabase/functions/routes/index.ts`, `_tests/routes_patch_test.ts`
- 내용: SDD §3.5 — name / displayOrder / active / stops 부분 수정
- **테스트:**
  - displayOrder 단일 update
  - name 단일 update
  - stops 전체 교체 (기존 PUT 시맨틱 — provider 재매핑 포함)
  - **active 토글 (PRD D2 확정) — true ↔ false 양방향. GET /routes 응답에 변경 반영**
  - 401 / 404 / RLS
- 의존: T3, T3-a
- 분량: M
- [x] 완료 (2026-05-09)

### T9. `route-stops` PATCH (별명 전용)
- 파일: `supabase/functions/route-stops/index.ts`, `_tests/route-stops_patch_test.ts`
- 내용: SDD §3.6
- **테스트:**
  - alias 변경 (값 / null / 빈 문자열 → null)
  - 401 / 404 / RLS (해당 route_stop의 부모 routes의 user_id 검증)
- 의존: T2
- 분량: S
- [x] 완료 (2026-05-09)

### T10. `arrival-info` 확장 — favorite_stops lookup
- 파일: `supabase/functions/arrival-info/index.ts`, 기존 테스트 확장
- 내용: SDD §3.7 — stopId가 route_stops에 없으면 favorite_stops 조회
- **테스트:**
  - stopId가 favorite_stops 케이스 → 정상 응답 (provider 분기 동일)
  - stopId가 둘 다 없는 케이스 → 404 ARRIVAL_STOP_NOT_FOUND
  - 기존 route_stops 케이스 회귀 (변경 없음)
- 의존: T1
- 분량: M
- [x] 완료 (2026-05-09)

---

## Phase 2-2 — 지하철 호선/방향 정보 endpoint (be-agent, PRD D10 + D11)

> Phase 3 FE의 T16-A(`<UnifiedStopPicker>`) 호선/방향 단계가 의존하는 BE 데이터. Phase 3 진입 전 또는 병렬로 진행.
>
> **D11 단순화 (2026-05-08):** ODsay `subwayStationInfo` 단일 호출로 prev/next 다음 역 1개씩 추출. 새 테이블/cron 불필요. 옵션 A/B/C 폐기 → 단일 task로 통합.

### T10-b''. `subway-station-directions` endpoint 신설 (D11)
- 파일: `supabase/functions/subway-station-directions/index.ts`, `_tests/subway-station-directions_test.ts`
- 내용: SDD §3.7-pre 채택안 — `GET /subway-station-directions?stationId={odsayStationId}`
  - ODsay `subwayStationInfo` 호출 → `prevOBJ`/`nextOBJ`에서 다음 역 1개씩 추출
  - 응답: `{ stationName, lineName, subwayId, directions: [{updn,nextStop}, ...] }` (1~2개)
  - 종착역은 한 방향만 존재 → `directions.length === 1`
  - 인증 정책: 검색 흐름의 일부 → anon 허용 (search-stops와 동일)
- **테스트:**
  - 정상 — 양방향 (`directions.length === 2`)
  - 종착역 — 단방향 (`directions.length === 1`)
  - `stationId` 누락 → 400
  - 존재하지 않는 stationId → 404 `STATION_NOT_FOUND`
  - 외부 ODsay API 장애 → 502 `ARRIVAL_PROVIDER_ERROR`
  - OPTIONS preflight
  - 응답에 `stationName`/`lineName`/`subwayId` 모두 동봉 검증 (FE 호선 row 노출용)
- 의존: 없음 (Phase 1 마이그레이션 무관 — DB 스키마 변경 없음)
- 분량: M

> **제거됨 (2026-05-08 D11):**
> - ~~T10-a 호선/방향 데이터 출처 조사 (api-expert)~~ — D11로 ODsay `subwayStationInfo` 단일 호출 확정. 별도 조사 task 불필요.
> - ~~T10-b 옵션 A 구현 (`/subway-line-headsigns` + cron)~~ — 폐기.
> - ~~T10-b' 옵션 B 구현 (`/search-stops` 응답 확장 — `subwayLines: [{terminals}]`)~~ — D11으로 양 종착지 N개 표시 자체가 사라짐. search-stops `laneName`/`subwayId` 노출은 별개 트랙.
> - ~~`subway_line_headsigns` 테이블 마이그레이션~~ — 신설 안 함 (Phase 1에 추가하지 않은 상태).

---

## Phase 3 — FE 공용 컴포넌트 + lib (fe-agent)

### T11. 도메인 타입 확장
- 파일: `src/lib/mockData.ts` (또는 도메인 타입 파일)
- 내용:
  - `TransitStop`에 `alias?: string | null` 추가
  - `SavedRoute`에 `displayOrder?: number` 추가
  - `SavedRoute`에 `active?: boolean` 추가 (PRD D2)
  - `FavoriteStop` 타입 신규 추가
- **수용 기준:** 타입 체크 통과, 기존 사용처 영향 없음 (옵셔널)
- 의존: 없음
- 분량: S

### T12. `lib/api.ts` 확장
- 파일: `src/lib/api.ts`
- 내용:
  - `fetchFavoriteStops()` / `createFavoriteStop()` / `updateFavoriteStop()` / `deleteFavoriteStop()`
  - `patchRoute(id, partial)` (기존 PUT 외 추가)
  - `patchRouteStop(id, { alias })`
- **수용 기준:** 응답 normalize (에러 코드 추출 — 기존 패턴 따름)
- 의존: T11
- 분량: M

### T13. `<StopName>` 공용 컴포넌트
- 파일: `src/components/StopName.tsx`
- 내용: SDD §4.2
- **수용 기준:**
  - 본명만 / 본명+별명 / size 변형 / editable 모드 모두 렌더 OK
  - editable일 때 연필 클릭 → onEditAlias 호출 (실제 저장 로직은 부모)
  - Storybook 없으므로 실 사용처 1곳에서 시각 확인
- 의존: T11
- 분량: M

### T14. `<AliasEditor>` 인라인 편집
- 파일: `src/components/AliasEditor.tsx`
- 내용: SDD §4.2
- **수용 기준:**
  - input + 저장/삭제(휴지통)/취소(X)
  - Enter = 저장, Esc = 취소
  - 빈 문자열 저장 = null로 정규화 후 onSave 호출
  - maxLength 20 (props로 변경 가능)
- 의존: T13
- 분량: M

### T15. `<StopName>` 8개 자리 적용
- 파일: SDD §7 체크리스트
- 내용: 모든 정류장 표시 자리에 `<StopName>`로 치환
- **수용 기준:** 8개 자리 모두 동일 컴포넌트 사용. 코드 리뷰 + dev 서버에서 시각 확인.
- 의존: T13, T14
- 분량: M

---

## Phase 4 — FE 즐겨찾기 페이지 (fe-agent)

### T16-A. `<UnifiedStopPicker>` 공용 컴포넌트 (PRD D10 + D11 — 기존 T16 재정의)
- 파일: `src/features/stop-picker/components/UnifiedStopPicker.tsx`
- 내용: SDD §4.2 `<UnifiedStopPicker>` — 검색 → 결과 선택 → (지하철) 호선/방향 / (버스) 노선 다중 선택. payload 산출까지.
- **상태 머신:** `searching → resultSelected (bus) | lineSelecting → directionSelecting (subway) → done`
- **수용 기준:**
  - 검색 단계: 기존 SetupRoute 검색 입력 UX와 동등 (debounce, 결과 리스트)
  - 버스 결과 선택: 노선 다중 체크 → 1개 이상 선택 시 done
  - 지하철 결과 선택 (단일호선역): 호선 단계 자동 통과 → 방향 chip 노출 → 선택 시 done
  - 지하철 결과 선택 (환승역): 호선 chip 노출 → 선택 → 방향 chip → 선택 시 done
  - **방향 chip 표시 (D11): 양방향 다음 역 1개씩** (예: "시청 방향(상행)" / "남영 방향(하행)"). 종착역은 단방향 1개.
  - 호선/방향 정보 fetch 실패: 확인 다이얼로그 → 사용자 동의 시 NULL payload로 done
  - payload 형식: `{ stop, routes, subway? }` — SDD §4.2의 `StopPickerPayload`와 일치. `subway.direction`은 `{updn, nextStop}` (headsign 없음 — D11)
  - onCancel 핸들러 호출 정상
- **의존 데이터:** T10-b'' (subway-station-directions endpoint)
- 의존: T10-b''
- 분량: L

### T16-B. SetupRoute 수동 검색을 `<UnifiedStopPicker>`로 교체
- 파일: `src/features/setup/pages/SetupRoute.tsx`
- 내용:
  - 기존 inline 검색 UI 제거 → `<UnifiedStopPicker>` 사용
  - done payload 도착 시 RouteNodeCard 추가 → picker는 검색 단계로 자동 리셋(연속 추가 UX 보존)
  - 지하철 노드는 `subwayCode`/`directionHeadsign`/`directionUpdn`/`directionNextStop`을 정상 채워 저장
- **수용 기준:**
  - 기존 수동 검색 흐름 회귀 없음 (정류장/지하철 추가 후 저장 → GET /routes에서 정상 노출)
  - 신규: 지하철 노드의 `direction_*` 필드가 NULL이 아닌 정상 값으로 저장됨
  - route-search 결과 일괄 추가 분기는 영향 없음 (별도 흐름 유지)
- 의존: T16-A
- 분량: M

### T17. `Favorites.tsx` 페이지
- 파일: `src/features/favorite/pages/Favorites.tsx`, `src/features/favorite/components/FavoriteStopCard.tsx`
- 내용: SDD §4.2 — 빈 상태 / 카드 리스트 / 새로고침 / `+` 진입점
- **수용 기준:**
  - GET /favorite-stops 호출 + display_order 정렬
  - 카드별 도착 정보 (기존 TransitCard 또는 추상화 재사용 — 홈과 동일 형식)
  - 빈 상태 카피 + `+` 강조
- 의존: T11, T12, T15, T17의 도착 카드 추상화
- 분량: L

### T18. `AddFavorite.tsx` 추가 화면
- 파일: `src/features/favorite/pages/AddFavorite.tsx`
- 내용: SDD §4.2 — `<UnifiedStopPicker>` 사용 → 별명 입력 → 저장
- **수용 기준:**
  - `<UnifiedStopPicker>` 재사용 (T16-A)
  - 버스: 노선 다중 체크 / 지하철: 호선 + 방향 단계 정상 동작
  - **지하철 즐겨찾기에 `directionHeadsign` / `directionUpdn` / `subwayCode`가 정상 저장됨 (PRD D10) — 호선/방향 정보 미제공 폴백 시에만 NULL 저장 허용**
  - 별명 input (선택)
  - **저장 버튼 disabled 조건 (PRD D5): 노선 선택 0개일 때 저장 불가. 정류장 미선택일 때도 disabled.**
  - 저장 후 /favorites navigate
  - 에러 토스트 (BE의 `FAVORITE_ROUTES_REQUIRED` 응답 포함 핸들링)
- 의존: T16-A, T12
- 분량: L

### T19. 라우트 추가 + BottomNav 변경
- 파일: `src/app/routes.ts`, `src/components/BottomNav.tsx`
- 내용: SDD §8 — `/favorites`, `/favorites/add` + 라벨 변경
- **수용 기준:**
  - "경로 등록" → "즐겨찾기" 라벨 + 링크
  - 활성 탭 표시 정상
- 의존: T17
- 분량: S

---

## Phase 5 — FE 정렬 + 내 경로 개편 (fe-agent)

### T20-pre. dnd 인프라 도입 (PRD D4 확정)
- 파일: `package.json`, `src/main.tsx` (또는 `App.tsx`의 DndProvider 위치)
- 내용:
  - `react-dnd-multi-backend` (또는 `react-dnd-touch-backend`) 의존성 추가
  - 기존 `react-dnd` + `react-dnd-html5-backend`만 있던 자리에 multi-backend 적용
  - DndProvider backend 교체 (HTML5 + Touch 자동 전환)
- **수용 기준:**
  - 데스크톱 마우스 드래그 정상
  - 모바일(Safari/Chrome 터치) 드래그 정상 — 핵심 검증 포인트
  - SetupRoute 등 기존 화면 회귀 없음 (현재 dnd 사용처 0이므로 영향 적음)
- 의존: 없음 (Phase 5 진입 전 1회)
- 분량: S

### T20. Home 상단 경로 칩 DnD 정렬
- 파일: `src/features/home/pages/Home.tsx`
- 내용: SDD §6 — chip drag, 드롭 시 변경된 항목만 PATCH
- **수용 기준:**
  - 드래그 시 시각 피드백
  - 드롭 시 displayOrder PATCH (Promise.all)
  - optimistic update + onError rollback
  - 모바일 터치 드래그 정상
- 의존: T12, T20-pre
- 분량: M

### T21. Favorites 목록 길게 누름 정렬
- 파일: `src/features/favorite/pages/Favorites.tsx`
- 내용: SDD §6 — 길게 누르기 → 이동 모드 → 드래그
- **수용 기준:**
  - 일반 탭은 카드 진입(없음 — 카드 자체가 도착 표시) / 길게 누르기 = 이동 모드
  - 모드 진입 시각 피드백 (카드 진동/그림자)
  - 드롭 시 PATCH
  - 모바일 터치 드래그 정상
- 의존: T17, T20-pre
- 분량: M

### T22. RouteManagement 두 섹션 + 항목 메뉴 + 수정 진입
- 파일: `src/features/route/pages/RouteManagement.tsx`
- 내용:
  - 두 섹션 (경로 / 즐겨찾기)
  - 각 항목 탭 → 액션 시트 (수정 / 삭제 / (경로) 활성화 토글)
  - "수정" → `/setup?routeId=:id`로 navigate
- **수용 기준:**
  - 각 섹션 빈 상태 처리
  - 즐겨찾기 항목 = `<FavoriteStopCard>` 재사용 또는 동일 형태
  - 액션 시트 UX (현재 `...` 메뉴 통합)
- 의존: T11, T12, T17
- 분량: L

### T23. SetupRoute 편집 모드
- 파일: `src/features/setup/pages/SetupRoute.tsx`
- 내용:
  - URL `?routeId=:id` (또는 `/setup/:id`) 처리
  - 진입 시 GET /routes/:id로 prefill
  - 저장 시 PATCH /routes/:id (stops 전체 교체)
- **수용 기준:**
  - 신규/편집 흐름 모두 정상
  - 편집 헤더 "경로 수정 중" 표시
  - 활성 경로 편집 시 ID 유지 (홈 화면 깨짐 없음)
- 의존: T12, T22
- 분량: L

---

## Phase 6 — 통합 + QA (be/fe 합동)

### T24. 별명 표시 8개 자리 수동 QA
- 내용: SDD §7 체크리스트 8개 자리 직접 확인
- **수용 기준:** 모든 자리에서 본명+별명 함께 표시, 본명만 있을 때도 깨짐 없음
- 의존: T15
- 분량: S

### T25. 정렬 영속성 QA
- 내용:
  - 홈 칩 정렬 → 새로고침 후 보존
  - Favorites 정렬 → 새로고침 후 보존
  - 다른 디바이스(브라우저)에서 동일 순서 노출
- 의존: T20, T21
- 분량: S

### T26. 경기 정류장 즐겨찾기 QA
- 내용:
  - 광명사거리역 정류장 즐겨찾기 등록
  - provider 매핑 정상 (gyeonggi)
  - 도착 정보 정상 노출
- 의존: T5, T17
- 분량: S

### T27. 경로 수정 회귀 QA
- 내용:
  - 활성 경로 수정 → 홈 화면 정상 유지
  - 정류장 교체 / 노선 변경 / 방향 변경 모두 정상
  - PUT (legacy)와 PATCH 두 흐름 모두 동작
- 의존: T8, T23
- 분량: M

---

## Phase 7 — 정리 (자동)

### T28. 아키텍처 문서 갱신
- 파일:
  - `when_come_fe/docs/architecture/overview.md` — 도메인 섹션에 `favorite` 추가, 라우팅 추가, `<StopName>` 언급
  - `when_come_be/docs/architecture/overview.md` — `favorite-stops` Function 추가, `favorite_stops`/`favorite_stop_routes` 테이블 추가
- 의존: T1~T23 완료
- 분량: S

### T29. `docs/api/contracts/favorites.md` 응답 예시 업데이트
- 내용: 실제 응답 캡처해 Examples 섹션에 추가
- 의존: T5~T7
- 분량: S

### T30. ADR 작성 (선택)
- 파일: `docs/decisions/ADR-004-favorite-stops-and-aliases.md`
- 내용:
  - Decision: 즐겨찾기와 경로의 분리, 별명을 컨텍스트별 분리, stopId 풀 통합
  - Alternatives: 인라인 jsonb, 즐겨찾기 = 1-stop 경로로 통합, etc.
  - Consequences
- 의존: 본 spec 통과
- 분량: S

### T31. PRD/SDD/TASKS 상태 갱신
- 모든 task 완료 후 PRD/SDD 상태를 "구현 완료"로 업데이트, 본 TASKS 상태 갱신.
- 의존: T1~T30 완료
- 분량: S

---

## 의존성 그래프 (요약)

```
T1 ─┬─ T4 ─ T5 ─ T6 ─┐         T11 ─ T12 ─┬─ T13 ─ T14 ─ T15
    └─ T7              │                    │
T2 ─── T9              │
T3 ─┬─ T8              │       T10-b'' ────┐
T3-a┘                  │                    │
T1 ─── T10             │                    │
                       │            T16-A ◀─┘
                       │            T16-A ─┬─ T16-B (SetupRoute 교체)
                       │                   └─ T18 (AddFavorite)
                       │            T17 ─ T19
                       │            T20-pre ─┬─ T20 (T12 + T20-pre)
                       │                     └─ T21 (T17 + T20-pre)
                       │            T22 ─ T23
                       │
                       └─ T24 ~ T27 ~ T31
```

병렬 가능:
- Phase 1 (T1·T2·T3·T3-a) 동시 적용
- Phase 2 BE (T4~T10)와 Phase 3 FE 컴포넌트 (T11~T15)는 계약서 확정 후 병렬
- **Phase 2-2 (T10-b'' subway-station-directions)는 Phase 3 FE 컴포넌트(T11~T15)와 병렬 가능. T16-A 진입 전엔 endpoint 배포 필요**
- T16-A는 T17/T18/T16-B 진입 전에 완료 — 공용 컴포넌트라 후속 모두가 의존
- T16-B(SetupRoute 교체)는 T16-A 완료 후 단독 진행 가능 — T18과 병렬
- T20-pre는 Phase 5 진입 전 1회 — T20/T21의 선행
- T22/T23은 순차 (RouteManagement → SetupRoute 편집 모드)
- **T16-B와 T23은 순차 권장:** 둘 다 SetupRoute 수정. T16-B(수동 검색 교체) → T23(편집 모드) 순서로 가면 충돌 적음
