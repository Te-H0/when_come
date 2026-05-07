# 도착정보 노선 매칭 — 인덱스 → 노선번호 (2026-05-08)

## 증상

저장된 정류장 카드에 표시되는 버스 도착시간이 **다른 노선의 데이터로 잘못 표시**되는 버그. 사용자 보고 패턴:

- 한 정거장 차이의 두 정류장에서 같은 노선 도착시간이 20분 이상 차이 (가리봉파출소 643: 2분48초 vs 디지털단지오거리 643: 22분48초)
- 정류장의 여러 노선이 **초 단위까지 동일한 도착시간** (서대문역 750A/750B/752 모두 "11분53초후 6정거장 전")
- 마지막 정류장에서 "다음 차" 시간이 노선별로 동일 (가리봉 643/651 모두 "13분48초")

## 원인

`when_come_fe/src/lib/arrival.ts`의 `getRawArrmsg`/`getArrivalMin`에서 도착 item을 **`seg.stop.lines` 인덱스로 매칭**하고 있었음:

```ts
// 버그: 인덱스로 매칭
const item = arrival.data.items[idx] ?? arrival.data.items[0]
```

문제 1 — **BE 응답 items 순서가 무보장**:
`when_come_be/supabase/functions/arrival-info/index.ts:426~504`에서 provider별 `Promise.all` 병렬 fetch 결과를 `allItems.push(...result.items)` 순으로 단순 concat. 응답 items 순서는 provider 응답 도착 순서이며 `stop_routes` 순서를 보장하지 않음.

문제 2 — **외부 API가 정류장 전체 노선 반환**:
서울 버스 `getStationByUid`, ODsay `realtimeStation` 등은 정류장의 모든 노선을 반환. 사용자가 저장하지 않은 노선까지 items에 섞여 들어와서, idx=0이 사용자가 저장한 첫 노선이 아닐 수 있음.

문제 3 — **인덱스 어긋남으로 같은 item이 여러 카드에 매핑**:
items 길이가 stop.lines보다 짧으면 `?? items[0]` 폴백으로 모든 카드가 items[0]을 가리킴. 같은 item이라 카운트다운에서 동일 elapsedSec 차감 후 **초 단위까지 동일한 표시**.

지하철은 `matchSubwayItems(items, line, direction)`로 호선+방향 매칭이라 영향 없음. ODsay 케이스는 이미 `routeName === line` 매칭이 일부 적용되어 있었으나 `?? items[idx]` fallback이 남아 있었음.

## 수정

매칭 키를 인덱스 → 노선번호(`busRouteAbrv` / `routeName`)로 전환.

```ts
// 수정 후
function matchBusItem<T extends { busRouteAbrv: string; traTime1: number | null }>(
  items: T[],
  line: string,
): T | null {
  const matched = items.filter(
    i => i.busRouteAbrv === line || i.busRouteAbrv.replace(/번$/, '') === line,
  )
  if (matched.length === 0) return null
  if (matched.length === 1) return matched[0]
  return matched.reduce((best, cur) => {
    const bestT = best.traTime1 ?? Infinity
    const curT = cur.traTime1 ?? Infinity
    return curT < bestT ? cur : best
  })
}
```

### 매칭 규칙

| 케이스 | 매칭 키 | 비고 |
|--------|---------|------|
| `subway` | `lineName` + `direction` | 기존 `matchSubwayItems` 유지 |
| `odsay` | `routeName === line` | fallback `items[idx]` 제거 |
| `bus` (legacy) | `routeName === line` | |
| `bus_by_stopid` (신 경로) | `busRouteAbrv === line` 또는 `busRouteAbrv.replace(/번$/, '') === line` | "643" / "643번" 둘 다 대응 |

### 중복 노선번호 처리

서울/경기 경계 지역에서 동일 번호 노선이 존재할 가능성을 고려해, `find` → `filter` 후 `traTime1` 최솟값 채택. 단일 매칭이면 즉시 반환.

### `idx` 파라미터 제거

`getArrivalDisplay`, `getArrivalDisplay2`, `getArrivalMin`, `getRawArrmsg`의 시그니처에서 `idx: number` 제거. 호출부 `Home.tsx:549, 550, 553, 869, 870`도 함께 정리. 매개변수가 남아 있으면 향후 인덱스 기반 로직 재도입 실수 유발 가능.

## 회귀 방지

- `getFastestArrivalText` (Home.tsx)는 이미 동일한 매칭 패턴이라 영향 없음
- 매칭 실패 시 `null` 반환 → "도착 정보 없음" 표시 (기존 `?? items[0]` 폴백은 잘못된 데이터 표시의 원흉이라 제거)
- 미적용 항목: vitest 도입 후 `arrival.ts` 단위 테스트 1순위 (백로그)

## 영향 범위

이 버그는 버스 카드 전체에 영향. 다음 사용자 보고 케이스의 근본 원인일 가능성:
- "도착시간이 갑자기 안 맞음"
- "여러 노선 도착시간이 똑같이 표시됨"
- "특정 노선만 항상 이상한 시간이 나옴"

지하철은 영향 없음.
