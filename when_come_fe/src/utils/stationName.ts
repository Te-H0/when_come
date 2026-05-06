/**
 * 지하철 역명 표시용 정규화.
 * - "군자(능동)" → "군자"
 * - "강남역 (2호선)" → "강남역"
 * - "강동" → "강동" (변경 없음)
 *
 * 도착 API 호출 시에는 원본을 사용해야 함 (BE에서 다단계 fallback 처리).
 * 이 함수는 표시 용도 전용 — fetchArrival 등 API 호출 인자에 절대 사용 금지.
 */
export function formatStationName(stationName: string): string {
  return stationName.replace(/\s*\([^)]*\)/g, '').trim()
}
