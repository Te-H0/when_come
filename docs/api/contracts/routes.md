# API 계약 — `/routes` (사용자 경로 CRUD)

- **상태:** 변경 예정 (multi-region-bus-arrival 적용 시)
- **작성일:** 2026-05-02
- **관련:** `docs/specs/multi-region-bus-arrival/SDD.md`, `docs/api/contracts/route-direction-design.md`, `docs/collab-notes.md`

---

## 0. 변경 요약 (2026-05-02)

`POST /routes` 입력 DTO에 **provider 매핑을 위한 좌표(`lat`/`lng`) 필수 추가**, 그리고 BE 자동 매핑 결과를 `GET /routes` 응답에 노출. `provider`/`gbis_*` 필드는 BE가 매핑 알고리즘으로 채움 — FE는 좌표만 보내면 됨.

| 변경 | 종류 | Breaking? |
|------|------|-----------|
| 입력 `lat`/`lng` 필수화 | 수정 | **Yes (BREAKING)** — FE가 좌표 누락 시 'seoul' 가정 fallback 처리하면 비파괴적 호환 |
| 입력 `provider`/`gbisStationId` 옵셔널 | 추가 | No |
| 입력 `stopRoutes[].gbisRouteId`/`gbisStaOrder` 옵셔널 | 추가 | No |
| 응답 `route_stops[].provider` 노출 | 추가 | No |
| 응답 `route_stops[].gbis_station_id` 노출 | 추가 | No |
| 응답 `stop_routes[].gbis_route_id`/`gbis_sta_order` 노출 | 추가 | No |

> **호환 전략:** 입력 `lat`/`lng` 누락 시 BE는 `provider='seoul'`로 가정 (한 사이클 호환). 한 사이클 후 누락 시 400으로 강화.

---

## 1. POST /routes — 경로 저장

### 1.1 인증

Bearer JWT 필수.

### 1.2 입력 DTO

```ts
interface CreateRouteRequest {
  name: string
  stops: RouteStopInput[]
}

interface RouteStopInput {
  // 기존
  odsayStopId: string                // ODsay stationID
  stopName: string
  stopType: 'bus' | 'subway'
  sequence: number                   // 0-based 정수
  arsId?: string                     // 서울 5자리 (subway/경기는 미전송 가능)

  // 기존 — route-direction (지하철 only)
  directionHeadsign?: string | null
  directionUpdn?: 'up' | 'down' | null
  directionNextStop?: string | null

  // 신규 — multi-region (필수 권장)
  lat?: number                       // ODsay y (위도)
  lng?: number                       // ODsay x (경도)

  // 신규 — provider 힌트 (FE가 알면 보내도 됨, 없으면 BE가 매핑)
  provider?: 'seoul' | 'gyeonggi' | 'odsay_fallback' | null
  gbisStationId?: string | null

  stopRoutes: StopRouteInput[]
}

interface StopRouteInput {
  // 기존
  odsayRouteId: string
  routeName: string                  // "11", "643", "1호선"
  busType: number | null
  // 서울 버스 매핑 (기존)
  stId?: string | null
  busRouteId?: string | null
  stationOrd?: number | null
  stationName?: string | null

  // 신규 — 경기 버스 매핑
  gbisRouteId?: string | null
  gbisStaOrder?: number | null
}
```

### 1.3 BE 처리 흐름 (요약)

1. 각 stop에 대해 `lat`/`lng`로 `detectRegion()` 호출
2. `region === 'gyeonggi'`이면 `findGbisStation` → `mapGbisRoutes` → `verifyGbisMapping`
3. 결과에 따라 `provider`/`gbis_station_id` 결정
4. stop_routes에 `gbis_route_id`/`gbis_sta_order` 채움
5. DB insert

### 1.4 응답 — 201 Created

```ts
interface ApiRoute {
  id: string                         // uuid
  user_id: string
  name: string
  created_at: string
  updated_at: string
  route_stops: ApiRouteStop[]
}
```

(상세 `ApiRouteStop`은 §2.2 참고)

### 1.5 입력 예시

```json
{
  "name": "출근",
  "stops": [
    {
      "odsayStopId": "87103",
      "stopName": "광명사거리역",
      "stopType": "bus",
      "sequence": 0,
      "arsId": "85019",
      "lat": 37.4807,
      "lng": 126.8615,
      "stopRoutes": [
        { "odsayRouteId": "...", "routeName": "11", "busType": 13 }
      ]
    },
    {
      "odsayStopId": "217001144",
      "stopName": "석남(거북시장)",
      "stopType": "subway",
      "sequence": 1,
      "directionHeadsign": "장암행",
      "directionUpdn": "down",
      "directionNextStop": "산곡",
      "lat": 37.5057,
      "lng": 126.6754,
      "stopRoutes": [
        { "odsayRouteId": "...", "routeName": "수도권 7호선", "busType": null }
      ]
    }
  ]
}
```

### 1.6 응답 예시 (BE 매핑 결과 반영)

```json
{
  "id": "uuid-1",
  "user_id": "uuid-user",
  "name": "출근",
  "created_at": "2026-05-02T13:14:15.123Z",
  "updated_at": "2026-05-02T13:14:15.123Z",
  "route_stops": [
    {
      "id": "uuid-stop-1",
      "route_id": "uuid-1",
      "sequence": 0,
      "stop_name": "광명사거리역",
      "stop_type": "bus",
      "ars_id": "85019",
      "direction_headsign": null,
      "direction_updn": null,
      "direction_next_stop": null,
      "provider": "gyeonggi",
      "gbis_station_id": "200000177",
      "stop_routes": [
        {
          "id": "uuid-sr-1",
          "odsay_route_id": "...",
          "route_name": "11",
          "bus_type": 13,
          "st_id": null,
          "bus_route_id": null,
          "station_ord": null,
          "station_name": "광명사거리역",
          "gbis_route_id": "234000016",
          "gbis_sta_order": 12
        }
      ]
    },
    {
      "id": "uuid-stop-2",
      "route_id": "uuid-1",
      "sequence": 1,
      "stop_name": "석남(거북시장)",
      "stop_type": "subway",
      "ars_id": null,
      "direction_headsign": "장암행",
      "direction_updn": "down",
      "direction_next_stop": "산곡",
      "provider": "seoul",
      "gbis_station_id": null,
      "stop_routes": [...]
    }
  ]
}
```

### 1.7 에러

| HTTP | 케이스 |
|------|--------|
| 400 | stops 빈 배열 / sequence 중복 / lat·lng 형식 오류 (한 사이클 후 누락도 400) |
| 401 | 인증 헤더 없음 |
| 502 | GBIS 검색 API 5xx (마이그레이션 위험 → 가능하면 fallback 처리) |

---

## 2. GET /routes — 경로 목록 조회

### 2.1 인증

Bearer JWT 필수.

### 2.2 응답 — 200 OK

```ts
interface ApiRouteStop {
  // 기존
  id: string
  route_id: string
  sequence: number
  stop_name: string
  stop_type: 'bus' | 'subway'
  ars_id: string | null
  odsay_stop_id?: string | null

  // route-direction
  direction_headsign?: string | null
  direction_updn?: 'up' | 'down' | null
  direction_next_stop?: string | null

  // multi-region (신규)
  provider: 'seoul' | 'gyeonggi' | 'odsay_fallback'
  gbis_station_id: string | null

  stop_routes: ApiStopRoute[]
}

interface ApiStopRoute {
  // 기존
  id: string
  odsay_route_id: string
  route_name: string
  bus_type: number | null
  st_id: string | null
  bus_route_id: string | null
  station_ord: number | null
  station_name: string | null

  // multi-region (신규)
  gbis_route_id: string | null
  gbis_sta_order: number | null
}
```

---

## 3. PUT /routes/:id, DELETE /routes/:id

본 PRD 범위에서 **변경 없음**. PUT 시 stops 재구성이 들어오면 POST와 동일한 매핑 알고리즘 적용 (BE 책임).

---

## 4. DB 스키마 (참고)

### 4.1 route_stops

```
id                  uuid PK
route_id            uuid FK → routes.id
sequence            int
stop_name           text
stop_type           text   ('bus' | 'subway')
odsay_stop_id       text
ars_id              text  NULL
direction_headsign  text  NULL
direction_updn      text  NULL CHECK ('up' | 'down')
direction_next_stop text  NULL
provider            text  NULL CHECK ('seoul' | 'gyeonggi' | 'odsay_fallback')  [신규]
gbis_station_id     text  NULL                                                  [신규]
```

### 4.2 stop_routes

```
id                uuid PK
stop_id           uuid FK → route_stops.id
odsay_route_id    text
route_name        text
bus_type          int  NULL
st_id             text NULL          (서울 버스)
bus_route_id      text NULL          (서울 버스)
station_ord       int  NULL          (서울 버스)
station_name      text NULL
gbis_route_id     text NULL                                                    [신규]
gbis_sta_order    int  NULL                                                    [신규]
```

---

## 5. 변경 이력

- 2026-05-02 — multi-region: `lat`/`lng` 입력, `provider`/`gbis_*` 응답 필드 추가
- 2026-04-28 — route-direction: `direction_headsign`/`direction_updn`/`direction_next_stop` 추가 (additive)
- 2026-04-21 — `subwayCode` 타입 변경 [BREAKING]
