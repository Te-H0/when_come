/**
 * FE 에러 코드 → 사용자 메시지 매핑 테이블
 *
 * 출처: docs/api/error-codes.md "FE 권장 메시지" 컬럼
 * 정책: ADR-002 §4.6
 *
 * 신규 코드 추가 절차:
 *  1. BE `_shared/errorCodes.ts` union에 코드 추가 (단일 진실)
 *  2. src/types/errorCodes.ts 동기화
 *  3. docs/api/error-codes.md 카탈로그 행 추가
 *  4. 이 파일에 메시지 추가
 */

import type { ErrorCode } from '@/types/errorCodes'

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // COMMON_*
  COMMON_INVALID_JSON: '요청 형식이 잘못되었습니다',
  COMMON_METHOD_NOT_ALLOWED: '지원하지 않는 요청입니다',
  COMMON_INTERNAL_ERROR: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요',
  COMMON_BAD_REQUEST: '요청을 처리할 수 없습니다',

  // AUTH_*
  AUTH_REQUIRED: '로그인이 필요합니다',
  AUTH_INVALID: '세션이 만료되었습니다. 다시 로그인해 주세요',
  AUTH_FORBIDDEN: '권한이 없습니다',

  // ROUTE_*
  ROUTE_NAME_REQUIRED: '경로 이름과 출발/도착지가 필요합니다',
  ROUTE_STOPS_REQUIRED: '정류장이 최소 1개 이상 필요합니다',
  ROUTE_INVALID_STOP_TYPE: '정류장 종류가 올바르지 않습니다',
  ROUTE_INVALID_STEP_GROUP: '스텝 번호가 올바르지 않습니다',
  ROUTE_STEP_GROUP_OVERFLOW: '한 스텝당 최대 2개 정류장입니다',
  ROUTE_STOP_TYPE_MIXED: '같은 스텝의 정류장은 동일한 타입이어야 합니다',
  ROUTE_NAME_EMPTY: '경로 이름이 비어 있습니다',
  ROUTE_DISPLAY_ORDER_NEGATIVE: '정렬 값이 올바르지 않습니다',
  ROUTE_ACTIVE_INVALID: '활성 상태 값이 올바르지 않습니다',
  ROUTE_PATCH_NO_FIELDS: '수정할 항목이 없습니다',
  ROUTE_NOT_FOUND: '경로를 찾을 수 없습니다',
  ROUTE_PERSIST_FAILED: '경로 저장에 실패했습니다',
  ROUTE_DELETE_FAILED: '경로 삭제에 실패했습니다',
  ROUTE_STOPS_PERSIST_FAILED: '정류장 저장에 실패했습니다',
  ROUTE_STOP_ROUTES_PERSIST_FAILED: '노선 저장에 실패했습니다',
  ROUTE_STOP_MAPPING_MISMATCH: '내부 오류가 발생했습니다',
  ROUTE_QUERY_FAILED: '경로 목록을 불러오지 못했습니다',
  ROUTE_UPDATE_FAILED: '경로 수정에 실패했습니다',

  // ROUTE_STOP_*
  ROUTE_STOP_ALIAS_TOO_LONG: '별명은 20자 이내로 입력해 주세요',
  ROUTE_STOP_NOT_FOUND: '정류장을 찾을 수 없습니다',
  ROUTE_STOP_UPDATE_FAILED: '정류장 수정에 실패했습니다',

  // FAVORITE_*
  FAVORITE_STOP_ID_REQUIRED: '정류장 정보가 누락되었습니다',
  FAVORITE_STOP_NAME_REQUIRED: '정류장 이름이 필요합니다',
  FAVORITE_INVALID_STOP_TYPE: '정류장 종류가 올바르지 않습니다',
  FAVORITE_ROUTES_REQUIRED: '노선을 1개 이상 선택해 주세요',
  FAVORITE_ALIAS_TOO_LONG: '별명은 20자 이내로 입력해 주세요',
  FAVORITE_DISPLAY_ORDER_NEGATIVE: '정렬 값이 올바르지 않습니다',
  FAVORITE_NOT_FOUND: '즐겨찾기를 찾을 수 없습니다',
  FAVORITE_PERSIST_FAILED: '즐겨찾기 저장에 실패했습니다',
  FAVORITE_ROUTES_PERSIST_FAILED: '노선 저장에 실패했습니다',
  FAVORITE_DELETE_FAILED: '즐겨찾기 삭제에 실패했습니다',
  FAVORITE_FETCH_AFTER_WRITE_FAILED: '처리 후 조회에 실패했습니다',
  FAVORITE_QUERY_FAILED: '즐겨찾기 목록을 불러오지 못했습니다',
  FAVORITE_ROUTES_DELETE_FAILED: '노선 삭제에 실패했습니다',

  // ARRIVAL_*
  ARRIVAL_STOP_NOT_FOUND: '정류장 정보를 찾을 수 없습니다',
  ARRIVAL_UNSUPPORTED_REGION: '현재 지원하지 않는 지역입니다',
  ARRIVAL_MAPPING_FAILED: '도착 정보를 가져오지 못했습니다',
  ARRIVAL_VERIFY_FAILED: '도착 정보 검증에 실패했습니다',
  ARRIVAL_PROVIDER_ERROR: '도착 정보 서비스가 일시적으로 불안정합니다',
  ARRIVAL_PARAMS_INVALID: '조회 파라미터가 잘못되었습니다',
  ARRIVAL_SUBWAY_CODE_INVALID: '지하철 노선 코드가 올바르지 않습니다',

  // STOP_*
  STOP_QUERY_REQUIRED: '검색어를 입력해 주세요',
  STOP_NOT_FOUND: '정류장을 찾을 수 없습니다',
  STOP_PROVIDER_ERROR: '정류장 검색 서비스가 일시적으로 불안정합니다',

  // SUBWAY_*
  SUBWAY_STATION_ID_REQUIRED: '역 정보가 누락되었습니다',
  SUBWAY_STATION_NOT_FOUND: '역 정보를 찾을 수 없습니다',
  SUBWAY_PROVIDER_ERROR: '지하철 정보 조회에 실패했습니다',

  // ROUTE_SEARCH_*
  ROUTE_SEARCH_COORDS_REQUIRED: '출발/도착 좌표가 필요합니다',
  ROUTE_SEARCH_NO_RESULT: '경로를 찾지 못했습니다',
  ROUTE_SEARCH_PROVIDER_ERROR: '경로탐색 서비스가 일시적으로 불안정합니다',

  // PLACE_*
  PLACE_QUERY_REQUIRED: '검색어를 입력해 주세요',
  PLACE_PROVIDER_ERROR: '장소 검색 서비스가 일시적으로 불안정합니다',

  // SYNC_* — 운영 cron, 사용자 메시지 불필요하나 타입 완성을 위해 포함
  SYNC_FORBIDDEN: '권한이 없습니다',
  SYNC_PROVIDER_ERROR: '외부 서비스 오류가 발생했습니다',
  SYNC_PERSIST_FAILED: '데이터 저장에 실패했습니다',
}

/**
 * 에러 코드로 사용자 메시지를 조회한다.
 * - code가 카탈로그에 있으면 매핑된 메시지 반환
 * - code가 undefined이거나 카탈로그에 없으면 fallback 반환
 */
export function lookupMessage(code: string | undefined, fallback: string): string {
  if (!code) return fallback
  return (ERROR_MESSAGES as Record<string, string>)[code] ?? fallback
}
