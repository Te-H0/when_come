---
paths:
  - "supabase/**/*.ts"
---
# TypeScript 컨벤션 (Deno / 실무 기준)

## 타입 선언 원칙
- `interface` > `type` — 확장 가능한 객체는 interface
- `any` 사용 금지 — `unknown` 또는 구체 타입
- `as` 타입 단언 금지 — 반드시 타입 가드 함수로 대체
- 함수 반환 타입 항상 명시 — 추론에 의존하지 않음

## DTO 패턴 (Spring의 Request/Response DTO와 동일 개념)
외부 경계(HTTP 요청/응답, 외부 API)에는 반드시 전용 인터페이스를 정의한다.

```typescript
// ✅ 올바른 패턴
interface CreateRouteRequest { ... }        // 입력 DTO
interface CreateRouteResponse { id: string } // 출력 DTO

interface SeoulBusApiResponse {              // 외부 API 응답 원시 타입
  msgBody?: { itemList?: SeoulBusArrivalItem[] }
}
interface SeoulBusArrivalItem { ... }        // 외부 API 항목 타입

// ❌ 금지 패턴
const item = data?.msgBody?.itemList?.[0]   // 타입 없는 [0] 인덱싱
list.map((item: Record<string, string>) =>  // Record로 외부 응답 받기
```

## 타입 가드 패턴 (as 단언 대체)
외부 API 응답처럼 `unknown`에서 구체 타입으로 좁힐 때 사용한다.

```typescript
// ✅ 올바른 패턴
function hasStation(val: unknown): val is { station: OdsayStation[] } {
  return val !== null &&
    typeof val === "object" &&
    "station" in val &&
    Array.isArray((val as Record<string, unknown>)["station"])
}
const result = await odsayFetch(...)
return hasStation(result) ? result.station : []

// ❌ 금지 패턴
const result = await odsayFetch(...) as { station: OdsayStation[] } | null
```

## 환경변수 읽기 패턴
모듈 최상위에서 읽으면 테스트 불가 + 런타임 미설정 무음 실패 발생.
반드시 함수 내부에서 lazy하게 읽고 미설정 시 명시적 에러를 던진다.

```typescript
// ✅ 올바른 패턴
function busApiKey(): string {
  const key = Deno.env.get("SEOUL_BUS_API_KEY")
  if (!key) throw new AppError("SEOUL_BUS_API_KEY not configured", 500)
  return key
}

// ❌ 금지 패턴
const BUS_API_KEY = Deno.env.get("SEOUL_BUS_API_KEY") ?? ""  // 모듈 최상위
```

## req.json() 파싱 오류 처리
`req.json()`은 malformed JSON에서 SyntaxError를 던진다. 잡지 않으면 500 반환.
항상 try-catch로 감싸서 400으로 처리한다.

```typescript
// ✅ 올바른 패턴
let body: CreateRouteRequest
try {
  body = await req.json()
} catch {
  throw new AppError("요청 본문이 올바른 JSON이 아닙니다", 400)
}

// ❌ 금지 패턴
const body: CreateRouteRequest = await req.json()
```

## 쿼리 실무 패턴
- 목록 조회에는 반드시 `.limit(N)` 추가 — 무제한 쿼리 금지
- 관계 데이터의 순서가 중요하면 JS에서 `.sort()` 또는 `.order()` 명시
- 존재 여부 확인이 필요한 update/delete는 `.select("id")` 후 빈 배열 → 404

```typescript
// ✅ 올바른 패턴
.order("created_at", { ascending: false })
.limit(50)

// update 후 존재 확인
const { data } = await db.from("routes").update({...}).select("id")
if (!data || data.length === 0) throw new AppError("찾을 수 없습니다", 404)
```

## 네이밍
| 대상 | 규칙 | 예시 |
|------|------|------|
| 타입/인터페이스 | PascalCase | `ArrivalInfo` |
| 함수/변수 | camelCase | `fetchArrival` |
| 상수 | UPPER_SNAKE_CASE | `ODSAY_BASE_URL` |
| 파일명 | camelCase.ts | `odsayClient.ts` |
| API 입력 DTO | ~Request | `CreateRouteRequest` |
| API 출력 DTO | ~Response | `CreateRouteResponse` |
| 외부 API 원시 응답 | 서비스명+항목명 | `SeoulBusArrivalItem` |
| 타입 가드 함수 | has~/is~ | `hasStation`, `isValidStop` |

## 임포트
Deno 스타일 — npm: 접두사 사용
```typescript
import { createClient } from "npm:@supabase/supabase-js@2"
```

## 에러 처리
- 외부 API 에러는 `_shared/error.ts`의 `AppError`로 통일
- 프론트에 raw 에러 구조 노출 금지 — `{ error: "메시지" }` 형태만
- 5xx는 서버 문제, 4xx는 클라이언트 잘못 — 구분해서 던질 것
