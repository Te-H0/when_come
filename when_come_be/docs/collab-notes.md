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

**segments 필드:**

| 필드 | 설명 |
|------|------|
| `startOdsayId` / `endOdsayId` | ODsay 정류장 ID — `arrival-info?type=odsay` 에 사용 |
| `startArsId` / `endArsId` | 서울 버스 arsId — `arrival-info?type=bus` 에 사용. 지하철 구간은 `null` |

**lines 필드:**

| 필드 | 설명 |
|------|------|
| `busRouteId` | 서울 버스 API busRouteId — `arrival-info?type=bus` 에 사용. 지하철은 `null` |
| `busType` | ODsay 버스 노선 타입 (코드표 아래 참고). 지하철은 `null` |
| `subwayCode` | 서울 지하철 API `subwayId` 형식 (`"1001"`, `"1002"` ...). 버스는 `null` |

> `subwayCode`는 `arrival-info?type=subway` 응답의 `lineName`과 직접 비교 가능 (동일 형식).

**busType 코드표 (ODsay 기준):**

| 값 | 의미 |
|----|------|
| `1` | 일반 | `2` | 좌석 | `3` | 마을버스 | `4` | 직행좌석 |
| `5` | 공항버스 | `6` | 간선급행 | `10` | 외곽 | `11` | 간선 |
| `12` | 지선 | `13` | 순환 | `14` | 광역 | `15` | 급행 |
| `16` | 관광버스 | `20` | 농어촌버스 | `22` | 경기도 시외형 | `26` | 급행간선 |
| `30` | 한강버스 | `null` | 지하철 구간 또는 미제공 |

---

### GET /arrival-info

실시간 도착정보. `type` 파라미터로 버스/지하철/odsay 구분.

#### type=bus

서울 버스 API 직접 조회. 두 가지 방식 중 하나.

**방식 A — stId + ord (ODsay stationInfo에서 얻은 값)**
```
GET /arrival-info?type=bus&busRouteId=100100643&stId=101000043&ord=12
```

**방식 B — arsId (권장)**
```
GET /arrival-info?type=bus&busRouteId=100100643&arsId=21003
```

> arsId 방식은 `getStationByUid` 단일 호출로 처리. API 할당량 효율적.

**응답:**
```json
{
  "routeName": "643",
  "arrmsg1": "3분후[1번째 전]",
  "arrmsg2": "18분후[10번째 전]",
  "arrivalSec1": 180,
  "arrivalSec2": 1080
}
```

| 필드 | 설명 |
|------|------|
| `arrivalSec1` / `arrivalSec2` | 도착까지 초. `traTime1/2 = "0"` 이면 `null` (운행종료/정보없음) |
| 해당 노선 없음 | `null` 반환 (200) |

**에러:**
- `busRouteId` 누락 → 400
- `stId+ord`, `arsId` 모두 누락 → 400
- 서울 버스 API 오류 → 502
- API 키 미설정 → 500

#### type=subway

서울 지하철 API. 해당 역의 모든 호선 열차 전부 반환.

```
GET /arrival-info?type=subway&stationName=강남
```

**응답:**
```json
[
  {
    "lineName": "1002",
    "direction": "성수행 - 역삼방면",
    "arrmsg1": "2분 40초 후",
    "arrmsg2": "서초",
    "updnLine": "외선"
  }
]
```

> `lineName`은 서울 지하철 API `subwayId` 형식 — `route-search` `subwayCode`와 직접 비교 가능.

**에러:** `stationName` 누락 → 400 / 지하철 API 오류 → 502

#### type=odsay

ODsay `realtimeStation` 프록시.

```
GET /arrival-info?type=odsay&stationId=87103
```

**에러:** `stationId` 누락 → 400

---

### GET /stop-buses?arsId={arsId}

arsId로 해당 정류장에 오는 버스 노선 목록 조회.
서울 버스 API `getRouteByStation` 프록시.

```
GET /stop-buses?arsId=21003
```

**응답:**
```json
[
  {
    "routeName": "643",
    "busRouteId": "100100643",
    "busRouteType": 12
  }
]
```

> `busRouteType`은 서울 버스 API 기준 코드. ODsay `busType`과 **다름**.  
> 정류장에 버스 없음 → `[]` (200).

**에러:** `arsId` 누락 → 400 / 서울 버스 API 오류 → 502

---

### GET/POST/PUT/DELETE /routes

인증 필요 (Bearer JWT). 사용자 저장 경로 CRUD.

**경로 저장 요청 (`POST /routes`):**
```json
{
  "name": "출근길",
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
    }
  ]
}
```

> `startArsId` / `endArsId` — route_stops.ars_id에 저장. 이후 `arrival-info?type=bus` 호출에 사용.

---

## 변경 이력

### 2026-04-21 | POST /route-search | `subwayCode` 타입 변경 [BREAKING]

`segments[].lines[].subwayCode`: `number | null` → `string | null` (서울 지하철 API 형식)

- 변경 전: `2` (ODsay 형식)
- 변경 후: `"1002"` (서울 지하철 API subwayId 형식)

`arrival-info?type=subway` 응답의 `lineName`과 직접 비교 가능. 프론트 `subwayCodeToLineName()` ODsay 변환 함수 제거 가능.

---

### 2026-04-21 | POST /route-search | arsId 필드 추가

`segments[]`에 `startArsId`, `endArsId`, `startOdsayId`, `endOdsayId` 추가.  
버스 구간은 arsId 있음, 지하철 구간은 `null`.

---

### 2026-04-21 | GET /stop-buses | 신규 엔드포인트

arsId로 정류장 노선 목록 조회. 기존 ODsay stationInfo 기반 방식 대체.

---

### 2026-04-21 | GET /arrival-info?type=bus | arsId 방식 추가, stationName 제거 [BREAKING]

- 제거: `busRouteId + stationName` 방식 (내부 API 할당량 초과 이슈)
- 추가: `busRouteId + arsId` 방식 (getStationByUid 단일 호출)
- 유지: `busRouteId + stId + ord` 방식

---

### 2026-04-19 | POST /route-search | `busType` 필드 추가

`segments[].lines[]`에 `busType: number | null` 추가.  
ODsay lane `type` 코드 직접 전달.
