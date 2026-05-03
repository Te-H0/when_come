# PRD — 멀티-지역 버스 도착 Provider (multi-region-bus-arrival)

- **상태:** 초안 (2026-05-02) — 검토 대기
- **작성일:** 2026-05-02
- **작성자:** architect
- **관련:** `SDD.md`, `TASKS.md`, `docs/api/contracts/arrival-info.md`, `docs/api/contracts/routes.md`, `docs/decisions/ADR-002-multi-region-arrival-provider.md` (예정)

---

## 1. 문제 정의

현재 when_come의 실시간 버스 도착 정보는 **서울 정류장만** 정상 동작한다.

### 1.1 재현 사례 — "1111 경로 (광명사거리역)" 도착정보 미동작

- 사용자가 `광명사거리역` 정류장을 ODsay 검색으로 찾아 경로에 추가
- 저장된 `arsId` = `85019` (ODsay `arsID` 그대로 캐시)
- `arrival-info?type=bus&busRouteId=...&arsId=85019` 호출 → 서울 버스 API `getStationByUid`에 `arsId=85019` 전달 → 빈 배열 반환 (서울 데이터에 없음)
- 동일 `arsId=85019`를 GBIS `getBusArrivalListv2`에 그대로 전달 → `resultCode: 4` (결과 없음). **GBIS는 별도 `stationId`(예: `200000177`) 체계**.

### 1.2 서울이 우연히 동작했던 이유

ODsay 검색 응답의 `arsID`(서울권 5자리)는 **서울 버스 API `arsId`와 동일 체계**다. 그래서 ID 변환 없이 통과해 왔다. 서울 외 지역은 우연히 잘 들어맞을 ID 체계가 없어 실패한다.

### 1.3 영향 범위

- 광명·시흥·부천·안양·성남·수원 등 **경기도 31개 시군의 모든 버스 정류장**에서 도착정보 미동작
- 사용자가 경로 등록은 가능하나 (ODsay route-search는 전국 커버), Home 대시보드의 도착 카드에서는 빈 응답 / "정보없음"만 표시됨
- 서비스 핵심 가치(빠른 통근 의사결정) 훼손

### 1.4 근본 원인

| 단계 | 데이터 출처 | 식별자 | 커버리지 |
|------|-------------|--------|----------|
| 정류장 검색 | ODsay `searchStation` | `stationID`, `arsID` | 전국 |
| 경로탐색 | ODsay `searchPubTransPathT` | 동일 | 전국 |
| 도착 조회 (현행) | 서울 버스 API `getStationByUid` | `arsId` (서울) | **서울만** |
| 도착 조회 (필요) | GBIS `getBusArrivalListv2` | `stationId`, `routeId`, `staOrder` | 경기도 |

→ 검색·경로탐색 레이어는 통합돼 있으나 **도착 조회 레이어는 지역별 API가 분리**돼 있어, 단일 API 호출로 전국 커버 불가능.

---

## 2. 목표 / 비목표

### 2.1 목표

- **G1.** 서울 + 경기 정류장의 도착 정보가 동등 수준 정확도로 표시된다 (분 단위, 도착 임박 상태, 노선번호).
- **G2.** 인천·부산·대구 등 추후 광역시 추가 시 **새 Provider 클래스만 추가**하면 동작하도록 한다 (Open/Closed).
- **G3.** 기존 서울 사용자 데이터를 깨지 않고 마이그레이션한다 (legacy row → `provider='seoul'` 자동 분류).
- **G4.** 잘못된 정류장 매핑(엉뚱한 stationId)으로 사용자가 옆 정류장 도착 정보를 보는 사고를 방지한다.

### 2.2 비목표

- **N1.** 인천·부산·대구 등 다른 광역시 실제 연동은 **이번 범위 밖**. 단, 확장성 인터페이스만 확보.
- **N2.** ODsay realtimeStation을 적극 사용하지 않는다 (이미 구현돼 있으나, 신뢰도가 서울/경기 공식 API보다 낮아 **fallback** 위치만 부여).
- **N3.** 마을버스 / 광역버스 등 노선 유형별 특수 표시 로직은 본 PRD 범위 밖. 응답에 `routeTypeCd`만 보존해 후속 PRD에서 활용.
- **N4.** GBIS의 좌석 잔여(`remainSeatCnt`), 혼잡도(`crowded`), 저상버스(`lowPlate`) 표시는 옵셔널 필드로 응답에는 포함하되, FE UI 적용은 후속 작업.

---

## 3. 사용자 시나리오

### 3.1 저장 시나리오 — 광명사거리역 11번 버스

> 사용자 B는 광명사거리역에서 11번 버스를 타고 출근한다.

1. SetupRoute에서 "광명사거리역" 검색 → ODsay `searchStation`이 `stationID=87103, arsID=85019` 반환
2. 경로에 추가 → ODsay `searchPubTransPathT`로 경로 옵션 표시
3. 사용자가 경로 저장
4. **(신규) BE는 좌표·이름으로 GBIS 정류소 검색** → `stationId=200000177` 매핑
5. **(신규) BE는 11번 노선에 대해 GBIS 노선 검색** → `routeId=234000016, staOrder=12` 매핑
6. **(신규) `route_stops` insert 시 `provider='gyeonggi'`, `gbis_station_id`, `gbis_route_id`, `gbis_sta_order` 채움**
7. 매핑 검증: 직후 GBIS 도착 1회 호출 → 응답 노선 목록에 11번이 있는지 확인. 없으면 `provider='odsay_fallback'`으로 격하

### 3.2 조회 시나리오 — Home 도착 카드

1. Home에서 11번 버스 카드 새로고침
2. FE는 `arrival-info?stopId={uuid}` 호출 (provider는 BE가 DB에서 조회 — 자세한 이유 SDD §4)
3. BE는 `route_stops.provider`를 보고 분기:
   - `seoul` → 기존 서울 버스 API 호출
   - `gyeonggi` → GBIS `getBusArrivalListv2(stationId)` 호출 후 `routeId` 필터링
   - `odsay_fallback` → ODsay realtimeStation
4. 응답 포맷은 기존 `BusArrivalResponse` 유지 — FE는 분기 모름

### 3.3 Legacy 시나리오 — 기존 서울 사용자

1. 마이그레이션 시 기존 row의 `provider`를 `'seoul'`로 일괄 백필 (ars_id 패턴 == 5자리 숫자)
2. 동작 변화 없음. 사용자는 마이그레이션을 인지 못함.

### 3.4 매핑 실패 시나리오 — 매핑 불가능한 정류장

1. ODsay 검색 결과의 좌표가 GBIS에서 찾을 수 있는 정류소와 매칭 안 됨 (거리 임계값 초과 / 동명 없음)
2. BE는 `provider='odsay_fallback'`로 저장
3. FE 도착 카드는 정상 표시되나, ODsay 응답 한계(분 단위만, 갱신 지연)를 사용자에게 inline 안내 ("도착 정보가 부정확할 수 있어요")

---

## 4. 가정

- **A1.** 사용자가 공공데이터포털에서 다음 두 데이터셋을 추가 신청·승인 받았다:
  - `경기도_시내버스 정류소 정보조회` (GBIS 정류소 검색)
  - `경기도_시내버스 노선 정보조회` (GBIS 노선 검색)
  - 인증키는 기존 `GYEONGGI_BUS_API_KEY`와 **동일 키** 사용 가능 (공공데이터포털은 키 단위가 아니라 데이터셋 단위로 승인 관리).
- **A2.** ODsay 검색 응답의 `x`/`y` (경위도)가 실제 정류장 위치와 충분히 일치한다 (10m 이내 오차 허용).
- **A3.** GBIS 정류소 정보조회는 좌표 또는 정류소명으로 검색을 지원한다 (실제 명세는 SDD §3.2에서 검증).
- **A4.** GBIS 노선 정보조회는 노선번호(`routeName`)로 노선 목록을 검색하고, 응답에서 `staOrder`(정류장 순번)을 노선 정보의 `busStationList` 안에서 추출 가능하다 (실제 명세는 SDD §3.3에서 검증).
- **A5.** 공공데이터포털 GBIS 무료 한도(개발계정 1,000건/일)가 운영 초기 사용량을 커버한다. 도착 1회 = 1 quota 가정.
- **A6.** ODsay → GBIS 매핑은 **저장 시점 1회**만 수행. 사용자당 도착 조회마다 매핑하지 않는다 (할당량 보호).

---

## 5. 사용자 가치

| Before | After |
|--------|-------|
| 광명·시흥 정류장 도착 정보 빈 응답 | 정확한 도착 분/초 노출 |
| 매번 본인이 카카오맵·네이버지도 별도 확인 | 앱 한 화면에서 완결 |
| 서울 외 사용자 = 사실상 미사용자 | 수도권 전역 정상 동작 |
| 도착 데이터 출처 단일 의존 (서울 API) | 지역별 분기 + ODsay fallback으로 가용성 ↑ |

---

## 6. 성공 지표

정량 측정이 어려운 사용자 규모지만 **품질 게이트**로 정의:

1. **응답 가용성:** 광명·시흥 임의 5개 정류장 등록 → 도착정보 99% 응답 (5회 호출 × 5정류장 = 25회 중 24회 이상 비어있지 않음).
2. **매핑 정확도:** 매핑 검증 단계(저장 직후 1회 호출)에서 운행 노선 교집합 검증 통과율 100%. 통과 못한 row는 자동 `odsay_fallback`으로 격하 → **잘못된 stationId로 옆 정류장 정보 보여주는 사고 0건**.
3. **Legacy 호환:** 기존 서울 저장 경로 100% 정상 동작 (마이그레이션 후 기존 사용자 도착 카드 깨짐 0건).
4. **확장성 검증:** 인천 광역버스 1개 정류장에 대해 `IncheonBusProvider`(목업 구현) 추가 시 기존 코드 수정 없이 동작하는지 dry-run 테스트 통과.
5. **Edge Function 응답 시간:** 경기 도착 조회 p50 < 800ms, p95 < 1500ms (GBIS API + DB 조회 포함).

---

## 7. 영향 범위

### 7.1 BE

| 영역 | 변경 |
|------|------|
| `_shared/gbisClient.ts` | 신규 — 정류소 검색 / 노선 검색 / 도착 조회 |
| `_shared/arrivalProvider.ts` | 신규 — `ArrivalProvider` 인터페이스 + 3 구현 |
| `arrival-info/index.ts` | provider 라우팅 분기 (stopId 기반 DB 조회) |
| `routes/index.ts` | POST 시 매핑 알고리즘 호출 + 검증 + 결과 저장 |
| 마이그레이션 | `route_stops`에 컬럼 4개 추가, legacy 백필 |
| 테스트 | gbis-client, arrival-provider, arrival-info 라우팅, routes 매핑 |

### 7.2 FE

| 영역 | 변경 |
|------|------|
| `lib/api.ts` | `arrival-info` 호출 시 `stopId` 사용 (provider/arsId/busRouteId 분기 제거 가능) |
| `lib/arrival.ts` | 호출 인자 단순화. `provider==='odsay_fallback'`일 때 안내 메시지 표시 |
| 도착 카드 | fallback 안내 inline UI 추가 |
| Home 새로고침 | 변경 없음 (응답 포맷 호환) |

### 7.3 DB

- `route_stops`에 4개 컬럼 추가: `provider`(text, NOT NULL DEFAULT 추정), `gbis_station_id`(text), `gbis_route_id`(text), `gbis_sta_order`(int)
- `stop_routes`에 GBIS 매핑 컬럼 검토 (SDD §3.5에서 결정)

### 7.4 외부 API

- 신규: GBIS 정류소 검색, 노선 검색, 도착 조회 (이미 명세 작성됨)
- 변경 없음: ODsay 전 엔드포인트, 서울 버스 API (다만 호출 분기 위치 이동)

### 7.5 환경변수

- `GYEONGGI_BUS_API_KEY` — 이미 있음, 데이터셋 추가 승인만 필요 (사용자 액션)

---

## 8. 리스크 / Open Questions

| 리스크 | 영향 | 완화 |
|--------|------|------|
| GBIS 정류소 좌표 검색이 좌표 기반 미지원이면 이름 매칭으로만 진행해야 함 | 중복 정류소명에서 잘못 매핑 위험 | 좌표 거리 기준 fallback 알고리즘 도입 + 매핑 검증 단계로 잘못된 매칭 격하 |
| ODsay 검색 응답 좌표와 실제 GBIS 좌표 오차가 큰 경우 | 매핑 정확도 저하 | 임계값 100m 1차, 실패 시 임계값 300m 재시도 |
| GBIS 노선 정보조회에서 `staOrder`를 직접 안 주는 경우 | 단일 도착 조회(`getBusArrivalItemv2`) 불가 | `getBusArrivalListv2`(정류소 단위)만 사용해 routeId로 client filter |
| 같은 정류소를 왕복하는 노선의 상·하행 구분 | 상행 사용자에게 하행 정보 표시 | 매핑 시 ODsay subPath의 다음역(`endName`) 좌표와 GBIS 응답의 `routeDestName`/`turnSeq` 비교 — Phase 2 검증 |
| 공공데이터포털 일일 한도(1,000건) 소진 | 서비스 중단 | 매핑은 저장 1회, 도착은 사용자 액션 시만. 캐시 60초 도입 검토 |
| GBIS 도착 응답에 노선이 없을 때 (운행 종료 시간) | 빈 카드로 보임 | `flag: STOP/WAIT` 케이스에 "운행종료" 텍스트 표시 (서울과 동일 UX) |

### Open Questions (구현 시 검증 필요)

- **OQ1.** GBIS 정류소 검색이 좌표 검색을 지원하는가? 미지원이면 이름 검색만으로 매핑 정확도 충분한가?
- **OQ2.** GBIS 노선 검색 응답에 정류장별 `staOrder`가 포함되는가?
- **OQ3.** ODsay subPath의 `busLocalBlID` 접두 패턴(서울 100·서울 113 등)으로 지역 추정이 가능한가? 좌표 기반보다 빠른 분기가 가능한가?
- **OQ4.** 인천 정류소의 GBIS 응답 포함 여부 — 확장성 검증용 dry-run 케이스로 사용 가능한가?

---

## 9. 마일스톤

- **M0 (검토):** PRD/SDD/TASKS 승인 ← **현 단계**
- **M1 (BE 토대):** 마이그레이션 + GBIS 클라이언트 + Provider 인터페이스 + 테스트
- **M2 (BE 통합):** arrival-info 라우팅 변경 + routes 매핑 알고리즘 + 매핑 검증
- **M3 (FE 적응):** API 호출 단순화 + fallback 안내 UI
- **M4 (QA):** 광명·시흥 5개 정류장 + 서울 5개 정류장 회귀 + 인천 1개 dry-run
- **M5 (롤아웃):** 데이터셋 승인 확인 후 배포. 기존 사용자 안내 토스트 1회 (선택)

각 마일스톤은 `TASKS.md`에서 체크리스트로 분해.

---

## 10. 사용자 액션 (배포 전 필수)

다음은 사용자(서비스 운영자)가 직접 처리해야 함:

- [ ] **공공데이터포털에서 `경기도_시내버스 정류소 정보조회` 데이터셋 활용 신청** (자동승인 또는 수일 내 승인)
- [ ] **공공데이터포털에서 `경기도_시내버스 노선 정보조회` 데이터셋 활용 신청**
- [ ] 두 데이터셋 모두 기존 `GYEONGGI_BUS_API_KEY`와 동일 키로 신청 (별도 키 발급 시 환경변수 추가 필요 — `.env`/`secrets.local.md` 갱신)
- [ ] 승인 확인 후 `when_come_be/docs/external-apis/gyeonggi-bus.md`에 정류소·노선 검색 엔드포인트 명세 추가 (BE 작업자가 응답 1회 캡처해 보강)

승인 전엔 M1까지만 진행 가능 (Provider 인터페이스 + 서울 분기). M2의 매핑 알고리즘은 GBIS 검색 API 명세가 확정된 후 착수.
