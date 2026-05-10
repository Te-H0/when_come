# 에러 핸들링 컨벤션

> 자동 적용 경로:
> - BE: `when_come_be/supabase/functions/**/*.ts`
> - FE: `when_come_fe/src/**/*.{ts,tsx}`
>
> 근거: [ADR-002](../../docs/decisions/ADR-002-error-handling.md)
> 카탈로그: [docs/api/error-codes.md](../../docs/api/error-codes.md)

---

## 핵심 원칙

1. **모든 비즈니스 에러는 `ErrorCode` enum(union literal)을 부여한다.** code 없는 `AppError`는 마이그레이션 잔재로만 허용 — 신규 코드에서 금지.
2. **BE가 에러 코드의 단일 진실(source of truth).** FE는 BE가 제공하는 코드 문자열을 string literal로 사용.
3. **응답 포맷은 구조화 형태로 통일:** `{ error: { code, message, detail? } }`
4. **운영 환경에서 raw 메시지는 마스킹.** dev/스테이징에서만 `[CODE/STATUS]` prefix + raw detail 노출.

---

## BE 작성 규칙 (`supabase/functions/**/*.ts`)

### 1. AppError 생성 시 code 필수

```typescript
// 금지 — code 없는 신규 throw
throw new AppError("이름이 비어 있습니다", 400)

// 허용
throw new AppError("이름이 비어 있습니다", 400, "ROUTE_NAME_REQUIRED")
```

**예외 (한시적 허용):** 5xx unhandled를 의도적으로 throw하지 않는 경우 — 그냥 `throw err`로 던지면 `withErrorLogging` 미들웨어가 처리. AppError 인스턴스를 만든다면 code 필수.

### 2. 새 코드 추가 시 등록 절차

새 에러 코드가 필요하면 **반드시 다음 순서로**:

1. `_shared/errorCodes.ts`의 도메인별 union에 literal 추가
   ```typescript
   export type RouteErrorCode =
     | "ROUTE_NAME_REQUIRED"
     | "ROUTE_NOT_FOUND"
     | "ROUTE_INVALID_STEP_GROUP"
     | "ROUTE_NEW_THING"  // ← 추가
   ```
2. `docs/api/error-codes.md` 카탈로그 표에 행 추가 (status, 의미, FE 권장 메시지)
3. 함수에서 throw 시 union literal 사용 — 임의 string 금지
4. 새 도메인 prefix면 ADR-002 §4.2 표 갱신

### 3. string literal 금지

```typescript
// 금지 — 카탈로그에 없는 임의 string
throw new AppError("...", 400, "MY_RANDOM_CODE")

// 허용 — errorCodes.ts에서 import
import type { RouteErrorCode } from "../_shared/errorCodes.ts"
throw new AppError("...", 400, "ROUTE_NAME_REQUIRED" satisfies RouteErrorCode)
```

> AppError 시그니처를 `code: ErrorCode` (도메인 union의 합집합)로 좁히는 것은 **구현 단계 Phase 1**에서 처리.

### 4. unhandled 5xx는 그냥 throw

```typescript
// 외부 API 실패 — 비즈니스 5xx → code 부여
try {
  const r = await fetch(...)
  if (!r.ok) throw new AppError("외부 API 실패", 502, "ARRIVAL_PROVIDER_ERROR")
} catch { ... }

// 진짜 모르는 예외 — 그냥 던짐 → middleware가 잡음
const data = JSON.parse(garbage)  // SyntaxError 발생 → 잡지 않음 → 500 + error.unhandled 로깅
```

### 5. errorResponse(e, source) 호출 시 source 필수

```typescript
} catch (e) {
  return errorResponse(e, "routes")  // ← source 항상 함수명
}
```

source가 없으면 anomaly_logs 기록이 누락된다.

### 6. 운영 환경 메시지 마스킹

`errorResponse`가 환경에 따라 응답 본문을 마스킹한다 (구현 단계 Phase 1).
- 운영: `code` 없는 4xx → message를 `"요청을 처리할 수 없습니다"`로 치환, detail 제거.
- 운영: 5xx unhandled → `"서버 오류가 발생했습니다"` (code: `COMMON_INTERNAL_ERROR`).
- dev: 마스킹 없음. raw 그대로.

함수 작성자는 마스킹을 의식하지 않는다 — `errorResponse`가 알아서 처리.

### 7. 표준 catch 패턴

```typescript
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "POST") {
      throw new AppError("POST 요청만 허용됩니다", 405, "COMMON_METHOD_NOT_ALLOWED")
    }
    // 비즈니스 로직
    return new Response(...)
  } catch (e) {
    return errorResponse(e, "함수명")
  }
}

if (import.meta.main) Deno.serve(withErrorLogging(handler, "함수명"))
```

---

## FE 작성 규칙 (`src/**/*.{ts,tsx}`)

### 1. toast.error 직접 호출 금지

```typescript
// 금지
catch (e) {
  toast.error('즐겨찾기 추가 실패')
}

// 허용
import { showApiErrorToast } from '@/lib/errorToast'
catch (e) {
  showApiErrorToast(e, '즐겨찾기 추가 실패')
}
```

`showApiErrorToast(e, fallback)` / `getErrorMessage(e, fallback)` 헬퍼만 사용.
구현 단계에서 `src/lib/errorToast.ts` 생성 예정.

### 2. 코드별 UX 분기

```typescript
import { ApiError } from '@/lib/api'

try {
  await createFavoriteStop(body, jwt)
} catch (e) {
  if (e instanceof ApiError && e.code === 'FAVORITE_ROUTES_REQUIRED') {
    // 노선 선택 모달 자동 오픈
    setRoutePickerOpen(true)
    return
  }
  showApiErrorToast(e, '즐겨찾기 추가 실패')
}
```

**규칙:**
- code 매칭은 `e instanceof ApiError && e.code === "..."` 패턴.
- 매칭하는 string literal은 `docs/api/error-codes.md` 카탈로그에 등록된 것만 사용.
- 매칭 안 되면 항상 `showApiErrorToast`로 fallback.

### 3. dev 모드 토스트 prefix

`showApiErrorToast` 내부 동작:
- `import.meta.env.DEV === true`이고 `e instanceof ApiError`:
  → 토스트 텍스트 = `[${code}/${status}] ${message}`
- 운영: 매핑 테이블(`src/lib/errorMessages.ts`) lookup → 없으면 `e.message` → 없으면 `fallback`.

### 4. 새 4xx 분기 추가 시

1. BE에 코드 등록되어 있는지 확인 (`docs/api/error-codes.md`).
2. FE 매핑 테이블 (`src/lib/errorMessages.ts`)에 행 추가 (필요 시).
3. catch 안에서 `e.code === "..."` 분기.

### 5. throw 금지 영역

- React 컴포넌트 렌더링 중 throw 금지 (Error Boundary 별도).
- API 호출은 항상 try/catch — `apiFetch`가 ApiError를 throw하므로 컴포넌트가 받아서 처리해야 한다.

---

## 양쪽 공용 규칙

### 1. 코드는 불변 ID, 메시지는 가변 UX 텍스트

- 한 번 배포된 코드는 **rename 금지**. deprecated 후 신규 코드 추가, 한 사이클 후 union에서 제거.
- 메시지 텍스트는 자유롭게 개선 가능. i18n 도입 시 메시지만 키로 매핑하고 코드는 그대로 유지.

### 2. 신규 도메인 추가 시 체크리스트

- [ ] `_shared/errorCodes.ts`에 도메인 union 추가
- [ ] ADR-002 §4.2 prefix 표에 행 추가
- [ ] `docs/api/error-codes.md` 카탈로그에 도메인 섹션 추가
- [ ] FE 매핑 테이블 (필요 시) 추가
- [ ] BE 함수의 catch 블록 `errorResponse(e, source)` source 인자 확인

### 3. 점검 포인트

- BE PR 머지 전: 새 `AppError` throw 마다 code 부여됐는지 grep
- FE PR 머지 전: `toast.error(` grep → `showApiErrorToast` 외 사용처 0건 확인

---

## 자주 묻는 질문

**Q. 한국어 메시지는 BE? FE?**
A. BE 메시지는 디버그/로그용 + dev 토스트 fallback. 운영 사용자 메시지는 FE 매핑 테이블에서 결정. code가 다리 역할.

**Q. 같은 status(예: 400)인데 의미가 다른 두 에러는?**
A. 반드시 다른 code 부여. status는 HTTP 시맨틱, code는 비즈니스 의미.

**Q. ARRIVAL_*는 prefix가 이미 자리잡았는데 ARRIVAL_NOT_FOUND를 ARRIVAL_STOP_NOT_FOUND로 바꿔도 되나?**
A. 이미 운영 배포된 코드는 rename 금지. deprecated 처리 후 신규 추가.

**Q. unhandled 5xx에도 code를 박아야 하나?**
A. 아니다. unhandled는 그냥 throw하면 middleware가 `error.unhandled` category로 기록한다. 의도적 비즈니스 5xx만 code 부여.
