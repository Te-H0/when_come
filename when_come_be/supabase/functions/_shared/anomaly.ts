import { createClient } from "npm:@supabase/supabase-js@2"

export interface AnomalyPayload {
  source: string
  category: string
  detail: Record<string, unknown>
  userId?: string | null
}

let _admin: ReturnType<typeof createClient> | null = null

function admin(): ReturnType<typeof createClient> | null {
  if (_admin) return _admin
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) return null // 환경변수 없으면 silent skip (테스트 환경 등)
  _admin = createClient(url, key)
  return _admin
}

/**
 * 이상 케이스를 anomaly_logs 테이블에 fire-and-forget으로 기록한다.
 * INSERT 실패가 메인 로직을 절대 차단하지 않는다.
 */
export function logAnomaly(payload: AnomalyPayload): void {
  const task = (async () => {
    try {
      const client = admin()
      if (!client) return
      await client.from("anomaly_logs").insert({
        source: payload.source,
        category: payload.category,
        detail: payload.detail,
        user_id: payload.userId ?? null,
      })
    } catch {
      // 로깅 실패는 무시 — 메인 로직 차단 절대 금지
    }
  })()

  // @ts-ignore — Supabase Edge runtime
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    // @ts-ignore
    EdgeRuntime.waitUntil(task)
  }
  // EdgeRuntime 없으면(로컬/테스트 환경) microtask로 던짐 — 응답 후 끝나도 OK
}
