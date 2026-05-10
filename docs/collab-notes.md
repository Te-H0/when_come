# 프론트-백 협업 노트

> API 스펙(요청/응답 구조, 엔드포인트) 변경 시 즉시 여기에 추가.

## 규칙
- 변경일, 변경 내용, 영향받는 프론트 컴포넌트를 함께 기록
- 파괴적 변경(breaking change)은 `[BREAKING]` 태그 필수

---

## 2026-05-10 — 디자인 시스템 토큰화 + Page Shell 표준화 (ADR-003) **[설계 완료, FE 구현 대기]**

FE 페이지 8개에 누적된 디자인 일관성 부재 (hex/px 230+/190+ 곳 분산, 페이지마다 다른 헤더 sticky 패턴, BottomNav 가림/공백 미해결)를 토큰 시스템 + PageShell/PageHeader 공용 컴포넌트로 일괄 정리.

### 산출물
- **결정 문서:** [`docs/decisions/ADR-003-design-system.md`](decisions/ADR-003-design-system.md)
- **실전 가이드:** [`docs/design-system.md`](design-system.md) — 토큰 카테고리 7개, theme.css 확장 명세, PageShell/PageHeader props 명세, 페이지별 마이그레이션 매핑
- **강제 룰:** [`.claude/rules/design-system.md`](../.claude/rules/design-system.md) — `when_come_fe/src/**/*.{ts,tsx}` 자동 적용

### 토큰 카테고리 요약
- Color: 22개 신규 시멘틱 (text 6, surface 7, border 4, info 1, arrival domain 4) + shadcn 41개 유지 = 63개
- Radius: 4개 신규 (chip/control/card/pill) + shadcn 4개 유지
- Elevation: 3개 (flat/card/floating)
- Motion: 5개 (3 duration + 2 easing)
- Typography: 7개 시멘틱 utility (`text-page-title`/`section`/`card-title`/`body`/`label`/`caption`/`button`)
- Layout: 5개 (`--bottom-nav-height/total`, `--page-header-height`, `--page-max-width`, `--page-padding-x`)

### BE 영향: 없음 (FE 전용 변경).

### FE 작업 (FE-DS-1 ~ FE-DS-5, fe-agent 위임)
- **FE-DS-1.** `src/styles/theme.css` 확장 (위 토큰 카테고리 일괄 추가)
- **FE-DS-2.** `<PageShell>`, `<PageHeader>` 신설
- **FE-DS-3.** BottomNav 높이를 CSS custom property로 노출
- **FE-DS-4.** 페이지 8개 일괄 토큰 마이그레이션 (Home/Favorites/AddFavorite/RouteManagement/SetupRoute/UnifiedStopPicker/BottomNav/EmptyState)
- **FE-DS-5.** `npm run check:tokens` grep 기반 검출 스크립트

### 마이그레이션 정책
일괄 진행. 점진 정리는 ADR-003 §1 (4개월 누적 안티패턴)에서 기각됨. 단 PR은 페이지별 또는 도메인별로 분리 권장.

### `when_come_fe/CLAUDE.md` 갱신 필요
`## 개발 원칙`에 한 줄 추가: "디자인 토큰만 사용 — hex/px hardcode 금지. 페이지는 `<PageShell>` + `<PageHeader>`. 상세 [`docs/design-system.md`](../docs/design-system.md), 정책 [ADR-003](../docs/decisions/ADR-003-design-system.md)."

---

## 2026-05-10 — 전역 에러 핸들링 표준 (ADR-002) **[구현 완료]**

Java Spring 스타일 enum 코드 기반 전역 에러 표준 — Phase 0~4 전구간 구현 완료.

### 산출물
- **결정 문서:** [`docs/decisions/ADR-002-error-handling.md`](decisions/ADR-002-error-handling.md)
- **컨벤션 룰:** [`.claude/rules/error-handling.md`](../.claude/rules/error-handling.md) — BE/FE 경로 기반 자동 적용
- **카탈로그:** [`docs/api/error-codes.md`](api/error-codes.md) — 53개 코드 (ARRIVAL_DB_ROW_INVALID, SYNC_PARAMS_INVALID 추가)

### BE 변경
- `_shared/errorCodes.ts` 신설 — 11개 도메인 union (`Route/RouteStop/Favorite/Arrival/Stop/Subway/RouteSearch/Place/Sync/Auth/Common`)
- `_shared/error.ts` `AppError.code` 타입 좁힘 + `errorResponse` 운영/dev 분기 (`isProduction()`)
- `_shared/auth.ts` `AUTH_REQUIRED` / `AUTH_INVALID` 분리
- 13개 함수 모든 `AppError` throw에 code 부여 (`satisfies XxxErrorCode` 패턴 강제)
- 테스트 421/421 통과

### FE 변경
- `src/types/errorCodes.ts` 신설 — BE union 거울복사 (수동 동기화 정책)
- `src/lib/errorMessages.ts` 신설 — 카탈로그 기반 코드→사용자 메시지 매핑
- `src/lib/errorToast.ts` 신설 — `getErrorMessage`, `showApiErrorToast` 헬퍼. dev에서 `[CODE/STATUS]` prefix 자동.
- `toast.error(...)` 직접 호출 17곳 → `showApiErrorToast(e, fallback)` 일괄 변환

### 운영 마스킹 정책 (ADR §3.4)
- dev: raw message + detail 노출
- 운영: code 있으면 message 노출 + detail 제거, code 없는 4xx는 `COMMON_BAD_REQUEST` 마스킹, unhandled 5xx는 `COMMON_INTERNAL_ERROR` 마스킹

### **운영 배포 시 필수 액션**
**`DENO_ENV=production` 함수 시크릿 주입 필요.** 미설정 시 운영도 dev 모드로 동작 → raw 메시지 노출.
- GitHub Actions `deploy-supabase.yml`에 `supabase secrets set DENO_ENV=production` 스텝 추가 완료 (prod 브랜치 push 시 자동 적용)
- 최초 배포 후 `supabase secrets list`로 확인 권장

### Breaking 변경 2건
1. **`arrival-info ?type=subway&subwayCode=INVALID`**: 기존 무시(200) → 400 `ARRIVAL_SUBWAY_CODE_INVALID`
   - **FE 영향 없음** (FE는 항상 `^10\d{2}$` 형식만 전송)
2. **`sync-gbis-stations` 인증 실패**: 401 → 403 `SYNC_FORBIDDEN` (의미 정확화)
   - **FE 영향 없음** (cron 전용 내부 함수, FE 호출 경로 없음)

### 호환성
- legacy `{ error: "..." }` flat 포맷도 FE `apiFetch`가 계속 파싱 — 운영/스테이징 사이의 점진 배포 안전.

---

## 2026-05-09 — subway_code 필드 추가 (non-breaking)

`stop_routes` / `favorite_stop_routes` 응답에 `subway_code` 필드가 추가됨.

- **영향 엔드포인트:** `GET /routes`, `GET /favorite-stops`
- **변경 내용:** `stop_routes[].subway_code` (string | null), `favorite_stop_routes[].subway_code` (string | null)
- **값 형식:** 서울 지하철 API `lineName` 형식 (`"1001"` ~ `"1031"`). bus 노선 row는 `null`.
- **FE 요청 시 추가:** `POST /routes` → `stops[].stopRoutes[].subwayCode` 전달, `POST /favorite-stops` / `PATCH /favorite-stops/:id` → `routes[].subwayCode` 전달
- **[non-breaking]** 기존 row의 `subway_code`는 NULL (백필 전). FE는 null인 경우 기존 호선명 문자열 매칭 로직으로 폴백.
- 기존 row 백필: `scripts/backfill-subway-code.ts` 참고 (`docs/tech-notes/subway-code-backfill.md`)

---

## 2026-05-09 — headsign 계약 변경: BE 순수 역명 반환, FE가 "행" 접미사 추가

**[BREAKING]** `arrival-info` 지하철 응답의 `headsign` 필드가 **"행" 접미사를 포함하지 않는 순수 역명**으로 변경됨.

- 변경 전: `headsign: "방화행"`, `"온수행"`, `"인천행"`
- 변경 후: `headsign: "방화"`, `"온수"`, `"인천"`
- **FE 대응 필수:** `Home.tsx`의 `{headsign}행` 표시 패턴 유지하면 올바르게 "방화행"으로 렌더링됨 — 별도 수정 불필요. 하지만 `headsign` 그대로 렌더링하던 코드가 있다면 "행"을 붙이도록 수정 필요.
- 근원 버그: BE가 "방화행"을 반환하고 FE가 `{headsign}행`으로 붙여 "방화행행"이 되던 이중 접미사 버그 수정.
- 수정 파일: `arrival-info/index.ts` `extractHeadsign()` 함수

**`favorite_stops` direction 컬럼 SELECT 추가 (non-breaking)**

`arrival-info`의 `favorite_stops` fallback lookup에서 `direction_headsign`, `direction_updn`, `direction_next_stop` 3개 컬럼이 SELECT에서 누락되어 있던 버그 수정. `route_stops` lookup과 동등하게 맞춤. 즐겨찾기 지하철 stop의 방향 정보(`direction_headsign`, `direction_updn`)가 `RouteStopRow`로 정상 전달됨.

---

## 2026-05-08 — favorites-and-aliases D11 추가: 양방향 다음 역 1개씩 + 종착지 동적 노출 (D10 보강)

D10 양 종착지 N개 표시 → **양방향 다음 역 1개씩**으로 단순화. ODsay `subwayStationInfo`의 `prevOBJ`/`nextOBJ`(단일 호출)로 prev/next 한 칸씩만 추출. 종착지(headsign)는 도착 카드에서 매 item `headsign`(이미 BE 응답 동봉)으로 동적 표시.

- **새 endpoint:** `GET /subway-station-directions?stationId={ODsay stationID}` (anon 허용). 응답 `{ stationName, lineName, subwayId, directions: [{updn:'up'|'down', nextStop}, ...] }` (1~2개, 종착역은 1개).
- **저장 모델 변경:** `directionUpdn` + `directionNextStop`만 저장. **`directionHeadsign`은 NULL** — 매 도착 item의 `headsign`(2026-05-08 BE 작업으로 이미 동봉)으로 카드 시점에 표시.
- **폐기 옵션:**
  - 옵션 A(`/subway-line-headsigns` + cron + `subway_line_headsigns` 캐시 테이블 + ODsay `searchSubwaySchedule`) — 폐기. 새 테이블/cron 만들지 않음.
  - 옵션 C(정적 매핑) — 폐기.
- **유지 (역할 변경):** 옵션 B(`search-stops` 응답에 `laneName`/`subwayId` 노출) — 호선 row 분리 노출용 별개 트랙으로 유지. D11과 직접 결합하지 않음.
- **영향 task:** Phase 2-2가 단순화됨. `T10-a 조사 → T10-b 또는 T10-b'` (옵션 분기) → **단일 `T10-b'' subway-station-directions endpoint 신설`**로 통합. cron/새 테이블 마이그레이션 task 제거.
- **FE 영향:** `<UnifiedStopPicker>`의 방향 chip은 양방향 다음 역 1개씩 (예: "시청 방향(상행)" / "남영 방향(하행)"). payload `subway.direction`은 `{updn, nextStop}` (headsign 없음).
- **도착 카드 흐름 변경 없음:** `matchSubwayItems`는 기존 `directionUpdn` 필터링 그대로. 매 item `headsign` prefix 표시는 이미 완료된 BE 응답 + FE 표시 작업으로 노출 중.

> be-agent 위임: 단일 endpoint `GET /subway-station-directions` 구현. ODsay `subwayStationInfo` 호출 → `prevOBJ`/`nextOBJ`에서 다음 역 1개씩 추출. 검증 케이스: 양방향 정상 / 종착역 단방향 / stationId 누락 400 / 미존재 404 / ODsay 장애 502 / OPTIONS preflight.

---

## 2026-05-08 — favorites-and-aliases D10 추가: 공용 StopPicker + 지하철 호선/방향 선택

옵션 (2) 채택. 즐겨찾기 추가와 SetupRoute 수동 검색이 **동일 공용 `<UnifiedStopPicker>`**를 사용. 지하철역 결과 선택 시 **호선 → 방향 선택 단계**가 자동 이어진다. 한 즐겨찾기/노드 = 한 호선 + 한 방향. 환승역에서 두 호선 단골은 별개 카드 두 개.

- 기존 SetupRoute 수동 검색의 지하철 NULL 저장 한계 해소(재등록 시점부터 정확한 `directionHeadsign`/`directionUpdn`/`subwayCode` 채워짐).
- BE 신규 데이터 endpoint 필요: `GET /subway-station-info`(옵션 A) **또는** 기존 `search-stops` 응답에 `subwayLines` 확장(옵션 B), 또는 정적 매핑(옵션 C). 결정은 be-agent + api-expert가 ODsay/서울 지하철 API 조사 후 확정 (TASKS T10-a). spec엔 응답 스키마 셋 다 명시됨 — 채택 시 나머지 삭제.
- 폴백: 호선/방향 정보 미제공/장애 시 FE는 사용자 동의로 NULL 저장 허용 (legacy graceful fallback).
- 영향 task: T16 → T16-A(`<UnifiedStopPicker>`) + T16-B(SetupRoute 교체)로 분리. T10-a/T10-b/T10-b' Phase 2-2 신설. T18은 `<UnifiedStopPicker>` 의존으로 변경.

> be-agent 위임: `/subway-station-info` endpoint 또는 `search-stops` 응답 확장 둘 중 하나로 호선 목록 + 호선별 양 종착지(up/down headsign)를 제공. ODsay subwayInfo / 서울 지하철 통합 API / 정적 hardcode 셋 중 가용 출처 조사 후 결정.

---

## 2026-05-08 — favorites-and-aliases spec OQ 5개 결정 반영

`docs/specs/favorites-and-aliases/{PRD,SDD,TASKS}.md` + `docs/api/contracts/favorites.md` 업데이트. 구현은 spec 승인 후 진행.

- **D1.** `GET /arrival-info?stopId=` lookup 통합 — `route_stops` ∪ `favorite_stops`. FE는 분기 모름.
- **D2.** `routes.active boolean NOT NULL DEFAULT true` 컬럼 신설 + 기존 row backfill. `PATCH /routes/:id`에 `active` 토글 포함. GET 응답에 `active` 필드 추가 (옵셔널 → 마이그레이션 후 NOT NULL).
- **D3.** 별명 컨텍스트별 분리 — `route_stops.alias`와 `favorite_stops.alias`는 별도. 동기화 없음.
- **D4.** dnd 인프라 새로 도입 (`react-dnd-multi-backend`/`react-dnd-touch-backend` 후보). 기존 `react-dnd` + HTML5 단독은 모바일 미지원이라 사용 안 함. SetupRoute의 dnd 제거는 의도적이었음 — 백로그 #B3 무효 처리.
- **D5.** 즐겨찾기 노선 0개 불허. POST/PATCH `/favorite-stops`에서 `routes: []`/누락 시 400 `FAVORITE_ROUTES_REQUIRED`. FE는 저장 버튼 disabled.

영향: BE는 `routes` 마이그레이션 1개 추가 (active), FE는 `SavedRoute` 타입에 `active` 필드 + dnd 라이브러리 교체 + 즐겨찾기 저장 버튼 검증 추가.

---

## 현재 API 스펙 요약 (2026-04-21 기준)

### GET /search-stops?q={query}

정류장/역 검색. ODsay `searchStation` 프록시.

**응답:**
```json
[
  {
    "id": "87103",
    "name": "개봉역",
    "type": "bus",
    "lat": 37.4912,
    "lng": 126.8628,
    "arsId": "21003"
  }
]
```

| 필드 | 설명 |
|------|------|
| `id` | ODsay stationID (문자열) — 경로탐색, odsay 도착정보에 사용 |
| `type` | `"bus"` / `"subway"` |
| `arsId` | 정류장 고유번호 (표지판에 적힌 번호) — 서울 버스 API 조회에 사용. 지하철역은 `null` |

---

### POST /route-search

좌표 → 대중교통 경로 목록. ODsay `searchPubTransPathT` 프록시.

**요청:**
```json
{ "startX": 126.86, "startY": 37.49, "endX": 127.02, "endY": 37.49 }
```

**응답:**
```json
[
  {
    "id": "0",
    "totalMinutes": 42,
    "transferCount": 1,
    "segments": [
      {
        "type": "bus",
        "sectionMinutes": 15,
        "startName": "개봉역",
        "startOdsayId": 87103,
        "startArsId": "21003",
        "endName": "구로역",
        "endOdsayId": 88201,
        "endArsId": "21012",
        "lines": [
          {
            "routeName": "643",
            "busRouteId": "100100643",
            "busType": 12,
            "subwayCode": null
          }
        ]
      },
      {
        "type": "subway",
        "sectionMinutes": 20,
        "startName": "구로역",
        "startOdsayId": 110,
        "startArsId": null,
        "endName": "강남역",
        "endOdsayId": 225,
        "endArsId": null,
        "lines": [
          {
            "routeName": "1호선",
            "busRouteId": null,
            "busType": null,
            "subwayCode": "1001"
          }
        ]
      }
    ]
  }
]
```

| 필드 | 설명 |
|------|------|
| `startOdsayId` / `endOdsayId` | ODsay 정류장 ID — `arrival-info?type=odsay` 에 사용 |
| `startArsId` / `endArsId` | 서울 버스 arsId — `arrival-info?type=bus` 에 사용. 지하철 구간은 `null` |
| `busRouteId` | 서울 버스 API busRouteId. 지하철은 `null` |
| `busType` | ODsay 버스 노선 타입. 지하철은 `null` |
| `subwayCode` | 서울 지하철 API subwayId 형식 (`"1001"`, `"1002"` ...). 버스는 `null` |

---

### GET /arrival-info

실시간 도착정보. `type` 파라미터로 버스/지하철/odsay 구분.

**type=bus:** `GET /arrival-info?type=bus&busRouteId=100100643&arsId=21003`  
**type=subway:** `GET /arrival-info?type=subway&stationName=강남`  
**type=odsay:** `GET /arrival-info?type=odsay&stationId=87103`

---

### GET /stop-buses?arsId={arsId}

arsId로 해당 정류장에 오는 버스 노선 목록 조회.

---

### GET/POST/PUT/DELETE /routes

인증 필요 (Bearer JWT). 사용자 저장 경로 CRUD.

---

## 변경 이력

### 2026-05-05 | 에러 응답 구조화 + ADR-002 D3-supplement (설계 합의, 구현 대기)

`{ error: string }` 단일 문자열 응답으로는 FE가 에러 종류를 구분할 수 없어 사용자 안내 분기 불가. 특히 `odsay_fallback` provider가 (1) 진짜 미지원 지역, (2) GBIS 매핑 실패, (3) 매핑 검증 실패를 동일하게 표현해 "왜 안 되는지/뭘 해야 하는지" 안내 불가능. 본 변경으로 에러 응답을 구조화하고 `arrival-info` 도메인 코드 5종을 정의. 상세: `docs/api/contracts/error-codes.md`, `docs/decisions/ADR-002-multi-region-arrival-provider.md` (D3-supplement).

**1. 응답 스키마 변경 (BE) [BREAKING — 호환 사이클 별도 합의]:**

```
{ "error": "메시지" }                                    ← 기존
{ "error": { "code": "...", "message": "...", "detail"? } }  ← 신
```

- `error.code` — 머신 판독용 안정 contract (예: `ARRIVAL_MAPPING_FAILED`)
- `error.message` — 한국어 사용자 노출용 (BE가 책임 — FE 별도 i18n 매핑 불필요)
- `error.detail` — 디버그 옵셔널 (외부 API status, 매핑 실패 사유 등)

> 호환 전략: 한 사이클 동안 string + object 동시 직렬화 권장 (`{ error: "...", errorCode: "...", errorDetail: "..." }`). 다음 사이클에 object 단일화. 결정은 별도 합의에서 확정.

**2. 신설 에러 코드 (arrival-info 도메인):**

| 코드 | HTTP | 의미 | 재시도 | 사용자 액션 |
|------|------|-----|------|-----------|
| `ARRIVAL_UNSUPPORTED_REGION` | 422 | 서울·경기 외 지역 (강원/충청 등) | 불가 | 없음 (지원 확장 대기) |
| `ARRIVAL_MAPPING_FAILED` | 422 | 경기 정류장 GBIS station 매핑 실패 | 불가 | 경로 재등록 |
| `ARRIVAL_VERIFY_FAILED` | 422 | GBIS 매핑 운행 노선 교집합 50% 미달 | 불가 | 경로 재등록 |
| `ARRIVAL_PROVIDER_ERROR` | 502 | 외부 API 호출 실패 (서울/GBIS/ODsay) | 가능 (지수 백오프) | 재시도 |
| `ARRIVAL_STOP_NOT_FOUND` | 404 | stopId DB 없음 / RLS 위반 | 불가 | 새로고침 |

**3. `odsay_fallback`의 의미 분리 (중요):**

이전까지 `provider === 'odsay_fallback'`은 위 3개 422 에러 케이스를 모두 묶어 표현. 본 변경 후 FE는 다음과 같이 분기한다.

- **정상 응답 + `provider: 'odsay_fallback'` (200)** — 매핑은 실패했지만 ODsay realtimeStation으로 부분 응답 가능. 기존 inline 안내 유지: "도착 정보가 부정확할 수 있어요 (제휴 데이터 사용)"
- **422 `ARRIVAL_UNSUPPORTED_REGION`** — 도착 카드 자리에 "이 지역은 실시간 도착 정보를 지원하지 않아요". 새로고침 비활성화
- **422 `ARRIVAL_MAPPING_FAILED` / `ARRIVAL_VERIFY_FAILED`** — "도착 정보를 가져올 수 없어요. 경로를 다시 등록하면 더 정확해져요" + "재등록" 액션 권장

> 한 줄 요약: **`odsay_fallback`은 더 이상 단일 상태가 아님.** 200으로 부분 응답이 가능한 케이스에만 provider 라벨로 사용하고, 응답 자체를 만들 수 없는 실패는 422 에러 코드로 명시 분리.

**4. ADR-002 D3-supplement — busType 보조 신호 (BE):**

좌표 bounding box 1차 판단 유지 + ODsay route의 `busType === 6` (경기버스) 노선이 정류장에 하나라도 있으면 GBIS 매핑 시도. 좌표가 서울 bbox 안인 경계 지역 오분류 보완. ADR-002 Alternatives C ("노선 패턴 기반 판단")는 "정류장 검색 시점에 노선 정보 없음"으로 기각됐으나, 경로 **저장** 시점엔 route-search 응답으로 busType이 확보됨 — 기각 사유 해소.

**FE 영향:**
- `lib/api.ts` fetch 헬퍼에 응답 normalize 추가 — `body.error.code` 추출 → `ApiError(code, message)` throw
- `arrival-info` 호출 컴포넌트(`Home.tsx` 도착 카드)에서 코드별 분기 UI 추가
- 알려지지 않은 코드는 `error.message`를 그대로 일반 토스트 노출 (forward-compat)

**BE 영향:**
- `_shared/error.ts`에 `errorResponse(code, message, status, detail?)` 헬퍼 추가
- `arrival-info`의 매핑/검증/외부 API 호출 분기마다 적절한 코드 반환
- `routes` POST 매핑 단계에 D3-supplement 로직 추가 (busType 6 → GBIS 매핑 시도)

**API 계약 영향:** 모든 엔드포인트의 에러 응답 구조 변경 (BREAKING). 정상 응답 스키마는 영향 없음.

**구현 진행:** 계약서·ADR 작성 완료 (2026-05-05). 호환 사이클 정책 합의 + 사용자 승인 후 BE/FE 동시 구현 예정.

---

### 2026-05-02 | multi-region-bus-arrival v2 — 캐싱 패턴 도입 (설계 갱신)

GBIS API 명세 확정 후 발견 — (1) 정류소 검색 API 부재, (2) 정류소→노선 detail API 부재. 매번 매핑 시 외부 API 페이징 다운로드는 비현실적 → **경기도 정류소 자체 캐시(`gbis_stations`) + 일 1회 cron** 패턴으로 전환. 상세: `docs/specs/multi-region-bus-arrival/SDD.md`(v2), `docs/decisions/ADR-003-gbis-station-caching.md`, `docs/api/contracts/sync-gbis-stations.md`, `when_come_be/docs/external-apis/gyeonggi-bus.md`(v2).

**핵심 변경:**
1. **신규 테이블 `gbis_stations`** — 경기 OpenAPI에서 31개 시군 정류소를 일 1회 캐시. PK `station_id`, 인덱스: `ars_no`/`(lat,lng)`/`sigun_nm`.
2. **신규 Edge Function `POST /sync-gbis-stations`** — Service Role 인증, GitHub Actions cron(`0 19 * * *` UTC = 04:00 KST)이 호출. 시군별 페이징 다운로드 + upsert.
3. **신규 GitHub Actions 워크플로** `.github/workflows/sync-gbis-stations.yml` — 사용자 액션: GitHub Secrets에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등록.
4. **매핑 알고리즘 갱신** — `findGbisStation` 외부 API 호출 → `findGbisStationFromDB` 자체 DB 검색으로 교체. ARS 1차 매칭 + 좌표/이름 보조(Haversine 200m + Levenshtein 0.7).
5. **노선 매핑 알고리즘 신규** — `getBusRouteListv2(keyword=routeName)` + `getBusRouteStationListv2(routeId)` 조합으로 우회. 정류소→노선 detail API 부재 보완. 5분 캐시.
6. **`getGbisStationDetail` 폐기** — v1 SDD가 가정한 API가 GBIS에 존재하지 않음.

**API 계약 영향: 없음 (BE 내부 변경).** `arrival-info`/`routes` 외부 계약은 v1 그대로.

**환경변수 추가:** `GYEONGGI_OPENAPI_KEY` (경기도 자체 OpenAPI, 공공데이터포털 키와 별도 시스템). 기존 `GYEONGGI_BUS_API_KEY`는 도착·노선조회에 그대로 사용.

**FE 영향: 없음.** v1 Phase 3에서 적용한 stopId 기반 호출 + fallback 안내 그대로 유효.

**사용자 액션 (배포 전 필수):**
1. 공공데이터포털 데이터셋 ID `15080662` (경기도 시내버스 노선 정보) 활용 신청 (기존 `GYEONGGI_BUS_API_KEY` 동일 키)
2. **경기도 자체 OpenAPI 인증키 발급** (`https://openapi.gg.go.kr` — 별도 시스템) → `GYEONGGI_OPENAPI_KEY`로 등록
3. GitHub Secrets 등록: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
4. 첫 배포 후 `workflow_dispatch`로 수동 1회 실행 → `gbis_stations` row > 30,000 확인 후 트래픽 활성화

**구현 진행:** SDD v2 / TASKS v2(T21~T26) / ADR-003 / 신규 계약서 작성 완료. 사용자 승인 + OpenAPI 키 발급 후 BE Phase 5 착수 예정.

---

### 2026-05-02 | multi-region-bus-arrival 설계 합의 (구현 대기)
경기도 정류장(광명·시흥 등) 도착정보 미동작 이슈 해결을 위한 멀티-지역 Provider 아키텍처 도입. 상세 설계: `docs/specs/multi-region-bus-arrival/`, `docs/decisions/ADR-002-multi-region-arrival-provider.md`, `docs/api/contracts/arrival-info.md`, `docs/api/contracts/routes.md`.

핵심 결정 — (1) `ArrivalProvider` 인터페이스 + `SeoulBusProvider` / `GyeonggiBusProvider` / `OdsayBusProvider` 3 구현, (2) `arrival-info`는 `?stopId={uuid}` 입력으로 BE가 DB의 `route_stops.provider`로 분기, (3) 저장 시 ODsay 좌표(`x`/`y`) bounding box로 지역 판별 후 GBIS 정류소·노선 검색으로 매핑, (4) 매핑 직후 1회 검증(운행 노선 50% 교집합) 실패 시 `provider='odsay_fallback'`로 격하.

**API 계약 변경 (모두 additive — Breaking 없음, legacy 한 사이클 호환):**

1. **GET `/arrival-info`** — `?stopId={uuid}` 입력 추가 (인증 필수). 응답에 `provider`, `fetchedAt` 추가. 버스 items에 `remainSeatCnt`/`crowded`/`lowPlate` 옵셔널 추가 (GBIS 한정). 기존 `?type=bus&arsId&busRouteId`는 한 사이클 호환 후 제거 예고.

2. **POST `/routes`** — stops[]에 `lat`/`lng` 추가 권장 (BE 매핑 입력). `provider`/`gbisStationId` 옵셔널 (FE 힌트). stopRoutes[]에 `gbisRouteId`/`gbisStaOrder` 옵셔널.

3. **GET `/routes` 응답** — route_stops[]에 `provider`(필수), `gbis_station_id`(옵셔널). stop_routes[]에 `gbis_route_id`/`gbis_sta_order` 옵셔널.

**DB 마이그레이션:** `route_stops`에 `provider text CHECK`, `gbis_station_id text` 추가. `stop_routes`에 `gbis_route_id text`, `gbis_sta_order int` 추가. 기존 row는 `provider='seoul'`로 일괄 백필. 마이그레이션 파일(예정): `20260502000000_add_provider_to_route_stops.sql`.

**FE 영향:** `lib/api.ts`에 `fetchArrivalByStopId(stopId)` 추가, 기존 호출은 한 사이클 유지. 도착 카드에 `provider==='odsay_fallback'` 시 inline 안내 1행 추가. 그 외 UI 변경 없음.

**사용자 액션 (배포 전 필수):** 공공데이터포털에서 `경기도_시내버스 정류소 정보조회`, `경기도_시내버스 노선 정보조회` 데이터셋 활용 신청·승인 (인증키는 기존 `GYEONGGI_BUS_API_KEY` 동일 키 사용 가능).

**구현 진행:** PRD/SDD/TASKS 작성 완료 (2026-05-02). 사용자 승인 + 데이터셋 승인 후 BE Phase 1 착수 예정.

---

### 2026-04-28 | route-direction 설계 합의 → 구현 완료
지하철 양방향 도착 정보 분리를 위한 방향 모델 추가. 상세: `docs/api/contracts/route-direction-design.md`, `docs/decisions/ADR-001-subway-direction-model.md`.

**구현 상태(2026-04-28):** Phase 1·2·3·4 완료. 마이그레이션 적용됨, BE deno test 통과, FE 빌드 OK. 수동 QA(7호선 분기, 2호선 외선, 광역철도 fallback)는 `when_come_be/docs/tech-notes/route-direction-open-questions.md`에서 별도 진행.

**Breaking change 없음 확인:** 모든 신규 필드 옵셔널. 구 클라이언트는 신규 응답 필드를 무시하고, 신규 클라이언트는 구 응답에서 신규 필드를 `undefined`로 받아 fallback 동작. 기존 저장 row(방향 NULL)는 호선 일치 전체로 fallback + inline 안내 노출 — 도착 카드 비어버리지 않음.

**변경 요약 (모두 additive — Breaking 없음):**

1. **POST `/route-search` 응답** — `segments[]`에 옵셔널 필드 추가
   - `way: string | null` — ODsay `subPath.way` (지하철 종점역명, 미제공 가능)
   - `wayCode: 1 | 2 | null` — ODsay `subPath.wayCode` (1=상행/내선, 2=하행/외선)
   - 버스 segment에서는 항상 null

2. **POST `/routes` 요청** — `stops[]` 항목에 옵셔널 필드 추가
   - `directionHeadsign?: string | null` — 예: `"장암행"`
   - `directionUpdn?: 'up' | 'down' | null`
   - `directionNextStop?: string | null` — ODsay `endName` (디버그/감사용)
   - subway stop에만 의미. 버스 stop은 미전송.

3. **GET `/routes` 응답** — `route_stops[]`에 옵셔널 필드 추가
   - `direction_headsign?: string | null`
   - `direction_updn?: 'up' | 'down' | null`
   - `direction_next_stop?: string | null`

4. **GET `/arrival-info?type=subway`** — **변경 없음.** 응답을 그대로 두고 FE에서 매칭/필터링.

**FE 매칭 규칙 (참고):**
- `subwayId === lineName` 1차 필터
- `direction_updn` 있으면 `updnLine` 정규화 비교 (`상행/내선→up`, `하행/외선→down`)
- `direction_headsign` 있으면 `trainLineNm.startsWith(headsign)` 비교
- 매칭 0건이면 호선만 일치하는 전체로 fallback (legacy 데이터 호환)

**DB 마이그레이션:** `route_stops` 신규 3컬럼, 모두 nullable. 기존 row 영향 없음. 마이그레이션: `20260428000000_add_direction_to_route_stops.sql` (적용 완료).

**기존 사용자 데이터:** 방향 NULL → fallback 동작. 정확한 표시를 위해 재등록 권장 안내(선택).

**구현 후 응답 예시 (지하철 segment, route-search):**
```json
{
  "type": "subway",
  "startName": "석남(거북시장)",
  "endName": "산곡",
  "way": "장암",
  "wayCode": 2,
  "lines": [{ "routeName": "수도권 7호선", "subwayCode": "1007", "busRouteId": null, "busType": null }]
}
```

**구현 후 응답 예시 (GET /routes의 route_stops 항목, 지하철):**
```json
{
  "id": "...",
  "stop_name": "석남(거북시장)",
  "stop_type": "subway",
  "sequence": 0,
  "ars_id": null,
  "direction_headsign": "장암행",
  "direction_updn": "down",
  "direction_next_stop": "산곡",
  "stop_routes": []
}
```

> 위 예시는 실측 검증 전이며, 실제 ODsay 응답에서 `way`/`wayCode` 누락이 발견되면 OQ1~OQ3 결과(`when_come_be/docs/tech-notes/route-direction-open-questions.md`)에 따라 보강.

---

### 2026-04-21 | POST /route-search | `subwayCode` 타입 변경 [BREAKING]
`segments[].lines[].subwayCode`: `number | null` → `string | null`
- 변경 전: `2` (ODsay 형식)
- 변경 후: `"1002"` (서울 지하철 API subwayId 형식)

### 2026-04-21 | POST /route-search | arsId 필드 추가
`segments[]`에 `startArsId`, `endArsId`, `startOdsayId`, `endOdsayId` 추가.

### 2026-04-21 | GET /stop-buses | 신규 엔드포인트
arsId로 정류장 노선 목록 조회.

### 2026-04-21 | GET /arrival-info?type=bus | arsId 방식 추가, stationName 제거 [BREAKING]
- 제거: `busRouteId + stationName` 방식
- 추가: `busRouteId + arsId` 방식

### 2026-04-19 | POST /route-search | `busType` 필드 추가
`segments[].lines[]`에 `busType: number | null` 추가.

---

2026-05-06 — 지하철 도착 API 다단계 fallback 도입. FE는 stop.name 그대로 전달, BE가 OVERRIDES → strip → OVERRIDES 순서로 시도. 0건일 때 "도착 정보 없음" 표시 (FE 측 변경 별도).

## 2026-05-08 — 지하철 도착 응답 `headsign` + `displayMsg` 확장

### [ADD] `arrival-info` 지하철 응답 item에 `headsign: string | null` 추가 (additive, Breaking 없음)

서울 지하철 API의 `trainLineNm`과 `arrmsg1`에서 행선지(이번 열차가 어디행인지)를 추출해 동봉.

추출 우선순위:
1. `trainLineNm`의 첫 번째 "X행" 패턴: `"온수행 - 역삼방면"` → `"온수행"`
2. 실패 시 `arrmsg1` 괄호 안 텍스트: `"5분 후 (인천)"` → `"인천행"`
3. 둘 다 실패 → `null` (anomaly_logs 기록, 응답엔 영향 없음)

FE 사용 예시: `"온수행 곧 도착"` / `"인천행 5분 후"` 패턴으로 카카오지하철과 유사한 UX.

### [EXTEND] `displayMsg` — arvlCd 99 fallback 패턴 추가

기존 arvlCd 0~5 매핑 유지. arvlCd 99(또는 누락)인 경우 arrmsg1 패턴 매칭으로 보충:
- `"[N]번째 전역 (...)"` → `"N개역 전"` (예: `"[2]번째 전역 (온수)"` → `"2개역 전"`)
- `"N분..."`, `"N초..."` 등 시간 카운트다운 → `null` (FE 기존 카운트다운 유지)
- 매칭 실패 → `null` (anomaly_logs 기록)

FE 기존 동작 (`displayMsg ?? arrmsg1`) 그대로 유지. BE 미배포 환경에서도 FE는 정상 동작.

업데이트된 응답 타입:
```ts
interface SubwayArrivalItem {
  lineName: string
  direction: string
  arrmsg1: string
  arrmsg2: string
  updnLine: string
  displayMsg: string | null  // 기존
  headsign: string | null    // 신규 추가
}
```

영향 파일: `when_come_be/supabase/functions/arrival-info/index.ts`
FE 타입 업데이트 필요: `SubwayArrivalItem`에 `headsign?: string | null` 추가 (옵셔널로 받아 forward-compat).

---

## 2026-05-08 — 지하철 도착 응답 `displayMsg` 필드 추가

### [ADD] `arrival-info` 지하철 응답 item에 `displayMsg: string | null`

서울 지하철 통합 API의 `arvlCd`(도착 코드)를 BE에서 짧은 한국어 라벨로 매핑해 동봉.

매핑:
- 0(당역진입) → `"진입중"`
- 1(당역도착) → `"도착"`
- 2(출발) → `"출발"`
- 3(전역출발) → `"전역 출발"`
- 4(전역진입) → `"전역 진입"`
- 5(전역도착) → `"전역 도착"`
- 99(운행중) / 누락 / 알 수 없는 값 → `null`

FE 동작:
- `displayMsg ?? arrmsg1` 패턴으로 우선 사용 — null이면 기존 카운트다운 표시 유지
- `getArrivalMin` subway 분기에서 `displayMsg != null`이면 0분으로 간주해 isUrgent 빨간색 강조 동작
- BE 미배포 환경 호환을 위해 FE 타입은 `displayMsg?: string | null` (옵셔널). 양쪽 배포 완료 후 별도 커밋으로 옵셔널 제거 예정

영향: 지하철 카드 폭 깨짐(긴 메시지로 호선 뱃지 잘림) 해소.

---

## 2026-05-09 — favorites-and-aliases Phase 2 BE Edge Functions 완료

Phase 2 BE 구현 완료. FE Phase 3 착수 가능.

### 신규 엔드포인트

#### GET/POST/PATCH/DELETE `/favorite-stops`

인증 필수 (Bearer JWT).

**GET `/favorite-stops`**
- 응답: `FavoriteStop[]` — `display_order` asc, `created_at` asc 정렬
- 각 항목에 `favorite_stop_routes` 조인 포함

**POST `/favorite-stops`**
```json
{
  "odsayStopId": "106186",
  "stopName": "강남역",
  "stopType": "bus",
  "lat": 37.498,
  "lng": 127.028,
  "arsId": "23156",
  "alias": "회사 앞",
  "routes": [
    { "odsayRouteId": "100100643", "routeName": "643", "busType": 12, "stId": "106186", "busRouteId": "100100643", "stationOrd": 5, "stationName": "강남역" }
  ]
}
```
- `routes` 빈 배열 또는 누락 → 400 `FAVORITE_ROUTES_REQUIRED` (PRD D5)
- `provider` 자동 매핑: 좌표 bounding box → Seoul/Gyeonggi/odsay_fallback
- `display_order` 자동 부여 (현재 max + 1)
- 응답 201: 생성된 `FavoriteStop` 전체 (favorite_stop_routes 포함)

**PATCH `/favorite-stops/:id`**
```json
{
  "alias": "새 별명",
  "displayOrder": 2,
  "routes": [...]
}
```
- 각 필드 독립 수정 (부분 수정 가능)
- `routes: []` → 400 `FAVORITE_ROUTES_REQUIRED`
- `routes` 있으면 전체 교체 (기존 삭제 + 재삽입)
- 응답 200: 수정된 `FavoriteStop` 전체

**DELETE `/favorite-stops/:id`**
- 응답 204 (No Content)
- `favorite_stop_routes` cascade 자동 삭제

#### PATCH `/routes/:id` 확장 (기존 엔드포인트 확장)

```json
{
  "name": "출근길(수정)",
  "displayOrder": 1,
  "active": false,
  "stops": [...]
}
```
- 각 필드 독립 수정 (부분 수정 가능). 기존 PUT 시맨틱(stops 전체 교체) 포함.
- `active` 반드시 boolean — 문자열 "true"/"false" 허용 안 함
- `name` 빈 문자열 → 400
- `stops: []` → 400
- `stops` 있으면 route_stops 전체 교체 + provider 재매핑

#### PATCH `/route-stops/:id` (신규)

```json
{ "alias": "출구 앞 정류장" }
```
- `alias` 단일 필드만 수정 (빈 문자열 → null 정규화)
- RLS: 부모 `routes.user_id === auth.uid()` 검증
- 응답 200: 수정된 `route_stop` 전체 (`stop_routes` 포함)

#### GET `/arrival-info?stopId=` 확장 (D1)

`stopId`가 `route_stops`에 없으면 `favorite_stops`를 자동으로 fallback 조회.
- FE는 분기 없이 동일 `?stopId={uuid}` 패턴 사용
- `favorite_stops.id`도 `stopId`로 전달 가능
- 둘 다 없으면 404 `ARRIVAL_STOP_NOT_FOUND`

### FE 다음 작업 (Phase 3)

**T11 — 도메인 타입 확장** (착수 가능)
- `TransitStop`에 `alias?: string | null` 추가
- `SavedRoute`에 `displayOrder?: number`, `active?: boolean` 추가
- `FavoriteStop` 타입 신규: `{ id, odsayStopId, stopName, stopType, arsId, lat, lng, provider, gbisStationId, alias, displayOrder, favoriteStopRoutes: FavoriteStopRoute[] }`

**T12 — `lib/api.ts` 확장** (T11 완료 후)
- `fetchFavoriteStops()` — GET /favorite-stops
- `createFavoriteStop(body)` — POST /favorite-stops
- `updateFavoriteStop(id, partial)` — PATCH /favorite-stops/:id
- `deleteFavoriteStop(id)` — DELETE /favorite-stops/:id
- `patchRoute(id, partial)` — PATCH /routes/:id (active/displayOrder/name/stops)
- `patchRouteStop(id, { alias })` — PATCH /route-stops/:id

**T13~T15 — `<StopName>` 공용 컴포넌트** (T11 완료 후)

**T16~T19 — Favorites 페이지 + BottomNav 변경** (T12 완료 후)

### 에러 코드 신설

| 코드 | HTTP | 의미 |
|------|------|------|
| `FAVORITE_ROUTES_REQUIRED` | 400 | 즐겨찾기 노선 0개 저장 시도 (POST/PATCH) |

---

## 2026-05-09 — favorites-and-aliases Phase 1 마이그레이션 완료

Phase 1 DB 마이그레이션 4개 파일 적용 완료. FE 영향 없음. Edge Function(Phase 2)은 다음 PR.

**적용된 마이그레이션:**
- `20260509000000_create_favorite_stops.sql` — `favorite_stops` + `favorite_stop_routes` 테이블 + RLS (T1)
- `20260509000100_add_alias_to_route_stops.sql` — `route_stops.alias text` nullable 추가 (T2)
- `20260509000200_add_display_order_to_routes.sql` — `routes.display_order int NOT NULL DEFAULT 0` + 기존 row 0-based 백필 + 인덱스 (T3)
- `20260509000300_add_active_to_routes.sql` — `routes.active boolean NOT NULL DEFAULT true` + 기존 row true 백필 + 인덱스 (T3-a)

**검증 완료:**
- `routes.active` NULL 0개, 기존 row 모두 true 백필
- `routes.display_order` NULL 0개, default 0 적용
- `favorite_stops` stop_type/direction_updn/provider check 제약 동작
- `favorite_stop_routes` cascade delete (favorite_stops 삭제 시 자동 삭제)
- RLS 정책: owner read(SELECT) + owner write(ALL) 정상 등록

**FE 영향:** 없음 (additive — 기존 GET /routes 응답에 `display_order`, `active` 필드 추가됨. 현재 FE가 무시해도 동작 무관).

**Phase 2 착수 사전 준비:** 마이그레이션 완료로 T4~T10 EF 개발 가능. `favorite_stops`, `favorite_stop_routes` 테이블 존재 확인됨.

---

## 2026-05-08 — favorites-and-aliases spec 작성 (구현 별도)

FavoriteStops(단일 정류장 즐겨찾기) 도메인 + 정류장/역 별명(alias) + 경로/즐겨찾기 정렬을 위한 PRD/SDD/TASKS/계약서 작성. 구현은 사용자 승인 후 별도 Phase로 진행.

- 신규 spec: `docs/specs/favorites-and-aliases/PRD.md`, `SDD.md`, `TASKS.md`
- 신규 계약: `docs/api/contracts/favorites.md` (GET/POST/PATCH/DELETE `/favorite-stops`, PATCH `/routes/:id`, PATCH `/route-stops/:id`)
- DB 변경 예정: 신규 `favorite_stops` + `favorite_stop_routes`, `route_stops.alias`, `routes.display_order` 추가
- FE 영향: BottomNav "경로 등록" → "즐겨찾기" 라벨 변경, `/favorites` + `/favorites/add` 신규, `<StopName>` + `<AliasEditor>` 공용 컴포넌트, RouteManagement 두 섹션 분할 + 항목 메뉴 통합 + 경로 수정 진입, Home 칩 DnD 정렬, Favorites 길게 누름 정렬
- 모든 신규 필드 옵셔널 (additive — Breaking 없음). 기존 사용자 데이터는 마이그레이션 시 `display_order` ROW_NUMBER 백필.

---

## 2026-05-08 — 도착정보 노선 매칭 규약 명시 (FE 버그 수정)

### [CONTRACT] `GET /arrival-info?stopId=` 응답 items 순서 보장 안 함

기존부터 BE `arrival-info`는 provider별 `Promise.all` 병렬 fetch 결과를 단순 concat하므로 응답 `items` 순서는 **provider 응답 도착 순서**이며 `stop_routes` 순서와 무관. 또한 외부 API(서울 버스 `getStationByUid` 등)는 정류장의 모든 노선을 반환하므로 사용자 미저장 노선이 섞일 수 있음.

**FE는 인덱스 기반 매칭을 사용하면 안 됨.** 노선번호로 매칭:
- `bus_by_stopid`: `item.busRouteAbrv === line` (또는 `"번"` suffix 정규화)
- `bus` (legacy): `item.routeName === line`
- `odsay`: `item.routeName === line`

같은 `busRouteAbrv`가 중복으로 올 수 있음(서울/경기 동일 번호 노선 등). FE는 `traTime1` 최솟값을 채택.

영향 파일: `when_come_fe/src/lib/arrival.ts`. 자세한 분석은 `when_come_fe/docs/tech-notes/arrival-route-matching.md`.

---

## 2026-05-06 — 군자역 지하철 API 매핑 + 빈 경로 저장 차단

### [FIX] arrival-info: 군자역 별칭 매핑 (BE 내부 변경)

서울 지하철 실시간 도착 API는 군자역을 `"군자(능동)"`으로만 색인. ODsay는 `"군자"`로 반환하므로 BE `normalizeSubwayStationName`에 OVERRIDES 매핑 추가.
- `"군자"` → `"군자(능동)"` (5호선/7호선)
- `"군자역"`, `"군자(능동)"` 입력도 모두 `"군자(능동)"`으로 정규화
- FE 변경 없음. 도착 API 응답 스키마 변경 없음.
- 향후 동일 패턴 역 발견 시 `SUBWAY_NAME_OVERRIDES` 맵에 추가.

### [FIX] routes POST: stops 없으면 400 (기존 동작 확인)

`stops`가 없거나 빈 배열이면 `400 "정류장이 최소 1개 이상 필요합니다"`. 기존 코드에 이미 구현되어 있었음. FE 변경 없음.

---

## 2026-05-03 — step_group · 홈 타임라인 전면 개편

### [NEW] route_stops.step_group

`routes` POST body에 `stepGroup: number` 필드 추가됨.
- 1-based 정수, 같은 논리 스텝의 대안 정류장을 묶는 키
- (route_id, step_group, sequence) unique constraint
- 한 그룹 최대 2개, 같은 stopType 강제
- `GET /routes` 응답 `route_stops[].step_group` 포함

### [NEW] stop-buses startStation / endStation

`GET /stop-buses?arsId=` 응답에 `startStation`, `endStation` 필드 추가.
영향: SetupRoute 버스 드롭다운에 종점 표시.

### [CHANGE] 홈 타임라인 도착 조회 범위 확장

- 기존: 현재 스텝만 `useQueries`
- 변경: `nonPastSegments` (현재+이후 전체) 동시 조회
- 다음 스텝 카드: 최소 도착 시간 표시 + accordion 상세

---

## 2026-05-09 — 지하철 도착정보 subwayCode 파라미터 추가 (non-breaking)

**대상:** `GET /arrival-info?type=subway&stationName=...`

**변경 내용:** `subwayCode` 쿼리 파라미터 추가 (optional).

- **형식:** `/^10\d{2}$/` (서울 지하철 API lineName 형식, 예: `"1004"`)
- **동작:** 전달 시 1차 응답에 해당 코드 매칭이 0건이면 역명 strip(괄호/역 제거) fallback을 추가로 시도하고 1차 + 2차 결과를 merge(dedupe)하여 반환.
  - 예: `stationName=서울역&subwayCode=1004` → 1차 "서울역"(GTX-A만) + 2차 "서울"(1호선/4호선) merge
- **[non-breaking]** 미전달 시 기존 동작 유지 (0건일 때만 fallback). 잘못된 형식은 무시.
- **FE 권장:** `arrival-info` 지하철 호출 시 `stop.subwayCode`(route_stops → stop_routes[0].subway_code)를 함께 전달하면 정확도 향상. 없어도 기존 동작 유지.
- **임시 해결책 주의:** backlog #9 (subway_code 전체 정비) 완료 전까지의 임시 패치. subway_code가 NULL인 기존 stop은 효과 없음.
- 영향 컴포넌트: `Home.tsx`
