# ADR-003 — GBIS 정류소 자체 캐시 + 노선조회 OpenAPI 매핑

- **상태:** Proposed (2026-05-02) — multi-region-bus-arrival v2 갱신 일부
- **결정자:** architect (사용자 승인 대기)
- **관련 문서:** `docs/specs/multi-region-bus-arrival/SDD.md`(v2), `docs/api/contracts/sync-gbis-stations.md`, `when_come_be/docs/external-apis/gyeonggi-bus.md`(v2), ADR-002

---

## Context

ADR-002에서 채택한 멀티-지역 Provider 패턴은 **저장 시점에 ODsay 정류소 → GBIS 정류소(stationId) + 노선(routeId, staOrder) 매핑**을 수행한다. v1 SDD는 이를 위해 GBIS 측의 정류소 검색 API와 정류소 노선 detail API를 가정했다 (`searchGbisStation`, `getGbisStationDetail`).

### 문제 — API 명세 확정 후 발견된 두 가지 사실

1. **정류소 검색 API가 존재하지 않는다.**
   - 공공데이터포털(`apis.data.go.kr/6410000`)에는 정류소 검색 엔드포인트가 없다. busarrivalservice/v2(도착)와 busrouteservice/v2(노선)만 존재.
   - 경기도 자체 OpenAPI(`openapi.gg.go.kr/BusStation`)에는 정류소 정보가 있으나 **검색이 아니라 시군 단위 페이징 다운로드만 제공**한다 (`SIGUN_NM` 필터, `pIndex`/`pSize`).
   - 매번 매핑할 때 페이징 다운로드는 비용·지연 모두 비현실적.

2. **정류소 → 노선 detail API도 없다.**
   - 노선조회(`busrouteservice/v2`)에는 노선 → 정류소 시퀀스(`getBusRouteStationListv2`)만 있고, 정류소 → 노선 목록은 없다.
   - 즉 "이 정류소에 어떤 노선이 오는가"를 직접 묻는 방법이 없다.

ADR-002가 가정한 매핑 흐름은 두 API의 부재로 그대로 구현 불가능. 대안 필요.

---

## Decision

다음 3개의 결정을 동시에 채택한다.

### D1. 자체 DB 캐시 (`gbis_stations`)

경기도 정류소 정보를 자체 Supabase 테이블에 캐싱한다.

- 일 1회 cron(`sync-gbis-stations` Edge Function)이 경기 OpenAPI에서 31개 시군 정류소를 페이징 다운로드해 upsert
- 매핑 알고리즘은 외부 API 대신 **자체 DB만** 검색
- 인덱스: `ars_no` (1차 매칭 키), `(lat, lng)` (좌표 사전 필터), `sigun_nm`

### D2. ARS 우선 매칭 → 좌표/이름 보조

ODsay 응답의 `arsId`를 1차 매칭 키로 사용한다.

```
1차: gbis_stations.ars_no === odsayStop.arsId
   - 단일 hit → 확정
   - 다중 hit → 좌표 가까운 것 (200m 이내)
2차: bbox 1km 사전 필터 + Haversine 200m 이내 + Levenshtein 0.7 이상
   - 가장 가까운 1건
3차: 모두 실패 → provider='odsay_fallback'
```

근거: ODsay arsID와 경기 STATION_MANAGE_NO는 같은 ARS 체계. 데이터 일치율 높을 것으로 추정 (검증은 T26 QA에서).

### D3. 노선 매핑은 노선조회 + 정류소 시퀀스 조합

정류소 → 노선 detail API 부재 → **반대 방향(노선 → 정류소)** 으로 우회한다.

```
expectedRoutes = [{ routeName }, ...]   // ODsay에서 알고 있는 노선

for each expectedRoute:
  candidates = getBusRouteListv2(keyword=routeName)
  regional   = candidates.filter(c => isSameRegion(c.regionName, station.sigun_nm))
  for cand in regional:
    stationList = getBusRouteStationListv2(routeId=cand.routeId)  // 캐시 5분
    if stationList.find(s => s.stationId === station.stationId):
      → gbisRouteId = cand.routeId
      → gbisStaOrder = matched.stationSeq
      break
```

**호출량:** 노선당 평균 2~3 후보 × `getBusRouteStationListv2` 1회 + `getBusRouteListv2` 1회. 사용자 1 정류소 등록 = ~5~10 외부 API 호출. 캐시 5분 TTL로 같은 사용자의 연속 등록 시 호출 절감.

---

## Alternatives Considered

### A. ODsay arsID ↔ GBIS stationId 정적 매핑 테이블 운영

- **장점:** 매핑 시점 외부 API 호출 0
- **단점:**
  - 매핑 테이블 자체를 어딘가에서 만들어야 함 → 결국 OpenAPI 다운로드 필요 (D1과 동일 비용)
  - 신규/폐지 정류소 반영 지연
  - 좌표/이름 fallback 불가
- **기각:** D1과 비교해 우위 없음. D1은 같은 비용으로 더 많은 정보(좌표/이름) 보유.

### B. 매핑마다 경기 OpenAPI 페이징 다운로드 (no cache)

- **장점:** DB 스키마 추가 0
- **단점:**
  - 1회 매핑 = 시군 1개 페이징 다운로드 = 수십 페이지 = 수십 초
  - 사용자 저장 응답 시간 폭발
  - OpenAPI 호출 제한 없다지만 매너 위반
- **기각:** UX 불가.

### C. 매핑마다 GBIS 도착 API로 정류소 추정

- 도착 API에 정류소 정보가 일부 들어있음 (`stationId`, `routeId`)
- **장점:** 신규 인프라 불필요
- **단점:**
  - 도착 API는 운행 시간 외 빈 응답 → 새벽/심야 등록 불가능
  - 운행 노선이 없는 정류소는 매핑 불가
  - stationId 를 알아야 호출 가능 — 순환 모순
- **기각:** 부분 정보 + 시간 의존성으로 불완전.

### D. PostGIS / earthdistance 도입 후 좌표 검색

- **장점:** 좌표 검색 인덱스 정확도/성능 향상
- **단점:** 현재 데이터 규모(~35,000 row)에선 (lat, lng) B-tree + bbox 사전 필터로 충분. 미리 도입할 비용 > 이점.
- **연기:** 운영 중 검색 지연 200ms 이상 관측 시 후속 ADR.

### E. 자체 캐시 대신 ODsay subPath의 `localStID`/`stID` 활용

- **장점:** ODsay가 이미 알고 있을 가능성
- **단점:**
  - ODsay 응답이 GBIS stationId를 포함하는지 미검증
  - localStID/stID는 서울 버스 API 식별자 — 경기 GBIS와 호환 안 됨 (확인됨)
- **기각:** 검증 결과 호환성 없음.

---

## Consequences

### 긍정

- 매핑 시 외부 API 호출 0 (1차 ARS 매칭 시) ~ 10 이내 (노선 매핑 시) — 사용자 응답 시간 안정
- ODsay arsID와 GBIS arsNo 매칭이 잘 되면 매핑 정확도 매우 높음
- `gbis_stations`에 좌표/이름/시군 다 있어 fallback 검색이 자연스러움
- cron 1일 1회 = 인프라 비용 무시 가능
- 인천·부산 추가 시 동일 패턴(자체 캐시 + 노선 → 정류소 우회) 재사용 가능

### 부정 / 트레이드오프

- 신규 인프라: `gbis_stations` 테이블 + `sync-gbis-stations` 함수 + GitHub Actions 워크플로 (3종)
- **cron 미실행 시 fallback 폭발 위험.** 첫 배포 시 부트스트랩 + 운영 알림 필수
- 환경변수 1개 추가 (`GYEONGGI_OPENAPI_KEY`) — 도착/노선조회 키와 별도 시스템
- 경기 OpenAPI의 데이터 정확도/신선도 의존 — 정류소 신설 후 다음날까지 매핑 불가
- 노선 매핑이 후보 검색(`getBusRouteListv2`)에 의존 — 노선번호 동명이인 많은 경우(`11`이 시군별로 여럿) 정확도 저하 가능 → `regionName` 1차 필터 + `getBusRouteStationListv2`로 stationId 포함 노선 검증으로 보완

### 후속 영향

- DB 마이그레이션 1건 (`gbis_stations` 테이블)
- BE: `_shared/gbisClient.ts` 노선조회 함수 2개 추가, `getGbisStationDetail` 폐기
- BE: `_shared/regionMapper.ts`의 `findGbisStation` → `findGbisStationFromDB`로 대체
- BE: `supabase/functions/sync-gbis-stations/` 신규
- 인프라: GitHub Actions secrets 등록 (사용자 액션)
- 운영: cron 실패 알림 정책 수립 (후속 tech-note)

---

## Open Questions

- **OQ1.** ODsay arsID와 GBIS STATION_MANAGE_NO의 실제 매칭률은? (T26 QA에서 광명·시흥 5개씩 검증)
- **OQ2.** `getBusRouteListv2`의 `regionName` 필드값과 정류소 `SIGUN_NM`의 표기 차이 (예: `광명` vs `광명시`)는 어떻게 정규화? — `isSameRegion` 함수가 부분 포함 매칭 전제. 실측 후 보정.
- **OQ3.** 같은 노선번호가 다른 시군에 동시에 존재하는 경우(예: `1번` 마을버스가 시군마다 있음) `regionName` 필터 후에도 후보가 여럿일 수 있음. `getBusRouteStationListv2`의 정류소 포함 검증으로 충분한가?
- **OQ4.** 경기 OpenAPI의 `WGS84_LAT`/`WGS84_LOGT` 정밀도가 ODsay `x`/`y`와 일치하는가? 좌표 오차 200m 임계값이 충분한가?

---

## References

- `docs/specs/multi-region-bus-arrival/PRD.md`, `SDD.md`(v2), `TASKS.md`(v2)
- `docs/api/contracts/sync-gbis-stations.md`
- `when_come_be/docs/external-apis/gyeonggi-bus.md`(v2)
- ADR-002 — Provider 패턴 (전제 결정)
