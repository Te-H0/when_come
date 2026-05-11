# 서비스 구조도

> 아키텍처 변경 시 자동 업데이트됨

## 레이어 구조

```
Page
 └─ Feature Component (도메인 로직)
     ├─ Custom Hook (상태/비즈니스)
     │   └─ Service / React Query (서버 상태) ← API 연동 후 적용
     │       └─ API Client (axios)
     └─ UI Component (순수 UI)
```

## 폴더 구조

```
src/
├── app/
│   ├── App.tsx
│   └── routes.ts
├── components/
│   ├── ui/                   ← shadcn/ui 컴포넌트
│   ├── BottomNav.tsx         ← 공유 내비게이션 (아이콘 22px + 라벨 text-caption, height 56px, indicator 없음, --bottom-nav-total로 PageShell padding과 정합)
│   ├── PageShell.tsx         ← 페이지 래퍼 (h-dvh flex-col, main padding-bottom = --bottom-nav-total + 24px breathing, reserveStickyFooter면 +56px)
│   ├── PageHeader.tsx        ← 스티키 헤더 (뒤로가기/제목/배지/우측슬롯/하단슬롯)
│   ├── EmptyState.tsx        ← 공용 빈 상태 UI (아이콘+제목+설명+CTA 카드)
│   ├── StopName.tsx          ← 정류장/역 이름 표시 (별명 병기 지원)
│   ├── AliasEditor.tsx       ← 별명 인라인 편집 컴포넌트 (외부 클릭 시 cancel + 닫기, mousedown 감지)
│   ├── StopRouteChips.tsx    ← 정류장 노선 chip 렌더링 공용 컴포넌트 (버스/지하철 transitColors 적용)
│   └── figma/
│       └── ImageWithFallback.tsx
├── features/
│   ├── home/
│   │   └── pages/Home.tsx
│   ├── setup/
│   │   ├── components/       ← RouteNodeCard, SearchResultNode
│   │   └── pages/SetupRoute.tsx
│   ├── route/
│   │   ├── components/       ← TransitCard, RouteProgress, RouteOption
│   │   └── pages/RouteManagement.tsx
│   ├── favorites/
│   │   └── pages/Favorites.tsx   ← 즐겨찾기 탭 (Stage B에서 본격 구현)
│   └── stop-picker/
│       └── UnifiedStopPicker.tsx ← 검색+호선+방향 multi-step 정류장 선택 UI
├── lib/
│   ├── api.ts                ← API 클라이언트 함수 (ApiError 포함)
│   ├── arrival.ts            ← 실시간 도착정보 fetch/파싱 로직
│   ├── mappers.ts            ← API 응답 → 도메인 모델 변환
│   ├── mockData.ts           ← TransitStop, SavedRoute 타입 정의 + mock 데이터
│   ├── errorMessages.ts      ← 에러 코드 → 사용자 메시지 매핑 (ADR-002)
│   ├── errorToast.ts         ← showApiErrorToast/getErrorMessage 헬퍼 (dev에서 [CODE/STATUS] prefix)
│   ├── clientErrorLog.ts     ← logClientError — apiFetch catch에서 fire-and-forget BE 송신 (네트워크/4xx/5xx/parse 에러 → /client-log)
│   ├── useVersionCheck.ts    ← 새 배포 감지 훅 (5분 polling + visibilitychange) → sonner 토스트 + 새로고침 액션
│   ├── useKeyboardInset.ts   ← 모바일 키보드 가시영역 → CSS 변수 `--keyboard-inset-height` 갱신 (visualViewport 기반). PageShell/BottomNav/SetupRoute sticky 저장 버튼/Dialog가 참조. App 최상위 1회 호출.
│   ├── usePageVisibility.ts  ← `document.visibilitychange` 추적. Home/Favorites 카운트다운 1초 tick을 화면 안 보일 때 정지 — 배터리/CPU 절약 (2026-05-11~)
│   ├── useOnlineStatus.ts    ← online/offline 이벤트 → 오프라인 진입 시 sonner 토스트(duration Infinity) + 복귀 시 자동 dismiss. App 최상위 1회 호출 (2026-05-11~)
│   ├── safeStorage.ts        ← localStorage try/catch wrapper — 사파리 사적 브라우징/quota 차단 환경에서 throw 차단. 모든 localStorage 접근은 이것만 사용 (2026-05-11~)
│   ├── useSubmitGuard.ts     ← 저장 버튼 더블탭 가드 헬퍼 (참고용). 실제로는 각 핸들러에 inline `savingLockRef` 패턴 사용 — 같은 컴포넌트 내 다른 핸들러가 lock 공유 케이스 대응 (2026-05-11~)
│   └── supabase.ts           ← Supabase 클라이언트 + dev 자동 로그인 분기
├── types/
│   ├── api.ts                ← API DTO 타입
│   └── errorCodes.ts         ← BE errorCodes.ts 거울복사 (수동 동기화)
├── utils/
│   ├── transitColors.ts      ← 버스/지하철 공식 색상 매핑
│   ├── stationName.ts        ← 지하철 역명 정규화
│   └── arrivalDisplay.tsx    ← ArrivalText/splitArrival/parseArrivalToken (Home/Favorites 공용)
└── styles/
    └── theme.css             ← Tailwind v4 CSS custom properties + 디자인 토큰 (ADR-003)
```

## 도메인

| 도메인 | 설명 | 주요 컴포넌트 |
|--------|------|--------------|
| route | 저장된 경로 관리 | `RouteManagement.tsx` |
| setup | 경로 생성/편집 | `SetupRoute.tsx` |
| home | 활성 경로 대시보드 | `Home.tsx` |
| favorites | 즐겨찾기 정류장 관리 | `Favorites.tsx` (Stage B 구현 예정) |
| stop-picker | 정류장 검색+호선+방향 선택 | `UnifiedStopPicker.tsx` |

## 라우팅

| Route | Page | Purpose |
|-------|------|---------|
| `/` | `Home.tsx` | 활성 경로 대시보드 — 현재 구간, 도착 시간 |
| `/setup` | `SetupRoute.tsx` | 경로 빌더 — 정류장 검색/추가 (홈 상단 버튼으로만 진입) |
| `/favorites` | `Favorites.tsx` | 즐겨찾기 탭 (푸터 탭 2번) |
| `/routes` | `RouteManagement.tsx` | 저장된 경로 CRUD |

## 상태 관리 전략

| 상태 종류 | 도구 | 예시 |
|-----------|------|------|
| 서버 상태 | TanStack Query | 경로 목록, 도착정보 |
| 클라이언트 전역 | Zustand (최소화) | 활성 경로 ID |
| 지역 UI 상태 | useState | 모달 열림/닫힘, 드래그 상태 |

## 실시간 도착정보 조회 전략

```
fetchArrival(stop)
  ├─ subway → GET /arrival-info?type=subway&stationName=...  (변경 없음)
  └─ bus
      ├─ 신 경로 → GET /arrival-info?stopId={route_stops.id}
      │             BE가 route_stops.provider로 자동 분기 (서울/경기/ODsay-fallback)
      │             응답: BusArrivalResponse { items, provider, fetchedAt }
      └─ legacy fallback (신 경로 실패 시, 한 사이클 호환)
          ├─ ODsay stationId 있음 → GET /arrival-info?type=odsay&stationId=...
          └─ arsId 있음 → GET /arrival-info?type=bus&busRouteId=...&arsId=...
```

- **신 경로(2026-05-02~):** `stop.id`(= `route_stops.id`) 하나만 전달 — FE는 provider를 모름. BE 미배포 시 자동으로 legacy fallback.
- `provider === 'odsay_fallback'`인 stop 카드에 inline 안내 노출: "도착 정보가 부정확할 수 있어요 (제휴 데이터 사용)"
- `subwayCode`는 서울 지하철 API 형식(`"1002"`) 사용 — arrival `lineName`과 직접 비교
- **도착정보 조회 범위 (2026-05-10~):** 모든 그룹(과거 포함)을 동시 조회 — past/future 통합
  - `allSegments = groupedSegments.flat()` (이전 nonPastSegments → 전체로 확장)
  - `useQueries`로 per-stop 독립 쿼리, `arrivalByStopId: Map<stopId, {data, isLoading}>` 맵으로 참조
  - 현재 스텝(`isCurrent`): 도착 상세 카드 (노선별 전체 표시)
  - 그 외 스텝(`isPast || isFuture`): 미니 카드 (`getFastestArrivalText`) + accordion 상세 펼침. 동일 컴포넌트 사용
  - **isPast 시각 차이:** Card에 `opacity-60` + 좌측 체크 마커 (탑승 완료 표시). 펼침 영역은 isFuture와 동일한 노선별 도착 상세
  - **이전 스텝 되돌리기:** `currentGroupIndex > 0`일 때 헤더 우측에 `RotateCcw` 보조 버튼 (`handleUndoBoarding` — `currentSegmentIndex`를 이전 그룹 첫 세그먼트로 이동). 즉시 토스트 undo는 별도(`handleBoardingComplete` action 5초)
  - 미니카드 펼침 row도 `splitArrival`로 `[N번째 전]` suffix 분리해 시간/정거장 두 줄로 표시
  - 새로고침: `allArrivalResults.map(r => r.refetch())` — 전체 동시 갱신
  - 트레이드오프: past 스텝까지 polling 비용 증가 (수동 새로고침 1회당 요청 수 ↑). 경로 길이가 짧아 실질적 부담은 낮음
- **역명 표시 정규화 (2026-05-06~):** BE는 ODsay 원본 저장 + 다단계 fallback 시도. FE는 표시 시점에만 `formatStationName`으로 정규화 (`src/utils/stationName.ts`). `TransitStop.displayName`에 매핑 시점 계산. API 호출 인자에는 원본 `stop.name` 사용. 0건 응답은 "도착 정보 없음"으로 표시 (막차 이외 케이스 포함).
- **노선 매칭 규칙 (2026-05-08~):** BE 응답 `items` 순서는 provider 응답 도착 순서로 무보장이며 사용자 미저장 노선도 섞일 수 있음. FE는 **인덱스가 아닌 노선번호**로 매칭 (`busRouteAbrv === line` 또는 `routeName === line`). 같은 노선번호 중복 시 `traTime1` 최솟값 채택. 자세한 내용은 `docs/tech-notes/arrival-route-matching.md`.
- **지하철 열차 종류 표시 (2026-05-11~):** BE 응답 `trainType` raw (서울 API `btrainSttus` 5종 enum: 급행/ITX/특급/일반/미지) → FE `formatTrainTypeShort` 헬퍼로 짧은 라벨 (`"급행" → "급"`, `"특급" → "특"`, `"ITX" → "ITX"`, `"일반"/"" → null`, 미지 → raw). 헤드사인 앞 prefix `(급)용산행` 패턴. Home/Favorites 모든 도착 카드 렌더링에 일괄 적용. 색 강조 없음 — 헤드사인과 동일 텍스트색.

### 지하철 방향 매칭 규칙 (2026-04-28~)

저장된 stop의 `directionHeadsign` / `directionUpdn`을 사용해 도착 응답을 필터링한다.
관련 설계: `docs/api/contracts/route-direction-design.md`, `docs/decisions/ADR-001-subway-direction-model.md`.

```
matchSubwayItems(items, line, { headsign, updn }, subwayCode?)
  ├─ 호선 필터 (신/legacy 분기, 2026-05-09~):
  │   ├─ 1차 (신): subwayCode 있으면 item.lineName === subwayCode (직접 비교)
  │   └─ 2차 (legacy fallback): subwayCode 없으면 subwayApiCodeToLineName(lineName) === normalizeSubwayLineName(line)
  │       → 백필 완료 + 1주일 모니터링 후 별도 PR(T21)에서 제거 예정
  ├─ 방향 필터 (기존 동일):
  │   ├─ directionUpdn 있으면 updnLine 정규화 비교
  │   │   ("상행"|"내선" → up, "하행"|"외선" → down)
  │   └─ directionHeadsign 있으면 trainLineNm.startsWith(headsign)
  └─ 매칭 0건 → 호선만 일치하는 전체로 fallback
```

subwayCode 저장 흐름:
- ODsay search-stops 응답: `stop.subwayCode` (예: "1004")
- 저장 시: stop 단위 subwayCode → stopRoute(지하철)의 `subwayCode` 필드로 복사
- GET 응답: `stop_routes.subway_code` → mapper에서 camelCase `subwayCode`로 변환
- 매칭 시: `stop.stopRoutes.find(r => r.routeName === line)?.subwayCode` 추출 후 전달

- 두 방향 키 모두 있으면 둘 다 만족하는 item만, 한쪽만 있으면 그것만 적용
- 매칭 0건이면 호선 일치 전체로 fallback — legacy 데이터(방향 NULL) 안전망
- 방향 NULL인 지하철 stop에는 카드 헤더에 inline 안내 노출 ("방향 정보 없음 — 경로를 다시 등록하면 더 정확해요")
- 카드 표시 규칙: 같은 item의 `arrmsg1`/`arrmsg2`를 두 줄로 보이던 방식 → **상위 2개 매칭 item의 `arrmsg1`만** 두 줄로 표시
- **byte-identical 중복 제거 (2026-05-08~):** 서울 API가 동일 열차를 같은 row로 중복 반환하는 quirk 방어. `(lineName, direction, arrmsg1, arrmsg2, updnLine)` 모두 일치할 때만 제거 — 다른 트레인이 우연히 같은 메시지를 갖는 경우는 보존.
- **displayMsg 짧은 표준 라벨 (2026-05-08~):** BE가 서울 지하철 API의 `arvlCd`(도착 코드)를 "진입중"/"도착"/"출발"/"전역 출발"/"전역 진입"/"전역 도착"으로 매핑해 응답 동봉. FE는 `displayMsg ?? arrmsg1`로 우선 사용. 99/누락은 null → 기존 카운트다운 표시 유지. 카드 폭 깨짐 해소 + `getArrivalMin`에서 displayMsg 있으면 0분 처리해 isUrgent 강조.

### step_group — 한 스텝에 정류장 최대 2개 그룹핑 (2026-05-03~)

`route_stops.step_group` (1-based 정수)으로 같은 논리 스텝의 정류장을 묶는다.

```
groupedSegments: Map<stepGroup, RouteSegment[]>
  - Home: 같은 그룹 → 현재 스텝이면 카드 stack + 파란 left border
  - Setup: "대안 정류장 추가" 버튼으로 같은 stepGroup에 두 번째 stop 추가
  - 저장: node.stepGroup → BE routes POST body `stepGroup` 필드
```

- 한 그룹 최대 2개, 같은 stopType 강제 (BE 검증)
- `handleRemoveNode`: 제거 후 stepGroup 번호 연속 재정렬
- 버스 노선 선택: 사용자가 드롭다운에서 직접 선택 (자동 선택 없음)
- **전체 추가 동작 (2026-05-08~):** "전체 추가" 버튼은 각 노드를 **별도 stepGroup**으로 추가. 같은 stepGroup의 대안 정류장은 명시적 "대안 정류장 추가" 버튼으로만 등록. 과거 `handleAddAllNodes`가 `for...await` 루프 내내 stale `nodes` 클로저를 참조해 모든 노드가 동일 stepGroup으로 들어가던 버그 수정 — `forcedNewGroup` 인자로 호출자가 명시적으로 stepGroup 증가시켜 전달.
