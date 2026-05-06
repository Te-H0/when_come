# 지하철 역명 표시 정규화 (2026-05-06)

## 배경

서울 지하철 도착 API는 일부 역을 별칭으로만 인식한다.
예: 군자역 → `"군자(능동)"` (ODsay 저장값), 서울 지하철 도착 API는 이 문자열로 실제 조회 가능.

BE는 저장 시 ODsay 원본을 그대로 보존하고, 도착 조회 시 다단계 fallback으로 처리한다.
FE는 표시 시점에만 정규화한다.

## formatStationName 적용 원칙

- **파일:** `src/utils/stationName.ts`
- **지하철(`type === 'subway'`)에만 적용.** 버스 정류장은 `"(서울역 앞)"` 같은 부가 정보가 포함될 수 있어 괄호 제거 시 정보 손실 우려.
- **API 호출 인자에 절대 사용 금지.** `fetchArrival`, `getSubwayArrival` 등에는 원본 `stop.name` 사용. BE의 다단계 fallback이 원본 문자열을 기반으로 동작함.
- 표시 전용: 렌더링되는 JSX에서만 사용.

## displayName 필드 전략

`TransitStop` 인터페이스에 `displayName` 필드를 추가하고 `mappers.ts`에서 한 번만 계산한다.
인라인 `formatStationName` 호출을 각 컴포넌트에 분산하지 않는다.

```ts
// mappers.ts — API 응답을 도메인 모델로 변환할 때 한 번만 계산
displayName: stop.stop_type === 'subway'
  ? formatStationName(stop.stop_name)
  : stop.stop_name,
```

`RouteNodeCard`(setup 화면)는 `RouteNode` 타입을 별도로 사용하므로 인라인 적용:
```tsx
{node.type === 'subway' ? formatStationName(node.name) : node.name}
```

### 적용된 표시 위치

| 컴포넌트 | 방식 |
|----------|------|
| `Home.tsx` — 경로 선택 드롭다운 정류장명 | `displayName` 필드 |
| `Home.tsx` — 현재 스텝 카드 헤더 | `displayName` 필드 |
| `Home.tsx` — 다음 스텝 미니카드 | `displayName` 필드 |
| `RouteManagement.tsx` — 경로 상세 정류장명 | `displayName` 필드 |
| `TransitCard.tsx` — 카드 제목 | `displayName` 필드 |
| `RouteNodeCard.tsx` — 등록된 정류장명 | 인라인 (`formatStationName`) |

검색 결과(`SearchResultNode`, `StopPicker`, `PlacePicker`)는 원본 유지 — 사용자가 등록하려는 정류장의 정확한 이름을 확인해야 함.

## "운행 없음" → "도착 정보 없음" 변경

`Home.tsx`의 3곳에서 변경.

### 이유

빈 도착 응답(items 0건)은 다음 여러 케이스를 포함한다:
- 막차 이후
- 배차 지연
- API 인식 실패 (별칭 문제 포함)
- 외부 서비스 일시 장애

이 모두가 외부적으로 동일한 0건 응답으로 나타난다. "운행 없음"은 막차 이후 상황만을 단정짓는 표현으로 다른 케이스에서 오해를 줄 수 있다. "도착 정보 없음"은 원인을 특정하지 않는 더 정확한 표현이다.
