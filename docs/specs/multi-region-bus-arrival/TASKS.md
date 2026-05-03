# TASKS — 멀티-지역 버스 도착 Provider (multi-region-bus-arrival)

- **상태:** v1 BE Phase 1~2 구현 완료 (2026-05-02) → v2 갱신: 캐싱 패턴 도입 (2026-05-02). T21~T25 구현 완료. T26 QA는 cron 부트스트랩 후 진행.
- **최근 갱신:** 2026-05-02 (v2 T21~T25 완료)
- **선행 문서:** `PRD.md`, `SDD.md`(v2), `docs/decisions/ADR-002-multi-region-arrival-provider.md`, `docs/decisions/ADR-003-gbis-station-caching.md`
- **승인 후 위임:** be-agent (T21~T25) → fe-agent (FE 영향 없음 — Phase 3 v1 그대로 적용 후) → 정리(T26)

> 각 task 완료 시 체크박스 + 완료일 표기 (rule: docs-maintenance.md).

---

## v1 정리 — 기존 태스크

### Phase 0 — 사용자 액션 (선행)

- [ ] **U1.** 공공데이터포털 `경기도_시내버스 정류소 정보조회` 데이터셋 활용 신청 → **v2에서 폐기 (정류소 검색 API 부재 확인됨, 경기도 자체 OpenAPI로 대체).**
- [ ] **U2.** 공공데이터포털 `경기도_시내버스 노선 정보조회` 데이터셋 활용 신청 → **v2 변경: `15080662` 데이터셋 (`busrouteservice/v2`) 활용 신청.**
- [ ] **U3.** 승인 확인 후 외부 API 문서 보강 → 본 v2에서 사전 명세 확정 → 부분 완료. T26에서 실측 응답 캡처 보강.

### Phase 1 — BE 토대 (be-agent) — 완료

- [x] **T1.** DB 마이그레이션 (`route_stops.provider` 등) (완료일: 2026-05-02)
- [x] **T2.** GBIS 클라이언트 v1 (도착 API 중심) (완료일: 2026-05-02) — **v2에서 T22로 보완.**
- [x] **T3.** ArrivalProvider 인터페이스 (완료일: 2026-05-02)
- [x] **T4.** SeoulBusProvider (완료일: 2026-05-02)
- [x] **T5.** GyeonggiBusProvider (완료일: 2026-05-02)
- [x] **T6.** OdsayBusProvider (완료일: 2026-05-02)

### Phase 2 — BE 통합 (be-agent) — 완료

- [x] **T7.** arrival-info 라우팅 변경 (완료일: 2026-05-02)
- [x] **T8.** `regionMapper` v1 (완료일: 2026-05-02) — **v2에서 T23으로 갱신 (DB 검색 기반).**
- [x] **T9.** routes POST 매핑 호출 통합 (완료일: 2026-05-02) — **v2에서 T23 갱신 영향 받음.**
- [x] **T10.** routes GET 응답 확장 (완료일: 2026-05-02)
- [ ] **T11.** 매핑 검증 QA — **v2에서 T25로 합쳐서 진행.**

### Phase 3 — FE 적응 (fe-agent) — v2 영향 없음

- [x] **T12.** `lib/api.ts` 단순화 (완료일: 2026-05-02)
- [x] **T13.** 도착 카드 호출 변경 (완료일: 2026-05-02)
- [x] **T14.** fallback 안내 UI (완료일: 2026-05-02)
- [ ] **T15.** 수동 QA — v2 캐시 부트스트랩 후 진행 (T25에 흡수)

### Phase 4 — 정리

- [ ] **T16.** `when_come_be/docs/architecture/overview.md` (완료 — 2026-05-02 v2에서 Provider 패턴 반영됨)
- [ ] **T17.** `when_come_fe/docs/architecture/overview.md`
- [ ] **T18.** `when_come_be/docs/external-apis/gyeonggi-bus.md` — **v2 본 갱신에서 사전 처리, T26에서 실측 응답 보강.**
- [x] **T19.** ADR-002 작성 (완료일: 2026-05-02)
- [ ] **T20.** PRD/SDD/TASKS/ADR 상태 갱신 (T26에서 일괄)

---

## v2 신규 태스크 — 캐싱 패턴 도입

### Phase 5 — BE 캐시 인프라 (be-agent)

#### T21. `gbis_stations` 마이그레이션
- 파일: `supabase/migrations/20260503000000_create_gbis_stations.sql`
- 내용: SDD §5.2의 `create table` + 인덱스 3종
  - PK `station_id`
  - 인덱스: `ars_no` (partial), `(lat, lng)`, `sigun_nm`
  - comment 추가
- RLS: `gbis_stations`은 read public, write service-role only
  ```sql
  alter table gbis_stations enable row level security;
  create policy "anon read" on gbis_stations for select using (true);
  -- write는 service role bypass
  ```
- **수용 기준:**
  - `supabase db push` 성공
  - select/insert 권한 검증 (anon select OK, anon insert NG)
  - 인덱스 `EXPLAIN`으로 실제 사용 확인
- 완료일: 2026-05-02

#### T22. `gbisClient` v2 보강 — 노선조회 API 추가
- 파일: `supabase/functions/_shared/gbisClient.ts`
- 추가 함수:
  - `getBusRouteListv2(keyword: string): Promise<GbisRouteCandidate[]>`
  - `getBusRouteStationListv2(routeId: string): Promise<GbisRouteStation[]>`
- 기존 v1 함수에서 **폐기:** `getGbisStationDetail` (SDD §8.1 — API 부재 확인)
- 환경변수: `GYEONGGI_BUS_API_KEY` (도착과 동일 키)
- 캐시: 모듈 레벨 메모리 Map, key=`routeStations:${routeId}`, TTL 5분
- 에러 처리: 공공데이터포털 표준 (`resultCode=0` 정상, `4` 빈 결과, 그 외 502)
- **수용 기준:** `gbisClient_test.ts` 갱신
  - `getBusRouteListv2('11')` happy → busRouteList 배열
  - `getBusRouteStationListv2('234000016')` happy
  - 캐시 동작: 같은 routeId 두 번 호출 시 fetch 1회만
  - resultCode=4 → 빈 배열
  - HTTP 502 → throw BadGatewayError
- 완료일: 2026-05-02

#### T23. `regionMapper` v2 갱신 — DB 검색 기반
- 파일: `supabase/functions/_shared/regionMapper.ts`
- 변경 함수 (v1 대체):
  - `findGbisStationFromDB(odsayStop)`: SDD §3.3
    1. ARS 매칭 (단일 → 확정 / 다중 → 좌표 가까운 것)
    2. ARS 실패 시: bbox 사전 필터 + Haversine + Levenshtein 0.7
  - `mapGbisRoutes(station, expectedRoutes)`: SDD §3.4
    1. 각 노선에 대해 `getBusRouteListv2(keyword=routeName)`
    2. `regionName` 1차 필터 (`isSameRegion(c.regionName, station.sigun_nm)`)
    3. 후보별 `getBusRouteStationListv2(routeId)` (캐시 5분)
    4. stationId 포함 노선 선택 → `stationSeq` 추출
  - `verifyGbisMapping`: 변경 없음 (50% 임계값)
- 폐기 함수: v1의 `findNearestGbisStation` (외부 API 호출 → DB 검색으로 전환)
- **수용 기준:** `regionMapper_test.ts` 갱신
  - DB mock에 5개 row 시드 → ARS 매칭 happy
  - DB miss + 좌표 200m 이내 + 이름 유사도 0.7 이상 → 매칭
  - DB miss + 좌표 OK + 이름 0.5 → null
  - DB 빈 테이블 → odsay_fallback 분기
  - mapGbisRoutes happy: 1 노선 → gbisRouteId/staOrder 채워짐
  - mapGbisRoutes 부분 실패: 일부 노선만 매핑 (배열 일부 null OK)
- 완료일: 2026-05-02

#### T24. `sync-gbis-stations` Edge Function
- 파일: `supabase/functions/sync-gbis-stations/index.ts`
- 계약: `docs/api/contracts/sync-gbis-stations.md`
- 동작:
  1. 인증: `Authorization: Bearer SERVICE_ROLE_KEY` 검증 (`_shared/auth.ts` 활용)
  2. body: `{ sigun_nm?: string }` (optional, 단일 시군 모드)
  3. 31개 시군 (또는 단일 시군) 페이징 다운로드
  4. 100개씩 chunk upsert
  5. 통계 응답 `{ synced, sigun: {...}, errors: [...] }`
- 환경변수: `GYEONGGI_OPENAPI_KEY` (신규), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- 시간초과 대응: 시군 단위 try/catch로 부분 실패 허용 (errors[] 누적 후 200 응답)
- **수용 기준:** `syncGbisStations_test.ts`
  - 인증 헤더 없음 → 401
  - service role 헤더 + body `{}` → 200 + synced > 0 (mock fetch)
  - body `{ sigun_nm: '광명시' }` → 단일 시군 페이징 검증
  - 외부 API 5xx 응답 (mock) → errors[]에 누적, 200 응답 유지
  - resultCode `INFO-200`(데이터 없음) → 빈 응답 처리
  - upsert 실패 mock → 500 + clear message
  - OPTIONS preflight → 200
- 완료일: 2026-05-02

#### T25. GitHub Actions 워크플로
- 파일: `.github/workflows/sync-gbis-stations.yml`
- 내용: SDD §7 그대로
  - 트리거: `schedule: '0 19 * * *'` + `workflow_dispatch`
  - Step: curl로 Edge Function POST (Service Role 헤더)
  - `--max-time 300` (5분)
- GitHub Secrets 등록 (사용자 액션):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- **수용 기준:**
  - `workflow_dispatch`로 수동 트리거 → 성공 응답
  - 실행 후 `gbis_stations` row count > 30,000 (수도권 정류소 추정치)
  - 다음날 자동 트리거 정상 동작 확인 (운영 1주차)
- 완료일: 2026-05-02 (코드 완료 — GitHub Secrets 등록 및 workflow_dispatch 검증은 사용자 액션)

### Phase 6 — 통합 / QA / 문서 (be-agent + 수동)

#### T26. v2 통합 QA + 문서 보강
- 사전: T21~T25 모두 완료 + 첫 cron 실행 후 `gbis_stations` 부트스트랩 완료
- QA 시나리오:
  - (a) 광명사거리역 11번 등록 → DB의 provider='gyeonggi', gbis_station_id 채움, gbis_route_id/sta_order 채움 → 도착 카드 정상
  - (b) 시흥 신천역 21번 등록 → 동일 검증
  - (c) 강남역 472번 (서울 회귀) → provider='seoul', GBIS 컬럼 null
  - (d) 좌표 외곽(강원/충청) → provider='odsay_fallback'
  - (e) 마이그레이션 후 기존 저장 경로 회귀 → 깨지지 않음
  - (f) 매핑 검증 실패 강제 (mock GBIS arrivals 빈 응답) → odsay_fallback 격하 확인
- 문서 보강:
  - `when_come_be/docs/external-apis/gyeonggi-bus.md` v2 — 실측 응답 예시 추가
  - `docs/specs/multi-region-bus-arrival/PRD.md`, `SDD.md` 상태 → '완료'
  - `docs/collab-notes.md` 변경 이력 갱신 (실측 응답 + 인덱스 정확도)
- 운영 가이드(신규):
  - `when_come_be/docs/tech-notes/gbis-stations-cron-ops.md` — cron 실패 알림 절차, 14일 미동기화 시 대응
- **수용 기준:** 6개 시나리오 모두 통과 + 문서 갱신 PR 머지
- 완료일: ____

---

## 검증 기준 (Definition of Done — v2)

다음 모두 만족 시 v2 머지 가능:

1. Deno test 전체 통과 (T22/T23/T24의 모든 신규 케이스 포함)
2. T25 GitHub Actions `workflow_dispatch` 수동 1회 성공 + cron 1회 자동 성공 확인 (운영 1주차)
3. `gbis_stations` row count > 30,000
4. T26 QA 6개 시나리오 모두 통과
5. PRD/SDD/TASKS/ADR-002/ADR-003 모두 상태 "완료"
6. `collab-notes.md` 변경 이력 갱신 (캐싱 패턴 도입 항목)
7. 광명·시흥 정류장에서 도착 정보 정상 응답 (PRD §6 성공 지표 1·2 통과)

---

## 의존성 / 순서 요약 (v2)

```
사용자 액션 (Phase 0)
    │ (GYEONGGI_OPENAPI_KEY 발급)
    ▼
T21 (마이그레이션) ─────────────────┐
T22 (gbisClient v2 보강) ──────┐   │
                                │   │
                                ▼   ▼
                              T23 (regionMapper v2)
                                │
                                ▼
                              T24 (sync-gbis-stations)
                                │
                                ▼
                              T25 (GitHub Actions)
                                │
                                ▼
                            [수동 트리거로 캐시 부트스트랩]
                                │
                                ▼
                              T26 (QA + 문서)
```

> Phase 5는 이전 Phase 1~3과 독립적. 기존 BE/FE 구현은 v2 매핑 로직이 들어가도 동작 변화 없음 (단, 캐시 빈 상태에서는 모든 경기 stop이 odsay_fallback으로 격하 — T25 부트스트랩 필수).
