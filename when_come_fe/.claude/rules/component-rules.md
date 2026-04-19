---
paths:
  - "src/**/components/**/*.tsx"
  - "src/**/pages/**/*.tsx"
  - "src/**/features/**/*.tsx"
---

# 컴포넌트 규칙

## 컴포넌트 분류

| 종류 | 위치 | 역할 |
|------|------|------|
| Page | `src/features/{domain}/pages/` | 라우팅 단위, 데이터 페칭 |
| Feature Component | `src/features/{domain}/components/` | 도메인 로직 포함 |
| UI Component | `src/app/components/ui/` (현재) → 추후 `src/components/ui/` | 순수 UI, 도메인 무관 |

> **현재 상태:** 초기 Figma 생성 코드가 `src/app/` 아래에 있음.
> 신규 기능은 `src/features/{domain}/` 구조로 작성하고, 기존 코드는 점진적으로 이전.

## 단방향 의존성

- UI Component → 아무것도 import 금지 (도메인 타입 포함)
- Feature Component → UI Component, 훅, 서비스
- Page → Feature Component, 훅

## Props 규칙

- Props 타입은 별도 `interface`로 분리
- optional props는 명시적 default 값 지정
- 콜백은 `on` 접두사: `onSelect`, `onDelete`

```typescript
interface RouteCardProps {
  route: SavedRoute
  isActive?: boolean
  onSelect: (id: string) => void
}

function RouteCard({ route, isActive = false, onSelect }: RouteCardProps) {
  ...
}
```

## 상태 관리 원칙

> **현재:** mock 데이터 + `useState` 사용 중. API 연동 시 아래로 전환.

- 서버 상태: TanStack Query (React Query)
- 클라이언트 전역 상태: Zustand (최소화)
- 지역 상태: `useState` / `useReducer`

서버 상태를 전역 상태로 복사하지 않는다. React Query 캐시가 단일 진실 공급원.

## 렌더링 최적화

- 최적화는 측정 후 적용. 추측으로 `memo`/`useCallback` 남발 금지
- 목록 렌더링은 반드시 고유 `key` (`index` 사용 금지)

## 파일 구조 (Feature)

```
src/features/route/
├── components/
│   ├── RouteCard.tsx
│   └── RouteList.tsx
├── hooks/
│   └── useRouteList.ts
├── pages/
│   └── RouteManagementPage.tsx
├── services/
│   └── routeService.ts
└── types/
    └── route.types.ts
```
