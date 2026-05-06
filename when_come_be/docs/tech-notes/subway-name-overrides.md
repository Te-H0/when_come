# 서울 지하철 도착 API — 역명 별칭 등록 패턴

작성일: 2026-05-06  
갱신일: 2026-05-06 (다단계 fallback 알고리즘 도입)

## 배경

서울 지하철 실시간 도착 API (`swopenapi.seoul.go.kr/api/subway/.../realtimeStationArrival/0/30/{역명}`)는
역명 색인을 서울교통공사 자체 기준으로 관리한다. ODsay/일반 검색 API의 표기와 다른 경우가 있다.

## 군자역 발견 과정

실측 결과:

```
curl http://swopenapi.seoul.go.kr/api/subway/{KEY}/json/realtimeStationArrival/0/30/군자
→ 0건 ("STATUS": 429 INFO_NORESULT 또는 빈 realtimeArrivalList)

curl http://swopenapi.seoul.go.kr/api/subway/{KEY}/json/realtimeStationArrival/0/30/군자(능동)
→ 8건 (5호선 4건, 7호선 4건)
```

서울교통공사가 도착 API에서 "군자"역을 "군자(능동)"으로 색인한 것이 원인.
ODsay `searchStation`은 "군자"로 반환하므로 BE에서 매핑 책임.

## 다단계 fallback 알고리즘 (2026-05-06~)

기존 단일 정규화(`normalizeSubwayStationName`)를 두 함수로 분리하고 호출 흐름을 다단계로 확장했다.

### 함수 분리

```ts
// 알려진 별칭 매핑. 모르는 역은 원본 그대로 반환.
export function applySubwayNameOverride(stationName: string): string

// 호선 표기 괄호("강남역 (2호선)")와 "역" 접미사 제거. 표시·검색 fallback용.
export function stripSubwayNameDecorations(stationName: string): string
```

### getSubwayArrival 호출 흐름

```
입력: stationName
  ↓
1차: applySubwayNameOverride(stationName) → primary
     fetchSubwayArrivalRaw(primary)
     → 1건 이상이면 즉시 반환 (예: "군자" → "군자(능동)" → 8건)

2차 (1차 0건인 경우):
     stripped = stripSubwayNameDecorations(primary)
     fallback = applySubwayNameOverride(stripped)
     fallback !== primary이면 fetchSubwayArrivalRaw(fallback)
     → 1건 이상이면 반환 (예: "강남역(2호선)" → 1차 0건 → 2차 "강남" → 4건)

전 fallback 실패:
     console.warn("[subway-arrival] no result after fallback: ...")
     return []
```

### 2차 호출 skip 조건

`fallback === primary`인 경우 동일 명칭으로 다시 호출해도 결과가 같으므로 skip한다.

예: `"존재안함"` 입력 → primary = "존재안함", stripped = "존재안함", fallback = "존재안함" → skip → fetch 1회.

## SUBWAY_NAME_OVERRIDES 맵

```ts
const SUBWAY_NAME_OVERRIDES: Record<string, string> = {
  "군자": "군자(능동)",
  "군자역": "군자(능동)",
  "군자(능동)": "군자(능동)",
}
```

### OVERRIDES 등록 가이드

새 별칭이 발견되면 다음 3가지 키 변형을 모두 등록한다:

| 키 변형 | 예시 | 이유 |
|---------|------|------|
| 정식명 | `"군자"` | ODsay가 반환하는 기본 형태 |
| 정식명+역 | `"군자역"` | stop_name에 "역" 접미사가 붙은 경우 1차에서 직접 처리 → fetch 1회 |
| API 등록명 자체 | `"군자(능동)"` | strip 후에도 OVERRIDES가 안전망으로 작동하도록 |

이 세 가지를 모두 등록하면 어떤 입력 형태에서도 1차에서 바로 처리되어 fetch 1회로 끝난다.

### 2차 fallback 동작 설명

1차 miss(0건) → `stripSubwayNameDecorations(primary)` → `applySubwayNameOverride(stripped)` 순으로 재시도한다.

"군자(능동)"이 OVERRIDES에 등록되어 있어야 하는 이유: `stripSubwayNameDecorations("군자(능동)")` → `"군자"` → `applySubwayNameOverride("군자")` → `"군자(능동)"` 경로가 작동한다. 만약 `"군자(능동)"` 키가 없더라도 `"군자"` 키가 있으면 2차에서 처리된다. 하지만 `"군자(능동)"` 자체를 입력받은 경우에는 strip 전에도 이미 일치해야 하므로 직접 등록이 필요하다.

## 유사 케이스 추가 방법

운영 중 도착 결과 0건이 반복되는 역이 발견되면:

1. 서울 지하철 도착 API에 직접 curl해서 실제 등록명 확인
2. `SUBWAY_NAME_OVERRIDES`에 다음 3가지 키를 모두 추가
   - `"역명"` (ODsay 표준 표기)
   - `"역명역"` (stop_name에 "역" 접미사 포함 케이스)
   - `"역명(API등록명)"` (API 실제 등록명이 괄호 포함인 경우)
3. `arrival-info_test.ts`에 `applySubwayNameOverride` 단위 케이스 추가 (3가지 키 모두)
4. 통합 테스트에 fetch 횟수 1회 검증 케이스 추가

알려진 잠재 후보: 병점(세마), 이름이 변경되거나 병기 표기가 있는 역.

## 운영 모니터링

0건 fallback 실패 시 다음 로그가 출력된다.

```
[subway-arrival] no result after fallback: input="..." primary="..." fallback="..."
```

Edge Function 로그에서 `[subway-arrival] no result after fallback` 키워드를 검색하면 신규 별칭 케이스를 발견할 수 있다.

신규 별칭 발견 즉시 위 OVERRIDES 등록 가이드에 따라 3가지 키 변형 모두 등록할 것.

## 왜 0건일 때 오류가 아닌 빈 배열 반환인가

서울 지하철 도착 API는 (1) 막차 후/지연/장애로 운행이 없는 경우와 (2) 역명 매핑 실패 모두 동일하게 `realtimeArrivalList`를 비우거나 누락시킨다. 외부 응답상 두 케이스를 구분할 수 없으므로 단정적인 "운행 없음" 에러를 던지지 않는다. FE는 0건 응답을 "도착 정보 없음"으로 표시하여 "운행 없음"과 혼동을 피한다.
