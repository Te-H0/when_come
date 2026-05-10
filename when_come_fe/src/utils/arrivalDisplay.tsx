/**
 * 도착 텍스트 파싱/렌더링 공통 유틸
 * Home.tsx + Favorites.tsx에서 중복 정의되던 코드를 단일 모듈로 추출.
 */

/**
 * 도착 텍스트 파싱 결과.
 * - count 타입: "3개전" → { kind: 'count', count: 3, unit: '개전' }
 * - text 타입: "곧 도착", "도착 정보 없음" 등 → { kind: 'text', text: '...' }
 */
export type ArrivalTextToken =
  | { kind: 'count'; count: number; unit: string }
  | { kind: 'text'; text: string }

/**
 * "3개전", "5분후", "1분30초후" 같은 텍스트를 파싱해 토큰으로 분해.
 * 숫자+단위 패턴을 감지하고, 나머지는 그대로 text 토큰으로 반환.
 */
export function parseArrivalToken(msg: string): ArrivalTextToken {
  if (!msg || msg === '--') return { kind: 'text', text: msg || '--' }
  // "N개전" 패턴
  const countMatch = msg.match(/^(\d+)(개전)/)
  if (countMatch) return { kind: 'count', count: parseInt(countMatch[1]), unit: countMatch[2] }
  // "N분후", "N분N초후" 패턴
  const minMatch = msg.match(/^(\d+)분/)
  if (minMatch) return { kind: 'count', count: parseInt(minMatch[1]), unit: '분' }
  return { kind: 'text', text: msg }
}

interface ArrivalTextProps {
  msg: string
  className?: string
  /**
   * 숫자 크기 variant.
   * - 'lg': text-section (18px bold) — 미니카드, 현재 스텝 도착 강조용
   * - 'md': tabular-nums만 (className으로 크기 위임) — Favorites 카드 등
   * 기본값: 'md'
   */
  size?: 'lg' | 'md'
}

/** 도착 텍스트 토큰을 JSX 요소로 렌더링 */
export function ArrivalText({ msg, className, size = 'md' }: ArrivalTextProps) {
  const token = parseArrivalToken(msg)
  if (token.kind === 'count') {
    return (
      <span className={className}>
        <span className={`font-bold tabular-nums ${size === 'lg' ? 'text-section' : ''}`}>
          {token.count}
        </span>
        <span className="text-caption font-normal">{token.unit}</span>
      </span>
    )
  }
  return <span className={className}>{token.text}</span>
}

/**
 * "[N번째 전]" suffix를 arrmsg에서 분리해 표시용 구조로 반환.
 * "3분후[2번째 전]" → { time: "3분후", stops: "2정거장 전" }
 */
export function splitArrival(text: string | null): { time: string; stops: string | null } {
  if (!text) return { time: '--', stops: null }
  const match = text.match(/^(.*?)\[(\d+)번째 전\]$/)
  if (match) return { time: match[1].trim(), stops: `${match[2]}정거장 전` }
  return { time: text, stops: null }
}
