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
| `subwayId` | string | 지하철 호선 코드 (아래 코드표) |
| `trainLineNm` | string | "행선지 - 방면" 형태 (표시용) |
| `arvlMsg2` | string | 도착 예정 메시지 ("2분 40초 후", "전역 출발" 등) |
| `arvlMsg3` | string | 이전 정차역명 |
| `updnLine` | string | `"상행"` / `"하행"` / `"내선"` / `"외선"` |

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
