# API 계약 — `GET /arrival-info`

- **상태:** 변경 예정 (multi-region-bus-arrival 적용 시)
- **작성일:** 2026-05-02
- **관련:** `docs/specs/multi-region-bus-arrival/SDD.md`, `docs/collab-notes.md`

---

## 0. 변경 요약 (2026-05-02)

기존 `?type=bus&busRouteId=...&arsId=...` 단일 경로에서 **`?stopId={uuid}` 기반 BE 분기**로 전환. provider(서울/경기/ODsay) 라우팅을 BE가 DB의 `route_stops.provider`를 기준으로 수행.

| 변경 | 종류 | Breaking? |
|------|------|-----------|
| `?stopId` 신규 입력 | 추가 | No (additive) |
| `?type=bus&arsId&busRouteId` legacy | 한 사이클 호환 후 제거 | 향후 Breaking 예고 |
| 응답 스키마 `provider`, `fetchedAt` 추가 | 추가 (옵셔널) | No |
| `items[]`에 `remainSeatCnt`/`crowded`/`lowPlate` 추가 | 추가 (옵셔널) | No |

---

## 1. 엔드포인트

```
GET /arrival-info?stopId={uuid}                                 ← 신 (권장)
GET /arrival-info?type=bus&busRouteId={id}&arsId={arsId}        ← legacy (한 사이클 호환)
GET /arrival-info?type=subway&stationName={name}                ← 변경 없음
GET /arrival-info?type=odsay&stationId={odsayId}                ← 변경 없음
```

### 1.1 인증

- 신 경로(`?stopId`)는 **인증 필수** (Bearer JWT). stop 소유권 검증 — 다른 사용자의 stopId는 404.
- legacy 경로는 변경 없음 (현재 인증 없음 → 그대로 유지하되 한 사이클 후 제거 시 인증 통합).

---

## 2. 입력

### 2.1 신 경로 (`?stopId`)

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|-----|------|
| `stopId` | uuid | Y | `route_stops.id` |

### 2.2 Legacy `type=bus`

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|-----|------|
| `type` | `'bus'` | Y | |
| `arsId` | string | Y | 서울 5자리 |
| `busRouteId` | string | N | 단일 노선 필터링 |

### 2.3 Legacy `type=subway`

변경 없음 (route-direction SDD 참고).

### 2.4 Legacy `type=odsay`

변경 없음.

---

## 3. 응답

### 3.1 200 OK — `BusArrivalResponse` (모든 버스 경로 공통)

```ts
interface BusArrivalResponse {
  items: BusArrivalItem[]
  provider: 'seoul' | 'gyeonggi' | 'odsay_fallback'  // 신규
  fetchedAt: string                                  // 신규 (ISO 8601)
}

interface BusArrivalItem {
  busRouteId: string         // provider별 routeId (서울 100100643, 경기 234000016)
  busRouteAbrv: string       // 노선 약칭 ("11", "643")
  arrmsg1: string            // "3분후[2번째 전]" / "곧 도착" / "운행종료" / "정보없음"
  arrmsg2: string | null     // 두 번째 차량
  traTime1: number | null    // 초 (없으면 null)
  traTime2: number | null
  busType: number | null     // 보존만 (서울 busRouteType / GBIS routeTypeCd)
  // 신규 옵셔널 (GBIS 한정)
  remainSeatCnt1?: number | null   // 잔여좌석 (-1 → null)
  remainSeatCnt2?: number | null
  crowded1?: 1 | 2 | 3 | 4 | null  // 1여유/2보통/3혼잡/4매우혼잡
  crowded2?: 1 | 2 | 3 | 4 | null
  lowPlate1?: 0 | 1 | 2 | null     // 0일반/1저상/2이층
  lowPlate2?: 0 | 1 | 2 | null
}
```

### 3.2 응답 예시 — 서울 (provider='seoul')

```json
{
  "items": [
    {
      "busRouteId": "100100643",
      "busRouteAbrv": "643",
      "arrmsg1": "3분50초후[1번째 전]",
      "arrmsg2": "13분후[6번째 전]",
      "traTime1": 230,
      "traTime2": 813,
      "busType": 12
    }
  ],
  "provider": "seoul",
  "fetchedAt": "2026-05-02T13:14:15.123Z"
}
```

### 3.3 응답 예시 — 경기 (provider='gyeonggi')

```json
{
  "items": [
    {
      "busRouteId": "234000016",
      "busRouteAbrv": "11",
      "arrmsg1": "3분후[2번째 전]",
      "arrmsg2": "12분후[8번째 전]",
      "traTime1": 180,
      "traTime2": 720,
      "busType": 13,
      "remainSeatCnt1": null,
      "remainSeatCnt2": null,
      "crowded1": 2,
      "crowded2": 3,
      "lowPlate1": 1,
      "lowPlate2": 0
    }
  ],
  "provider": "gyeonggi",
  "fetchedAt": "2026-05-02T13:14:16.456Z"
}
```

### 3.4 응답 예시 — fallback (provider='odsay_fallback')

```json
{
  "items": [
    {
      "busRouteId": "100100096",
      "busRouteAbrv": "96",
      "arrmsg1": "3분후",
      "arrmsg2": "15분후",
      "traTime1": 180,
      "traTime2": 900,
      "busType": 2
    }
  ],
  "provider": "odsay_fallback",
  "fetchedAt": "2026-05-02T13:14:17.789Z"
}
```

> ODsay realtimeStation은 분 단위만 제공 → traTime은 분*60으로 합성. 정확도 한계 존재.

---

## 4. 에러

| HTTP | 케이스 | 응답 |
|------|--------|------|
| 400 | `stopId` 형식 잘못 / `type=bus`인데 `arsId` 누락 | `{ error: 'INVALID_REQUEST', message: '...' }` |
| 401 | 신 경로(`?stopId`)에서 인증 헤더 없음 | `{ error: 'UNAUTHORIZED' }` |
| 404 | stopId가 사용자 소유 아님 / 존재 안 함 | `{ error: 'NOT_FOUND' }` |
| 502 | 외부 API HTTP 오류 / GBIS 데이터셋 미승인 | `{ error: 'BAD_GATEWAY', source: 'seoul' \| 'gyeonggi' \| 'odsay' }` |

> 외부 API의 "결과 없음"(`resultCode=4`, `-98`/`-99`)은 200 + `items: []`로 응답.

---

## 5. 구현 메모

- BE 라우터는 `stopId` → DB → `provider` 컬럼 분기.
- provider 결정 후 `ArrivalProvider.fetchArrivals()` 호출 (SDD §2 인터페이스).
- 단일 노선 카드는 BE가 응답 items를 `gbis_route_id`/`busRouteId`로 client-side 필터.
- 캐시(60초, Deno KV) 도입은 후속 PR.

---

## 6. FE 호출 예시

```ts
// 신 경로 (권장)
const res = await api.get(`/arrival-info?stopId=${stop.id}`, { auth: true })

// legacy (한 사이클 호환)
const res = await api.get(`/arrival-info?type=bus&arsId=${stop.arsId}&busRouteId=${routeId}`)
```

응답 처리:

```ts
if (res.provider === 'odsay_fallback') {
  // inline 안내 UI 노출
}
```

---

## 7. 변경 이력

- 2026-05-02 — 신 `?stopId` 입력 추가, 응답에 `provider`/`fetchedAt`/옵셔널 GBIS 필드 추가. legacy 경로 한 사이클 호환 후 제거 예고.
- 2026-04-21 — `type=bus`에서 `stationName` 제거, `arsId` 방식 추가 [BREAKING]
