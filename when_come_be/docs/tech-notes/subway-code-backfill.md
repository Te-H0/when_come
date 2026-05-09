# subway_code 백필 가이드

## 배경

`stop_routes.subway_code` / `favorite_stop_routes.subway_code` 컬럼이
마이그레이션 `20260509000600_add_subway_code_to_stop_routes.sql`로 추가됨.
기존 row는 NULL 상태이며, 이 스크립트로 채운다.

## 환경변수 설정

```bash
export SUPABASE_URL="https://<project-id>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role_jwt>"
export ODSAY_API_KEY="<odsay_key>"
```

## 실행 명령

```bash
cd when_come_be
deno run --allow-net --allow-env scripts/backfill-subway-code.ts > backfill.sql 2> failed.txt
```

- stdout → `backfill.sql` (UPDATE 문 목록)
- stderr → `failed.txt` (매핑 실패 row + 진행 로그)

## dry-run 절차

SQL을 실행하기 전 반드시 트랜잭션 안에서 검증한다.

```sql
BEGIN;

-- backfill.sql 내용 붙여넣기 또는 \i backfill.sql

-- 검증: subway_code가 채워진 row 확인
SELECT id, route_name, subway_code FROM stop_routes WHERE subway_code IS NOT NULL LIMIT 10;
SELECT id, route_name, subway_code FROM favorite_stop_routes WHERE subway_code IS NOT NULL LIMIT 10;

ROLLBACK;  -- 문제 없으면 COMMIT; 으로 변경
```

## 실패 row 처리

`failed.txt`에 기록된 row는 자동 매칭에 실패한 경우다.

확인 방법:
1. `stop_name` / `route_name` 조합으로 ODsay 콘솔에서 직접 검색
2. `odsaySubwayTypeToSubwayCode(type)` 함수 참고해 subwayCode 결정
3. 수동 UPDATE:
   ```sql
   UPDATE stop_routes SET subway_code = '1002' WHERE id = '<uuid>';
   ```

## 검증 SQL

백필 완료 후 NULL이 남아 있는 row 수를 확인한다.

```sql
-- stop_routes 잔여 NULL
SELECT COUNT(*)
FROM stop_routes sr
JOIN route_stops rs ON rs.id = sr.stop_id
WHERE rs.stop_type = 'subway' AND sr.subway_code IS NULL;

-- favorite_stop_routes 잔여 NULL
SELECT COUNT(*)
FROM favorite_stop_routes fsr
JOIN favorite_stops fs ON fs.id = fsr.favorite_stop_id
WHERE fs.stop_type = 'subway' AND fsr.subway_code IS NULL;
```

두 쿼리 모두 0이면 백필 완료.

## 주의 사항

- ODsay 요청 간 200ms sleep이 적용됨 (rate limit 방어). row 수가 많으면 시간이 걸린다.
- 동일 `stop_name`의 중복 ODsay 호출은 캐시로 방지됨.
- 스크립트는 읽기 전용(stdout에 SQL만 출력). 실제 DB 변경은 사용자가 직접 수행한다.
