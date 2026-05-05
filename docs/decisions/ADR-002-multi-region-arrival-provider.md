# ADR-002 — 멀티-지역 버스 도착 Provider 패턴

- **상태:** Accepted (2026-05-02) — D1·D2·D4는 그대로 유효. **D3(좌표 기반 지역 판별)은 유지하되, `findGbisStation`의 구현 방식은 ADR-003에서 자체 캐시(`gbis_stations`)로 보완. D3-supplement(2026-05-05)로 busType 보조 신호 추가.**
- **작성일:** 2026-05-02
- **결정자:** architect
- **관련 문서:** `docs/specs/multi-region-bus-arrival/`, `docs/api/contracts/arrival-info.md`, `docs/api/contracts/routes.md`, **`docs/decisions/ADR-003-gbis-station-caching.md` (보조 결정)**

---

## Context

when_come은 ODsay로 정류장 검색·경로탐색을 처리하지만, **실시간 버스 도착 조회**는 서울 버스 API(`getStationByUid`)에만 의존한다. ODsay가 응답하는 `arsID`(5자리)가 우연히 서울 `arsId`와 동일 체계라 서울 정류장은 동작했으나, 경기 정류장(GBIS는 `stationId`(예: `200000177`) 별도 체계)은 미동작.

광명사거리역 사례에서 `arsId=85019`를 GBIS에 전달하면 `resultCode=4` (결과 없음). 두 시스템 ID 체계가 다름이 확인됨.

향후 인천·부산 등 추가 광역시도 동일 패턴(공공데이터포털 자체 API + 별도 ID 체계) 예상.

---

## Decision

다음 4개의 결정을 동시에 채택한다.

### D1. ArrivalProvider 인터페이스 패턴

지역별 도착 API를 `ArrivalProvider` 인터페이스로 추상화한다. 구현체 3개:
- `SeoulBusProvider` — 서울 버스 API
- `GyeonggiBusProvider` — GBIS
- `OdsayBusProvider` — ODsay realtimeStation (fallback)

각 Provider는 stateless. 환경변수 lazy 읽기, 응답을 통일된 `BusArrivalResponse` 포맷으로 변환.

### D2. BE 분기 (FE는 stopId만 전달)

`arrival-info`는 `?stopId={uuid}` 입력만 받고, BE가 DB의 `route_stops.provider` 컬럼으로 분기. FE는 provider를 모른다.

### D3. 좌표 기반 지역 판별 (bounding box)

저장 시점에 ODsay 검색 응답의 `x`/`y` 좌표로 서울/경기/unknown 분기. 단순 bounding box 1차, 다각형 매칭은 후속 ADR.

#### D3-supplement (2026-05-05) — busType 보조 신호

좌표 bounding box를 **1차 판단**으로 유지하되, 경로 저장 시점에 함께 들어오는 **ODsay route 검색 결과의 `busType` 필드를 보조 신호**로 추가한다.

**규칙:**
- `busType === 6` (경기버스) → 해당 노선은 무조건 `gyeonggi` provider로 분류
- 정류장의 stop_routes 중 `busType === 6`인 노선이 **하나라도** 있으면, 좌표가 서울 bbox 안이더라도 GBIS station 매핑을 **시도**한다
  - 매핑 성공 → `route_stops.provider = 'gyeonggi'`
  - 매핑 실패 → 좌표 기반 1차 판단(`seoul`)으로 복귀
- 정류장 단위(`route_stops.provider`)와 노선 단위(`stop_routes.provider`)는 별개로 결정 — 같은 정류장에 서울/경기 노선이 공존하면 정류장 provider는 좌표·매핑 결과로, 각 노선 provider는 `routeIdToProvider()` (odsay_route_id 첫 자리) + busType으로 결정

**근거:**
- ADR-002 Alternatives **C ("노선 패턴 기반 판단")**는 "정류장 검색 시점에 노선 정보가 없다"는 이유로 기각됐다. 그러나 경로 **저장** 시점엔 `route-search` 응답을 통해 `segments[].lines[].busType`이 이미 확보되어 있다 — 기각 사유가 해소된다.
- 좌표 단독 판단의 경계 지역 오분류(서울 외곽 ↔ 경기 인접)에서 발생하는 매핑 실패를 보완한다.
- 본 보충은 D3을 **대체하지 않고**, 좌표 판별이 `seoul`로 떨어졌을 때 **재시도 트리거**로만 사용 — 적용 범위를 보수적으로 제한한다.

**적용 범위:**
- 경로 저장(`POST /routes`) 매핑 단계에 한정. 정류장 검색(`/search-stops`) 시점은 여전히 좌표 단독 (노선 정보 없음).
- 인천·부산 등 향후 확장 시 동일 패턴 적용 가능 — busType 코드표가 광역시별 식별자를 제공하면 일반화 (`docs/reference_odsay_codes.md` 참조).

**Open Questions:**
- **OQ-D3a.** `busType === 6`인 노선이 여러 개일 때, GBIS 매핑이 실패하면 좌표 판단으로 복귀 vs `odsay_fallback` 격하 — 어느 쪽이 더 안전한가? (잠정: 좌표 판단 복귀)
- **OQ-D3b.** ODsay busType 6이 경기버스 외에 다른 광역 노선을 포함할 가능성 — `reference_odsay_codes.md` 재확인 필요.

### D4. 매핑 검증 + fallback 정책

GBIS 매핑 직후 1회 도착 호출로 운행 노선 교집합 검증(50% 임계값). 실패 시 `provider='odsay_fallback'`으로 격하해 ODsay realtimeStation 사용 + FE inline 안내.

---

## Alternatives Considered

### A. ID 변환 매핑 테이블만 두기 (ODsay arsID ↔ GBIS stationId)

- **장점:** 코드 변경 최소
- **단점:** 매핑 테이블 운영 부담 + 운행 종료/노선 변경 추적 어려움. 외부 API 응답 포맷 차이는 여전히 변환 필요. 결국 Provider 패턴과 동일 수준의 분기 코드가 라우터에 들어감.
- **기각:** 코드 중복 + 확장성 0. 인천 추가 시 라우터 if-else 더 늘어남.

### B. FE가 provider 라우팅 (FE에서 type 파라미터 결정)

- **장점:** BE 라우터 단순
- **단점:**
  - FE에 GBIS stationId 같은 내부 식별자 노출
  - provider 추가 시 FE도 변경
  - 권한 검증이 분산 (각 endpoint마다 stop 소유권 확인)
- **기각:** D2 결정 — BE 분기로 단일 진입점 + 정보 은닉 우선.

### C. 좌표 대신 노선 패턴(`busLocalBlID` 접두) 기반 지역 판별

- **장점:** 외부 데이터 불필요, 빠름
- **단점:**
  - 정류장 검색 시점엔 noteslocalBlID 정보 없음 (경로탐색 후에야 노선 알 수 있음)
  - 패턴 신뢰도 미검증 (서울 100·113·233 / 경기 200·213·234 등 가설 수준)
- **기각:** D3 — 좌표 기반이 정류장 검색 시점에 즉시 적용 가능. 노선 패턴은 보조 신호로 후속 도입 검토.

### D. ODsay realtimeStation을 1순위로 사용 (지역 무관)

- **장점:** 분기 없이 단일 코드 경로
- **단점:**
  - ODsay 분 단위만 제공, 갱신 지연 → UX 악화
  - 무료 한도 부담
  - 서울/경기 공식 API의 풍부한 메타(혼잡도, 잔여좌석, 저상)를 못 쓰게 됨
- **기각:** D1·D4 — ODsay는 fallback 전용 위치로 한정.

### E. 정확한 행정경계 다각형 매칭

- **장점:** 100% 정확
- **단점:**
  - GeoJSON 임베드 (~50KB) — Edge Function 콜드 스타트 비용
  - bounding box로도 99% 충분 (서울/경기 경계는 매우 단순)
- **연기:** D3에서 일단 bounding box, 정확도 미달 시 후속 ADR로 다각형 도입.

---

## Consequences

### 긍정

- 서울+경기 도착 정보 동등 수준 정확도 달성
- 인천·부산 추가 시 새 Provider 클래스만 추가 (Open/Closed 원칙)
- 응답 포맷 통일로 FE 분기 0
- 매핑 검증으로 잘못된 stationId 사고 0건 보장
- ODsay fallback으로 미커버 지역(강원/충청 등)도 표시 가능

### 부정 / 트레이드오프

- 저장 시 매핑 알고리즘 호출 → POST /routes 응답 시간 증가 (GBIS 검색 1~2회 + 검증 1회 = ~600ms 예상)
- GBIS 데이터셋 추가 신청 필요 (사용자 액션 의존)
- bounding box로 99%만 커버 — 경계 인접 정류장은 오분류 가능 (매핑 검증으로 자동 fallback)
- legacy 호환 코드(한 사이클 유지) 임시로 코드 복잡도 증가

### 후속 영향

- DB 마이그레이션 1건 (provider/gbis_* 컬럼 + 백필)
- BE: `_shared/gbisClient.ts`, `_shared/arrivalProvider.ts`, `_shared/regionMapper.ts` 신규
- BE: `arrival-info`, `routes` 변경 (입력/응답 추가, 분기 로직 이동)
- FE: `lib/api.ts` 단순화, 도착 카드 fallback UI 1건 추가
- 외부 API: GBIS 정류소·노선·도착 3개 엔드포인트 사용 (도착은 이미 사용 중)

---

## Open Questions (구현 단계 검증)

- **OQ1.** GBIS 정류소 검색이 좌표 기반을 직접 지원하는가? 미지원 시 이름→좌표 거리 정렬 방식의 정확도가 충분한가?
- **OQ2.** GBIS 노선 검색 응답에 정류장별 `staOrder`가 포함되는가?
- **OQ3.** 같은 정류소를 왕복 경유하는 노선의 상·하행 구분이 `routeDestName`/`turnSeq`로 가능한가?
- **OQ4.** 인천 정류소가 GBIS에 일부 포함되는가 (확장성 dry-run 케이스로 가능)?

---

## References

- `docs/specs/multi-region-bus-arrival/PRD.md`
- `docs/specs/multi-region-bus-arrival/SDD.md`
- `docs/specs/multi-region-bus-arrival/TASKS.md`
- `when_come_be/docs/external-apis/seoul-bus.md`
- `when_come_be/docs/external-apis/gyeonggi-bus.md`
- `when_come_be/docs/external-apis/odsay.md`
- `docs/decisions/ADR-001-subway-direction-model.md` (지하철 방향 — 별도 도메인)
