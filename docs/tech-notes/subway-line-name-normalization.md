# 지하철 노선명 정규화 정책

날짜: 2026-05-09

## 배경

ODsay API는 노선 이름을 "수도권 1호선", "수도권 4호선" 형태로 반환한다.
BE는 ODsay 원본 그대로 `favorite_stop_routes.route_name`에 저장한다.
서울 지하철 도착 API(`arrival-info`)는 `lineName` 코드("1001" 등)를 반환하며,
`subwayApiCodeToLineName`은 이를 "1호선" 형태로 변환한다.

결과적으로 FE `matchSubwayItems`에서 `"수도권 1호선" === "1호선"` 비교가 false가 되어
즐겨찾기 지하철 stop이 항상 "도착 정보 없음"으로 표시되는 버그가 발생했다.

## 결정

**BE는 ODsay 원본을 보존한다.** 저장 시점에 정규화하면 향후 ODsay API 변경 시 원본 추적이 불가능해진다.

**FE는 표시/매칭 시점에만 `normalizeSubwayLineName`으로 정규화한다.**

```ts
// src/utils/transitColors.ts
export function normalizeSubwayLineName(label: string): string {
  return label.replace(/^(수도권|경기|인천|부산|대구|광주|대전)\s+/, '')
}
```

- 정규식은 지역명 + 공백(필수)으로만 매칭 → "수인분당선", "신분당선" 등 공백 없는 이름은 보존
- "수도권 1호선" → "1호선", "신분당선" → "신분당선" (idempotent)

## 적용 위치

| 위치 | 역할 |
|------|------|
| `arrival.ts matchSubwayItems` | `line` 인자를 normalize 후 `subwayApiCodeToLineName` 결과와 비교 |
| `Favorites.tsx` 노선 루프 | `displayLine = normalizeSubwayLineName(line)`으로 라벨 표시 및 `getSubwayColor` 조회 |
