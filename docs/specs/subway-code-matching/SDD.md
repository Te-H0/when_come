# SDD: 지하철 노선 매칭 — subway_code 영속화

- 작성일: 2026-05-09
- 관련 PRD: `./PRD.md`

## 1. DB 마이그레이션

### 1.1 스키마 변경

```sql
ALTER TABLE stop_routes          ADD COLUMN subway_code text NULL;
ALTER TABLE favorite_stop_routes ADD COLUMN subway_code text NULL;
COMMENT ON COLUMN stop_routes.subway_code IS
  'ODsay subwayCode = 서울 지하철 API lineName 형식 ("1001"~"1031"). bus row는 NULL.';
COMMENT ON COLUMN favorite_stop_routes.subway_code IS
  '동일. 지하철 노선 매칭 키.';
```

- 인덱스 미생성. 카디널리티 작음(~17개), 도착 매칭은 stop별 in-memory 비교로 충분.
- 둘 다 nullable — 버스 row와 백필 전 지하철 row 모두 안전.
- 마이그레이션 파일명: `supabase/migrations/<다음 번호>_add_subway_code_to_stop_routes.sql` (BE 구현 시점에 다음 sequential 번호 부여).

### 1.2 타입 영향

- `stop_routes` / `favorite_stop_routes` SELECT 절에 `subway_code` 추가 (routes/index.ts, favorite-stops/index.ts, arrival-info — 단, §3 결정에 따라 arrival-info는 SELECT만 추가, 응답 동봉 X).

## 2. 저장 흐름 (BE)

### 2.1 입력 DTO 확장

`StopRouteInput` / `FavoriteStopRouteInput`에 `subwayCode?: string | null` 필드 추가.

```ts
interface StopRouteInput {
  // ... existing
  subwayCode?: string | null   // ODsay subwayCode, 지하철만 채워짐
}
```

### 2.2 저장 지점

| Endpoint | 변경 |
|---|---|
| `POST /routes` | `stopRoutes[i].subwayCode` 받아 INSERT payload `subway_code`로 매핑 |
| `PATCH /routes/:id` (stops 교체 분기) | 동일 |
| `POST /favorite-stops` | `routes[i].subwayCode` 받아 INSERT |
| `PATCH /favorite-stops/:id` (routes 교체 분기) | 동일 |

검증 없음 — FE가 `search-stops` 응답에서 그대로 흘려보낸다. 서버 측 `^10\d{2}$` 패턴 검증은 과한 결합으로 판단해 생략.

### 2.3 조회 지점

`GET /routes`, `GET /favorite-stops`의 SELECT 절에 `subway_code` 컬럼 추가. FE는 응답에서 직접 읽는다.

## 3. arrival-info 응답 — **옵션 C 채택 (변경 없음, 추천)**

### 3.1 비교

| 옵션 | 변경 범위 | 응답 크기 | FE 매칭 코드 | 위험 |
|---|---|---|---|---|
| A. 응답에 `expectedSubwayCodes[]` 동봉 | arrival-info 수정 | 약간 ↑ | 유지 | 중복 데이터 — stop은 이미 GET /routes에 들어옴 |
| B. BE에서 미리 노선 필터 후 응답 | arrival-info 대폭 수정 | ↓ | 제거 | 변경 면적 큼, 방향 매칭까지 BE로 이전 → 회귀 위험 |
| **C. arrival-info 변경 없음** | **0** | 동일 | 유지 | stop 메타는 GET /routes·/favorite-stops 응답에서 이미 보유 |

**선택 근거 (C):** subway_code는 stop 단위 메타다 (도착 응답마다 보낼 필요 없음). FE는 holderquery 로 받은 stop 객체에 이미 `stopRoutes[].subwayCode`를 가지고 있고, `matchSubwayItems(items, stop)` 호출 시점에 stop에서 직접 코드 추출이 가능. arrival-info를 건드리지 않으므로 BE 변경 면적 최소, 회귀 영역 0. 옵션 B의 BE 필터링 이전은 별도 트랙(향후 검토)으로 분리.

## 4. FE 변경

### 4.1 타입 확장

- `lib/api.ts` 또는 동등 위치의 `StopRoute` 타입에 `subwayCode?: string | null` 추가.
- `search-stops` 응답에는 stop 단위 `subwayCode`만 있음 — stop 단위에서 호선별 row를 만들 때 `subwayCode`를 stopRoute에 복사해 POST 페이로드에 포함.
  - 지하철 stop은 호선당 1 row가 표준이므로 stop.subwayCode를 그대로 매핑.

### 4.2 POST 송신

`SetupRoute` / `Favorites` 저장 흐름의 `stopRoutes[]` 빌드 시 `subwayCode` 동봉.

### 4.3 매칭 로직

```ts
matchSubwayItems(items, line, { headsign, updn, subwayCode })
  ├─ 1차 (신): subwayCode 있으면 item.lineName === subwayCode (정확 일치)
  ├─ 2차 (legacy fallback): subwayCode 없으면 normalizeSubwayLineName 비교 (현행 패치 유지)
  ├─ 3·4차: 현행 directionUpdn / headsign 필터 그대로
  └─ 0건 → 호선만 일치 fallback (현행 동일)
```

- legacy fallback은 백필 완료 + 1주일 모니터링 후 별도 PR로 제거.

## 5. 백필 전략 (Edge Function 미사용, 1회용)

### 5.1 식별 SQL

지하철 row 식별은 `route_stops`/`favorite_stops` JOIN — `stop_type='subway'` 가 신뢰 가능한 단일 기준.

```sql
-- stop_routes 대상
SELECT sr.id, sr.route_name, rs.stop_name, rs.odsay_stop_id
FROM stop_routes sr
JOIN route_stops rs ON rs.id = sr.stop_id
WHERE rs.stop_type = 'subway' AND sr.subway_code IS NULL;

-- favorite_stop_routes 대상
SELECT fr.id, fr.route_name, fs.stop_name, fs.odsay_stop_id
FROM favorite_stop_routes fr
JOIN favorite_stops fs ON fs.id = fr.favorite_stop_id
WHERE fs.stop_type = 'subway' AND fr.subway_code IS NULL;
```

### 5.2 매핑 절차

1. 위 SQL로 대상 row와 `odsay_stop_id` / `route_name` 추출 → CSV 또는 JSON.
2. 로컬 스크립트 `when_come_be/scripts/backfill-subway-code.ts` (Deno)
   - 각 unique `odsay_stop_id`에 대해 `search-stops?q={stop_name}` 또는 ODsay `searchStation`을 호출.
   - 응답에서 `subwayCode` 추출 (한 stop의 여러 호선이면 `route_name` ↔ 호선 라벨 매칭).
   - row id → subway_code 매핑 결과 SQL UPDATE 문으로 출력.
3. 출력된 UPDATE 스크립트를 Supabase SQL editor에서 일괄 실행.
   - 형식: `UPDATE stop_routes SET subway_code = '1002' WHERE id = '<uuid>';` 형태 줄 단위.
   - 일괄 실행 전 `BEGIN; ... ROLLBACK;` 으로 dry-run 필수.

### 5.3 실패 row 처리

매핑 실패 row는 별도 anomaly 리포트로 출력 — 운영자가 수기 처리 또는 사용자에게 재등록 유도. NULL 유지 시 FE legacy fallback이 동작.

### 5.4 산출물 위치

- `when_come_be/scripts/backfill-subway-code.ts` (1회용, .gitignore 대상 아님 — 작업 이력으로 남김)
- 실행 가이드: `when_come_be/docs/tech-notes/subway-code-backfill.md`

## 6. 수용 기준

- [ ] 마이그레이션 적용 후 `stop_routes.subway_code` / `favorite_stop_routes.subway_code` 컬럼 존재 확인.
- [ ] 신규 경로/즐겨찾기 저장 시 지하철 row의 subway_code가 `"10\d{2}"` 패턴으로 채워짐.
- [ ] 백필 완료 후 `WHERE stop_type='subway' AND subway_code IS NULL` 카운트 0 (또는 운영자 승인된 잔여 row만).
- [ ] FE matchSubwayItems가 코드 비교 1차 경로로 동작 (로그/디버그 확인 가능).
- [ ] 즐겨찾기/경로 dev 화면에서 지하철 도착 정보 정상 표시 — "도착 정보 없음" 오표시 회귀 0건.
- [ ] arrival-info 응답 스키마 변경 없음 (옵션 C 보장).

## 7. 롤아웃 순서

1. **마이그레이션 PR** — 컬럼 추가만. 기존 코드 무영향.
2. **BE PR** — `routes`/`favorite-stops` POST/PATCH에서 `subwayCode` 수신 + INSERT, GET SELECT 절 추가. (테스트 필수: happy path + null 입력)
3. **FE PR** — 타입 확장 + POST 송신 + matchSubwayItems 코드 우선 분기. legacy fallback 유지.
4. **백필 실행** — 운영 DB 대상. dry-run → 실행 → 잔여 NULL 확인.
5. **검증 단계** — 1주일 모니터링 (anomaly_logs + 사용자 리포트).
6. **별도 PR** — FE legacy normalize fallback 제거.

## 8. 위험 / 미결정 사항

- 1주일 모니터링 후 fallback 제거 시점은 운영 데이터 기준 재판단.
- ODsay `subwayCode`가 미래에 새 호선(예: 32~) 추가 시 `ODSAY_SUBWAY_CODE_MAP` 보강 필요 — 모니터링 항목에 추가.
- 백필 스크립트가 ODsay rate limit에 걸릴 가능성 → 호출 간 sleep 포함.
