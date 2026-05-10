# ADR-002: 전역 에러 핸들링 표준 (enum 코드 기반)

- **상태:** Accepted (2026-05-10)
- **결정자:** 시스템 아키텍트 + 사용자
- **관련 ADR:** ADR-001 (subway-direction-model)
- **영향 범위:** when_come_be (모든 Edge Function), when_come_fe (모든 catch / toast)

---

## 1. 컨텍스트

### 현재 상태 (audit 결과, 2026-05-10 기준)

**잘 깔린 인프라**
- BE `_shared/error.ts`: `AppError(message, status, code?, detail?)` — `code` 필드 슬롯 이미 존재
- BE `_shared/error.ts` `errorResponse(e, source)`:
  - `code` 있으면 `{ error: { code, message, detail? } }` 구조화 응답
  - `code` 없으면 legacy `{ error: "..." }` 평문 응답
- BE `_shared/middleware.ts` `withErrorLogging`: unhandled 예외 안전망 + `anomaly_logs` 자동 기록
- BE 로깅 정책: 5xx 전체 + code 있는 4xx만 `anomaly_logs` 기록
- FE `lib/api.ts`: `ApiError(code, message, status)` + `apiFetch`가 structured/legacy 둘 다 파싱

**부족한 부분**
1. **ErrorCode union이 한 도메인에만 있음.** `ArrivalErrorCode` 5개(`ARRIVAL_*`)만 정의되어 있고, 나머지 모든 함수(`routes`, `favorite-stops`, `route-stops`, `route-search`, `search-stops`, `stop-buses`, `place-search`, `subway-station-directions`, `sync-gbis-stations`)는 그냥 `AppError("한국어 메시지", 400)` — code 없음.
2. **결과:** code 없는 4xx는 `anomaly_logs`에도 안 쌓이고 FE에서도 분기 불가. RouteManagement에서 PATCH displayOrder가 실패해도 원인 추적이 0.
3. **FE catch 16곳 분산.** `toast.error('하드코딩 한국어')` 패턴 다수. `ApiError`의 `code`/`status` 활용은 1곳뿐.
4. **컨벤션 문서 0건.** `.claude/rules/error-handling.md` 없음. CLAUDE.md에도 한 줄 없음.
5. **dev/운영 분기 없음.** 운영도 raw 메시지 그대로 노출. 반대로 dev에서도 `[CODE/STATUS]` 같은 디버그 hint 부재.

### 사용자 의도

> "Java Spring처럼 enum 에러 코드를 백엔드에서 정의해서 주는 식"으로 가고 싶다.
> "정의 안 한 케이스는 메시지 그대로 보내준다."

---

## 2. 결정

**모든 비즈니스 에러는 enum 코드(`ErrorCode` union literal)를 부여하고, 응답은 구조화 포맷 `{ error: { code, message, detail? } }`로 통일한다.**

다음 4가지를 동시에 박는다.

1. BE `_shared/errorCodes.ts`에 도메인별 `ErrorCode` union을 한 곳에 카탈로그.
2. `AppError` 생성 시 `code` 필수화 — 신규 코드 등록되지 않은 string literal 금지(컨벤션 룰).
3. FE는 `toast.error` 직접 호출 금지 — `showApiErrorToast(e, fallback)` / `getErrorMessage(e, fallback)` 헬퍼만 사용.
4. dev/운영 환경 분기 — 운영은 generic 메시지 마스킹, dev는 `[CODE/STATUS]` prefix + raw detail 노출.

---

## 3. 대안 검토

### 대안 A: 현행 유지 (한국어 메시지 string + 일부만 code)
- 장점: 작업량 0. 메시지가 곧 UI 문구라서 FE 가공 불필요.
- 단점:
  - FE 분기 불가 (메시지 텍스트로 분기는 i18n/오타에 깨짐).
  - 운영 모니터링 불가 (anomaly_logs에 안 쌓임).
  - 동일 의미 다른 메시지 양산 (`"이름이 비어 있습니다"` vs `"name이 비어 있습니다"`).
- **기각**

### 대안 B: HTTP status만 사용 (400/404/409/500)
- 장점: 표준적. 추가 정의 불필요.
- 단점: 4xx 안에서 세부 분기 불가능 (이름 길이 초과 vs 별명 길이 초과 vs 노선 0개를 모두 400으로만 구분). FE UX 분기에 부적합.
- **기각**

### 대안 C: enum 코드 union + 구조화 응답 (이 ADR 선택)
- 장점:
  - FE는 `e.code === "FAVORITE_ROUTES_REQUIRED"`로 명시적 분기.
  - BE는 `errorCodes.ts` 한 파일이 카탈로그 → 신규 도메인 추가 시 참조점 명확.
  - 운영 anomaly_logs `category: error.business.{CODE}` 집계 가능.
  - 메시지는 사람이 읽는 용도(서버측 로그 + dev 토스트), code는 기계가 분기하는 용도 — 역할 분리.
- 단점:
  - 신규 코드 등록 절차(union + 카탈로그 doc) 필요. 관성 깨야 함.
  - FE/BE 양쪽에서 코드 string 동기화 필요(타입 공유 안 함, BE가 단일 진실).
- **채택**

### 대안 D: gRPC-style code enum (NUMBER) + 별도 message 필드
- 장점: 정수 enum이 더 작음.
- 단점: 사람이 읽기 어려움. 디버깅 시 매번 코드표 조회 필요. JSON 디버깅에서 가독성 큰 손실.
- **기각**

---

## 4. 정책

### 4.1 에러 코드 네이밍 규칙

`{DOMAIN}_{REASON}` SCREAMING_SNAKE_CASE.

**예시**
- `ROUTE_NAME_REQUIRED`
- `FAVORITE_NOT_FOUND`
- `FAVORITE_ROUTES_REQUIRED`
- `ARRIVAL_PROVIDER_ERROR`
- `AUTH_REQUIRED`

**규칙**
- 도메인 prefix는 **§4.2 표**에 등록된 것만 사용. 새 prefix 추가 시 ADR-002 §4.2 표를 갱신해야 한다(컨벤션 룰).
- prefix 뒤 `_REASON`은 동사 또는 형용사형으로 통일: `_REQUIRED`, `_NOT_FOUND`, `_TOO_LONG`, `_INVALID`, `_FAILED`, `_MIXED`, `_DUPLICATE` 등.
- 메시지 텍스트는 변경되어도 code는 불변(breaking change). 사용자 노출 메시지는 i18n 가능, code는 ID처럼 취급.

### 4.2 도메인 prefix 표

| Prefix | 도메인 | 해당 함수 |
|--------|--------|----------|
| `ROUTE_` | 사용자 저장 경로 | `routes` |
| `ROUTE_STOP_` | 경로 내 정류장 (alias 등) | `route-stops` |
| `FAVORITE_` | 즐겨찾기 단일 정류장 | `favorite-stops` |
| `ARRIVAL_` | 실시간 도착정보 | `arrival-info` |
| `STOP_` | 정류장/노선 검색 | `search-stops`, `stop-buses` |
| `SUBWAY_` | 지하철 부가 정보 | `subway-station-directions` |
| `ROUTE_SEARCH_` | 경로탐색 | `route-search` |
| `PLACE_` | 장소 검색 | `place-search` |
| `SYNC_` | 운영 cron 동기화 | `sync-gbis-stations` |
| `AUTH_` | 인증/권한 | 모든 함수 공통 |
| `COMMON_` | JSON 파싱, 메서드 등 횡단 | 모든 함수 공통 |

### 4.3 4xx vs 5xx 정책

| 상황 | code 부여 | 자동 로깅 | 예시 |
|------|----------|----------|------|
| 4xx 비즈니스 검증 실패 | **필수** | 기록됨 | `ROUTE_NAME_REQUIRED`, `FAVORITE_ROUTES_REQUIRED` |
| 4xx 인증/권한 | **필수** | 기록됨 | `AUTH_REQUIRED` |
| 4xx 리소스 부재 | **필수** | 기록됨 | `ROUTE_NOT_FOUND`, `FAVORITE_NOT_FOUND` |
| 5xx 비즈니스 5xx (외부 API 실패 등) | **필수** | 기록됨 | `ARRIVAL_PROVIDER_ERROR`, `ROUTE_PERSIST_FAILED` |
| 5xx unhandled 예외 | code 없음 | 기록됨(category: `error.unhandled`) | catch 안 한 throw |

**원칙**
- 4xx는 가능한 한 code를 부여한다. code 없는 4xx는 운영 모니터링에서 누락된다.
- 5xx 중 비즈니스적으로 의미 있는 것(`ROUTE_PERSIST_FAILED`, `ARRIVAL_PROVIDER_ERROR` 등)은 code 부여.
- 진짜 unhandled 예외(코드가 잡지 못한 throw)는 그냥 throw → `withErrorLogging` 미들웨어가 `error.unhandled`로 기록 + 500 반환.

### 4.4 사용자 요청 인용: "정의 안 한 케이스는 메시지 그대로 보내준다"

**해석:**
- 신규 도메인이나 마이그레이션 도중 일시적으로 code 없는 `AppError`가 남아 있을 수 있다 → 현재 `errorResponse`가 legacy `{ error: "메시지" }` 포맷을 유지하므로 호환됨.
- 단, 이는 **임시 상태**이며 `.claude/rules/error-handling.md` 컨벤션 룰이 신규 작성에는 code를 강제한다.

**운영/dev 분기 규칙 (D5):**
- **운영(prod):** code 없는 4xx → 메시지를 generic 마스킹 `"요청을 처리할 수 없습니다"`로 치환. detail 필드 제거. (raw 메시지 노출 금지 — 정보 노출 방지)
- **운영(prod):** 5xx unhandled → `"서버 오류가 발생했습니다"` 마스킹. (현행 `INTERNAL_SERVER_ERROR` 유지)
- **dev/스테이징:** raw message + status + detail 모두 그대로 노출. FE 토스트도 `[CODE/STATUS]` prefix 부착.

**환경 판별:**
- BE: `Deno.env.get("DENO_ENV") === "production"` 또는 `Deno.env.get("IS_DEV") !== "true"` (구체 keying은 구현 단계에서 확정 — 기존 `SUPABASE_URL` 도메인 inspect 등 기존 관행 따름).
- FE: `import.meta.env.DEV` (Vite 표준).

### 4.5 anomaly_logs 기록 정책 (현행 유지)

| 케이스 | 기록 여부 | category |
|-------|---------|---------|
| 5xx + AppError(code 있음) | 기록 | `error.business.{CODE}` |
| 5xx + AppError(code 없음) | 기록 | `error.5xx` |
| 5xx + unhandled throw | 기록 | `error.unhandled` (middleware) |
| 4xx + AppError(code 있음) | 기록 | `error.business.{CODE}` |
| 4xx + AppError(code 없음) | **미기록** (단순 클라 잘못 — 노이즈) | — |

→ 컨벤션 룰이 4xx에도 code를 강제하면 자연스럽게 모든 4xx도 모니터링됨.

### 4.6 FE 표준 토스트 패턴

`toast.error(...)` 직접 호출 금지. 신규 헬퍼 강제.

```
// 신규 헬퍼 (구현 단계에서 src/lib/errorToast.ts 생성)
showApiErrorToast(e: unknown, fallback: string): void
getErrorMessage(e: unknown, fallback: string): string
```

**동작 명세:**
- `e instanceof ApiError`:
  - dev: `toast.error("[${e.code}/${e.status}] ${e.message}")`
  - prod: 코드별 사용자 메시지 매핑 테이블 (`docs/api/error-codes.md` 참조) → 매핑 없으면 `e.message` → 그것도 없으면 `fallback`
- 일반 `Error`: `toast.error(fallback)` (dev에서는 raw message도 함께)
- 그 외 unknown: `toast.error(fallback)`

**코드별 UX 분기 (드물게 필요):**
```
if (e instanceof ApiError && e.code === "FAVORITE_ROUTES_REQUIRED") {
  // 노선 선택 모달 자동 오픈
  openRoutePicker()
  return
}
showApiErrorToast(e, "즐겨찾기 추가 실패")
```

---

## 5. 운영 (Operations)

### 5.1 신규 4xx 분기 추가 시 워크플로우

1. BE `_shared/errorCodes.ts` union에 코드 추가
2. `docs/api/error-codes.md` 카탈로그 표에 행 추가 (status, 의미, FE 권장 메시지)
3. BE 함수에서 `throw new AppError("메시지", status, "NEW_CODE")` 호출
4. FE 매핑 테이블 (구현 단계 `src/lib/errorMessages.ts`)에 행 추가 (필요 시)
5. ADR-002 §4.2 prefix 표는 새 prefix가 등장할 때만 갱신

### 5.2 모니터링

운영 anomaly_logs를 주기 점검:
```
SELECT category, count(*) FROM anomaly_logs
WHERE created_at > now() - interval '7 days'
GROUP BY category ORDER BY count DESC;
```
- `error.unhandled` 급증 → 코드 누락된 비즈니스 5xx 발견 신호
- `error.business.{CODE}` top → UX 개선 후보 (예: `FAVORITE_ROUTES_REQUIRED`가 top이면 UI에서 미리 노선 강조)

### 5.3 코드 변경/제거 정책

- 한 번 운영 배포된 코드는 **rename 금지**. deprecated 처리 후 새 코드 추가, 한 사이클 후 union에서 제거.
- 이유: FE catch 분기 또는 운영 모니터링 쿼리가 코드 string에 의존.

---

## 6. 영향 (Consequences)

### 긍정적
- 운영 에러 분포 가시화 → 경험 개선 우선순위 데이터 기반.
- FE 분기 표준화 → 코드별 UX 분기 가능.
- 신규 함수 작성 시 컨벤션 룰이 자동 적용 → "code 빼먹기" 방지.

### 부정적
- 기존 함수 16곳 catch 손봐야 함 (Phase 1).
- 신규 코드 등록 시 union + 카탈로그 doc 양쪽 갱신 필요 (관성 깨야 함).

### 마이그레이션 리스크
- code 없는 4xx → code 있는 4xx로 바뀌는 순간 anomaly_logs에 갑자기 누적되기 시작 → **이는 의도된 동작**이지만 첫 1주일은 노이즈 식별 모니터링 필요.
- FE `toast.error` 직접 호출 16곳 → `showApiErrorToast`로 일괄 변환. 누락되면 dev 모드 prefix가 안 붙어 식별 가능.

---

## 7. 부록: 초기 ErrorCode 카탈로그

전체 코드 카탈로그는 [`docs/api/error-codes.md`](../api/error-codes.md) 참조.

대표 예시:
- `ROUTE_NAME_REQUIRED` (400) — 경로 이름 누락
- `ROUTE_NOT_FOUND` (404) — 본인 소유 경로 없음
- `FAVORITE_ROUTES_REQUIRED` (400) — 즐겨찾기 노선 0개 (이미 코드에 존재)
- `ARRIVAL_PROVIDER_ERROR` (502) — 외부 도착 API 실패 (이미 코드에 존재)
- `AUTH_REQUIRED` (401) — JWT 누락/만료
- `COMMON_INVALID_JSON` (400) — req.json() 파싱 실패
