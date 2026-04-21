# 외부 API 레퍼런스

> 이 프로젝트에서 사용하는 외부 API의 응답 구조, 코드 매핑, 에러 처리 정리.
> 변경 시 이 문서도 함께 업데이트.

---

## 목차
1. [ODsay API](#1-odsay-api)
2. [서울 버스 API (ws.bus.go.kr)](#2-서울-버스-api-wsbusgoKr)
3. [서울 지하철 API (swopenapi.seoul.go.kr)](#3-서울-지하철-api)
4. [공통 코드 매핑](#4-공통-코드-매핑)

---

## 1. ODsay API

**Base URL:** `https://api.odsay.com/v1/api`  
**인증:** `apiKey` 쿼리 파라미터 (URI 플랫폼 키 → Referer 헤더로 도메인 인증 필요)

### 에러 응답 구조
```json
{
  "error": [{ "code": "-9", "message": "필수 파라미터 누락" }]
}
```

| 코드 | 의미 | 처리 |
|------|------|------|
| `-8` | 파라미터 형식 오류 | 400 |
| `-9` | 필수 파라미터 누락 | 400 |
| `-98` | 결과 없음 (정상) | 빈 배열 반환 |
| `-99` | 결과 없음 (정상) | 빈 배열 반환 |
| 기타 | ODsay 서버 오류 | 502 |

---

### 1-1. 정류장/역 검색 `searchStation`

```
GET /searchStation?lang=0&stationName={query}&apiKey={key}
```

**응답 (`result.station[]`):**
```json
{
  "stationID": 87103,
  "stationName": "개봉역",
  "x": 126.8628,
  "y": 37.4912,
  "type": 1,
  "arsID": "21003"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `stationID` | number | ODsay 정류장 ID (경로탐색, 실시간 조회에 사용) |
| `stationName` | string | 정류장명 |
| `x` | number | 경도 (longitude) |
| `y` | number | 위도 (latitude) |
| `type` | number | **1: 버스정류장, 2: 지하철역** |
| `arsID` | string | 서울 버스 정류장 고유번호 (서울 버스 API `arsId`에 사용) |

---

### 1-2. 실시간 도착정보 `realtimeStation`

```
GET /realtimeStation?lang=0&stationID={id}&apiKey={key}
```

**응답 (`result.real[]`):**
```json
{
  "routeID": "100100096",
  "routeName": "96",
  "arrivalTime1": 3,
  "arrivalTime2": 15,
  "type": 2
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `routeID` | string | ODsay 노선 ID |
| `routeName` | string | 노선 번호 (표시용) |
| `arrivalTime1` | number | 첫 번째 버스 도착 예정 시간 (분) |
| `arrivalTime2` | number\|null | 두 번째 버스 도착 예정 시간 (분) |
| `type` | number | **버스 노선 타입 코드** → [4. 코드 매핑](#41-odsay-버스-노선-타입-type) 참고 |

> **주의:** ODsay 커버리지 없는 정류장은 `-98`/`-99` 에러로 빈 배열 반환. 서울 버스 API fallback 필요.

---

### 1-3. 정류장 노선 목록 `stationInfo`

```
GET /stationInfo?stationID={id}&apiKey={key}
```

**응답 (`result.lane[]`):**
```json
{
  "busNo": "643",
  "busID": "100100643",
  "busLocalBlID": "100100643",
  "stID": "101000043",
  "stationOrd": 12,
  "type": 2
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `busNo` | string | 노선 번호 (표시용) |
| `busID` | string | ODsay 노선 ID |
| `busLocalBlID` | string | **서울 버스 API `busRouteId`** |
| `stID` | string | **서울 버스 API `stId`** |
| `stationOrd` | number | **서울 버스 API `ord`** (정류장 순번) |
| `type` | number | 버스 노선 타입 코드 → [4. 코드 매핑](#41-odsay-버스-노선-타입-type) |

---

### 1-4. 대중교통 경로탐색 `searchPubTransPathT`

```
GET /searchPubTransPathT?SX={lng}&SY={lat}&EX={lng}&EY={lat}&apiKey={key}
```

**응답 (`result.path[]`):**
```json
{
  "pathType": 3,
  "info": {
    "totalTime": 42,
    "transferCount": 1
  },
  "subPath": [
    {
      "trafficType": 2,
      "sectionTime": 15,
      "startName": "개봉역",
      "endName": "구로역",
      "lane": [
        {
          "busNo": "643",
          "busID": "100100643",
          "busLocalBlID": "100100643",
          "type": 2
        }
      ]
    }
  ]
}
```

**`pathType` (경로 유형):**

| 값 | 의미 |
|----|------|
| `1` | 지하철만 이용 |
| `2` | 버스만 이용 |
| `3` | 버스+지하철 혼합 |

**`subPath[].trafficType` (구간 교통수단):**

| 값 | 의미 |
|----|------|
| `1` | 지하철 |
| `2` | 버스 |
| `3` | 도보 (필터링해서 사용) |

**`subPath[].lane[]` 필드:**

| 필드 | 설명 |
|------|------|
| `busNo` | 버스 번호 (표시용) |
| `busLocalBlID` | 서울 버스 API `busRouteId` |
| `type` | 버스 노선 타입 코드 → [4. 코드 매핑](#41-odsay-버스-노선-타입-type) |
| `name` | 지하철 노선명 |
| `subwayCode` | 지하철 호선 코드 → [4. 코드 매핑](#42-odsay-지하철-호선-subwaycode) |
| `subwayExCode` | 지하철 확장 호선 코드 |

> `route-search` 응답의 `lines[].busType`으로 이 코드가 전달됨. 저장 시 `stop_routes.bus_type`에 보관.

---

## 2. 서울 버스 API (ws.bus.go.kr)

**Base URL:** `http://ws.bus.go.kr/api/rest`  
**인증:** `serviceKey` 쿼리 파라미터 (공공데이터포털 발급, 승인 필요)  
**주의:** HTTP (비암호화), 공공데이터포털에서 서비스별 개별 승인 필요

### 에러 구조
API 키 미승인/오류 시 JSON 대신 HTML 404 반환 (`.ok === false` → 502 처리).

---

### 2-1. 노선별 도착정보 `getArrInfoByRoute`

```
GET /arrive/getArrInfoByRoute?serviceKey={key}&stId={stId}&busRouteId={id}&ord={ord}&resultType=json
```

| 파라미터 | 설명 |
|---------|------|
| `stId` | 서울 버스 정류장 ID (ODsay `stID` 또는 `getRouteAllStaionList`의 `stId`) |
| `busRouteId` | 서울 버스 노선 ID (ODsay `busLocalBlID`) |
| `ord` | 정류장 순번 (ODsay `stationOrd` 또는 `getRouteAllStaionList`의 `seq`) |

**응답 (`msgBody.itemList[0]`):**
```json
{
  "busRouteAbrv": "643",
  "arrmsg1": "3분후[1번째 전]",
  "arrmsg2": "18분후[10번째 전]",
  "traTime1": "180",
  "traTime2": "1080"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `busRouteAbrv` | string | 노선 번호 약자 (표시용) |
| `arrmsg1` | string | 첫 번째 버스 도착 메시지 ("운행종료", "곧 도착" 등) |
| `arrmsg2` | string | 두 번째 버스 도착 메시지 |
| `traTime1` | string | 첫 번째 버스 도착까지 초 단위 (`"0"` = 운행종료/정보없음) |
| `traTime2` | string | 두 번째 버스 도착까지 초 단위 |

---

### 2-2. 정류장명으로 정류장 조회 `getStationByName`

```
GET /stationinfo/getStationByName?ServiceKey={key}&stSrch={name}&resultType=json
```

> `stSrch`는 `encodeURIComponent` 적용 필요. 동명 정류장이 여러 개 반환될 수 있음.

**응답 (`msgBody.itemList[]`):**
```json
{
  "stId": "116000142",
  "stNm": "개봉역",
  "arsId": "17233"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `stId` | string | 서울 버스 정류장 ID (`getLowArrInfoByStId`에 사용) |
| `stNm` | string | 정류장명 |
| `arsId` | string | 정류장 고유번호 (`getRouteByStation`의 `arsId`에 사용) |

---

### 2-3. 정류장 실시간 도착정보 `getLowArrInfoByStId`

```
GET /arrive/getLowArrInfoByStId?ServiceKey={key}&stId={stId}&resultType=json
```

> 해당 정류장에 오는 **현재 운행 중인 버스 전체** 반환. 운행 종료 시간대엔 빈 배열.

**응답 (`msgBody.itemList[]`):**
```json
{
  "busRouteId": "100100096",
  "busRouteAbrv": "643",
  "arrmsg1": "3분50초후[1번째 전]",
  "arrmsg2": "13분후[6번째 전]",
  "traTime1": "230",
  "traTime2": "813"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `busRouteId` | string | 서울 버스 노선 ID (필터링 키) |
| `busRouteAbrv` | string | 노선 번호 약자 |
| `arrmsg1` | string | 첫 번째 버스 도착 메시지 |
| `arrmsg2` | string | 두 번째 버스 도착 메시지 |
| `traTime1` | string | 첫 번째 버스 도착까지 초 (`"0"` = 정보없음) |
| `traTime2` | string | 두 번째 버스 도착까지 초 |

---

### 2-4. 정류장 노선 목록 `getRouteByStation`

```
GET /stationinfo/getRouteByStation?ServiceKey={key}&arsId={arsId}&resultType=json
```

**응답 (`msgBody.itemList[]`):**
```json
{
  "busRouteId": "100100643",
  "busRouteAbrv": "643",
  "busRouteNm": "643",
  "busRouteType": "12"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `busRouteId` | string | 서울 버스 노선 ID |
| `busRouteAbrv` | string | 노선 번호 약자 |
| `busRouteNm` | string | 노선 전체명 |
| `busRouteType` | string | 서울 버스 노선 타입 코드 (ODsay `type`과 다름) |

> `stId`, `stOrd` 필드는 응답에 포함되지 않음 (확인됨).

---

## 3. 서울 지하철 API

**Base URL:** `http://swopenapi.seoul.go.kr/api/subway`  
**인증:** URL 경로에 API 키 포함 (`/{key}/json/...`)

### 3-1. 실시간 역 도착정보 `realtimeStationArrival`

```
GET /{key}/json/realtimeStationArrival/0/10/{stationName}
```

> `stationName`은 반드시 `encodeURIComponent` 적용.

**응답 (`realtimeArrivalList[]`):**
```json
{
  "subwayId": "1002",
  "trainLineNm": "성수행 - 역삼방면",
  "arvlMsg2": "2분 40초 후",
  "arvlMsg3": "서초",
  "updnLine": "외선"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `subwayId` | string | 지하철 호선 코드 → [4. 코드 매핑](#43-서울-지하철-api-subwayid) |
| `trainLineNm` | string | "행선지 - 방면" 형태 (표시용) |
| `arvlMsg2` | string | 도착 예정 메시지 ("2분 40초 후", "전역 출발" 등) |
| `arvlMsg3` | string | 이전 정차역명 |
| `updnLine` | string | `"상행"` / `"하행"` / `"내선"` / `"외선"` |

---

## 4. 공통 코드 매핑

### 4-1. ODsay 버스 노선 타입 (`type`)

`realtimeStation`, `stationInfo`, `searchPubTransPathT` lane에서 공통 사용.

| 값 | 의미 |
|----|------|
| `1` | 일반 |
| `2` | 좌석 |
| `3` | 마을버스 |
| `4` | 직행좌석 |
| `5` | 공항버스 |
| `6` | 간선급행 |
| `10` | 외곽 |
| `11` | 간선 |
| `12` | 지선 |
| `13` | 순환 |
| `14` | 광역 |
| `15` | 급행 |
| `16` | 관광버스 |
| `20` | 농어촌버스 |
| `22` | 경기도 시외형버스 |
| `26` | 급행간선 |
| `30` | 한강버스 |

---

### 4-2. ODsay 지하철 호선 (`subwayCode`)

`searchPubTransPathT` lane의 `subwayCode` 필드.

| 값 | 호선 |
|----|------|
| `1` | 1호선 |
| `2` | 2호선 |
| `3` | 3호선 |
| `4` | 4호선 |
| `5` | 5호선 |
| `6` | 6호선 |
| `7` | 7호선 |
| `8` | 8호선 |
| `9` | 9호선 |
| `21` | 신분당선 |
| `22` | 경의중앙선 |
| `23` | 수인분당선 |
| `26` | 공항철도 |
| `27` | 경강선 |
| `29` | 서해선 |
| `30` | 신림선 |
| `31` | GTX-A |

---

### 4-3. 서울 지하철 API `subwayId`

`realtimeStationArrival` 응답의 `subwayId` 필드 (문자열 코드).

| 값 | 호선 |
|----|------|
| `1001` | 1호선 |
| `1002` | 2호선 |
| `1003` | 3호선 |
| `1004` | 4호선 |
| `1005` | 5호선 |
| `1006` | 6호선 |
| `1007` | 7호선 |
| `1008` | 8호선 |
| `1009` | 9호선 |
| `1063` | 경의중앙선 |
| `1065` | 공항철도 |
| `1067` | 경강선 |
| `1071` | 신분당선 |
| `1075` | 수인분당선 |
| `1077` | 신림선 |
