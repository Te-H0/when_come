import { errorResponse } from "./error.ts"
import { logAnomaly } from "./anomaly.ts"

type Handler = (req: Request) => Promise<Response>

/**
 * 핸들러를 감싸서 다음 두 역할을 수행한다.
 *
 * 1. 핸들러 내부 try/catch 에서 `errorResponse(e, source)` 를 호출하면
 *    anomaly 기록이 error.ts 내부에서 fire-and-forget으로 처리된다.
 *
 * 2. 핸들러가 예외를 throw 하고 errorResponse 를 호출하지 않은 경우(극히 드문 케이스)를
 *    미들웨어가 최후 안전망으로 잡는다.
 *    이 경우 logAnomaly 를 직접 호출하고 errorResponse 로 500 반환한다.
 *
 * 사용 방법:
 *   if (import.meta.main) Deno.serve(withErrorLogging(handler, "search-stops"))
 */
export function withErrorLogging(handler: Handler, source: string): Handler {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req)
    } catch (err) {
      // 핸들러 내부 try/catch가 errorResponse를 반환했다면 여기까지 오지 않음.
      // 여기에 도달 = 핸들러가 Response 없이 throw한 unhandled 예외.
      logAnomaly({
        source,
        category: "error.unhandled",
        detail: {
          message: err instanceof Error ? err.message : String(err),
          url: req.url,
          method: req.method,
          ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
        },
      })
      return errorResponse(err) // source 없이 — 위에서 이미 기록했으므로 중복 방지
    }
  }
}
