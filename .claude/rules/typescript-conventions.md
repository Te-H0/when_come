---
paths:
  - "when_come_fe/src/**/*.ts"
  - "when_come_fe/src/**/*.tsx"
  - "when_come_be/supabase/**/*.ts"
---

# TypeScript 컨벤션

## 공통

- `interface` > `type` (확장 가능한 객체 구조)
- `type`은 유니온, 인터섹션, 유틸리티 타입에만 사용
- `any` 사용 금지 — `unknown` 또는 구체 타입
- `as` 타입 단언 금지 — 타입 가드 함수로 대체

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
| 컴포넌트/타입/인터페이스 | PascalCase | `RouteCard`, `RouteResponse` |
| 커스텀 훅 | camelCase + use 접두사 | `useRouteList` |
| 상수 | UPPER_SNAKE_CASE | `MAX_ROUTE_STOPS`, `ODSAY_BASE_URL` |
| 일반 함수/변수 | camelCase | `fetchRoutes`, `isLoading` |
| 파일명 (컴포넌트) | PascalCase.tsx | `RouteCard.tsx` |
| 파일명 (훅/유틸/서비스) | camelCase.ts | `useRouteList.ts`, `odsayClient.ts` |
| API 입력 DTO | ~Request | `CreateRouteRequest` |
| API 출력 DTO | ~Response | `CreateRouteResponse` |
| 외부 API 원시 응답 | 서비스명+항목명 | `SeoulBusArrivalItem`, `OdsayStation` |
| 타입 가드 함수 | has~/is~ | `hasStation`, `isValidStop` |

---

## FE 전용 (when_come_fe/src/)

### 함수 선언
- 컴포넌트: `function` 선언식 (`React.FC` 금지)
- 이벤트 핸들러: `handle` 접두사

```typescript
// 금지
const RouteCard: React.FC<RouteCardProps> = ({ route }) => { ... }

// 허용
function RouteCard({ route }: RouteCardProps) { ... }
function handleCardClick() { ... }
```

### 임포트 순서
1. React, 외부 라이브러리
2. 내부 절대 경로 (`@/`)
3. 상대 경로
4. 타입 임포트 (`import type`)

### 에러 처리
- API 에러는 서비스 레이어에서 처리, 컴포넌트 직접 노출 금지
- 에러 바운더리로 UI 크래시 방지

---

## BE 전용 (when_come_be/supabase/)

### DTO 패턴
외부 경계(HTTP 요청/응답, 외부 API)에는 반드시 전용 인터페이스를 정의한다.

```typescript
interface CreateRouteRequest { ... }         // 입력 DTO
interface CreateRouteResponse { id: string } // 출력 DTO
interface SeoulBusApiResponse {              // 외부 API 원시 응답
  msgBody?: { itemList?: SeoulBusArrivalItem[] }
}
```

### 환경변수 — 반드시 lazy 읽기
```typescript
// 허용
function busApiKey(): string {
  const key = Deno.env.get("SEOUL_BUS_API_KEY")
  if (!key) throw new AppError("SEOUL_BUS_API_KEY not configured", 500)
  return key
}

// 금지 — 모듈 최상위
const BUS_API_KEY = Deno.env.get("SEOUL_BUS_API_KEY") ?? ""
```

### req.json() 파싱 오류 처리
```typescript
// 항상 try-catch로 감싸서 400 처리
let body: CreateRouteRequest
try {
  body = await req.json()
} catch {
  throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400)
}
```

### 쿼리 패턴
- 목록 조회에는 반드시 `.limit(N)` — 무제한 쿼리 금지
- update/delete 후 존재 확인: `.select("id")` 후 빈 배열 → 404

```typescript
// 허용
.order("created_at", { ascending: false }).limit(50)

// update 후 존재 확인
const { data } = await db.from("routes").update({...}).select("id")
if (!data || data.length === 0) throw new AppError("찾을 수 없습니다", 404)
```

### 임포트 (Deno 스타일)
```typescript
import { createClient } from "npm:@supabase/supabase-js@2"
```

### 에러 처리
- 외부 API 에러는 `_shared/error.ts`의 `AppError`로 통일
- 프론트에 raw 에러 구조/스택트레이스 노출 금지 (`{ error: "메시지" }` 형태만)
- 5xx: 서버 문제, 4xx: 클라이언트 잘못 — 구분해서 던질 것
- 함수 반환 타입 항상 명시 — 추론에 의존하지 않음
