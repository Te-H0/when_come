# CORS PATCH preflight 누락 사고 + 클라이언트 텔레메트리 도입

날짜: 2026-05-10

## 증상

운영에서 다음 PATCH 호출이 모두 실패. 화면에는 "순서 저장에 실패했어요" 같은 fallback 토스트만 표시.

- `PATCH /routes/:id` — 경로 정렬, 활성 토글, 이름 변경
- `PATCH /route-stops/:id` — 정류장 별명 변경
- `PATCH /favorite-stops/:id` — 즐겨찾기 정렬, 별명, 노선 교체

dev 환경에서는 모두 정상 동작했고, BE 코드/마이그레이션은 prod에 정상 머지된 상태였다.

## 진단을 어렵게 만든 두 요인

### 1. anomaly_logs가 비어 있었다

`_shared/error.ts`의 정책 상 5xx 전체 + code 있는 4xx는 `anomaly_logs.source=<함수명>`으로 기록된다. 그런데 운영에서 PATCH 실패 시각의 anomaly_logs를 조회해도 `routes`/`favorite-stops` source row가 0건이었다.

→ **BE 함수 호출 자체가 안 됐다는 뜻.** anomaly_logs는 BE 함수 안에서 INSERT되므로, 함수가 실행되지 않으면 기록도 없다.

### 2. dev에서는 잡히지 않는 종류의 버그

로컬 `supabase functions serve`는 OPTIONS preflight 응답을 자체적으로 보강해서 누락된 메서드도 통과시킨다. 운영(Edge Runtime)은 함수가 export한 `corsHeaders`를 그대로 사용. 같은 코드가 환경별로 다른 동작을 보였다.

## 원인

`_shared/cors.ts`:

```ts
"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"  // ← PATCH 누락
```

브라우저는 PATCH 같은 non-simple method 호출 전에 OPTIONS preflight를 보내고, 응답의 `Access-Control-Allow-Methods`에 PATCH가 없으면 실제 PATCH 요청을 발송하지 않는다. 따라서:

- BE 함수 실행 0회 → anomaly_logs INSERT 0회
- FE `apiFetch`는 `TypeError: Failed to fetch` 또는 CORS rejection을 받음 → catch에서 fallback 토스트 출력

## 해결

4겹으로 잡았다. 단순 fix만 하면 다음에 비슷한 종류의 사고가 또 운영에서 처음 발견된다.

### 1. 핫픽스 — PATCH 추가

```ts
"Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
```

이 한 줄로 모든 PATCH 함수가 즉시 회복.

### 2. 회귀 차단 — `_tests/cors_test.ts`

```ts
Deno.test("cors Allow-Methods includes all CRUD verbs", () => {
  const methods = corsHeaders["Access-Control-Allow-Methods"]
  for (const m of ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]) {
    assert(methods.includes(m), `${m} missing in CORS Allow-Methods`)
  }
})
```

다음에 누가 또 메서드를 빼먹으면 CI에서 빨간불. 같은 종류의 무증상 전면 장애는 두 번 다시 운영에서 처음 발견되지 않는다.

### 3. 가시성 — `client-log` endpoint + FE 텔레메트리

진짜 문제는 "BE에 닿지 못한 에러는 운영에서 추적이 불가능하다"는 구조적 깜깜이다. 같은 종류의 다른 사고(DNS 장애, CORS 외 다른 preflight 차단, fetch 자체 실패 등)가 또 일어나면 똑같이 못 본다.

해결: FE의 모든 에러(네트워크 실패 + 4xx/5xx + 2xx body parse 실패)를 BE의 `/client-log` endpoint로 fire-and-forget 송신. BE는 `anomaly_logs.source='client'`로 누적.

```
FE apiFetch catch → logClientError(payload)
                  → POST /client-log (실패 무시, throttle 1초, 재귀 방지)
                  → BE: anomaly_logs INSERT (source='client', category='client.{status|network}')
                        실패해도 항상 204 (텔레메트리 자체 에러로 client에 영향 X)
```

운영 조회:

```sql
select created_at, category, detail->>'path' as path,
       detail->>'message' as msg, user_id
  from anomaly_logs
 where source = 'client'
 order by created_at desc limit 100;
```

이제 같은 종류의 사고가 일어나도 SQL 한 방으로 시각·빈도·user 분포를 본다.

### 4. 동반 fix — POST display_order 자동 부여

진단 과정에서 발견한 별개 버그. `routes.display_order int NOT NULL DEFAULT 0`이라 신규 INSERT 시 모든 row가 0으로 깔려 사용자별 정렬이 무의미했다.

```ts
const { data: maxRow } = await db.from("routes")
  .select("display_order")
  .eq("user_id", user.id)
  .order("display_order", { ascending: false })
  .limit(1)
  .maybeSingle()

const nextDisplayOrder = (maxRow?.display_order ?? -1) + 1
```

POST `/routes`, POST `/favorite-stops` 양쪽에 적용. race는 의식적으로 무시 (동시 POST 두 번이 같은 max를 읽어 같은 값으로 INSERT되어도, 다음 PATCH 한 번이면 정렬됨).

기존 운영 DB의 동률 row는 `row_number()` 백필 SQL로 1회 정리 후 적용.

## 클라이언트 텔레메트리 설계 메모

`/client-log`는 다른 함수와 다르게 다음 원칙을 강제한다:

- **절대 4xx/5xx 응답 안 함.** 어떤 예외든 잡아서 항상 204.
  - 호출 측이 catch에서 fire-and-forget으로 부르므로 또 실패하면 무한루프 위험.
- **withErrorLogging 미적용.** 위와 같은 이유로 모든 예외를 내부에서 처리.
- **anon 호출 허용.** 로그인 전 에러도 잡기 위함.
- **service_role INSERT.** anomaly_logs RLS가 service-role-only인 의도된 예외. `_shared/anomaly.ts logAnomaly()`와 동일 패턴.

FE 쪽 `clientErrorLog.ts`:

- **재귀 방지**: path가 `/client-log`로 끝나면 송신 안 함.
- **스로틀**: 같은 (path, method, status, code) 키는 1초당 최대 1회. setTimeout으로 2초 후 Map에서 자동 제거 → 메모리 누수 방지.
- **keepalive: true**: 페이지 close 직전 에러도 어느 정도 송신.
- **fire-and-forget**: `void sendLog(payload)`. await 안 함, 자체 실패는 빈 catch로 무시.

## 회고

- "BE 코드는 정상이다"라는 결론을 너무 빨리 내고 운영 배포 상태만 의심했다 → 사용자가 "기존 데이터들 백필 깨졌나" 직관으로 짚어줘서 방향 전환. 다음에는 운영 동작 이상 → BE 도달 전 단계(브라우저 → preflight → 네트워크)도 동등한 가설로 두자.
- dev/운영 환경 차이가 있는 인프라(특히 CORS, env, secret)는 dev 동작이 운영 동작을 보장하지 않는다. 이런 영역은 회귀 테스트로 강제하는 게 정답.
- "왜 안 보였는지"를 짚는 게 "왜 깨졌는지"보다 더 본질적인 사후 작업이었다. 깨짐 자체는 1줄 fix지만, 깜깜이는 인프라 한 겹을 새로 만들어야 풀렸다.

## 관련 파일

- `_shared/cors.ts:4` — PATCH 추가
- `_tests/cors_test.ts` — 회귀 테스트
- `client-log/index.ts` — endpoint
- `_tests/client-log_test.ts` — 11/11 케이스
- `routes/index.ts`, `favorite-stops/index.ts` — display_order 자동 부여
- `when_come_fe/src/lib/clientErrorLog.ts` — FE 헬퍼
- `when_come_fe/src/lib/api.ts` — apiFetch 4지점에서 `logClientError` 호출
