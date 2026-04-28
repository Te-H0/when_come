---
paths:
  - "when_come_be/supabase/functions/**/*.ts"
---

# Edge Function 규칙

## 기본 구조

모든 Edge Function은 `handler` 함수를 export하고 `import.meta.main`으로 서버 진입점을 분리한다.

```typescript
import { corsHeaders } from "../_shared/cors.ts"
import { authGuard } from "../_shared/auth.ts"
import { AppError, errorResponse } from "../_shared/error.ts"

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "POST") throw new AppError("POST 요청만 허용됩니다", 405)
    const user = await authGuard(req)  // 인증 필요한 경우

    // 비즈니스 로직

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  } catch (e) {
    return errorResponse(e)
  }
}

if (import.meta.main) Deno.serve(handler)
```

## 규칙

- CORS 헤더는 반드시 `_shared/cors.ts`에서 가져올 것
- 인증 필요 엔드포인트는 반드시 `authGuard` 사용
- 모든 외부 API 키는 `Deno.env.get()` lazy 읽기 — 모듈 최상위 금지
- 각 Function은 단일 책임 (하나의 도메인)
- OPTIONS 외 허용 메서드 명시적 검증 필수
- `handler` 함수 export 필수 (테스트에서 직접 import 가능하도록)

## DB 클라이언트

`SERVICE_ROLE_KEY`는 RLS를 우회하므로 사용자 데이터 격리에 사용 금지.
ANON_KEY + 사용자 JWT로 RLS가 `auth.uid() = user_id`를 직접 검증하게 한다.

```typescript
// 허용 — RLS 동작
function supabaseClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  )
}

// 금지 — RLS 우회
createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", ...)
```

## TDD 워크플로우

```
1. 테스트 작성 (supabase/functions/_tests/)
2. npx deno test --allow-env --no-check <파일명>_test.ts
3. 통과 확인
4. supabase functions deploy <함수명>
```

## 테스트 작성 원칙

- `withMockFetch`로 fetch 목킹 — 외부 네트워크 의존 없음
- `withEnv`로 환경변수 목킹
- Supabase 클라이언트 사용 테스트는 `supabaseTest()` 헬퍼 사용 (타이머 누수 방지)
- 외부 API 응답은 raw HTTP 포맷 (SDK 래퍼 `{ data, error }` 아님)
- 커버리지: 정상 동작 + 파라미터 누락 + HTTP 오류 + 외부 API 에러 + 인증 실패

### Supabase 목 응답 포맷

```typescript
// 허용 — PostgREST raw 응답
mockDbInsertRoute() → jsonResponse({ id: "uuid" }, 201)   // single()
mockDbInsertStops() → jsonResponse([{ id: "uuid" }], 201) // 배열

// 금지 — SDK 래퍼 포맷
jsonResponse({ data: [{ id: "uuid" }], error: null })
```
