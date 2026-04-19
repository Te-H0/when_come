import { corsHeaders } from "./cors.ts"

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message)
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof AppError) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  console.error(e)
  return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
