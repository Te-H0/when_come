/**
 * POST /client-log
 *
 * FE에서 BE에 닿지 못한 에러(네트워크 실패, CORS 등)를 anomaly_logs에 누적한다.
 * 이 함수는 어떤 경우에도 4xx/5xx를 반환하지 않는다 — 항상 204.
 * 호출 측이 catch 블록에서 호출하므로 실패 시 무한 루프 방지가 최우선.
 */
import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface ClientLogBody {
  path: string
  method: string
  status: number | null
  code: string | null
  message: string
  context?: Record<string, unknown>
}

function isClientLogBody(v: unknown): v is ClientLogBody {
  if (typeof v !== "object" || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.path !== "string") return false
  if (typeof o.method !== "string") return false
  if (o.status !== null && typeof o.status !== "number") return false
  if (o.code !== null && typeof o.code !== "string") return false
  if (typeof o.message !== "string") return false
  return true
}

// ─── no-content 응답 ──────────────────────────────────────────────────────────

function noContent(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}

// ─── service_role 클라이언트 ──────────────────────────────────────────────────

// SERVICE_ROLE_KEY 사용은 anomaly_logs가 service-role-only RLS인 의도된 예외.
// _shared/anomaly.ts logAnomaly()와 동일 패턴.
function adminClient(): ReturnType<typeof createClient> | null {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── 핸들러 ──────────────────────────────────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders })
  }

  // POST 외 메서드 — 일관성을 위해 405, 단 이 함수 특성상 204도 허용 의도이나 정석대로 처리
  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: corsHeaders })
  }

  // 이 시점부터 모든 예외는 잡아서 204 반환 — 절대 throw 금지
  try {
    // ── body 파싱 ──────────────────────────────────────────────────────────
    let body: ClientLogBody
    try {
      const raw: unknown = await req.json()
      if (!isClientLogBody(raw)) {
        // 타입 가드 실패 → silent skip
        return noContent()
      }
      body = raw
    } catch {
      // JSON 파싱 실패 → silent skip
      return noContent()
    }

    // ── JWT에서 user_id 추출 (optional) ───────────────────────────────────
    let userId: string | null = null
    const authHeader = req.headers.get("authorization")
    if (authHeader) {
      try {
        const anonUrl = Deno.env.get("SUPABASE_URL")
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
        if (anonUrl && anonKey) {
          const anonClient = createClient(anonUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
          })
          const { data } = await anonClient.auth.getUser()
          userId = data?.user?.id ?? null
        }
      } catch {
        // 인증 실패는 무시 — user_id null로 진행
      }
    }

    // ── user-agent 추출 ───────────────────────────────────────────────────
    const ua = req.headers.get("user-agent") ?? undefined

    // ── anomaly_logs INSERT ────────────────────────────────────────────────
    const client = adminClient()
    if (client) {
      try {
        const { path, method, status, code, message, context } = body
        const category = `client.${status ?? "network"}`
        const detail: Record<string, unknown> = {
          path,
          method,
          status,
          code,
          message,
          ...(ua !== undefined ? { ua } : {}),
          ...(context ?? {}),
        }

        await client.from("anomaly_logs").insert({
          source: "client",
          category,
          detail,
          user_id: userId,
        })
      } catch (insertErr) {
        // INSERT 실패 → 콘솔 로그만, 절대 throw 금지
        console.error("[client-log] anomaly_logs INSERT 실패:", insertErr)
      }
    }
  } catch (outerErr) {
    // 최외곽 안전망 — 어떤 예외도 잡아서 204 반환
    console.error("[client-log] unexpected error:", outerErr)
  }

  return noContent()
}

// withErrorLogging 미적용: 이 함수는 모든 예외를 내부에서 처리하고 항상 204를 반환한다.
// 텔레메트리 endpoint이므로 자체 에러로 client에 영향 주면 안 됨 (재귀/무한루프 위험).
if (import.meta.main) Deno.serve(handler)
