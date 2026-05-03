# API 계약 — `POST /sync-gbis-stations`

- **상태:** Draft (2026-05-02) — multi-region-bus-arrival v2
- **작성일:** 2026-05-02
- **관련:** `docs/specs/multi-region-bus-arrival/SDD.md`(v2 §6, §7), `docs/decisions/ADR-003-gbis-station-caching.md`, `when_come_be/docs/external-apis/gyeonggi-bus.md`(정류소현황 섹션)

---

## 0. 개요

경기도 OpenAPI(`https://openapi.gg.go.kr/BusStation`)에서 **경기도 전 시군의 정류소 정보를 페이징 다운로드**해 자체 DB(`gbis_stations`)에 upsert하는 운영용 Edge Function. 일 1회 GitHub Actions cron이 호출. 사용자/FE는 호출하지 않음 (admin/cron 전용).

**왜 필요한가:** 경기 OpenAPI는 검색 API가 아니라 시군 단위 페이징 다운로드만 제공. 매번 페이징 다운로드는 비효율 → 자체 캐시.

**호출자:** GitHub Actions만 (서비스 롤 토큰 사용). 일반 anon/authenticated 사용자는 401.

---

## 1. 엔드포인트

```
POST {SUPABASE_URL}/functions/v1/sync-gbis-stations
```

CORS: 본 함수는 사용자 브라우저에서 호출되지 않으므로 OPTIONS preflight를 받되 GET/PUT/DELETE는 405. 단, Edge Function 표준에 따라 OPTIONS는 200.

---

## 2. 인증

| 헤더 | 값 | 필수 |
|------|----|------|
| `Authorization` | `Bearer {SUPABASE_SERVICE_ROLE_KEY}` | Y |
| `Content-Type` | `application/json` | Y (body 있을 때) |

> Service Role Key 검증은 `_shared/auth.ts`의 service-role 전용 헬퍼 사용 (anon JWT는 거부).

---

## 3. 입력 (Body)

```ts
interface SyncGbisStationsRequest {
  /** 단일 시군만 동기화하려면 지정. 미지정 시 31개 시군 전체. */
  sigun_nm?: string

  /** 다수 시군을 한 번에 (배열 모드, 운영 분할 모드용). sigun_nm 우선. */
  sigun_nm_in?: string[]

  /** 페이지 크기 (기본 100, 최대 1000). */
  pSize?: number

  /** dry-run — 외부 API 호출만 하고 DB upsert는 skip (디버그용). */
  dryRun?: boolean
}
```

### 3.1 입력 예시

전체 동기화 (cron 기본):
```json
{}
```

광명시만:
```json
{ "sigun_nm": "광명시" }
```

분할 모드 (수도권 6개 시군만):
```json
{ "sigun_nm_in": ["광명시", "시흥시", "부천시", "안양시", "성남시", "수원시"] }
```

---

## 4. 동작

```
1) 인증 검증 (Service Role JWT 아니면 401)
2) 시군 목록 결정
   - body.sigun_nm 지정 → [그것]
   - body.sigun_nm_in 지정 → 그 배열
   - 둘 다 없음 → 경기도 31개 시군 (하드코딩 또는 첫 호출 응답으로 추정)
3) 각 시군에 대해 페이징 루프
   for page = 1, 2, ... :
     GET https://openapi.gg.go.kr/BusStation
       ?KEY={GYEONGGI_OPENAPI_KEY}
       &Type=json
       &pIndex={page}
       &pSize={pSize ?? 100}
       &SIGUN_NM={sigun}
     totalCount = response.head[0].LIST_TOTAL_COUNT
     rows = response.row[]
     if (!dryRun) await upsertGbisStations(rows)
     if (rows.length < pSize) break
4) 통계 집계 + 응답
```

### 4.1 upsert 매핑

경기 OpenAPI 응답 → `gbis_stations` 컬럼:

| 응답 필드 | 컬럼 | 비고 |
|-----------|------|------|
| `STATION_ID` | `station_id` | PK (text) |
| `STATION_NM_INFO` | `station_name` | |
| `STATION_MANAGE_NO` | `ars_no` | nullable (일부 정류소 미할당) |
| `WGS84_LAT` | `lat` | numeric(9,6) |
| `WGS84_LOGT` | `lng` | numeric(9,6) — 응답은 `LOGT` 표기 (longitude의 변형) |
| `SIGUN_NM` | `sigun_nm` | |
| `SIGUN_CD` | `sigun_cd` | |
| `STATION_DIV_NM` | `station_div_nm` | |
| `JURISD_INST_NM` | `jurisd_inst_nm` | |
| `LOCPLC_LOC` | `locplc_loc` | |
| `now()` | `synced_at` | upsert 시 갱신 |

`onConflict: 'station_id'` — PK 충돌 시 업데이트.

---

## 5. 응답

### 5.1 200 OK — 정상 (전체/부분 성공)

```ts
interface SyncGbisStationsResponse {
  ok: true
  synced: number                  // 전체 upsert 건수
  sigun: Record<string, number>   // 시군별 건수 — { '광명시': 412, '시흥시': 689, ... }
  errors: SyncError[]             // 부분 실패 (시군 단위)
  dryRun: boolean
  startedAt: string               // ISO 8601
  finishedAt: string
  durationMs: number
}

interface SyncError {
  sigun: string
  page?: number
  message: string                 // 외부 API CODE/MESSAGE 또는 fetch 오류
  code?: string                   // 'EXTERNAL_API' | 'UPSERT' | 'TIMEOUT'
}
```

### 5.2 응답 예시 — 전체 성공

```json
{
  "ok": true,
  "synced": 34218,
  "sigun": {
    "수원시": 2103,
    "고양시": 1942,
    "용인시": 2014,
    "성남시": 1831,
    "광명시": 412,
    "시흥시": 689
  },
  "errors": [],
  "dryRun": false,
  "startedAt": "2026-05-02T19:00:00.000Z",
  "finishedAt": "2026-05-02T19:01:43.812Z",
  "durationMs": 103812
}
```

### 5.3 응답 예시 — 부분 성공

```json
{
  "ok": true,
  "synced": 31204,
  "sigun": {
    "수원시": 2103
  },
  "errors": [
    {
      "sigun": "여주시",
      "page": 3,
      "code": "EXTERNAL_API",
      "message": "INFO-300 필수입력값 오류"
    }
  ],
  "dryRun": false,
  "startedAt": "2026-05-02T19:00:00.000Z",
  "finishedAt": "2026-05-02T19:01:55.000Z",
  "durationMs": 115000
}
```

### 5.4 에러 응답

| HTTP | 케이스 | body |
|------|--------|------|
| 401 | Authorization 헤더 없음 / anon JWT / 잘못된 service role key | `{ error: 'UNAUTHORIZED' }` |
| 400 | body 형식 오류 (`sigun_nm` 빈 문자열 등) | `{ error: 'INVALID_REQUEST', message }` |
| 500 | `GYEONGGI_OPENAPI_KEY` 미설정 / Supabase upsert 전체 실패 | `{ error: 'INTERNAL', message }` |
| 502 | (사용 안 함 — 외부 API 부분 실패는 200 + errors[]에 누적) | — |

---

## 6. 호출 비용 / 제한

- 경기 OpenAPI **호출 제한 없음** (확정 정보).
- 1일 1회 cron 기준 최대 ~350 페이지 호출 예상.
- Edge Function wall-time: ~150초 한계 → 단일 invoke로 31시군 일괄 처리 가능 추정. 시간초과 관측 시 분할 모드(`sigun_nm_in`)로 워크플로 변경.

---

## 7. 호출 예시 (curl, GitHub Actions)

```bash
curl -fsS -X POST "$SUPABASE_URL/functions/v1/sync-gbis-stations" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  --max-time 300
```

분할 모드 (운영 분할):
```bash
curl -fsS -X POST "$SUPABASE_URL/functions/v1/sync-gbis-stations" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sigun_nm_in": ["광명시", "시흥시", "부천시"]}' \
  --max-time 120
```

---

## 8. 운영 노트

- **부트스트랩:** 첫 배포 후 `workflow_dispatch`로 1회 수동 실행. 캐시 row > 30,000 확인 후 사용자 트래픽 활성화.
- **장애 대응:** cron 실패 시 GitHub Actions 알림. 14일 연속 실패 시 매핑 정확도 저하 → 운영자 수동 확인.
- **데이터 신선도:** `synced_at`이 14일 이상 된 row 발견 시 알람 (후속 운영 도구).
- **마이그레이션 시 첫 row count:** 광역 정류소 약 35,000개 (추정).

---

## 9. 변경 이력

- 2026-05-02 — 초안 (multi-region-bus-arrival v2 캐싱 패턴 도입)
