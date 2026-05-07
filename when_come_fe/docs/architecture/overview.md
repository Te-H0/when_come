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
│   ├── BottomNav.tsx         ← 공유 내비게이션
│   └── figma/
│       └── ImageWithFallback.tsx
├── features/
│   ├── home/
│   │   └── pages/Home.tsx
│   ├── setup/
│   │   ├── components/       ← RouteNodeCard, SearchResultNode
│   │   └── pages/SetupRoute.tsx
│   └── route/
│       ├── components/       ← TransitCard, RouteProgress, RouteOption
│       └── pages/RouteManagement.tsx
├── lib/
│   ├── api.ts                ← API 클라이언트 함수
│   ├── arrival.ts            ← 실시간 도착정보 fetch/파싱 로직
│   ├── mappers.ts            ← API 응답 → 도메인 모델 변환
│   └── mockData.ts           ← TransitStop, SavedRoute 타입 정의 + mock 데이터
├── utils/
│   └── transitColors.ts      ← 버스/지하철 공식 색상 매핑
└── styles/
    └── theme.css             ← Tailwind v4 CSS custom properties
```

## 도메인

| 도메인 | 설명 | 주요 컴포넌트 |
|--------|------|--------------|
| route | 저장된 경로 관리 | `RouteManagement.tsx` |
| setup | 경로 생성/편집 | `SetupRoute.tsx` |
| home | 활성 경로 대시보드 | `Home.tsx` |

## 라우팅

| Route | Page | Purpose |
|-------|------|---------|
| `/` | `Home.tsx` | 활성 경로 대시보드 — 현재 구간, 도착 시간 |
| `/setup` | `SetupRoute.tsx` | 경로 빌더 — 정류장 검색/추가 |
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
- **도착정보 조회 범위 (2026-05-03~):** 현재 + 이후 모든 스텝(non-past)을 동시 조회
  - `nonPastSegments = groupedSegments.slice(currentGroupIndex).flat()`
  - `useQueries`로 per-stop 독립 쿼리, `arrivalByStopId: Map<stopId, {data, isLoading}>` 맵으로 참조
  - 현재 스텝: 도착 상세 카드 (노선별 전체 표시)
  - 다음 스텝들: 미니 카드 (가장 빠른 버스 `getFastestArrivalText`) + accordion 상세 펼침
  - 새로고침: `allArrivalResults.map(r => r.refetch())` — 전체 동시 갱신
- **역명 표시 정규화 (2026-05-06~):** BE는 ODsay 원본 저장 + 다단계 fallback 시도. FE는 표시 시점에만 `formatStationName`으로 정규화 (`src/utils/stationName.ts`). `TransitStop.displayName`에 매핑 시점 계산. API 호출 인자에는 원본 `stop.name` 사용. 0건 응답은 "도착 정보 없음"으로 표시 (막차 이외 케이스 포함).
- **노선 매칭 규칙 (2026-05-08~):** BE 응답 `items` 순서는 provider 응답 도착 순서로 무보장이며 사용자 미저장 노선도 섞일 수 있음. FE는 **인덱스가 아닌 노선번호**로 매칭 (`busRouteAbrv === line` 또는 `routeName === line`). 같은 노선번호 중복 시 `traTime1` 최솟값 채택. 자세한 내용은 `docs/tech-notes/arrival-route-matching.md`.

### 지하철 방향 매칭 규칙 (2026-04-28~)

저장된 stop의 `directionHeadsign` / `directionUpdn`을 사용해 도착 응답을 필터링한다.
관련 설계: `docs/api/contracts/route-direction-design.md`, `docs/decisions/ADR-001-subway-direction-model.md`.

```
matchSubwayItems(items, line, { headsign, updn })
  ├─ 1차: lineName === line (호선 일치)
  ├─ 2차: directionUpdn 있으면 updnLine 정규화 비교
  │       ("상행"|"내선" → up, "하행"|"외선" → down)
  ├─ 3차: directionHeadsign 있으면 trainLineNm.startsWith(headsign)
  └─ 매칭 0건 → 호선만 일치하는 전체로 fallback
```

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
