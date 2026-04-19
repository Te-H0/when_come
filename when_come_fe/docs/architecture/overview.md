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
│   └── mockData.ts           ← 임시 mock 데이터 (API 연동 시 제거)
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
| 서버 상태 | TanStack Query (API 연동 후) | 경로 목록, 정류장 정보 |
| 클라이언트 전역 | Zustand (최소화) | 활성 경로 ID |
| 지역 UI 상태 | useState | 모달 열림/닫힘, 드래그 상태 |
| 현재 (mock) | useState | 전체 상태 (임시) |
