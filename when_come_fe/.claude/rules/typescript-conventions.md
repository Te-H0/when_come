---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# TypeScript 컨벤션

## 타입 선언

- `interface` > `type` (확장 가능성 있는 객체 구조)
- `type`은 유니온, 인터섹션, 유틸리티 타입에 사용
- `any` 사용 금지 — `unknown` 또는 구체 타입 사용
- `as` 타입 단언 금지 — 타입 가드 사용

```typescript
// 금지
const data = response as RouteResponse

// 허용
function isRouteResponse(data: unknown): data is RouteResponse {
  return typeof data === 'object' && data !== null && 'id' in data
}
```

## 네이밍

| 대상 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 | PascalCase | `RouteCard`, `StopList` |
| 커스텀 훅 | camelCase + use 접두사 | `useRouteList`, `useTransitColor` |
| 타입/인터페이스 | PascalCase | `RouteResponse`, `RouteCardProps` |
| 상수 | UPPER_SNAKE_CASE | `MAX_ROUTE_STOPS` |
| 일반 함수/변수 | camelCase | `fetchRoutes`, `isLoading` |
| 파일명 (컴포넌트) | PascalCase.tsx | `RouteCard.tsx` |
| 파일명 (훅/유틸) | camelCase.ts | `useRouteList.ts` |

## 임포트 순서

1. React, 외부 라이브러리
2. 내부 절대 경로 (alias `@/`)
3. 상대 경로
4. 타입 임포트 (`import type`)

```typescript
import { useState } from 'react'
import { motion } from 'motion/react'

import { transitColors } from '@/app/utils/transitColors'

import { RouteCard } from './RouteCard'
import type { RouteCardProps } from './RouteCard.types'
```

## 함수 선언

- 컴포넌트: `function` 선언식 (`React.FC` 금지)
- 이벤트 핸들러: `handle` 접두사

```typescript
// 금지
const RouteCard: React.FC<RouteCardProps> = ({ route }) => { ... }

// 허용
function RouteCard({ route }: RouteCardProps) { ... }

function handleCardClick() { ... }
```

## 에러 처리

- API 에러는 서비스 레이어에서 처리, 컴포넌트에서 raw 에러 노출 금지
- 에러 바운더리로 UI 크래시 방지
