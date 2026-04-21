import { corsHeaders } from "../_shared/cors.ts"
import { AppError, errorResponse } from "../_shared/error.ts"
import { searchStation } from "../_shared/odsayClient.ts"

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "GET") throw new AppError("GET 요청만 허용됩니다", 405)

    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()
    if (!q) throw new AppError("q 파라미터가 필요합니다", 400)

    const stations = await searchStation(q)

    const data = stations.map((s) => ({
      id: String(s.stationID),
      name: s.stationName,
      type: s.type === 2 ? "subway" : "bus",
      lat: s.y,
      lng: s.x,
      arsId: s.arsID || null,
    }))

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

if (import.meta.main) Deno.serve(handler)
