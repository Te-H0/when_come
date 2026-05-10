/**
 * FE 에러 코드 타입 (BE `_shared/errorCodes.ts` 거울복사)
 *
 * 단일 진실: BE `when_come_be/supabase/functions/_shared/errorCodes.ts`
 * BE에 코드 추가 시 이 파일도 수동 동기화 필요.
 *
 * 정책: ADR-002 §4.1~§4.2
 * 카탈로그: docs/api/error-codes.md
 */

// ─── COMMON_* — 횡단 공통 ────────────────────────────────────────────────────
export type CommonErrorCode =
  | 'COMMON_INVALID_JSON'
  | 'COMMON_METHOD_NOT_ALLOWED'
  | 'COMMON_INTERNAL_ERROR'
  | 'COMMON_BAD_REQUEST'

// ─── AUTH_* — 인증/권한 ───────────────────────────────────────────────────────
export type AuthErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_FORBIDDEN'

// ─── ROUTE_* — 사용자 경로 (`routes` 함수) ────────────────────────────────────
export type RouteErrorCode =
  | 'ROUTE_NAME_REQUIRED'
  | 'ROUTE_STOPS_REQUIRED'
  | 'ROUTE_INVALID_STOP_TYPE'
  | 'ROUTE_INVALID_STEP_GROUP'
  | 'ROUTE_STEP_GROUP_OVERFLOW'
  | 'ROUTE_STOP_TYPE_MIXED'
  | 'ROUTE_NAME_EMPTY'
  | 'ROUTE_DISPLAY_ORDER_NEGATIVE'
  | 'ROUTE_ACTIVE_INVALID'
  | 'ROUTE_PATCH_NO_FIELDS'
  | 'ROUTE_NOT_FOUND'
  | 'ROUTE_PERSIST_FAILED'
  | 'ROUTE_DELETE_FAILED'
  | 'ROUTE_STOPS_PERSIST_FAILED'
  | 'ROUTE_STOP_ROUTES_PERSIST_FAILED'
  | 'ROUTE_STOP_MAPPING_MISMATCH'
  | 'ROUTE_QUERY_FAILED'
  | 'ROUTE_UPDATE_FAILED'

// ─── ROUTE_STOP_* — 경로 내 정류장 (`route-stops` 함수) ──────────────────────
export type RouteStopErrorCode =
  | 'ROUTE_STOP_ALIAS_TOO_LONG'
  | 'ROUTE_STOP_NOT_FOUND'
  | 'ROUTE_STOP_UPDATE_FAILED'

// ─── FAVORITE_* — 즐겨찾기 (`favorite-stops` 함수) ──────────────────────────
export type FavoriteErrorCode =
  | 'FAVORITE_STOP_ID_REQUIRED'
  | 'FAVORITE_STOP_NAME_REQUIRED'
  | 'FAVORITE_INVALID_STOP_TYPE'
  | 'FAVORITE_ROUTES_REQUIRED'
  | 'FAVORITE_ALIAS_TOO_LONG'
  | 'FAVORITE_DISPLAY_ORDER_NEGATIVE'
  | 'FAVORITE_NOT_FOUND'
  | 'FAVORITE_PERSIST_FAILED'
  | 'FAVORITE_ROUTES_PERSIST_FAILED'
  | 'FAVORITE_DELETE_FAILED'
  | 'FAVORITE_FETCH_AFTER_WRITE_FAILED'
  | 'FAVORITE_QUERY_FAILED'
  | 'FAVORITE_ROUTES_DELETE_FAILED'

// ─── ARRIVAL_* — 실시간 도착 (`arrival-info` 함수) ──────────────────────────
export type ArrivalErrorCode =
  | 'ARRIVAL_STOP_NOT_FOUND'
  | 'ARRIVAL_UNSUPPORTED_REGION'
  | 'ARRIVAL_MAPPING_FAILED'
  | 'ARRIVAL_VERIFY_FAILED'
  | 'ARRIVAL_PROVIDER_ERROR'
  | 'ARRIVAL_PARAMS_INVALID'
  | 'ARRIVAL_SUBWAY_CODE_INVALID'

// ─── STOP_* — 정류장/노선 검색 (`search-stops`, `stop-buses` 함수) ────────────
export type StopErrorCode =
  | 'STOP_QUERY_REQUIRED'
  | 'STOP_NOT_FOUND'
  | 'STOP_PROVIDER_ERROR'

// ─── SUBWAY_* — 지하철 부가정보 (`subway-station-directions` 함수) ────────────
export type SubwayErrorCode =
  | 'SUBWAY_STATION_ID_REQUIRED'
  | 'SUBWAY_STATION_NOT_FOUND'
  | 'SUBWAY_PROVIDER_ERROR'

// ─── ROUTE_SEARCH_* — 경로탐색 (`route-search` 함수) ─────────────────────────
export type RouteSearchErrorCode =
  | 'ROUTE_SEARCH_COORDS_REQUIRED'
  | 'ROUTE_SEARCH_NO_RESULT'
  | 'ROUTE_SEARCH_PROVIDER_ERROR'

// ─── PLACE_* — 장소 검색 (`place-search` 함수) ───────────────────────────────
export type PlaceErrorCode =
  | 'PLACE_QUERY_REQUIRED'
  | 'PLACE_PROVIDER_ERROR'

// ─── SYNC_* — 운영 cron (`sync-gbis-stations` 함수) ─────────────────────────
export type SyncErrorCode =
  | 'SYNC_FORBIDDEN'
  | 'SYNC_PROVIDER_ERROR'
  | 'SYNC_PERSIST_FAILED'

// ─── 합집합 ErrorCode ────────────────────────────────────────────────────────
/**
 * 모든 도메인 에러 코드의 합집합.
 * FE catch 분기 시 e.code === "..." 비교에 사용.
 */
export type ErrorCode =
  | CommonErrorCode
  | AuthErrorCode
  | RouteErrorCode
  | RouteStopErrorCode
  | FavoriteErrorCode
  | ArrivalErrorCode
  | StopErrorCode
  | SubwayErrorCode
  | RouteSearchErrorCode
  | PlaceErrorCode
  | SyncErrorCode
