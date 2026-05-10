# 로컬 개발 시드 규칙

자동 적용 경로: `when_come_be/supabase/seed.sql`, `when_come_fe/src/lib/supabase.ts`

## dev 유저 자격증명

| 항목 | 값 |
|------|-----|
| UUID | `00000000-0000-0000-0000-000000000001` |
| email | `dev@when-come.local` |
| password | `devpassword123` |

이 자격증명은 로컬 전용. `.env.production`에 절대 포함 금지.

## supabase db reset 동작

`supabase db reset`은 다음 순서로 실행된다.

1. 로컬 DB를 초기 상태로 reset
2. `supabase/migrations/` 하위 파일을 파일명(타임스탬프) 순으로 전부 적용
3. `supabase/seed.sql`이 존재하면 자동으로 실행

따라서 dev 유저 + 샘플 데이터는 `supabase db reset` 1회로 완전히 초기화된다.

## 시드 데이터 구성 (2026-05-10 기준)

| 테이블 | 건수 | 내용 |
|--------|------|------|
| auth.users | 1 | dev 유저 |
| auth.identities | 1 | email provider identity |
| routes | 2 | 출근길, 퇴근길 |
| route_stops | 5 | 버스(서울) 2, 지하철 2, 버스(경기) 1 |
| stop_routes | 6 | 노선 각 1~2개 |
| favorite_stops | 1 | 서울 버스 정류장 즐겨찾기 |
| favorite_stop_routes | 2 | 즐겨찾기 노선 |

## 시드 데이터 추가 절차

### seed.sql에 추가 (권장 — 영속)
`when_come_be/supabase/seed.sql` 하단에 INSERT문을 추가하고 `supabase db reset`을 다시 실행한다.
멱등 패턴 필수: `ON CONFLICT (id) DO NOTHING`.

### Supabase Studio에서 수동 추가 (임시)
`http://127.0.0.1:54323` (로컬 Studio)에서 직접 row를 추가할 수 있다.
단, `db reset` 시 날아가므로 영속이 필요하면 반드시 seed.sql로 옮긴다.

## 주의사항

- seed.sql의 odsay_stop_id / odsay_route_id / ars_id 등은 실제 API 값이 아님.
  `arrival-info` 등 외부 API를 호출하면 에러 응답이 돌아온다.
  실제 도착정보 테스트가 필요하면 실제 정류장 ID로 직접 row를 추가한다.
- `auth.users.encrypted_password` 생성에 `pgcrypto` 익스텐션이 필요하다.
  seed.sql 상단에 `create extension if not exists pgcrypto;` 포함됨.
- RLS가 활성화된 테이블에 seed 데이터를 넣으려면 시드는 superuser 컨텍스트(로컬 reset)에서 실행되므로 RLS bypass가 자동 적용됨.

## 운영 데이터로 시드 갱신

로컬 dev 환경에서 실시간 도착정보 등 외부 API 호출이 실제 동작하게 하려면 운영 DB의 실제 routes/stops 데이터를 seed.sql로 가져와야 한다. `scripts/import-prod-data.ts`가 이 과정을 자동화한다.

### 실행 방법

```bash
cd when_come_be
deno run -A scripts/import-prod-data.ts
supabase db reset
```

### 언제 실행

- 운영에서 본인 routes/favorites를 추가·수정했을 때
- 새 dev 환경 셋업 시

### 동작 요약

1. `.env.local`의 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 로드 (운영 자격)
2. `routes` 테이블에서 가장 많은 row를 가진 사용자 자동 탐지 (동률 시 `created_at` 가장 오래된 user 우선)
3. `routes` / `route_stops` / `stop_routes` / `favorite_stops` / `favorite_stop_routes` 추출
4. 운영 user_id → dev UUID (`00000000-0000-0000-0000-000000000001`) 치환
5. `seed.sql`의 auth.users/identities 헤더 유지, 데이터 부분만 교체
6. 모든 INSERT는 `ON CONFLICT (id) DO NOTHING` — 멱등

### 주의사항

- service_role_key는 로그/출력에 절대 표시되지 않음
- `seed.sql`에 운영 경로 라벨("집", "회사" 등) 등 개인 데이터가 포함됨
- 협업 환경이라면 `seed.sql`을 `.gitignore`에 추가 또는 `seed.sql.example`로 분리 검토

## prod와의 분리 보장

- `when_come_fe/.env.local` → 로컬 Supabase URL + anon key 사용
- `when_come_fe/.env.production` → prod Supabase URL + anon key (dev 자격 미포함)
- seed.sql은 로컬 `supabase db reset`에만 실행됨. prod DB에는 절대 실행 금지.
