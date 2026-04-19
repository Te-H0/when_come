import { createClient } from "npm:@supabase/supabase-js@2"
import { AppError } from "./error.ts"

export async function authGuard(req: Request) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AppError("UNAUTHORIZED", 401)
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new AppError("UNAUTHORIZED", 401)
  return user
}
