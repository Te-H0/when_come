# 프론트-백 협업 노트

> API 스펙(요청/응답 구조, 엔드포인트) 변경 시 즉시 여기에 추가.

## 규칙
- 변경일, 변경 내용, 영향받는 프론트 컴포넌트를 함께 기록
- 파괴적 변경(breaking change)은 `[BREAKING]` 태그 필수

## 변경 이력
<!-- 형식: YYYY-MM-DD | 엔드포인트 | 변경 내용 | 담당자 -->

### 2026-04-19 | GET /arrival-info?type=bus | stationName 파라미터 추가

**배경:** ODsay 커버리지 없는 정류장(개봉역 등)에서 도착 정보 "--" 표시 이슈

**변경 내용:**
`type=bus` 에서 `stId+ord` 없이 `busRouteId+stationName` 만으로 호출 가능하도록 확장.
백엔드가 서울 버스 API `getRouteAllStaionList` 로 stId/ord를 내부 조회 후 도착정보 반환.

**파라미터 옵션 (둘 중 하나):**

| 방식 | 파라미터 |
|------|---------|
| 기존 (직접) | `busRouteId` + `stId` + `ord` |
| 신규 (이름 조회) | `busRouteId` + `stationName` |

**요청 예시:**
```
GET /arrival-info?type=bus&busRouteId=100100643&stationName=개봉역
```

**에러 케이스:**
- `busRouteId` 누락 → 400
- `stId+ord`, `stationName` 모두 누락 → 400
- 해당 노선에 정류장 없음 → 404 `{ error: "해당 노선에서 정류장을 찾을 수 없습니다" }`
- 서울 버스 API 오류 → 502

---

### 2026-04-19 | POST /route-search | `busType` 필드 추가

**변경 내용:**
`segments[].lines[]`에 `busType: number | null` 필드 추가.
ODsay `lane[].type` 코드를 그대로 전달. 버스 구간에서만 값 있음, 지하철은 `null`.

**응답 예시:**
```json
{
  "segments": [{
    "type": "bus",
    "lines": [{
      "routeName": "643",
      "busRouteId": "100100643",
      "busType": 2,
      "subwayCode": null
    }]
  }]
}
```

**busType 코드표:**

| 값 | 의미 | 색상 |
|----|------|------|
| `1` | 간선버스 | 파랑 |
| `2` | 지선버스 | 초록 |
| `3` | 순환버스 | 노랑 |
| `4` | 광역버스 | 빨강 |
| `5` | 공항버스 | 회색 |
| `6` | 마을버스 | 연두 |
| `null` | 지하철 구간 또는 ODsay 미제공 | — |

→ `getBusType()` 번호 추론 대신 이 값으로 교체 권장. 상세 코드 매핑은 `docs/api-reference.md` 4-1절 참고.
