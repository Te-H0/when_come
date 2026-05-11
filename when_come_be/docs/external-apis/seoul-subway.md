# 서울 지하철 API (swopenapi.seoul.go.kr)

**Base URL:** `http://swopenapi.seoul.go.kr/api/subway`  
**인증:** URL 경로에 API 키 포함 (`/{key}/json/...`)  
**현재 사용 엔드포인트:** realtimeStationArrival

---

## realtimeStationArrival — 실시간 역 도착정보

```
GET /{key}/json/realtimeStationArrival/0/10/{stationName}
```

> `stationName`은 반드시 `encodeURIComponent` 적용.  
> 해당 역의 **모든 호선** 열차를 전부 반환 (필터링은 FE 또는 응답 후 처리).

**응답 (`realtimeArrivalList[]`) — 우리가 사용하는 필드만:**
```json
{
  "subwayId": "1001",
  "updnLine": "하행",
  "trainLineNm": "광명행 - 급행",
  "btrainSttus": "급행",
  "bstatnNm": "광명",
  "barvlDt": "160",
  "recptnDt": "2026-05-11 09:23:18",
  "arvlMsg2": "2분 40초 후",
  "arvlMsg3": "구로",
  "arvlCd": "99",
  "lstcarAt": "0"
}
```

| 필드 | 타입 | 의미 | 우리 사용처 |
|------|------|------|------|
| `subwayId` | string | 호선 코드 (아래 코드표) | `lineName`으로 매핑 |
| `updnLine` | string | `"상행"`/`"하행"`/`"내선"`/`"외선"` | `updnLine` 그대로 |
| `trainLineNm` | string | "행선지 - 방면" 형태 (표시용) | `direction` + `extractHeadsign` 입력 |
| `btrainSttus` | string | 열차 종류 — `"급행"`/`"ITX"`/`"특급"`/`"일반"`/`""` (5종 공식) + 미지의 값 | `trainType` raw 동봉 (2026-05-11~) |
| `bstatnNm` | string | 종착역명 | `destinationName` (trainLineNm 파싱 실패 fallback) |
| `barvlDt` | string | 도착 예정 초 (정수 문자열) | `arrivalSeconds` (Number 파싱) |
| `recptnDt` | string | 데이터 생성 시각 `"YYYY-MM-DD HH:mm:ss"` | `dataTimestamp` (지연 보정용) |
| `arvlMsg2` | string | 도착 메시지 ("2분 40초 후", "전역 출발" 등) | `arrmsg1`으로 매핑 |
| `arvlMsg3` | string | 이전 정차역명 | `arrmsg2`로 매핑 |
| `arvlCd` | string | 도착 코드 (아래 코드표) | `displayMsg`로 매핑 |
| `lstcarAt` | string | 막차 여부 `"1"`(막차) / `"0"` | `isLastTrain` (boolean 변환) |

> 명세에는 21개 필드가 있으나(`statnFid`/`statnTid`/`statnId`/`statnNm`/`trnsitCo`/`ordkey`/`subwayList`/`statnList`/`btrainNo`/`bstatnId`) 본 앱 도메인에서 사용 가치 낮아 미수신.

### btrainSttus 값 처리 정책 (2026-05-11~)

- BE는 **raw 그대로 보존** — `"급행"`/`"ITX"`/`"특급"`/`"일반"`/`""` 5종 외 미지의 값은 `anomaly_logs`(source=`arrival-info`, category=`subway.unknown_train_type`)에 기록 후 응답에 그대로 동봉.
- FE는 `formatTrainTypeShort`로 짧은 라벨 매핑: `"급행" → "급"` / `"특급" → "특"` / `"ITX" → "ITX"` / `"일반" / "" → null`(라벨 미표시) / 미지 → raw.
- 새 enum 값(예: `"K급행"`, `"GTX"`) 발견 시 `anomaly_logs`로 자동 학습 후 `formatTrainTypeShort` 업데이트.

### arvlCd 코드표

| arvlCd | 의미 | displayMsg (우리 매핑) |
|--------|------|----------------------|
| `"0"` | 진입 | "진입중" |
| `"1"` | 도착 | "도착" |
| `"2"` | 출발 | "출발" |
| `"3"` | 전역 출발 | "전역 출발" |
| `"4"` | 전역 진입 | "전역 진입" |
| `"5"` | 전역 도착 | "전역 도착" |
| `"99"` | 운행중 (특정 상태 아님) | null → `arvlMsg2` 그대로 |

매핑 구현: `arrival-info/index.ts` `arvlCdToDisplayMsg`.

---

## subwayId 코드표

`route-search` 응답의 `subwayCode`와 **직접 비교 가능** (동일 형식으로 변환되어 있음).

| subwayId | 호선 | subwayId | 호선 |
|----------|------|----------|------|
| `1001` | 1호선 | `1063` | 경의중앙선 |
| `1002` | 2호선 | `1065` | 공항철도 |
| `1003` | 3호선 | `1067` | 경강선 |
| `1004` | 4호선 | `1071` | 신분당선 |
| `1005` | 5호선 | `1075` | 수인분당선 |
| `1006` | 6호선 | `1077` | 신림선 |
| `1007` | 7호선 | | |
| `1008` | 8호선 | | |
| `1009` | 9호선 | | |

---

## 에러 처리

| 상황 | 처리 |
|------|------|
| `stationName` 누락 | 400 |
| API 오류 | 502 |
| 열차 없음 (운행 종료) | 빈 배열 (`[]`) |
