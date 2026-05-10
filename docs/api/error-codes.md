# Error Code 카탈로그

> 단일 진실: BE `_shared/errorCodes.ts` (구현 단계 Phase 1에서 생성).
> 이 문서는 인간 가독용 카탈로그. FE 매핑 테이블 작성 시 참고.
>
> 정책: [ADR-002](../decisions/ADR-002-error-handling.md)
> 컨벤션: [.claude/rules/error-handling.md](../../.claude/rules/error-handling.md)

---

## 응답 포맷

```json
{
  "error": {
    "code": "ROUTE_NAME_REQUIRED",
    "message": "경로 이름이 필요합니다",
    "detail": "name field is empty (optional)"
  }
}
```

- `code`: 기계 분기용 ID. 대문자 SCREAMING_SNAKE_CASE.
- `message`: 사람이 읽는 디버그/dev 토스트 fallback. 운영에서는 마스킹될 수 있음.
- `detail`: 옵션. 디버깅 컨텍스트(필드명, 외부 API status 등). 운영에서 마스킹.

---

## 도메인별 카탈로그

### COMMON_* — 횡단 공통

| Code | Status | 의미 | FE 권장 메시지 |
|------|--------|------|--------------|
| `COMMON_INVALID_JSON` | 400 | 요청 본문이 유효한 JSON이 아님 | "요청 형식이 잘못되었습니다" |
| `COMMON_METHOD_NOT_ALLOWED` | 405 | 지원하지 않는 HTTP 메서드 | "지원하지 않는 요청입니다" |
| `COMMON_INTERNAL_ERROR` | 500 | unhandled 예외 (운영 마스킹용) | "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" |
| `COMMON_BAD_REQUEST` | 400 | 운영 환경에서 code 없는 4xx 마스킹용 | "요청을 처리할 수 없습니다" |

### AUTH_* — 인증/권한

| Code | Status | 의미 | FE 권장 메시지 |
|------|--------|------|--------------|
| `AUTH_REQUIRED` | 401 | JWT 누락 또는 Bearer 형식 아님 | "로그인이 필요합니다" |
| `AUTH_INVALID` | 401 | JWT 만료 또는 검증 실패 | "세션이 만료되었습니다. 다시 로그인해 주세요" |
| `AUTH_FORBIDDEN` | 403 | 본인 소유가 아닌 리소스 접근 | "권한이 없습니다" |

> 현재 `auth.ts`는 `AppError("UNAUTHORIZED", 401)` — message에 코드를 넣은 legacy 형태. Phase 1에서 `AUTH_REQUIRED` / `AUTH_INVALID`로 분리.

### ROUTE_* — 사용자 경로 (`routes` 함수)

| Code | Status | 의미 | FE 권장 메시지 |
|------|--------|------|--------------|
| `ROUTE_NAME_REQUIRED` | 400 | name/originName/destinationName 누락 또는 빈 문자열 | "경로 이름과 출발/도착지가 필요합니다" |
| `ROUTE_STOPS_REQUIRED` | 400 | stops 배열 비었거나 누락 | "정류장이 최소 1개 이상 필요합니다" |
| `ROUTE_INVALID_STOP_TYPE` | 400 | stopType이 'bus'/'subway' 아님 | "정류장 종류가 올바르지 않습니다" |
| `ROUTE_INVALID_STEP_GROUP` | 400 | stepGroup이 1 미만 또는 비정수 | "스텝 번호가 올바르지 않습니다" |
| `ROUTE_STEP_GROUP_OVERFLOW` | 400 | 한 stepGroup 정류장 3개 이상 | "한 스텝당 최대 2개 정류장입니다" |
| `ROUTE_STOP_TYPE_MIXED` | 400 | 같은 stepGroup에 bus+subway 혼합 | "같은 스텝의 정류장은 동일한 타입이어야 합니다" |
| `ROUTE_NAME_EMPTY` | 400 | PATCH 시 name 빈 문자열 | "경로 이름이 비어 있습니다" |
| `ROUTE_DISPLAY_ORDER_NEGATIVE` | 400 | PATCH displayOrder < 0 | "정렬 값이 올바르지 않습니다" |
| `ROUTE_ACTIVE_INVALID` | 400 | PATCH active가 boolean 아님 | "활성 상태 값이 올바르지 않습니다" |
| `ROUTE_PATCH_NO_FIELDS` | 400 | PATCH 시 수정 필드 0개 | "수정할 항목이 없습니다" |
| `ROUTE_NOT_FOUND` | 404 | 본인 소유 경로 없음 | "경로를 찾을 수 없습니다" |
| `ROUTE_PERSIST_FAILED` | 500 | DB INSERT/UPDATE 실패 | "경로 저장에 실패했습니다" |
| `ROUTE_DELETE_FAILED` | 500 | DB DELETE 실패 | "경로 삭제에 실패했습니다" |
| `ROUTE_STOPS_PERSIST_FAILED` | 500 | route_stops INSERT 실패 | "정류장 저장에 실패했습니다" |
| `ROUTE_STOP_ROUTES_PERSIST_FAILED` | 500 | stop_routes INSERT 실패 | "노선 저장에 실패했습니다" |
| `ROUTE_STOP_MAPPING_MISMATCH` | 500 | 내부 매핑 불일치 (sequence 매칭 실패) | "내부 오류" + 모니터링 알림 |
| `ROUTE_QUERY_FAILED` | 500 | DB 경로 목록 조회 실패 | "경로 목록을 불러오지 못했습니다" |
| `ROUTE_UPDATE_FAILED` | 500 | DB UPDATE 실패 (PATCH 단순 필드) | "경로 수정에 실패했습니다" |

### ROUTE_STOP_* — 경로 내 정류장 (`route-stops` 함수)

| Code | Status | 의미 | FE 권장 메시지 |
|------|--------|------|--------------|
| `ROUTE_STOP_ALIAS_TOO_LONG` | 400 | alias 20자 초과 | "별명은 20자 이내로 입력해 주세요" |
| `ROUTE_STOP_NOT_FOUND` | 404 | route_stop 없음 또는 RLS 권한 거부 | "정류장을 찾을 수 없습니다" |
| `ROUTE_STOP_UPDATE_FAILED` | 500 | UPDATE 실패 | "정류장 수정에 실패했습니다" |

### FAVORITE_* — 즐겨찾기 (`favorite-stops` 함수)

| Code | Status | 의미 | FE 권장 메시지 |
|------|--------|------|--------------|
| `FAVORITE_STOP_ID_REQUIRED` | 400 | odsayStopId 누락 | "정류장 정보가 누락되었습니다" |
| `FAVORITE_STOP_NAME_REQUIRED` | 400 | stopName 누락 | "정류장 이름이 필요합니다" |
| `FAVORITE_INVALID_STOP_TYPE` | 400 | stopType이 'bus'/'subway' 아님 | "정류장 종류가 올바르지 않습니다" |
| `FAVORITE_ROUTES_REQUIRED` | 400 | routes 배열 비었거나 누락 (이미 코드에 존재) | "노선을 1개 이상 선택해 주세요" |
| `FAVORITE_ALIAS_TOO_LONG` | 400 | alias 20자 초과 | "별명은 20자 이내로 입력해 주세요" |
| `FAVORITE_DISPLAY_ORDER_NEGATIVE` | 400 | displayOrder < 0 | "정렬 값이 올바르지 않습니다" |
| `FAVORITE_NOT_FOUND` | 404 | 본인 소유 즐겨찾기 없음 | "즐겨찾기를 찾을 수 없습니다" |
| `FAVORITE_PERSIST_FAILED` | 500 | favorite_stops INSERT/UPDATE 실패 | "즐겨찾기 저장에 실패했습니다" |
| `FAVORITE_ROUTES_PERSIST_FAILED` | 500 | favorite_stop_routes INSERT 실패 | "노선 저장에 실패했습니다" |
| `FAVORITE_DELETE_FAILED` | 500 | DELETE 실패 | "즐겨찾기 삭제에 실패했습니다" |
| `FAVORITE_FETCH_AFTER_WRITE_FAILED` | 500 | INSERT/UPDATE 후 재조회 실패 | "처리 후 조회에 실패했습니다" |
| `FAVORITE_QUERY_FAILED` | 500 | DB 즐겨찾기 목록 조회 실패 | "즐겨찾기 목록을 불러오지 못했습니다" |
| `FAVORITE_ROUTES_DELETE_FAILED` | 500 | favorite_stop_routes DELETE 실패 | "노선 삭제에 실패했습니다" |

### ARRIVAL_* — 실시간 도착 (`arrival-info` 함수)

> 이미 코드에 5개 존재. union 그대로 유지.

| Code | Status | 의미 | FE 권장 메시지 |
|------|--------|------|--------------|
| `ARRIVAL_STOP_NOT_FOUND` | 404 | stopId(uuid) 매칭되는 route_stop/favorite_stop 없음 | "정류장 정보를 찾을 수 없습니다" |
| `ARRIVAL_UNSUPPORTED_REGION` | 400 | 좌표가 지원 region 아님 (서울/경기 외) | "현재 지원하지 않는 지역입니다" |
| `ARRIVAL_MAPPING_FAILED` | 500 | ODsay→GBIS 매핑 실패 | "도착 정보를 가져오지 못했습니다" |
| `ARRIVAL_VERIFY_FAILED` | 500 | GBIS 매핑 검증 실패 | "도착 정보 검증에 실패했습니다" |
| `ARRIVAL_PROVIDER_ERROR` | 502 | 외부 도착 API HTTP 오류 | "도착 정보 서비스가 일시적으로 불안정합니다" |
| `ARRIVAL_PARAMS_INVALID` | 400 | type/stopId/stationName 등 파라미터 누락 (신규) | "조회 파라미터가 잘못되었습니다" |
| `ARRIVAL_SUBWAY_CODE_INVALID` | 400 | subwayCode가 `/^10\d{2}$/` 패턴 아님 (신규) | "지하철 노선 코드가 올바르지 않습니다" |
| `ARRIVAL_DB_ROW_INVALID` | 500 | route_stops/favorite_stops DB row가 예상 형식이 아님 (타입 가드 실패) | "도착 정보를 가져오지 못했습니다" |

### STOP_* — 정류장/노선 검색 (`search-stops`, `stop-buses` 함수)

| Code | Status | 의미 | FE 권장 메시지 |
|------|--------|------|--------------|
| `STOP_QUERY_REQUIRED` | 400 | q/arsId 등 검색 파라미터 누락 | "검색어를 입력해 주세요" |
| `STOP_NOT_FOUND` | 404 | arsId에 해당하는 정류장 없음 | "정류장을 찾을 수 없습니다" |
| `STOP_PROVIDER_ERROR` | 502 | 외부 정류장 API 오류 | "정류장 검색 서비스가 일시적으로 불안정합니다" |

### SUBWAY_* — 지하철 부가정보 (`subway-station-directions` 함수)

| Code | Status | 의미 | FE 권장 메시지 |
|------|--------|------|--------------|
| `SUBWAY_STATION_ID_REQUIRED` | 400 | stationId 쿼리 누락 | "역 정보가 누락되었습니다" |
| `SUBWAY_STATION_NOT_FOUND` | 404 | ODsay에 해당 stationId 없음 | "역 정보를 찾을 수 없습니다" |
| `SUBWAY_PROVIDER_ERROR` | 502 | ODsay subwayStationInfo 오류 | "지하철 정보 조회에 실패했습니다" |

### ROUTE_SEARCH_* — 경로탐색 (`route-search` 함수)

| Code | Status | 의미 | FE 권장 메시지 |
|------|--------|------|--------------|
| `ROUTE_SEARCH_COORDS_REQUIRED` | 400 | startX/startY/endX/endY 누락 | "출발/도착 좌표가 필요합니다" |
| `ROUTE_SEARCH_NO_RESULT` | 404 | ODsay 0건 응답 | "경로를 찾지 못했습니다" |
| `ROUTE_SEARCH_PROVIDER_ERROR` | 502 | ODsay searchPubTransPath 오류 | "경로탐색 서비스가 일시적으로 불안정합니다" |

### PLACE_* — 장소 검색 (`place-search` 함수)

| Code | Status | 의미 | FE 권장 메시지 |
|------|--------|------|--------------|
| `PLACE_QUERY_REQUIRED` | 400 | q 누락 | "검색어를 입력해 주세요" |
| `PLACE_PROVIDER_ERROR` | 502 | 네이버지도/ODsay 오류 | "장소 검색 서비스가 일시적으로 불안정합니다" |

### SYNC_* — 운영 cron (`sync-gbis-stations` 함수)

> 운영 함수. 사용자 메시지는 불필요(GitHub Actions 로그 + anomaly_logs로만 추적).

| Code | Status | 의미 |
|------|--------|------|
| `SYNC_FORBIDDEN` | 403 | service role key 없음 |
| `SYNC_PROVIDER_ERROR` | 502 | 경기 OpenAPI 오류 |
| `SYNC_PERSIST_FAILED` | 500 | upsert 실패 |
| `SYNC_PARAMS_INVALID` | 400 | sigun_nm/pSize/sigun_nm_in 파라미터 검증 실패 |

---

## FE 매핑 테이블 (구현 시 참고)

`src/lib/errorMessages.ts` (Phase 2에서 작성):

```typescript
import type { ErrorCode } from '@/types/errorCodes'

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  COMMON_INVALID_JSON: '요청 형식이 잘못되었습니다',
  COMMON_METHOD_NOT_ALLOWED: '지원하지 않는 요청입니다',
  COMMON_INTERNAL_ERROR: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요',
  // ... 위 표 그대로
}

export function lookupMessage(code: string, fallback: string): string {
  return (ERROR_MESSAGES as Record<string, string>)[code] ?? fallback
}
```

---

## 신규 코드 추가 절차

1. BE `_shared/errorCodes.ts`의 도메인 union에 literal 추가
2. 이 문서(`docs/api/error-codes.md`) 도메인 섹션 표에 행 추가
3. BE 함수에서 `throw new AppError("...", status, "NEW_CODE" satisfies XxxErrorCode)` 호출
4. (필요 시) FE `src/lib/errorMessages.ts` 매핑 추가
5. (필요 시) FE catch 분기 추가

새 도메인 prefix가 등장하면 ADR-002 §4.2 prefix 표도 갱신.

---

## 참고: code 없는 응답 (legacy / 마이그레이션 잔재)

운영 환경에서 code 없는 4xx 응답을 만나면:
- BE 응답: `{ error: { code: "COMMON_BAD_REQUEST", message: "요청을 처리할 수 없습니다" } }` (Phase 1에서 `errorResponse`가 자동 마스킹)
- dev/스테이징: `{ error: "원본 메시지" }` legacy 포맷 유지 — FE `apiFetch`가 `code: "UNKNOWN"`으로 처리.

이는 마이그레이션 도중 일시적으로만 허용되며, 모든 함수 catch가 code 부여를 마치면 해당 경로는 사실상 dead code가 된다.
