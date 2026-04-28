# 서울 버스 API (ws.bus.go.kr)

**Base URL:** `http://ws.bus.go.kr/api/rest`  
**인증:** `serviceKey` 쿼리 파라미터 (공공데이터포털 발급, 서비스별 개별 승인 필요)  
**주의:** HTTP (비암호화). 키 미승인 시 JSON 대신 HTML 404 반환 → `.ok === false`로 502 처리.  
**현재 사용 엔드포인트:** getArrInfoByRoute, getStationByUid, getRouteByStation

---

## getArrInfoByRoute — 노선별 도착정보

```
GET /arrive/getArrInfoByRoute?serviceKey={key}&stId={stId}&busRouteId={id}&ord={ord}&resultType=json
```

| 파라미터 | 설명 |
|---------|------|
| `stId` | 서울 버스 정류장 ID (ODsay `stID`) |
| `busRouteId` | 서울 버스 노선 ID (ODsay `busLocalBlID`) |
| `ord` | 정류장 순번 (ODsay `stationOrd`) |

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

| 필드 | 설명 |
|------|------|
| `arrmsg1` / `arrmsg2` | 도착 메시지 ("운행종료", "곧 도착" 등) |
| `traTime1` / `traTime2` | 도착까지 초 (`"0"` = 운행종료/정보없음) |

---

## getStationByUid — arsId로 정류장 도착정보 (권장)

```
GET /arrive/getStationByUid?ServiceKey={key}&arsId={arsId}&resultType=json
```

단일 호출로 해당 정류장 전체 운행 버스 도착정보 반환. API 할당량 효율적.

**응답 (`msgBody.itemList[]`):**
```json
{
  "busRouteId": "100100643",
  "busRouteAbrv": "643",
  "arrmsg1": "3분50초후[1번째 전]",
  "arrmsg2": "13분후[6번째 전]",
  "traTime1": "230",
  "traTime2": "813"
}
```

---

## getStationByName — 정류장명 검색

```
GET /stationinfo/getStationByName?ServiceKey={key}&stSrch={name}&resultType=json
```

> `stSrch`는 `encodeURIComponent` 적용 필요. 동명 정류장 여러 개 반환 가능.

**응답 (`msgBody.itemList[]`):**
```json
{
  "stId": "116000142",
  "stNm": "개봉역",
  "arsId": "17233"
}
```

---

## getRouteByStation — 정류장 노선 목록

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

> `stId`, `stOrd` 필드는 응답에 포함되지 않음 (확인됨).  
> `busRouteType`은 서울 버스 API 자체 코드. ODsay `type`과 **다름**.

---

## 에러 처리

| 상황 | 처리 |
|------|------|
| API 키 미승인 | HTML 404 반환 → `.ok === false` → 502 |
| 정류장/노선 없음 | 빈 배열 (`[]`) 반환, 200 |
| 서비스 오류 | `msgHeader.headerCd !== "0"` → 502 |
