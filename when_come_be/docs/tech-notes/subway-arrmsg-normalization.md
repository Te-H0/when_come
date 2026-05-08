# 지하철 arrmsg 정규화 + headsign 추출 기술 노트

작성일: 2026-05-08  
대상 파일: `supabase/functions/arrival-info/index.ts`

## 배경

서울 지하철 실시간 도착 API(`realtimeStationArrival`)는 다음 두 가지 비일관 문제를 가진다.

1. **arrmsg 비일관 라벨**: `arvlCd` 99(운행중)인 경우 `arvlMsg2`(→ arrmsg1)에 `"[2]번째 전역 (온수)"` 같은 raw 텍스트가 그대로 노출됨. FE 카드 폭 깨짐 + 사용자 혼란.
2. **행선지 정보 분산**: `trainLineNm` 필드에 `"온수행 - 역삼방면"` 형태로 행선지가 있지만 arrmsg에도 괄호 안에 역명이 중복 포함되어 있음. FE에서 통일된 행선지 표시를 위해 파싱이 필요.

## 해결 방법

### 1. `extractHeadsign(trainLineNm, arrmsg1, context?): string | null`

행선지 추출 순수 함수.

```
1차: trainLineNm.match(/^([^\s-]+행)/)
     "온수행 - 인천 급행" → "온수행"
     "광명행"             → "광명행"

2차 (1차 실패 시): arrmsg1.match(/\(([^)]+)\)/)
     "5분 후 (인천)"       → "인천" → "인천행"
     "[2]번째 전역 (온수)" → "온수" → "온수행"
     (이미 "행"으로 끝나면 접미사 중복 추가 안 함)

실패: null + logAnomaly(category: "pattern.unparseable_subway_headsign")
```

### 2. `normalizeArrmsg(arrmsg, context?): { displayMsg, stripped }`

arvlCd 99 fallback용 arrmsg1 패턴 정규화 함수.

```
"[N]번째 전역 (...)" → displayMsg = "N개역 전"
"N분..."  "N초..."   → displayMsg = null  (카운트다운 — FE 그대로)
매칭 실패            → displayMsg = null + logAnomaly(category: "pattern.unparseable_subway_arrmsg")
```

`stripped`: arrmsg에서 `(...)` 괄호 부분을 제거한 순수 텍스트 (현재 BE 응답에는 미포함, 향후 활용 가능).

### 3. `fetchSubwayArrivalRaw` 통합 흐름

```
item.arvlCd → arvlCdToDisplayMsg()  (0~5 기존 매핑)
  성공 → displayMsg 결정
  null → normalizeArrmsg(item.arvlMsg2).displayMsg  (99 fallback)

item.trainLineNm + item.arvlMsg2 → extractHeadsign()  (headsign 결정)
```

## anomaly_logs 활용

두 함수 모두 매칭 실패 시 `logAnomaly` fire-and-forget으로 기록.

| category | detail 필드 |
|----------|------------|
| `pattern.unparseable_subway_headsign` | `trainLineNm`, `arrmsg1`, `lineName` |
| `pattern.unparseable_subway_arrmsg` | `arrmsg1`, `arvlCd`, `lineName`, `trainLineNm` |

source: `"arrival-info"`. INSERT 실패가 메인 응답을 차단하지 않는다.

운영 모니터링에서 새 패턴 발견 시 정규식 확장 또는 `SUBWAY_NAME_OVERRIDES`처럼 테이블화 가능.

## API 응답 계약 변경

`SubwayArrivalItem`에 `headsign: string | null` 추가 (additive). FE 타입은 옵셔널(`headsign?: string | null`)로 선언해 forward-compat 유지. 상세 계약은 `docs/collab-notes.md` 참조.

## 테스트

- `_tests/arrival_normalize_test.ts` — `extractHeadsign`/`normalizeArrmsg` 단위 23케이스
- `_tests/arrival-info_test.ts` — headsign 통합 5케이스 추가 (총 51케이스)
