import { createClient } from "npm:@supabase/supabase-js@2"
import { AppError } from "./error.ts"
import type { AuthErrorCode } from "./errorCodes.ts"

export async function authGuard(req: Request) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    // 토큰 부재 또는 Bearer 형식 아님
    throw new AppError(
      "로그인이 필요합니다",
      401,
      "AUTH_REQUIRED" satisfies AuthErrorCode,
    )
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    // 토큰이 있지만 만료/검증 실패
    throw new AppError(
      "세션이 만료되었습니다",
      401,
      "AUTH_INVALID" satisfies AuthErrorCode,
    )
  }

  return user
}
