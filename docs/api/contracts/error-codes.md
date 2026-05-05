# API 계약 — 에러 응답 표준

- **상태:** Proposed (2026-05-05)
- **작성일:** 2026-05-05
- **결정자:** architect
- **관련:** `docs/decisions/ADR-002-multi-region-arrival-provider.md`, `docs/api/contracts/arrival-info.md`, `when_come_be/supabase/functions/_shared/error.ts`

---

## 0. 변경 요약

기존 BE는 모든 에러를 `{ "error": "<문자열>" }` 형태로 반환해 FE가 에러 종류를 구분할 수 없었다. 특히 `odsay_fallback` provider가 (1) 진짜 미지원 지역, (2) GBIS 매핑 실패, (3) 매핑 검증 실패 — 세 가지 다른 상황을 한 묶음으로 표현해 FE가 사용자에게 적절한 안내를 노출하지 못했다.

본 계약은 **에러 응답을 구조화**하고 (`{ error: { code, message, detail? } }`), `arrival-info` 도메인을 시작으로 **머신 판독 가능한 에러 코드 표**를 정의한다.

| 변경 | 종류 | Breaking? |
|------|------|-----------|
| 응답 스키마 `{ error: string }` → `{ error: { code, message, detail? } }` | 변경 | **Yes (BREAKING)** — 한 사이클 호환 정책 별도 합의 필요 |
| `ARRIVAL_*` 에러 코드 5종 신설 | 추가 | No (FE는 모르는 코드는 일반 에러로 처리) |
| `odsay_fallback` 단일 상태 → `MAPPING_FAILED` / `VERIFY_FAILED` / `UNSUPPORTED_REGION` 분리 | 의미 변경 | No (DB enum은 그대로, 에러 코드로 구분) |

> **호환 전략 권장:** 한 사이클 동안 `error` 필드를 **string + object 동시 포함**으로 직렬화 (`{ error: "...message...", errorCode: "...", errorDetail: "..." }`)하고, 다음 사이클에 object 단일화. 결정은 별도 ADR/협업 합의에서 확정.

---

## 1. 응답 스키마

### 1.1 표준 에러 응답

```json
{
  "error": {
    "code": "ARRIVAL_MAPPING_FAILED",
    "message": "도착 정보를 가져올 수 없어요. 경로를 다시 등록하면 더 정확해져요.",
    "detail": "GBIS station search returned no rows for stopId=8f1c..."
  }
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|-----|------|
| `error.code` | string (대문자_언더스코어) | Y | 머신 판독용. 안정 contract — 변경 시 BREAKING |
| `error.message` | string (한국어) | Y | **사용자에게 그대로 노출 가능한 문구**. FE는 별도 한국어 매핑 없이 사용 가능 |
| `error.detail` | string | N | 디버그용. 외부 API status, 매핑 실패 사유 등. 사용자에게 노출 금지 |

### 1.2 알려지지 않은 에러

`error.code`가 본 문서에 정의되지 않은 값이면 FE는 `error.message`를 그대로 보여주고 일반 에러 토스트로 처리한다. 향후 신규 코드 추가 시 FE 변경 없이 기본 동작이 보장된다.

---

## 2. arrival-info 에러 코드

### 2.1 `ARRIVAL_UNSUPPORTED_REGION`

- **HTTP:** `422 Unprocessable Entity`
- **반환 시점:**
  - `route_stops.provider === 'odsay_fallback'`이면서 `detectRegion(lat,lng)` 결과가 `unknown` (서울·경기 bbox 외부 — 강원/충청/전라/경상/제주 등)
  - 즉, "현재 우리가 지원하는 광역 도착 API 범위 밖" 정류장
- **FE 표시:**
  - 도착 카드 자리에 inline 안내 — "이 지역은 실시간 도착 정보를 지원하지 않아요. 추후 확장 예정이에요."
  - 새로고침 버튼 비활성화 (재시도해도 결과 동일)
  - 토스트 노출 금지 (스팸 방지)
- **재시도:** 불가 (지역 확장 전까지 동일 결과)
- **detail 예시:** `"region=unknown lat=37.85 lng=128.59 (강원 추정)"`

### 2.2 `ARRIVAL_MAPPING_FAILED`

- **HTTP:** `422 Unprocessable Entity`
- **반환 시점:**
  - `detectRegion === 'gyeonggi'`인데 `gbis_stations` 테이블에서 매칭되는 station을 찾지 못함
  - ARS 1차 매칭 실패 + 좌표 200m 반경 내 후보 0건 + 이름 유사도(Levenshtein) 0.7 미달
  - 결과적으로 `route_stops.provider`는 `odsay_fallback`으로 격하된 상태
- **FE 표시:**
  - 도착 카드에 inline 안내 — "도착 정보를 가져올 수 없어요. 경로를 다시 등록하면 더 정확해져요."
  - "경로 다시 등록" 액션을 권장 (재등록 시 매핑 알고리즘 재실행 → 성공 가능)
  - ODsay realtimeStation으로 표시 가능한 부분 응답이 있다면 함께 노출 (BE는 부분 성공일 경우 200으로 응답하고 별도 `warningCode` 필드 활용 — 본 422는 매핑 실패로 도착 응답 자체가 0건일 때 한정)
- **재시도:** 즉시 재시도는 의미 없음 (정류소 캐시 변동이 일 1회)
- **detail 예시:** `"GBIS station match failed: arsNo=85019, candidates within 200m=0"`

### 2.3 `ARRIVAL_VERIFY_FAILED`

- **HTTP:** `422 Unprocessable Entity`
- **반환 시점:**
  - 매핑된 GBIS station에 대해 도착 호출은 성공했으나, 운행 노선 교집합이 50% 미달 (ADR-002 D4 검증)
  - 매핑 직후 1회 검증 단계에서 `provider='odsay_fallback'`로 격하됨 — 사용자가 도착 조회 시 격하된 상태 그대로 fallback로 응답되거나, 재검증 모드에서 본 코드 반환
- **FE 표시:**
  - `MAPPING_FAILED`와 동일한 안내 문구 사용 — 사용자 입장에선 동일한 후속 액션("재등록")
  - inline 안내 — "도착 정보 정확도가 낮아요. 경로를 다시 등록해 주세요."
  - 단, FE 분석 로깅에서는 `MAPPING_FAILED`와 별도 카운터로 집계 (어느 단계에서 실패하는지 추적 목적)
- **재시도:** 즉시 재시도 무의미. 재등록 권장
- **detail 예시:** `"verify intersection 1/5 routes (20%) < threshold 50%"`

### 2.4 `ARRIVAL_PROVIDER_ERROR`

- **HTTP:** `502 Bad Gateway`
- **반환 시점:**
  - 외부 API 호출 자체 실패 — 서울 버스 API, GBIS, ODsay realtimeStation 어느 것이든 네트워크 오류·5xx·timeout·인증 만료
  - Provider 패턴에서 `fetch()` reject 또는 외부 API의 `resultCode`가 시스템 오류 계열
- **FE 표시:**
  - 토스트 노출 — "잠시 후 다시 시도해 주세요."
  - 도착 카드는 마지막 성공 응답 유지 (있다면) + 카드 헤더에 inline "갱신 실패" 표시
  - 새로고침 버튼은 활성 유지 (사용자가 재시도 가능)
- **재시도:** **가능** — 외부 API 일시 장애일 가능성 높음. 자동 재시도는 지수 백오프(2s/4s/8s) 1회까지 권장
- **detail 예시:** `"seoul-bus getStationByUid HTTP 503"`, `"gbis getBusArrivalListv2 timeout 5000ms"`

### 2.5 `ARRIVAL_STOP_NOT_FOUND`

- **HTTP:** `404 Not Found`
- **반환 시점:**
  - `?stopId={uuid}`로 전달된 ID가 `route_stops` 테이블에 존재하지 않음
  - 또는 존재하지만 **현재 사용자 소유의 route**가 아님 (RLS 위반 — 정보 은닉 차원에서 401 대신 404로 통일)
- **FE 표시:**
  - 토스트 노출 — "경로를 찾을 수 없어요. 새로고침 해주세요."
  - 도착 카드 자체를 숨김 처리 (해당 stop이 화면에서 사라지도록)
  - 경로 목록 자동 refetch 트리거 권장 (다른 기기에서 삭제됐을 가능성)
- **재시도:** 불가 (동일 stopId로는 영구 실패)
- **detail 예시:** `"route_stops.id=8f1c... not found or not owned by user"`

---

## 3. 코드 ↔ HTTP ↔ provider 상태 매핑 표

| 코드 | HTTP | provider 시점 | 사용자 액션 |
|------|------|--------------|------------|
| `ARRIVAL_UNSUPPORTED_REGION` | 422 | `odsay_fallback` + `detectRegion=unknown` | 없음 (지원 확장 대기) |
| `ARRIVAL_MAPPING_FAILED` | 422 | `odsay_fallback` + `detectRegion=gyeonggi` (매핑 실패) | 경로 재등록 |
| `ARRIVAL_VERIFY_FAILED` | 422 | `odsay_fallback` + 검증 실패 격하 | 경로 재등록 |
| `ARRIVAL_PROVIDER_ERROR` | 502 | provider 무관 (외부 API 호출 실패) | 재시도 |
| `ARRIVAL_STOP_NOT_FOUND` | 404 | DB row 없음 / RLS 위반 | 새로고침 |

> **핵심:** 기존 단일 `provider='odsay_fallback'`이 위 표의 3가지 의미를 동시에 가졌음. 본 계약 적용 후 FE는 `error.code`로 정확히 구분.

---

## 4. 정상 응답에 동반되는 fallback 신호 (참고)

도착 응답이 **부분 성공**(매핑은 실패했지만 ODsay realtimeStation으로 응답 생성 가능)인 경우는 200 응답에 `provider: 'odsay_fallback'`을 그대로 사용한다. 이 경우 본 에러 코드 표는 적용되지 않으며, FE는 기존대로 inline 안내("도착 정보가 부정확할 수 있어요 (제휴 데이터 사용)")를 노출한다.

본 에러 코드는 **응답 자체를 만들 수 없는 실패**에만 사용한다.

---

## 5. 다른 도메인으로의 확장 가이드

본 계약은 `arrival-info`를 시작점으로 하며, 다른 도메인 추가 시 다음 prefix 컨벤션을 따른다.

| 도메인 | prefix | 예시 |
|--------|--------|------|
| arrival-info | `ARRIVAL_` | `ARRIVAL_MAPPING_FAILED` |
| route-search | `ROUTE_SEARCH_` | `ROUTE_SEARCH_NO_RESULT` |
| routes (CRUD) | `ROUTE_` | `ROUTE_QUOTA_EXCEEDED` |
| search-stops | `SEARCH_` | `SEARCH_PROVIDER_ERROR` |
| auth | `AUTH_` | `AUTH_TOKEN_EXPIRED` |

신규 코드 추가 시 본 문서에 행 추가 + `docs/collab-notes.md`에 변경 요약.

---

## 6. BE 구현 메모 (참고)

`when_come_be/supabase/functions/_shared/error.ts`에 다음 헬퍼 추가 권장 (구현은 BE 에이전트 작업).

```ts
type ErrorCode = 'ARRIVAL_UNSUPPORTED_REGION' | 'ARRIVAL_MAPPING_FAILED' | ...;

function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  detail?: string
): Response;
```

`detail`은 프로덕션에서는 로그에만 남기고 응답에서 제거하는 옵션도 고려 (정보 노출 vs 디버그 편의 트레이드오프 — 별도 결정).

---

## 7. FE 구현 메모 (참고)

`when_come_fe/src/lib/api.ts`의 fetch 헬퍼에 응답 normalize 1단계 추가:

```
catch HTTPError →
  if (body.error?.code) throw new ApiError(body.error.code, body.error.message)
  else throw new ApiError('UNKNOWN', body.error ?? 'Unknown error')
```

`ApiError.code`로 컴포넌트에서 분기. 한국어 message는 BE가 책임지므로 FE 별도 i18n 매핑 불필요 (당분간).

---

## Open Questions

- **OQ1.** `error.message` 한국어 문구를 FE/BE 어디가 소유할지? — 본 계약은 BE 소유로 가정. i18n 도입 시 재검토.
- **OQ2.** 호환 사이클 동안 `{ error: string }` 응답을 어떻게 흘려보낼지? — 별도 합의 필요 (병행 직렬화 vs 즉시 BREAKING).
- **OQ3.** `ARRIVAL_VERIFY_FAILED`가 사용자 화면에 단독 노출되는 경로가 실제로 존재하는지? — 검증 실패 후 즉시 격하되어 다음 호출은 `odsay_fallback` 정상 응답으로 흐를 가능성 높음. 본 코드는 보수적으로 정의만 두고 실제 발생 빈도는 모니터링.
