# anomaly_logs — fire-and-forget 운영 이상 케이스 로깅

작성일: 2026-05-08

## 배경

Edge Function 에러와 "에러는 아니지만 이상한 케이스"(ODsay 매핑 실패, arrmsg 패턴 미매칭 등)를 DB에 누적해서 SQL로 분석 가능하게 만드는 인프라. Sentry 등 외부 서비스 없이 Supabase 자체 DB를 분석 저장소로 활용.

## 설계 원칙

1. 메인 로직 차단 절대 금지 — INSERT 실패, 환경변수 없음, 네트워크 오류 등 어떤 이유로도 원래 응답에 영향 0.
2. fire-and-forget — 응답 반환 후 비동기로 INSERT. 응답 latency에 기여하지 않음.
3. 노이즈 차단 — 4xx 클라이언트 잘못(`status >= 400 && status < 500 && code 없음`)은 기록 안 함. 5xx 전체 + 비즈니스 에러 코드(code 있는 4xx)만 기록.

## 구현 선택: errorResponse 통합 방식

요청에서 제시된 두 옵션 중 `errorResponse(e, source)` 통합 방식을 선택했다.

미들웨어만 사용하는 방식의 한계: 핸들러 내부 `try/catch`가 `return errorResponse(e)`로 에러를 이미 Response로 변환하면 미들웨어 catch에 도달하지 않는다. 즉 핸들러가 정상적으로 throw하지 않는 한 미들웨어는 아무것도 잡을 수 없다. 실제 5xx(ARRIVAL_PROVIDER_ERROR 등)는 모두 핸들러 내부 catch에서 처리되므로 미들웨어만으로는 기록 불가.

`errorResponse`에 optional `source?: string` 인자를 추가해서 내부에서 로깅 정책을 적용하고, 미들웨어(`withErrorLogging`)는 핸들러 외부 unhandled 예외(극히 드문 런타임 에러)에 대한 최후 안전망으로 사용.

## EdgeRuntime.waitUntil 사용 이유

Supabase Edge Function(Deno Deploy 기반)은 `Response`를 반환한 직후 worker가 종료될 수 있다. 단순히 Promise를 fire-and-forget으로 던지면 INSERT가 완료되기 전에 worker가 끊길 수 있다.

`EdgeRuntime.waitUntil(promise)`를 사용하면 런타임에 "이 Promise가 완료될 때까지 worker를 살려두라"고 알린다. 로컬/테스트 환경에서는 `EdgeRuntime`이 없으므로 microtask로 던지는 방식으로 폴백 — 응답 후 끝나도 OK (테스트에서는 await로 검증).

## 카테고리 분류 체계

| 패턴 | 예시 | 설명 |
|------|------|------|
| `error.5xx` | `error.502xx` | 비즈니스 코드 없는 5xx |
| `error.business.{CODE}` | `error.business.ARRIVAL_PROVIDER_ERROR` | 비즈니스 에러 코드 있는 4xx/5xx |
| `error.unhandled` | `error.unhandled` | 미들웨어가 잡은 핸들러 외부 예외 |

향후 "에러는 아니지만 이상한 케이스" 추가 시:
- arrmsg 패턴 매칭 실패 → `pattern.unparseable_subway_arrmsg`
- ODsay 매핑 실패 → `pattern.odsay_mapping_fallback`

`logAnomaly({ source, category, detail })`을 비즈니스 로직 어디서든 직접 호출 가능.

## anomaly_logs 테이블 RLS

`alter table anomaly_logs enable row level security` 후 정책을 생성하지 않으면 anon/authenticated 모두 read/write 차단. service role은 RLS를 우회하므로 `anomaly.ts` 내부의 service role 클라이언트만 INSERT 가능.

SQL 분석은 Supabase 대시보드 SQL Editor에서 service role로 직접 실행.

## SQL 분석 예시

```sql
-- 최근 에러 100건
select source, category, detail, created_at
from anomaly_logs
order by created_at desc
limit 100;

-- source별 에러 집계 (7일)
select source, category, count(*) as cnt
from anomaly_logs
where created_at > now() - interval '7 days'
group by source, category
order by cnt desc;

-- ARRIVAL_PROVIDER_ERROR 상세 조회
select detail, created_at
from anomaly_logs
where category = 'error.business.ARRIVAL_PROVIDER_ERROR'
order by created_at desc
limit 50;
```
