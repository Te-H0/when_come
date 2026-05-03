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
- 도착정보 자동 조회 비활성화 중 (`enabled: false`) — 새로고침 버튼으로만 조회 (개발 중 API 절약)

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
