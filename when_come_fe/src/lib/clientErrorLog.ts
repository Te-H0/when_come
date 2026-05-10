import { getJwt } from './supabase'

interface ClientErrorPayload {
  path: string
  method: string
  status: number | null
  code: string | null
  message: string
  context?: Record<string, unknown>
}

/** 재귀 방지: /client-log 자체 호출 실패는 다시 송신하지 않는다 */
function isClientLogPath(path: string): boolean {
  return path === '/client-log' || path.endsWith('/client-log')
}

/** 스로틀 맵: key → 마지막 송신 시각(ms) */
const recentSent = new Map<string, number>()
const THROTTLE_MS = 1000

/**
 * 클라이언트 에러 텔레메트리.
 *
 * - fire-and-forget: 호출 측은 await 불필요, throw 없음
 * - /client-log 자체 실패는 무시 (재귀 방지)
 * - 같은 (method, path, status, code) 조합은 1초당 최대 1회 송신
 */
export function logClientError(payload: ClientErrorPayload): void {
  if (isClientLogPath(payload.path)) return

  const key = `${payload.method}|${payload.path}|${payload.status ?? 'net'}|${payload.code ?? ''}`
  const now = Date.now()
  const last = recentSent.get(key)
  if (last !== undefined && now - last < THROTTLE_MS) return
  recentSent.set(key, now)
  // TTL cleanup — 2초 뒤 자동 제거. 같은 key 재발생 시 freshness가 보장되므로 안전.
  setTimeout(() => recentSent.delete(key), THROTTLE_MS * 2)

  void sendLog(payload)
}

async function sendLog(payload: ClientErrorPayload): Promise<void> {
  try {
    const token = await getJwt()
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-log`
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      // keepalive: 페이지가 닫히는 순간의 에러도 어느 정도 송신 시도
      keepalive: true,
    })
  } catch {
    // 의도적 무시 — 텔레메트리 자체 실패는 운영에 영향 없어야 한다
  }
}
