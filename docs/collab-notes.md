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

### 2026-05-05 | 에러 응답 구조화 + ADR-002 D3-supplement (설계 합의, 구현 대기)

`{ error: string }` 단일 문자열 응답으로는 FE가 에러 종류를 구분할 수 없어 사용자 안내 분기 불가. 특히 `odsay_fallback` provider가 (1) 진짜 미지원 지역, (2) GBIS 매핑 실패, (3) 매핑 검증 실패를 동일하게 표현해 "왜 안 되는지/뭘 해야 하는지" 안내 불가능. 본 변경으로 에러 응답을 구조화하고 `arrival-info` 도메인 코드 5종을 정의. 상세: `docs/api/contracts/error-codes.md`, `docs/decisions/ADR-002-multi-region-arrival-provider.md` (D3-supplement).

**1. 응답 스키마 변경 (BE) [BREAKING — 호환 사이클 별도 합의]:**

```
{ "error": "메시지" }                                    ← 기존
{ "error": { "code": "...", "message": "...", "detail"? } }  ← 신
```

- `error.code` — 머신 판독용 안정 contract (예: `ARRIVAL_MAPPING_FAILED`)
- `error.message` — 한국어 사용자 노출용 (BE가 책임 — FE 별도 i18n 매핑 불필요)
- `error.detail` — 디버그 옵셔널 (외부 API status, 매핑 실패 사유 등)

> 호환 전략: 한 사이클 동안 string + object 동시 직렬화 권장 (`{ error: "...", errorCode: "...", errorDetail: "..." }`). 다음 사이클에 object 단일화. 결정은 별도 합의에서 확정.

**2. 신설 에러 코드 (arrival-info 도메인):**

| 코드 | HTTP | 의미 | 재시도 | 사용자 액션 |
|------|------|-----|------|-----------|
| `ARRIVAL_UNSUPPORTED_REGION` | 422 | 서울·경기 외 지역 (강원/충청 등) | 불가 | 없음 (지원 확장 대기) |
| `ARRIVAL_MAPPING_FAILED` | 422 | 경기 정류장 GBIS station 매핑 실패 | 불가 | 경로 재등록 |
| `ARRIVAL_VERIFY_FAILED` | 422 | GBIS 매핑 운행 노선 교집합 50% 미달 | 불가 | 경로 재등록 |
| `ARRIVAL_PROVIDER_ERROR` | 502 | 외부 API 호출 실패 (서울/GBIS/ODsay) | 가능 (지수 백오프) | 재시도 |
| `ARRIVAL_STOP_NOT_FOUND` | 404 | stopId DB 없음 / RLS 위반 | 불가 | 새로고침 |

**3. `odsay_fallback`의 의미 분리 (중요):**

이전까지 `provider === 'odsay_fallback'`은 위 3개 422 에러 케이스를 모두 묶어 표현. 본 변경 후 FE는 다음과 같이 분기한다.

- **정상 응답 + `provider: 'odsay_fallback'` (200)** — 매핑은 실패했지만 ODsay realtimeStation으로 부분 응답 가능. 기존 inline 안내 유지: "도착 정보가 부정확할 수 있어요 (제휴 데이터 사용)"
- **422 `ARRIVAL_UNSUPPORTED_REGION`** — 도착 카드 자리에 "이 지역은 실시간 도착 정보를 지원하지 않아요". 새로고침 비활성화
- **422 `ARRIVAL_MAPPING_FAILED` / `ARRIVAL_VERIFY_FAILED`** — "도착 정보를 가져올 수 없어요. 경로를 다시 등록하면 더 정확해져요" + "재등록" 액션 권장

> 한 줄 요약: **`odsay_fallback`은 더 이상 단일 상태가 아님.** 200으로 부분 응답이 가능한 케이스에만 provider 라벨로 사용하고, 응답 자체를 만들 수 없는 실패는 422 에러 코드로 명시 분리.

**4. ADR-002 D3-supplement — busType 보조 신호 (BE):**

좌표 bounding box 1차 판단 유지 + ODsay route의 `busType === 6` (경기버스) 노선이 정류장에 하나라도 있으면 GBIS 매핑 시도. 좌표가 서울 bbox 안인 경계 지역 오분류 보완. ADR-002 Alternatives C ("노선 패턴 기반 판단")는 "정류장 검색 시점에 노선 정보 없음"으로 기각됐으나, 경로 **저장** 시점엔 route-search 응답으로 busType이 확보됨 — 기각 사유 해소.

**FE 영향:**
- `lib/api.ts` fetch 헬퍼에 응답 normalize 추가 — `body.error.code` 추출 → `ApiError(code, message)` throw
- `arrival-info` 호출 컴포넌트(`Home.tsx` 도착 카드)에서 코드별 분기 UI 추가
- 알려지지 않은 코드는 `error.message`를 그대로 일반 토스트 노출 (forward-compat)

**BE 영향:**
- `_shared/error.ts`에 `errorResponse(code, message, status, detail?)` 헬퍼 추가
- `arrival-info`의 매핑/검증/외부 API 호출 분기마다 적절한 코드 반환
- `routes` POST 매핑 단계에 D3-supplement 로직 추가 (busType 6 → GBIS 매핑 시도)

**API 계약 영향:** 모든 엔드포인트의 에러 응답 구조 변경 (BREAKING). 정상 응답 스키마는 영향 없음.

**구현 진행:** 계약서·ADR 작성 완료 (2026-05-05). 호환 사이클 정책 합의 + 사용자 승인 후 BE/FE 동시 구현 예정.

---

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

---

2026-05-06 — 지하철 도착 API 다단계 fallback 도입. FE는 stop.name 그대로 전달, BE가 OVERRIDES → strip → OVERRIDES 순서로 시도. 0건일 때 "도착 정보 없음" 표시 (FE 측 변경 별도).

## 2026-05-08 — 지하철 도착 응답 `displayMsg` 필드 추가

### [ADD] `arrival-info` 지하철 응답 item에 `displayMsg: string | null`

서울 지하철 통합 API의 `arvlCd`(도착 코드)를 BE에서 짧은 한국어 라벨로 매핑해 동봉.

매핑:
- 0(당역진입) → `"진입중"`
- 1(당역도착) → `"도착"`
- 2(출발) → `"출발"`
- 3(전역출발) → `"전역 출발"`
- 4(전역진입) → `"전역 진입"`
- 5(전역도착) → `"전역 도착"`
- 99(운행중) / 누락 / 알 수 없는 값 → `null`

FE 동작:
- `displayMsg ?? arrmsg1` 패턴으로 우선 사용 — null이면 기존 카운트다운 표시 유지
- `getArrivalMin` subway 분기에서 `displayMsg != null`이면 0분으로 간주해 isUrgent 빨간색 강조 동작
- BE 미배포 환경 호환을 위해 FE 타입은 `displayMsg?: string | null` (옵셔널). 양쪽 배포 완료 후 별도 커밋으로 옵셔널 제거 예정

영향: 지하철 카드 폭 깨짐(긴 메시지로 호선 뱃지 잘림) 해소.

---

## 2026-05-08 — 도착정보 노선 매칭 규약 명시 (FE 버그 수정)

### [CONTRACT] `GET /arrival-info?stopId=` 응답 items 순서 보장 안 함

기존부터 BE `arrival-info`는 provider별 `Promise.all` 병렬 fetch 결과를 단순 concat하므로 응답 `items` 순서는 **provider 응답 도착 순서**이며 `stop_routes` 순서와 무관. 또한 외부 API(서울 버스 `getStationByUid` 등)는 정류장의 모든 노선을 반환하므로 사용자 미저장 노선이 섞일 수 있음.

**FE는 인덱스 기반 매칭을 사용하면 안 됨.** 노선번호로 매칭:
- `bus_by_stopid`: `item.busRouteAbrv === line` (또는 `"번"` suffix 정규화)
- `bus` (legacy): `item.routeName === line`
- `odsay`: `item.routeName === line`

같은 `busRouteAbrv`가 중복으로 올 수 있음(서울/경기 동일 번호 노선 등). FE는 `traTime1` 최솟값을 채택.

영향 파일: `when_come_fe/src/lib/arrival.ts`. 자세한 분석은 `when_come_fe/docs/tech-notes/arrival-route-matching.md`.

---

## 2026-05-06 — 군자역 지하철 API 매핑 + 빈 경로 저장 차단

### [FIX] arrival-info: 군자역 별칭 매핑 (BE 내부 변경)

서울 지하철 실시간 도착 API는 군자역을 `"군자(능동)"`으로만 색인. ODsay는 `"군자"`로 반환하므로 BE `normalizeSubwayStationName`에 OVERRIDES 매핑 추가.
- `"군자"` → `"군자(능동)"` (5호선/7호선)
- `"군자역"`, `"군자(능동)"` 입력도 모두 `"군자(능동)"`으로 정규화
- FE 변경 없음. 도착 API 응답 스키마 변경 없음.
- 향후 동일 패턴 역 발견 시 `SUBWAY_NAME_OVERRIDES` 맵에 추가.

### [FIX] routes POST: stops 없으면 400 (기존 동작 확인)

`stops`가 없거나 빈 배열이면 `400 "정류장이 최소 1개 이상 필요합니다"`. 기존 코드에 이미 구현되어 있었음. FE 변경 없음.

---

## 2026-05-03 — step_group · 홈 타임라인 전면 개편

### [NEW] route_stops.step_group

`routes` POST body에 `stepGroup: number` 필드 추가됨.
- 1-based 정수, 같은 논리 스텝의 대안 정류장을 묶는 키
- (route_id, step_group, sequence) unique constraint
- 한 그룹 최대 2개, 같은 stopType 강제
- `GET /routes` 응답 `route_stops[].step_group` 포함

### [NEW] stop-buses startStation / endStation

`GET /stop-buses?arsId=` 응답에 `startStation`, `endStation` 필드 추가.
영향: SetupRoute 버스 드롭다운에 종점 표시.

### [CHANGE] 홈 타임라인 도착 조회 범위 확장

- 기존: 현재 스텝만 `useQueries`
- 변경: `nonPastSegments` (현재+이후 전체) 동시 조회
- 다음 스텝 카드: 최소 도착 시간 표시 + accordion 상세
- 영향 컴포넌트: `Home.tsx`
