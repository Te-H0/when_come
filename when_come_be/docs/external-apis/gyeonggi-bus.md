# 경기도 버스 API

> **두 시스템에서 데이터를 가져온다.** 시스템마다 인증 키가 별도이며 base URL과 응답 포맷도 다르다.
> - **공공데이터포털 GBIS** (`apis.data.go.kr/6410000`) — 도착정보 + 노선조회
> - **경기도 자체 OpenAPI** (`openapi.gg.go.kr`) — 정류소 현황 (cron 캐시용)

| 시스템 | Base URL | 인증키 환경변수 | 용도 |
|--------|----------|----------------|------|
| 공공데이터포털 GBIS | `https://apis.data.go.kr/6410000` | `GYEONGGI_BUS_API_KEY` | 도착(busarrivalservice/v2) + 노선조회(busrouteservice/v2) |
| 경기도 자체 OpenAPI | `https://openapi.gg.go.kr` | `GYEONGGI_OPENAPI_KEY` | 정류소 현황 (BusStation) |

---

## 1. busarrivalservice/v2 — 실시간 도착정보

**Base URL:** `https://apis.data.go.kr/6410000/busarrivalservice/v2`
**제공기관:** 경기도 교통정보과 (공공데이터포털 데이터셋 ID `15080346`)
**인증:** `serviceKey` 쿼리 파라미터
**환경변수:** `GYEONGGI_BUS_API_KEY` (Edge Function `Deno.env.get` lazy 읽기)
**무료 한도:** 개발계정 1,000건/일 / 운영계정 협의 증액
**현재 사용 엔드포인트:** `getBusArrivalItemv2`, `getBusArrivalListv2`

### 1.1 getBusArrivalListv2 — 정류소 단위 일괄 도착정보 (권장)

```
GET /getBusArrivalListv2?serviceKey={key}&stationId={stationId}&format=json
```

| 파라미터 | 설명 |
|---------|------|
| `stationId` | GBIS 정류소 ID (정수, 예: `200000177`) |
| `format` | `json` (생략 시 XML) |

응답 (`msgBody.busArrivalList[]`):

```json
{
  "stationId": 200000177,
  "routeId": 234000016,
  "routeName": "11",
  "staOrder": 12,
  "predictTime1": 3,
  "predictTime2": 12,
  "predictTimeSec1": 180,
  "predictTimeSec2": 720,
  "locationNo1": 2,
  "locationNo2": 8,
  "plateNo1": "경기75자1234",
  "plateNo2": "경기75자5678",
  "lowPlate1": 1,
  "lowPlate2": 0,
  "remainSeatCnt1": -1,
  "remainSeatCnt2": -1,
  "crowded1": 2,
  "crowded2": 3,
  "stateCd1": 0,
  "stateCd2": 2,
  "flag": "RUN",
  "routeDestId": 200000178,
  "routeDestName": "광명사거리역",
  "routeTypeCd": 13,
  "vehId1": 234001234,
  "vehId2": 234005678,
  "taglessCd1": 0,
  "taglessCd2": 0,
  "turnSeq": 45
}
```

### 1.2 getBusArrivalItemv2 — 노선·정류소 단위 단일 도착정보

```
GET /getBusArrivalItemv2?serviceKey={key}&stationId={stationId}&routeId={routeId}&staOrder={staOrder}&format=json
```

| 파라미터 | 설명 |
|---------|------|
| `stationId` | GBIS 정류소 ID |
| `routeId` | GBIS 노선 ID |
| `staOrder` | 노선 내 정류장 순번 (필수) |

응답 구조는 `getBusArrivalListv2`의 단일 item과 동일 (`msgBody.busArrivalItem`).

> **`staOrder` 필수.** 같은 노선이 같은 정류소를 왕복으로 경유할 때(상·하행) 구분에 사용.

### 1.3 핵심 필드 정리

| 필드 | 타입 | 설명 |
|------|------|------|
| `predictTime1` / `predictTime2` | int (분) | 첫·둘째 차량 도착 예상 (분) |
| `predictTimeSec1` / `predictTimeSec2` | int (초) | 첫·둘째 차량 도착 예상 (초) — 정밀 표시 권장 |
| `locationNo1` / `locationNo2` | int | "N번째 전 정류소" |
| `flag` | string | `RUN`/`PASS`/`STOP`/`WAIT` |
| `lowPlate1/2` | int | 0 일반 / 1 저상 / 2 2층 / 5 전세 / 6 예약 / 7 트롤리 |
| `remainSeatCnt1/2` | int | 잔여좌석 (`-1` = 정보없음). 좌석형 노선유형(11/12/14/16/17/21/22)에서만 유효 |
| `crowded1/2` | int | 1 여유 / 2 보통 / 3 혼잡 / 4 매우혼잡. 일반 시내(13)·따복(15)·일반 농어촌(23)에서만 유효 |
| `stateCd1/2` | int | 0 교차로 통과 / 1 정류소 도착 / 2 정류소 출발 |
| `routeTypeCd` | int | 노선유형 (아래 표) |
| `taglessCd1/2` | int | 0 일반 / 1 태그리스 |

### 1.4 routeTypeCd 코드표

| 코드 | 종류 | 코드 | 종류 |
|------|------|------|------|
| 11 | 직행좌석형 시내 | 30 | 마을 |
| 12 | 좌석형 시내 | 41 | 고속형 시외 |
| 13 | 일반형 시내 | 42 | 좌석형 시외 |
| 14 | 광역급행형 시내 | 43 | 일반형 시외 |
| 15 | 따복형 시내 | 51 | 리무진 공항 |
| 16 | 경기순환 | 52 | 좌석형 공항 |
| 17 | 준공영제 직행좌석 시내 | 53 | 일반형 공항 |
| 21 | 직행좌석형 농어촌 | | |
| 22 | 좌석형 농어촌 | | |
| 23 | 일반형 농어촌 | | |

---

## 2. busrouteservice/v2 — 노선조회 (확정 명세, 2026-05-02)

**Base URL:** `https://apis.data.go.kr/6410000/busrouteservice/v2`
**제공기관:** 경기도 (공공데이터포털 데이터셋 ID `15080662`)
**인증:** `serviceKey` 쿼리 파라미터 (`GYEONGGI_BUS_API_KEY` 동일 키)
**용도:** ODsay → GBIS 매핑 시 노선번호로 routeId·정류장 시퀀스 조회

> 사용자 액션: 공공데이터포털에서 데이터셋 ID `15080662` 활용 신청 → 동일 키 사용 가능.

### 2.1 getBusRouteListv2 — 노선번호로 검색

```
GET /getBusRouteListv2?serviceKey={key}&keyword={routeName}&format=json
```

| 파라미터 | 설명 |
|---------|------|
| `keyword` | 노선번호(예: `11`, `643`) 또는 부분 문자열 |
| `format` | `json` |

응답 (`msgBody.busRouteList[]`):

| 필드 | 설명 |
|------|------|
| `routeId` | 노선 ID (text/정수) |
| `routeName` | 노선번호 |
| `routeTypeCd` | 노선유형 코드 (위 표) |
| `routeTypeName` | 노선유형 한글명 |
| `startStationId` / `startStationName` | 기점 정류소 |
| `endStationId` / `endStationName` | 종점 정류소 |
| `regionName` | 지역명 (예: `광명`, `시흥`) |
| `districtCd` | 시군 코드 |
| `adminName` | 관할 행정명 |

> 같은 `keyword`에 여러 시군의 노선이 매칭될 수 있다. `regionName` 또는 `districtCd`로 필터링 필수.

### 2.2 getBusRouteStationListv2 — 노선의 경유 정류소 목록

```
GET /getBusRouteStationListv2?serviceKey={key}&routeId={routeId}&format=json
```

| 파라미터 | 설명 |
|---------|------|
| `routeId` | 노선 ID (`getBusRouteListv2`의 응답) |

응답 (`msgBody.busRouteStationList[]`):

| 필드 | 설명 |
|------|------|
| `stationId` | 정류소 ID |
| `stationName` | 정류소명 |
| **`stationSeq`** | **정류장 순번 (= staOrder)** — 도착 단일 조회 시 필수 키 |
| `mobileNo` | 모바일 번호(= ARS) |
| `x`, `y` | 경위도 |
| `regionName` | 지역명 |
| `districtCd` | 시군 코드 |
| `centerYn` | 중앙차로 정류소 여부 |
| `turnSeq` | 회차 순번 (있으면 회차지) |
| `turnYn` | 회차 여부 |
| `adminName` | 관할 행정명 |

> `stationSeq` 값이 **`getBusArrivalItemv2`의 `staOrder` 인자로 그대로 사용**된다.

### 2.3 getBusRouteInfoItemv2 (노선 상세 — 본 프로젝트 미사용)

첫차/막차/회사 정보 등. 응답 명세 생략.

### 2.4 getBusRouteLineListv2 (노선 형상 — 본 프로젝트 미사용)

좌표 시퀀스. 응답 명세 생략.

### 2.5 매핑 흐름 요약 (regionMapper.ts)

```
1) ODsay 노선번호 → getBusRouteListv2(keyword)
2) regionName/districtCd로 같은 시군 후보만 필터
3) 각 후보 → getBusRouteStationListv2(routeId) (캐시 5분)
4) stationList에서 우리 stationId 검색
5) 매칭되면 stationSeq를 staOrder로 저장
```

---

## 3. 경기도 자체 OpenAPI — 정류소현황 (확정 명세, 2026-05-02)

**Base URL:** `https://openapi.gg.go.kr/BusStation`
**제공기관:** 경기도청 (자체 OpenAPI 시스템 — 공공데이터포털과 별도)
**인증:** `KEY` 쿼리 파라미터 (자체 발급)
**환경변수:** `GYEONGGI_OPENAPI_KEY` ⚠️ **`GYEONGGI_BUS_API_KEY`와 별도 키**
**호출 제한:** **없음** (확정)
**용도:** 일 1회 cron(`sync-gbis-stations`)으로 자체 DB(`gbis_stations`) 캐시 갱신

> ⚠️ **검색 API가 아니다.** 시군 단위 페이징 다운로드만 제공.
> 따라서 매번 매핑할 때마다 호출하는 패턴이 아니라 **자체 캐시 후 그 캐시를 검색**하는 패턴으로 사용한다 (ADR-003).

### 3.1 요청

```
GET https://openapi.gg.go.kr/BusStation
   ?KEY={key}
   &Type={xml|json}
   &pIndex={page}
   &pSize={size}
   &SIGUN_NM={시군명, optional}
   &SIGUN_CD={시군코드, optional}
```

| 파라미터 | 설명 |
|---------|------|
| `KEY` | `GYEONGGI_OPENAPI_KEY` |
| `Type` | `xml` 또는 `json` |
| `pIndex` | 페이지 번호 (1-based) |
| `pSize` | 페이지 크기 (1~1000 추정) |
| `SIGUN_NM` | 시군명 (예: `광명시`) — 선택, 미지정 시 전체 |
| `SIGUN_CD` | 시군 코드 — 선택 |

### 3.2 응답 (JSON)

```json
{
  "BusStation": [
    {
      "head": [
        { "LIST_TOTAL_COUNT": 412 },
        { "RESULT": { "CODE": "INFO-000", "MESSAGE": "정상 처리되었습니다." } },
        { "API_VERSION": "1.0" }
      ]
    },
    {
      "row": [
        {
          "STATION_NM_INFO": "광명사거리역.광명시장",
          "ENG_STATION_NM_INFO": "Gwangmyeongsageori Stn.",
          "STATION_ID": "200000177",
          "STATION_MANAGE_NO": "85019",
          "STATION_DIV_NM": "노선버스",
          "JURISD_INST_NM": "광명시청",
          "LOCPLC_LOC": "광명사거리역 1번출구 앞",
          "WGS84_LAT": 37.480712,
          "WGS84_LOGT": 126.861534,
          "SIGUN_NM": "광명시",
          "SIGUN_CD": "41210"
        }
      ]
    }
  ]
}
```

| 응답 필드 | 설명 |
|----------|------|
| `LIST_TOTAL_COUNT` | 전체 row 수 (페이징 종료 판정) |
| `CODE` | `INFO-000` 정상 / `INFO-200` 데이터 없음 / `ERROR-xxx` 오류 |
| `MESSAGE` | 결과 메시지 |
| `API_VERSION` | API 버전 |
| **`STATION_ID`** | **GBIS 정류소 ID — DB PK** |
| **`STATION_MANAGE_NO`** | **ARS (모바일번호) — ODsay arsId 매칭 키** |
| `STATION_NM_INFO` | 정류소명 |
| `ENG_STATION_NM_INFO` | 정류소 영문명 |
| `STATION_DIV_NM` | 정류소 구분 |
| `JURISD_INST_NM` | 관할기관 |
| `LOCPLC_LOC` | 위치 설명 |
| **`WGS84_LAT`** | **위도** |
| **`WGS84_LOGT`** | **경도** (변형 표기 — `LOGT` = longitude) |
| `SIGUN_NM` | 시군명 |
| `SIGUN_CD` | 시군 코드 |

### 3.3 페이징 종료 판정

```
totalCount = response.BusStation[0].head[0].LIST_TOTAL_COUNT
processed += response.BusStation[1].row.length
if (processed >= totalCount) break
```

또는 마지막 페이지의 `row.length < pSize`이면 종료.

### 3.4 에러

| CODE | 의미 | 처리 |
|------|------|------|
| `INFO-000` | 정상 | 그대로 처리 |
| `INFO-200` | 해당하는 데이터가 없음 | 빈 응답으로 처리 (해당 시군 skip) |
| `INFO-300` | 필수입력값 오류 | errors[]에 기록 |
| `ERROR-300` | 필수값 누락 | errors[]에 기록 |
| `ERROR-500` | 서버 오류 | errors[]에 기록 후 다음 시군 진행 |

> 본 OpenAPI는 부분 실패에 관대 — sync-gbis-stations는 시군 단위 try/catch로 부분 실패를 errors[]에 누적하고 200 응답을 유지.

### 3.5 31개 시군 목록 (참고)

수원시, 고양시, 용인시, 성남시, 부천시, 안산시, 화성시, 남양주시, 안양시, 평택시, 시흥시, 파주시, 의정부시, 김포시, 광주시, **광명시**, 군포시, 하남시, 오산시, 양주시, 이천시, 구리시, 안성시, 포천시, 의왕시, 양평군, 여주시, 동두천시, 가평군, 과천시, 연천군

---

## 4. 서울 버스 API와의 차이

| 항목 | 서울 (ws.bus.go.kr) | 경기 (apis.data.go.kr/6410000) |
|------|---------------------|-------------------------------|
| 정류장 식별자 | `arsId` (5자리) | `stationId` (정수) |
| 노선 식별자 | `busRouteId` | `routeId` |
| 정류장 순번 | `ord` | `staOrder` (=`stationSeq`) |
| 도착시간 단위 | `traTime1` (초, 문자열) | `predictTimeSec1` (초, 정수) + `predictTime1` (분) |
| 메시지 필드 | `arrmsg1` (서버 가공) | 없음 — 클라이언트에서 분/초로 직접 포맷 |
| HTTPS | ❌ HTTP only | ✅ HTTPS |
| 노선 검색 | `getRouteByStation` (정류소 → 노선 목록) | `getBusRouteListv2` (노선번호 → 노선 목록) |
| 정류소 검색 | (현재 미사용) | **검색 API 없음** — 자체 캐시(`gbis_stations`) 운영 (ADR-003) |
| ODsay 연동 | `arsID` 그대로 사용 가능 | ODsay arsID ↔ `STATION_MANAGE_NO` 매칭 (ADR-003) |

---

## 5. 환경변수

| 변수 | 시스템 | 용도 |
|------|--------|------|
| `GYEONGGI_BUS_API_KEY` | 공공데이터포털 (apis.data.go.kr) | busarrivalservice/v2, busrouteservice/v2 |
| `GYEONGGI_OPENAPI_KEY` | 경기도 자체 OpenAPI (openapi.gg.go.kr) | BusStation (sync-gbis-stations만) |

⚠️ **두 키는 별도다.** 발급 시스템·관리 페이지 모두 다름. `.env`/`secrets.local.md`에 둘 다 기록 필요.

---

## 6. 관련 문서

- 매핑 알고리즘: `docs/specs/multi-region-bus-arrival/SDD.md` §3
- 캐시 정책 결정: `docs/decisions/ADR-003-gbis-station-caching.md`
- sync 함수 계약: `docs/api/contracts/sync-gbis-stations.md`
- Provider 패턴 결정: `docs/decisions/ADR-002-multi-region-arrival-provider.md`

---

## 7. 변경 이력

- **2026-05-02 (v2)** — 노선조회 OpenAPI(15080662) `getBusRouteListv2`, `getBusRouteStationListv2` 명세 확정 추가. 경기도 자체 OpenAPI 정류소현황 섹션 신규. 두 시스템 키 분리 명시.
- **2026-04-21 (v1)** — busarrivalservice/v2 명세 추가.
