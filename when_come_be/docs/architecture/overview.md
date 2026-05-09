# 백엔드 서비스 구조도

> 아키텍처 변경 시 자동 업데이트됨

## 레이어 구조
Request → Edge Function → _shared (auth/error/client/provider) → Supabase DB / 외부 API (서울 버스, GBIS, ODsay, 지하철)

## 폴더 구조
```
supabase/
├── functions/
│   ├── _shared/
│   │   ├── cors.ts              ← CORS 헤더
│   │   ├── auth.ts              ← JWT 검증
│   │   ├── error.ts             ← 에러 처리
│   │   ├── odsayClient.ts       ← ODsay API 클라이언트
│   │   ├── gbisClient.ts        ← GBIS(경기 버스) API 클라이언트 (노선 조회 + DB 정류소 검색, 5분 캐시)
│   │   ├── gbisOpenApiClient.ts ← 경기도 자체 OpenAPI 클라이언트 (BusStation — 시군 페이징 다운로드)
│   │   ├── arrivalProvider.ts   ← ArrivalProvider 인터페이스 + 3 구현체 (Seoul/Gyeonggi/Odsay)
│   │   ├── regionMapper.ts      ← ODsay→GBIS 매핑 알고리즘 (detectRegion, resolveStopProvider, DB 검색 기반)
│   │   ├── anomaly.ts           ← fire-and-forget 이상 케이스 로거 (anomaly_logs INSERT)
│   │   └── middleware.ts        ← withErrorLogging — 핸들러 감싸기 (unhandled 예외 안전망)
│   ├── search-stops/            ← 정류장 검색
│   ├── arrival-info/            ← 실시간 도착정보 (Provider 패턴 분기). stopId lookup: route_stops 우선 → favorite_stops fallback
│   ├── route-search/            ← 경로탐색
│   ├── stop-routes/             ← 정류장 노선 목록 (서울 버스 API)
│   ├── routes/                  ← 사용자 경로 CRUD (PATCH 확장: active/displayOrder/name/stops)
│   ├── route-stops/             ← 정류장 별명 전용 PATCH (alias 단일 변경)  [신규 2026-05-09]
│   ├── favorite-stops/          ← 즐겨찾기 CRUD (GET/POST/PATCH/DELETE, provider 자동 매핑)  [신규 2026-05-09]
│   ├── subway-station-directions/ ← 지하철역 양방향 인접역 (ODsay subwayStationInfo 프록시)  [신규 2026-05-08]
│   └── sync-gbis-stations/      ← 경기도 정류소 DB 동기화 (cron용, service role 인증)
├── migrations/                  ← DB 스키마
└── seed.sql
docs/
├── architecture/
│   └── overview.md
├── decisions/               ← ADR
├── tech-notes/
├── ideas/
└── collab-notes.md          ← 프론트와 협업 노트
```

## 도메인
| 도메인 | Function | 설명 |
|--------|----------|------|
| stops | search-stops | 정류장/역 검색 (ODsay) |
| stop-routes | stop-routes | 정류장 노선 목록 (서울 버스 API `getRouteByStation`) |
| arrival | arrival-info | 실시간 도착정보 — Provider 패턴, 서울/경기/ODsay-fallback 분기. `?stopId={uuid}` 신 경로 + `?type=bus` legacy 호환. stopId lookup은 route_stops 우선 → favorite_stops fallback (D1, 2026-05-09~) |
| route-search | route-search | 대중교통 경로탐색 (ODsay) |
| routes | routes | 사용자 저장 경로 CRUD (PATCH 확장: active/displayOrder/name/stops 부분 수정, 2026-05-09~) |
| route-stops | route-stops | 정류장 별명 전용 PATCH (`alias` 단일 변경, RLS 부모 검증, 2026-05-09~) |
| favorites | favorite-stops | 즐겨찾기 단일 정류장 CRUD. GET/POST(provider 자동 매핑)/PATCH/DELETE. D5 노선 0개 reject. (2026-05-09~) |
| subway-directions | subway-station-directions | 지하철역 양방향 인접역. `?stationId={ODsay stationID}` → `{ stationName, lineName, subwayCode, directions[{updn, nextStop}] }`. (2026-05-08~) |
| sync | sync-gbis-stations | 경기도 전체 정류소를 `gbis_stations` 테이블에 upsert (일 1회 cron, GitHub Actions) |

## DB 테이블
| 테이블 | 설명 |
|--------|------|
| routes | 사용자 저장 출퇴근 경로. `display_order int NOT NULL DEFAULT 0` (정렬용, 2026-05-09~). `active boolean NOT NULL DEFAULT true` (활성화 토글, 2026-05-09~). |
| route_stops | 경로 내 정류장/역 (순서 있음). `provider` (seoul/gyeonggi/odsay_fallback), `gbis_station_id` 컬럼 보유. 지하철 stop은 방향 컬럼 3개 보유: `direction_headsign`, `direction_updn` (`up`/`down`), `direction_next_stop`. 모두 nullable. `alias text` 컬럼 보유 (별명, nullable, 2026-05-09~). |
| stop_routes | 정류장에서 탈 수 있는 노선 목록. `gbis_route_id`, `gbis_sta_order` 컬럼 보유 (경기 버스 provider용). `provider` 컬럼 보유 (seoul/gyeonggi/odsay_fallback) — 노선 단위 분기 기준 (2026-05-03~). `subway_code text NULL` — 서울 지하철 API lineName 형식 ("1001"~"1031"), bus row는 NULL (2026-05-09~). |
| gbis_stations | 경기도 전체 정류소 캐시 (일 1회 cron 동기화). ARS 번호, 좌표, 시군명 보유. anon select 가능, write는 service role only. |
| anomaly_logs | 운영 이상 케이스 누적 테이블. `source`(함수명), `category`(에러 분류), `detail`(JSONB 자유 컨텍스트). RLS 활성화, anon 접근 불가. service role only. |
| favorite_stops | 사용자 즐겨찾기 단일 정류장/역 (2026-05-09~). `odsay_stop_id`, `stop_name`, `stop_type`, `ars_id`, `lat/lng`, 지하철 방향 3컬럼, `provider`(NOT NULL DEFAULT 'seoul'), `gbis_station_id`, `alias`, `display_order`. RLS: user_id 기반 owner read/write. `arrival-info`에서 `route_stops` 미발견 시 fallback lookup (SDD §3.7). |
| favorite_stop_routes | 즐겨찾기 정류장의 노선 목록 (2026-05-09~). `stop_routes`와 동일 컬럼 셋 (odsay_route_id, route_name, bus_type, st_id, bus_route_id, station_ord, station_name, gbis_route_id, gbis_sta_order, provider). `subway_code text NULL` 포함 (2026-05-09~). `favorite_stops(id)` cascade delete. RLS: 부모 favorite_stops.user_id 기반. |

## ArrivalProvider 패턴 (2026-05-02~, 2026-05-03 stop_routes 단위로 확장)

도착 조회는 `ArrivalProvider` 인터페이스로 추상화.
2026-05-03~: 노선 단위 `stop_routes.provider`로 분기 — 같은 정류장에 서울/경기 버스 공존 지원.

```
GET /arrival-info?stopId={uuid}
  → DB route_stops + stop_routes(provider, odsay_route_id) 조회
  → stop_routes가 없으면 route_stops.provider로 단일 provider 호출 (legacy 호환)
  → stop_routes 있으면 provider별 그룹핑 → 병렬 fetch → items merge
      seoulRoutes    → SeoulBusProvider  (서울 버스 getStationByUid)
      gyeonggiRoutes → GyeonggiBusProvider (GBIS getBusArrivalListv2)
      odsayRoutes    → OdsayBusProvider  (ODsay realtimeStation)
  → BusArrivalResponse { items: merged, provider: dominant, fetchedAt }
  dominant 우선순위: gyeonggi > seoul > odsay_fallback
```

stop_routes.provider 저장 흐름 (POST /routes):
```
odsay_route_id 첫 자리 → routeIdToProvider()
  '1...' → 'seoul'
  '2...' → 'gyeonggi'
  그 외  → 'odsay_fallback'
```

route_stops.provider 저장 흐름 (변경 없음):
```
lat/lng 좌표 → detectRegion (bounding box)
  seoul   → provider='seoul'
  gyeonggi → GBIS 정류소 검색 → verifyGbisMapping → 'gyeonggi' 또는 'odsay_fallback'
  unknown  → 'odsay_fallback'
```

## 지하철 도착정보 역명 fallback 전략 (getSubwayArrival, 2026-05-09~)

서울 지하철 API는 역명 등록 방식이 불일치 (예: "서울역" → GTX-A만 반환, 1/4호선은 "서울"로 등록).
`getSubwayArrival(stationName, expectedSubwayCode?)` 시그니처로 대응.

```
getSubwayArrival(stationName, expectedSubwayCode?)
  1차: applySubwayNameOverride(stationName) 로 API 호출
  needsFallback 조건 (OR):
    - 1차 응답 0건
    - expectedSubwayCode 제공됐는데 1차 응답에 해당 코드 매칭 0건
  needsFallback=false → 1차 결과 그대로 반환
  needsFallback=true:
    2차: stripSubwayNameDecorations → applySubwayNameOverride → API 호출
    1차가 비어있으면 2차 결과만 반환
    1차에 결과 있으면 merge + dedupe (key: lineName|updnLine|arrmsg1|direction)
```

- `?type=subway&subwayCode=1004` 쿼리 파라미터로 FE가 전달 가능 (optional, `/^10\d{2}$/` 검증)
- `fetchArrivalByStopId` subway stop 분기: stop_routes[0].subway_code 추출 → 자동 전달
- 임시 패치 (subway_code NULL인 기존 stop은 효과 없음 → backlog #9에서 전체 정비 예정)
