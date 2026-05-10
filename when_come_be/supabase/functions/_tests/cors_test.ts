import { assert } from "@std/assert"
import { corsHeaders } from "../_shared/cors.ts"

Deno.test("cors Allow-Methods includes all CRUD verbs", () => {
  const methods = corsHeaders["Access-Control-Allow-Methods"]
  for (const m of ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]) {
    assert(methods.includes(m), `${m} missing in CORS Allow-Methods`)
  }
})

Deno.test("cors Allow-Headers includes auth + content-type", () => {
  const headers = corsHeaders["Access-Control-Allow-Headers"]
  for (const h of ["authorization", "content-type"]) {
    assert(headers.toLowerCase().includes(h), `${h} missing in CORS Allow-Headers`)
  }
})
