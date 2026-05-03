# 프론트-백 협업 노트

> API 스펙(요청/응답 구조, 엔드포인트) 변경 시 즉시 여기에 추가.

## 규칙
- 변경일, 변경 내용, 영향받는 프론트 컴포넌트를 함께 기록
- 파괴적 변경(breaking change)은 `[BREAKING]` 태그 필수

---

## 현재 API 스펙 요약 (2026-04-21 기준)

### GET /search-stops?q={query}

정류장/역 검색. ODsay `searchStation` 프록시.

**응답:**
```json
[
  {
    "id": "87103",
    "name": "개봉역",
    "type": "bus",
    "lat": 37.4912,
    "lng": 126.8628,
    "arsId": "21003"
  }
]
```

| 필드 | 설명 |
|------|------|
| `id` | ODsay stationID (문자열) — 경로탐색, odsay 도착정보에 사용 |
| `type` | `"bus"` / `"subway"` |
| `arsId` | 정류장 고유번호 (표지판에 적힌 번호) — 서울 버스 API 조회에 사용. 지하철역은 `null` |

---

### POST /route-search

좌표 → 대중교통 경로 목록. ODsay `searchPubTransPathT` 프록시.

**요청:**
```json
{ "startX": 126.86, "startY": 37.49, "endX": 127.02, "endY": 37.49 }
```

**응답:**
```json
[
  {
    "id": "0",
    "totalMinutes": 42,
    "transferCount": 1,
    "segments": [
      {
        "type": "bus",
        "sectionMinutes": 15,
        "startName": "개봉역",
        "startOdsayId": 87103,
        "startArsId": "21003",
        "endName": "구로역",
        "endOdsayId": 88201,
        "endArsId": "21012",
        "lines": [
          {
            "routeName": "643",
            "busRouteId": "100100643",
            "busType": 12,
            "subwayCode": null
          }
        ]
      },
      {
        "type": "subway",
        "sectionMinutes": 20,
        "startName": "구로역",
        "startOdsayId": 110,
        "startArsId": null,
        "endName": "강남역",
        "endOdsayId": 225,
        "endArsId": null,
        "lines": [
          {
            "routeName": "1호선",
            "busRouteId": null,
            "busType": null,
            "subwayCode": "1001"
          }
        ]
      }
    ]
  }
]
```

| 필드 | 설명 |
|------|------|
| `startOdsayId` / `endOdsayId` | ODsay 정류장 ID — `arrival-info?type=odsay` 에 사용 |
| `startArsId` / `endArsId` | 서울 버스 arsId — `arrival-info?type=bus` 에 사용. 지하철 구간은 `null` |
| `busRouteId` | 서울 버스 API busRouteId. 지하철은 `null` |
| `busType` | ODsay 버스 노선 타입. 지하철은 `null` |
| `subwayCode` | 서울 지하철 API subwayId 형식 (`"1001"`, `"1002"` ...). 버스는 `null` |

---

### GET /arrival-info

실시간 도착정보. `type` 파라미터로 버스/지하철/odsay 구분.

**type=bus:** `GET /arrival-info?type=bus&busRouteId=100100643&arsId=21003`  
**type=subway:** `GET /arrival-info?type=subway&stationName=강남`  
**type=odsay:** `GET /arrival-info?type=odsay&stationId=87103`

---

### GET /stop-buses?arsId={arsId}

arsId로 해당 정류장에 오는 버스 노선 목록 조회.

---

### GET/POST/PUT/DELETE /routes

인증 필요 (Bearer JWT). 사용자 저장 경로 CRUD.

---

## 변경 이력

### 2026-05-02 | multi-region-bus-arrival v2 — 캐싱 패턴 도입 (설계 갱신)

GBIS API 명세 확정 후 발견 — (1) 정류소 검색 API 부재, (2) 정류소→노선 detail API 부재. 매번 매핑 시 외부 API 페이징 다운로드는 비현실적 → **경기도 정류소 자체 캐시(`gbis_stations`) + 일 1회 cron** 패턴으로 전환. 상세: `docs/specs/multi-region-bus-arrival/SDD.md`(v2), `docs/decisions/ADR-003-gbis-station-caching.md`, `docs/api/contracts/sync-gbis-stations.md`, `when_come_be/docs/external-apis/gyeonggi-bus.md`(v2).

**핵심 변경:**
1. **신규 테이블 `gbis_stations`** — 경기 OpenAPI에서 31개 시군 정류소를 일 1회 캐시. PK `station_id`, 인덱스: `ars_no`/`(lat,lng)`/`sigun_nm`.
2. **신규 Edge Function `POST /sync-gbis-stations`** — Service Role 인증, GitHub Actions cron(`0 19 * * *` UTC = 04:00 KST)이 호출. 시군별 페이징 다운로드 + upsert.
3. **신규 GitHub Actions 워크플로** `.github/workflows/sync-gbis-stations.yml` — 사용자 액션: GitHub Secrets에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등록.
4. **매핑 알고리즘 갱신** — `findGbisStation` 외부 API 호출 → `findGbisStationFromDB` 자체 DB 검색으로 교체. ARS 1차 매칭 + 좌표/이름 보조(Haversine 200m + Levenshtein 0.7).
5. **노선 매핑 알고리즘 신규** — `getBusRouteListv2(keyword=routeName)` + `getBusRouteStationListv2(routeId)` 조합으로 우회. 정류소→노선 detail API 부재 보완. 5분 캐시.
6. **`getGbisStationDetail` 폐기** — v1 SDD가 가정한 API가 GBIS에 존재하지 않음.

**API 계약 영향: 없음 (BE 내부 변경).** `arrival-info`/`routes` 외부 계약은 v1 그대로.

**환경변수 추가:** `GYEONGGI_OPENAPI_KEY` (경기도 자체 OpenAPI, 공공데이터포털 키와 별도 시스템). 기존 `GYEONGGI_BUS_API_KEY`는 도착·노선조회에 그대로 사용.

**FE 영향: 없음.** v1 Phase 3에서 적용한 stopId 기반 호출 + fallback 안내 그대로 유효.

**사용자 액션 (배포 전 필수):**
1. 공공데이터포털 데이터셋 ID `15080662` (경기도 시내버스 노선 정보) 활용 신청 (기존 `GYEONGGI_BUS_API_KEY` 동일 키)
2. **경기도 자체 OpenAPI 인증키 발급** (`https://openapi.gg.go.kr` — 별도 시스템) → `GYEONGGI_OPENAPI_KEY`로 등록
3. GitHub Secrets 등록: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
4. 첫 배포 후 `workflow_dispatch`로 수동 1회 실행 → `gbis_stations` row > 30,000 확인 후 트래픽 활성화

**구현 진행:** SDD v2 / TASKS v2(T21~T26) / ADR-003 / 신규 계약서 작성 완료. 사용자 승인 + OpenAPI 키 발급 후 BE Phase 5 착수 예정.

---

### 2026-05-02 | multi-region-bus-arrival 설계 합의 (구현 대기)
경기도 정류장(광명·시흥 등) 도착정보 미동작 이슈 해결을 위한 멀티-지역 Provider 아키텍처 도입. 상세 설계: `docs/specs/multi-region-bus-arrival/`, `docs/decisions/ADR-002-multi-region-arrival-provider.md`, `docs/api/contracts/arrival-info.md`, `docs/api/contracts/routes.md`.

핵심 결정 — (1) `ArrivalProvider` 인터페이스 + `SeoulBusProvider` / `GyeonggiBusProvider` / `OdsayBusProvider` 3 구현, (2) `arrival-info`는 `?stopId={uuid}` 입력으로 BE가 DB의 `route_stops.provider`로 분기, (3) 저장 시 ODsay 좌표(`x`/`y`) bounding box로 지역 판별 후 GBIS 정류소·노선 검색으로 매핑, (4) 매핑 직후 1회 검증(운행 노선 50% 교집합) 실패 시 `provider='odsay_fallback'`로 격하.

**API 계약 변경 (모두 additive — Breaking 없음, legacy 한 사이클 호환):**

1. **GET `/arrival-info`** — `?stopId={uuid}` 입력 추가 (인증 필수). 응답에 `provider`, `fetchedAt` 추가. 버스 items에 `remainSeatCnt`/`crowded`/`lowPlate` 옵셔널 추가 (GBIS 한정). 기존 `?type=bus&arsId&busRouteId`는 한 사이클 호환 후 제거 예고.

2. **POST `/routes`** — stops[]에 `lat`/`lng` 추가 권장 (BE 매핑 입력). `provider`/`gbisStationId` 옵셔널 (FE 힌트). stopRoutes[]에 `gbisRouteId`/`gbisStaOrder` 옵셔널.

3. **GET `/routes` 응답** — route_stops[]에 `provider`(필수), `gbis_station_id`(옵셔널). stop_routes[]에 `gbis_route_id`/`gbis_sta_order` 옵셔널.

**DB 마이그레이션:** `route_stops`에 `provider text CHECK`, `gbis_station_id text` 추가. `stop_routes`에 `gbis_route_id text`, `gbis_sta_order int` 추가. 기존 row는 `provider='seoul'`로 일괄 백필. 마이그레이션 파일(예정): `20260502000000_add_provider_to_route_stops.sql`.

**FE 영향:** `lib/api.ts`에 `fetchArrivalByStopId(stopId)` 추가, 기존 호출은 한 사이클 유지. 도착 카드에 `provider==='odsay_fallback'` 시 inline 안내 1행 추가. 그 외 UI 변경 없음.

**사용자 액션 (배포 전 필수):** 공공데이터포털에서 `경기도_시내버스 정류소 정보조회`, `경기도_시내버스 노선 정보조회` 데이터셋 활용 신청·승인 (인증키는 기존 `GYEONGGI_BUS_API_KEY` 동일 키 사용 가능).

**구현 진행:** PRD/SDD/TASKS 작성 완료 (2026-05-02). 사용자 승인 + 데이터셋 승인 후 BE Phase 1 착수 예정.

---

### 2026-04-28 | route-direction 설계 합의 → 구현 완료
지하철 양방향 도착 정보 분리를 위한 방향 모델 추가. 상세: `docs/api/contracts/route-direction-design.md`, `docs/decisions/ADR-001-subway-direction-model.md`.

**구현 상태(2026-04-28):** Phase 1·2·3·4 완료. 마이그레이션 적용됨, BE deno test 통과, FE 빌드 OK. 수동 QA(7호선 분기, 2호선 외선, 광역철도 fallback)는 `when_come_be/docs/tech-notes/route-direction-open-questions.md`에서 별도 진행.

**Breaking change 없음 확인:** 모든 신규 필드 옵셔널. 구 클라이언트는 신규 응답 필드를 무시하고, 신규 클라이언트는 구 응답에서 신규 필드를 `undefined`로 받아 fallback 동작. 기존 저장 row(방향 NULL)는 호선 일치 전체로 fallback + inline 안내 노출 — 도착 카드 비어버리지 않음.

**변경 요약 (모두 additive — Breaking 없음):**

1. **POST `/route-search` 응답** — `segments[]`에 옵셔널 필드 추가
   - `way: string | null` — ODsay `subPath.way` (지하철 종점역명, 미제공 가능)
   - `wayCode: 1 | 2 | null` — ODsay `subPath.wayCode` (1=상행/내선, 2=하행/외선)
   - 버스 segment에서는 항상 null

2. **POST `/routes` 요청** — `stops[]` 항목에 옵셔널 필드 추가
   - `directionHeadsign?: string | null` — 예: `"장암행"`
   - `directionUpdn?: 'up' | 'down' | null`
   - `directionNextStop?: string | null` — ODsay `endName` (디버그/감사용)
   - subway stop에만 의미. 버스 stop은 미전송.

3. **GET `/routes` 응답** — `route_stops[]`에 옵셔널 필드 추가
   - `direction_headsign?: string | null`
   - `direction_updn?: 'up' | 'down' | null`
   - `direction_next_stop?: string | null`

4. **GET `/arrival-info?type=subway`** — **변경 없음.** 응답을 그대로 두고 FE에서 매칭/필터링.

**FE 매칭 규칙 (참고):**
- `subwayId === lineName` 1차 필터
- `direction_updn` 있으면 `updnLine` 정규화 비교 (`상행/내선→up`, `하행/외선→down`)
- `direction_headsign` 있으면 `trainLineNm.startsWith(headsign)` 비교
- 매칭 0건이면 호선만 일치하는 전체로 fallback (legacy 데이터 호환)

**DB 마이그레이션:** `route_stops` 신규 3컬럼, 모두 nullable. 기존 row 영향 없음. 마이그레이션: `20260428000000_add_direction_to_route_stops.sql` (적용 완료).

**기존 사용자 데이터:** 방향 NULL → fallback 동작. 정확한 표시를 위해 재등록 권장 안내(선택).

**구현 후 응답 예시 (지하철 segment, route-search):**
```json
{
  "type": "subway",
  "startName": "석남(거북시장)",
  "endName": "산곡",
  "way": "장암",
  "wayCode": 2,
  "lines": [{ "routeName": "수도권 7호선", "subwayCode": "1007", "busRouteId": null, "busType": null }]
}
```

**구현 후 응답 예시 (GET /routes의 route_stops 항목, 지하철):**
```json
{
  "id": "...",
  "stop_name": "석남(거북시장)",
  "stop_type": "subway",
  "sequence": 0,
  "ars_id": null,
  "direction_headsign": "장암행",
  "direction_updn": "down",
  "direction_next_stop": "산곡",
  "stop_routes": []
}
```

> 위 예시는 실측 검증 전이며, 실제 ODsay 응답에서 `way`/`wayCode` 누락이 발견되면 OQ1~OQ3 결과(`when_come_be/docs/tech-notes/route-direction-open-questions.md`)에 따라 보강.

---

### 2026-04-21 | POST /route-search | `subwayCode` 타입 변경 [BREAKING]
`segments[].lines[].subwayCode`: `number | null` → `string | null`
- 변경 전: `2` (ODsay 형식)
- 변경 후: `"1002"` (서울 지하철 API subwayId 형식)

### 2026-04-21 | POST /route-search | arsId 필드 추가
`segments[]`에 `startArsId`, `endArsId`, `startOdsayId`, `endOdsayId` 추가.

### 2026-04-21 | GET /stop-buses | 신규 엔드포인트
arsId로 정류장 노선 목록 조회.

### 2026-04-21 | GET /arrival-info?type=bus | arsId 방식 추가, stationName 제거 [BREAKING]
- 제거: `busRouteId + stationName` 방식
- 추가: `busRouteId + arsId` 방식

### 2026-04-19 | POST /route-search | `busType` 필드 추가
`segments[].lines[]`에 `busType: number | null` 추가.
