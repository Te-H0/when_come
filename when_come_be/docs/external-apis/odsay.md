# ODsay API

**Base URL:** `https://api.odsay.com/v1/api`  
**인증:** `apiKey` 쿼리 파라미터 (URI 플랫폼 키, Referer 헤더로 도메인 인증)  
**현재 사용 엔드포인트:** searchStation, realtimeStation, stationInfo, searchPubTransPathT

## 에러 응답 구조

```json
{ "error": [{ "code": "-9", "message": "필수 파라미터 누락" }] }
```

| 코드 | 의미 | 처리 |
|------|------|------|
| `-8` | 파라미터 형식 오류 | 400 |
| `-9` | 필수 파라미터 누락 | 400 |
| `-98` | 결과 없음 (정상) | 빈 배열 반환 |
| `-99` | 결과 없음 (정상) | 빈 배열 반환 |
| 기타 | ODsay 서버 오류 | 502 |

---

## searchStation — 정류장/역 검색

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
| `stationID` | number | ODsay 정류장 ID |
| `x` | number | 경도 (longitude) |
| `y` | number | 위도 (latitude) |
| `type` | number | **1: 버스정류장, 2: 지하철역** |
| `arsID` | string | 서울 버스 API `arsId` |

---

## realtimeStation — 실시간 도착정보

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
| `arrivalTime1` | number | 첫 번째 버스 도착 예정 (분) |
| `arrivalTime2` | number\|null | 두 번째 버스 도착 예정 (분) |
| `type` | number | 버스 노선 타입 코드 (아래 코드표 참고) |

> **한계:** ODsay 커버리지 없는 정류장 → `-98`/`-99` 에러, 서울 버스 API fallback 필요.

---

## stationInfo — 정류장 노선 목록

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

| 필드 | 설명 |
|------|------|
| `busLocalBlID` | **서울 버스 API `busRouteId`** |
| `stID` | **서울 버스 API `stId`** |
| `stationOrd` | **서울 버스 API `ord`** (정류장 순번) |

---

## searchPubTransPathT — 대중교통 경로탐색

```
GET /searchPubTransPathT?SX={lng}&SY={lat}&EX={lng}&EY={lat}&apiKey={key}
```

**subPath[].trafficType:**

| 값 | 의미 |
|----|------|
| `1` | 지하철 |
| `2` | 버스 |
| `3` | 도보 (필터링) |

**subPath[] 방향 관련 필드 (지하철 only, 옵셔널):**

| 필드 | 타입 | 설명 |
|------|------|------|
| `way` | string \| undefined | 노선 종점역명 (헤드사인 합성용, 예: `"장암"`). 일부 노선/케이스 누락 가능 |
| `wayCode` | 1 \| 2 \| undefined | `1`=상행/내선, `2`=하행/외선. 일부 케이스 누락 가능 |

> 의미·매칭 규칙 상세는 `docs/api/contracts/route-direction-design.md` §1.1, `docs/decisions/ADR-001-subway-direction-model.md` 참고. 버스 subPath에는 의미 없음.

**subPath[].lane[] 주요 필드:**

| 필드 | 설명 |
|------|------|
| `busLocalBlID` | 서울 버스 API `busRouteId` |
| `type` | 버스 노선 타입 코드 |
| `subwayCode` | 지하철 호선 코드 (아래 참고) |

---

## 코드 매핑

### 버스 노선 타입 (`type`)

| 값 | 의미 | 값 | 의미 |
|----|------|----|----|
| `1` | 일반 | `11` | 간선 |
| `2` | 좌석 | `12` | 지선 |
| `3` | 마을버스 | `13` | 순환 |
| `4` | 직행좌석 | `14` | 광역 |
| `5` | 공항버스 | `15` | 급행 |
| `6` | 간선급행 | `16` | 관광버스 |
| `10` | 외곽 | `20` | 농어촌버스 |
| `22` | 경기도 시외형 | `26` | 급행간선 |
| `30` | 한강버스 | | |

### 지하철 호선 (`subwayCode`) — ODsay 기준

| 값 | 호선 | 값 | 호선 |
|----|------|----|----|
| `1`~`9` | 1~9호선 | `21` | 신분당선 |
| `22` | 경의중앙선 | `23` | 수인분당선 |
| `26` | 공항철도 | `27` | 경강선 |
| `29` | 서해선 | `30` | 신림선 |
| `31` | GTX-A | | |

> ⚠️ BE `route-search`는 ODsay `subwayCode`를 서울 지하철 API `subwayId` 형식(`"1001"` 등)으로 변환해서 반환함. `transitColors.ts` 참고.
