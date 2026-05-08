# PRD — 즐겨찾기(단일 정류장) + 별명 (favorites-and-aliases)

- **상태:** 초안 (2026-05-08) — 검토 대기
- **작성일:** 2026-05-08
- **작성자:** architect
- **관련:** `SDD.md`, `TASKS.md`, `docs/api/contracts/favorites.md` (예정), `docs/api/contracts/routes.md`

---

## 1. 배경

when_come은 현재 **다중 스텝 경로(route)** 단위로만 도착 정보를 묶는다. 사용자는 출퇴근 양쪽으로 1~2개의 경로를 등록한 뒤 Home 대시보드에서 현재 스텝의 도착 정보를 본다. 이 모델은 "출근/퇴근"이라는 정형화된 동선엔 잘 맞지만, 다음 두 사용 패턴엔 비효율적이다.

### 1.1 현재 한계

1. **단일 정류장 빠른 조회 부재**
   "회사 앞 정류장에서 점심 시간에 마을버스가 언제 오는지 한 번 확인" 같은 단발성 사용에 경로 등록을 강요한다. 경로는 시작·끝점 + 중간 환승까지 묶어야 의미가 있어, 단일 정류장 도착만 보고 싶은 사용자에게 과한 입력 비용을 부과한다.

2. **정류장 식별의 불친화성**
   "강남역 1번 출구 정류장", "회사 앞", "엄마집 가는 길" 같이 사용자에게 의미 있는 라벨이 정류장 본명("강남역.강남역사거리")에 가려진다. 동일 이름의 정류장이 양방향으로 존재하거나 ARS 번호만 다른 경우, 사용자가 어떤 정류장이 자기 정류장인지 다음 사용 시점에 다시 파악해야 한다.

### 1.2 서비스 모드 구분

본 기능은 **경로 모드와 별개의 가벼운 모드**를 제공한다.

- **경로 모드 (기존):** 출퇴근 같은 다중 스텝 + 환승 의사결정
- **즐겨찾기 모드 (신규):** 단일 정류장 + 자주 타는 노선 N개 = 한 번에 보는 도착 카드

두 모드는 데이터 모델/API/UI 모두에서 분리되며, 푸터 탭으로 구분 진입한다.

---

## 2. 목표 / 비목표

### 2.1 목표

- **G1.** 사용자가 **단일 정류장 + 노선 N개**를 즐겨찾기로 저장하고, 홈 카드와 동일한 형식의 도착 정보를 한 화면에서 빠르게 본다.
- **G2.** 모든 정류장/역 표시 자리(홈, 즐겨찾기, 도착 상세, 검색 결과, 내 경로)에서 **별명(alias)** 을 본명 옆에 작게 일관되게 노출한다.
- **G3.** 즐겨찾기 목록과 홈 상단 경로 칩의 **순서를 사용자가 직접 정렬**하고, 그 순서가 모든 디바이스에서 보존된다.
- **G4.** 내 경로 화면에서 즐겨찾기/경로를 **수정**할 수 있다 (현재는 토글/삭제만).
- **G5.** 푸터 IA 변경 — "경로 등록" → "즐겨찾기" 라벨 + 의미 변경. 새 진입점은 즐겨찾기 추가에 초점.

### 2.2 비목표

- **N1.** 즐겨찾기 그룹화/폴더 (예: "회사 근처", "맛집 근처") — 후속.
- **N2.** 즐겨찾기/경로 공유 (URL, QR 등) — 후속.
- **N3.** 즐겨찾기 알림 (도착 임박 푸시) — 후속.
- **N4.** 별명 자동 추천 (정류장 좌표 → 인근 POI 이름) — 후속.
- **N5.** 즐겨찾기 → 경로 변환 도구 — 후속.
- **N6.** 단일 즐겨찾기에 **여러 정류장**(예: 동명 양방향 둘 다) 묶기 — `step_group`은 경로 전용. 즐겨찾기는 정류장 1개 = 카드 1개 유지.
- **N7.** PWA 아이콘 maskable, 도착 카드 UI 개편, 지하철 검색 정렬은 다른 트랙.

---

## 3. 사용자 시나리오

### 3.1 단골 정류장 빠른 조회 — 회사 앞 마을버스

> 사용자 A는 점심 시간마다 회사 앞 정류장에서 마을버스 5번을 타고 식당가에 간다. 경로 등록할 만한 동선은 아니다.

1. 푸터 "즐겨찾기" 탭 진입 → 빈 상태 카피 + `+` 버튼
2. `+` 탭 → SetupRoute와 동일한 검색 UI로 "역삼주민센터" 검색
3. 검색 결과 선택 → 노선 목록에서 마을버스 5번 체크
4. 별명 입력 (선택) — "회사 앞 점심"
5. 저장 → 즐겨찾기 탭 목록에 카드 등장
6. 다음날 점심: 즐겨찾기 탭 → 5번 도착 카드 즉시 확인

### 3.1-b 환승역 즐겨찾기 — 서울역 1호선 인천행 단골 등록

> 사용자 A2는 매일 아침 서울역 1호선 인천행으로 출근한다. 환승역이라 방향을 정확히 골라야 도착 카드가 의미 있다.

1. 푸터 "즐겨찾기" 탭 → `+`
2. 공용 `<StopPicker>`로 "서울역" 검색 → 결과 선택
3. 지하철역이므로 **호선 선택 단계** 진입 — 1호선 / 4호선 / 공항철도 중 1호선 선택
4. **방향 선택 단계** — "인천행" / "동묘앞행" 중 인천행 선택
5. 별명 입력 (선택) — "출근 1호선"
6. 저장 → 즐겨찾기 카드에 1호선 인천행으로 정확히 매칭된 도착 정보 노출
7. 같은 서울역 4호선 사당행도 별개 카드로 추가하면 두 카드가 별명으로 구분되어 함께 보임

> 같은 흐름이 SetupRoute 수동 검색에도 적용된다. 기존엔 지하철역을 수동 검색으로 추가하면 호선/방향이 NULL로 저장되어 도착 카드가 호선 일치 fallback에 의존했지만, D10 채택 후엔 두 진입점 모두에서 정확한 매칭이 된다.

### 3.2 별명으로 정류장 구분 — 양방향 같은 이름

> 사용자 B는 집 근처 "광명사거리역" 정류장이 **회사 가는 방향**과 **집에 오는 방향** 둘 다 자주 쓴다. 본명만 보면 어느 쪽인지 구분 불가.

1. 즐겨찾기에 두 정류장 모두 등록 (둘 다 본명 "광명사거리역")
2. 첫 번째 카드의 연필 아이콘 → 인라인 input → "회사 가는 길" 저장
3. 두 번째 카드 → "집에 오는 길" 저장
4. 이후 즐겨찾기 탭에서 두 카드를 한 눈에 구분

### 3.3 별명을 경로 정류장에도 적용 — 일관 표시

> 사용자 C는 출근 경로의 첫 정류장 "테헤란로.한국기술센터"가 너무 길어서 마음에 안 든다.

1. 홈 도착 카드 또는 내 경로 → 해당 정류장 카드의 연필 아이콘
2. 인라인 input → "회사 앞" 저장
3. 홈/도착 상세/내 경로 모든 위치에서 본명 옆에 "회사 앞"이 작게 함께 표시

### 3.4 정렬 — 자주 쓰는 순서 위로

> 사용자 D는 즐겨찾기 5개 중 회사 앞 카드를 항상 첫 번째로 보고 싶다.

1. 즐겨찾기 카드 길게 누름 → 이동 모드 진입
2. 카드를 위로 드래그
3. 손을 떼면 새 순서가 저장됨
4. 홈 상단 경로 칩도 동일 패턴으로 드래그 정렬

### 3.5 경로 수정 — 토글/삭제뿐인 현재 한계 보완

> 사용자 E는 출근 경로의 두 번째 정류장을 다른 정류장으로 바꾸고 싶다.

1. 푸터 "내 경로" 탭 진입 → 두 섹션(경로 / 즐겨찾기)
2. 경로 항목 탭 → 옵션 메뉴 노출 (수정 / 삭제 / 활성화 토글)
3. "수정" 선택 → SetupRoute 편집 모드로 진입
4. 정류장 교체 후 저장 → 동일 ID 유지된 채 업데이트

---

## 4. 가정

- **A1.** 즐겨찾기 정류장의 도착 정보 조회는 **기존 `GET /arrival-info?stopId={uuid}`** 로직을 재활용한다. 즐겨찾기도 정류장 단위로 `stopId`(uuid)를 발급해 동일 엔드포인트로 호출 가능하게 한다.
- **A2.** 별명은 **사용자 단위 데이터**다. 같은 본명의 정류장이라도 사용자 A의 별명과 사용자 B의 별명은 독립.
- **A3.** 별명 길이는 **최대 20자**. 한글/영문/숫자/공백/일부 기호 허용. 검증은 BE에서 1차, FE에서 2차.
- **A4.** 별명 빈 문자열은 **삭제로 간주**한다. NULL과 동일하게 저장한다.
- **A5.** 즐겨찾기와 경로 정렬은 **사용자 단위 `display_order`**(정수, 0-based 또는 1-based — SDD에서 확정)로 보존한다. 새 항목은 마지막 + 1.
- **A6.** 한 사용자가 **같은 정류장을 여러 번** 즐겨찾기에 등록할 수 있다 (별명/노선 조합이 다를 수 있음). uniqueness는 별도로 강제하지 않는다.
- **A7.** 즐겨찾기 추가 시 노선 **1개 이상 필수** (D5 확정). BE가 POST/PATCH 시 노선 0개를 400으로 reject, FE가 저장 버튼 disabled.
- **A8.** 즐겨찾기/경로 둘 다 하루 사용자당 50개 이내 가정 (성능 영향 무시 가능 범위).

---

## 5. 사용자 가치

| Before | After |
|--------|-------|
| 단일 정류장 도착 보려고 경로 등록 강요 | 즐겨찾기 탭에서 정류장 단위로 추가 |
| "테헤란로.한국기술센터" 같은 본명만 노출 | 본명 + "회사 앞" 별명 동시 노출 |
| 양방향 정류장 구분이 ARS 번호로만 가능 | 별명으로 의미 부여, 한 눈에 구분 |
| 카드 순서 = 등록 순서 고정 | 드래그로 자주 쓰는 것 위로 |
| 경로 등록 후엔 토글/삭제만 가능 | 경로 수정 가능 (정류장/노선/방향) |
| 푸터 "경로 등록"이 매번 모달 진입 비용 | "즐겨찾기" 탭 = 빠른 조회 + 빠른 추가 |

---

## 6. 성공 지표

정량 측정이 어려운 사용자 규모지만 **품질 게이트**로 정의:

1. **저장 성공률:** 즐겨찾기 추가 흐름 (검색 → 노선 선택 → 저장) 완료율 95% 이상 (FE 에러 토스트 발생 5% 미만).
2. **별명 일관 표시:** 모든 정류장 카드 자리(홈/즐겨찾기/도착 상세/검색 결과/내 경로)에서 별명이 동일 컴포넌트로 그려지고, 한 자리도 누락되지 않음. (코드 리뷰 + 수동 QA 체크리스트.)
3. **정렬 영속성:** 드래그로 변경한 순서가 새로고침 후, 다른 디바이스에서도 보존된다.
4. **Legacy 호환:** 기존 경로 데이터에 `display_order` 자동 백필 후, 기존 사용자의 경로 화면에서 누락/순서 뒤섞임 0건.
5. **API 성능:** `GET /favorite-stops` p50 < 300ms, p95 < 600ms (도착 조회는 별도 — 기존 `arrival-info` 그대로).

---

## 7. 영향 범위

### 7.1 BE

| 영역 | 변경 |
|------|------|
| `supabase/migrations/` | `favorite_stops` 테이블 생성, `route_stops.alias`/`routes.display_order`/`favorite_stops.display_order` 추가 |
| `supabase/functions/favorite-stops/` | 신규 — GET/POST/PATCH/DELETE |
| `supabase/functions/routes/` | PATCH 확장 (alias·display_order). PUT은 기존 동작 유지 또는 PATCH로 통일 (SDD에서 결정) |
| `supabase/functions/arrival-info/` | **변경 없음.** 즐겨찾기도 `?stopId={uuid}`로 호출 — 다만 stopId가 `favorite_stops`인지 `route_stops`인지 BE가 자동 판별 (SDD §FAV-3) |
| `supabase/functions/subway-station-info/` (또는 search-stops 응답 확장) | **신규 (D10).** 지하철역의 호선 목록 + 호선별 양 종착지 제공. 형태는 SDD §3에서 확정 |
| 테스트 | favorite-stops 4 메서드 + routes PATCH 확장 케이스 + 지하철 호선/방향 정보 endpoint |

### 7.2 FE

| 영역 | 변경 |
|------|------|
| `app/routes.ts` | `/favorites`, `/favorites/add` 추가 |
| `components/BottomNav.tsx` | 라벨/링크 변경 ("경로 등록" → "즐겨찾기"), 의미도 변경 |
| `components/StopName.tsx` | 신규 — 본명 + 별명 통합 표시 컴포넌트 |
| `components/AliasEditor.tsx` | 신규 — 인라인 편집 (연필 아이콘 → input + 저장/삭제) |
| `features/favorite/` | 신규 — `pages/Favorites.tsx`, `pages/AddFavorite.tsx`, `components/FavoriteStopCard.tsx` |
| `features/stop-picker/` (가칭) | **신규 (D10).** 공용 `<UnifiedStopPicker>` 컴포넌트 — 검색 → 결과 선택 → (지하철이면) 호선 선택 → 방향 선택 → (버스면) 노선 다중 선택. SetupRoute 수동 검색 + AddFavorite 양쪽이 공유. 기존 `<StopSearchPanel>` 추출 계획을 흡수·확장 |
| `features/route/pages/RouteManagement.tsx` | 두 섹션 분할 + 항목 탭 옵션(수정/삭제/토글) |
| `features/home/pages/Home.tsx` | 상단 경로 칩 DnD 정렬 |
| `lib/api.ts` | `fetchFavoriteStops` / `createFavoriteStop` / `updateFavoriteStop` / `deleteFavoriteStop` / 경로·즐겨찾기 정렬 patch |
| `lib/mockData.ts` (또는 도메인 타입) | `FavoriteStop` 타입 추가, `TransitStop`/`SavedRoute`에 `alias`/`displayOrder` 필드 추가 |

### 7.3 DB

- 신규 테이블: `favorite_stops`, `favorite_stop_routes` (또는 jsonb 인라인 — SDD에서 결정)
- 컬럼 추가:
  - `route_stops.alias text NULL`
  - `routes.display_order int NULL` (마이그레이션 시 사용자별 ROW_NUMBER로 백필)
- RLS 정책 신규 (`favorite_stops`, `favorite_stop_routes`)

### 7.4 외부 API

- 변경 없음. 도착 조회는 기존 `arrival-info` 재활용. 즐겨찾기 노선 선택은 기존 `stop-buses`/`stop-routes` 재활용.

### 7.5 환경변수

- 변경 없음.

---

## 8. 리스크 / Open Questions

| 리스크 | 영향 | 완화 |
|--------|------|------|
| `favorite_stops`/`route_stops` 둘에서 같은 `stopId` 형식 도착 조회 → BE 분기 필요 | arrival-info 복잡도 ↑ | SDD §FAV-3에서 식별자 전략 확정 (uuid 네임스페이스 분리 / 단일 view union / 별도 엔드포인트 중 1) |
| 별명 컬럼이 정류장 단위로 두 군데 (`route_stops.alias`, `favorite_stops.alias`)에 분산 — 정규화 미흡 | 같은 정류장이 경로/즐겨찾기 양쪽에 있을 때 별명 동기화 안 됨 | 의도적 분리. "별명은 경로/즐겨찾기 컨텍스트별 라벨"로 정의 (PRD §A2 보강). 한 사용자가 같은 정류장에 다른 별명을 줄 수 있음 |
| 경기 정류장도 즐겨찾기 가능 → provider 매핑 필요 | 매핑 비용 + odsay_fallback 처리 | 경로 저장과 동일하게 좌표 기반 매핑 1회 — `_shared/regionMapper`/`resolveStopProvider` 재사용 |
| 드래그 정렬 PATCH가 매 이동마다 호출되면 트래픽↑ | 모바일에서 빈번한 N건 PATCH | 드롭 시점에만 PATCH (이동 중에는 로컬 state). 한 번에 변경된 항목만 보냄 |
| 즐겨찾기 별명 중복 — 동일 별명 여러 카드 | UX 혼란 가능 | 차단 안 함 (사용자 자유). FE에서 같은 별명 발견 시 inline hint만 표시 (선택, 추후) |

### 결정 사항 (2026-05-08 확정)

이전 Open Questions는 모두 사용자 결정으로 닫힘. SDD/계약서/TASKS는 아래 기준으로 정렬.

- **D1. arrival-info `stopId` 풀 통합 (구 OQ2):** `route_stops.id`와 `favorite_stops.id`는 같은 uuid 풀을 공유한다. BE가 두 테이블 모두 lookup, FE는 분기를 모른다. 별도 엔드포인트(`/favorite-arrival-info`)는 만들지 않는다.
- **D2. `routes.active` 컬럼 신규 추가 (구 OQ-S1):** `boolean NOT NULL DEFAULT true`로 신설. 마이그레이션 시 기존 routes 모두 `UPDATE routes SET active = true`로 backfill. PATCH /routes/:id에 `active` 토글 포함 (제거하지 않음).
- **D3. 별명 컨텍스트 분리 유지 (구 OQ-S2 일부):** 같은 정류장이 경로/즐겨찾기 양쪽에 존재해도 `route_stops.alias`와 `favorite_stops.alias`는 별도. 동기화하지 않는다 — 의도적 분리. 검색 결과는 별명 미리보기 없음.
- **D4. react-dnd 백로그 #B3 사전 task 불필요 (구 OQ4 관련):** SetupRoute의 dnd 제거는 의도적 결정이었음. 백로그 #B3은 무효 처리됨. 본 spec의 Home 칩/Favorites 정렬은 새 인프라(예: `react-dnd-multi-backend` 또는 `react-dnd-touch-backend`)로 처음부터 구현.
- **D5. 즐겨찾기 노선 0개 불허 (구 A7 보강):** POST/PATCH `/favorite-stops` 호출 시 `routes` 배열이 비어 있으면 BE가 400으로 reject. FE는 저장 버튼을 노선 0개일 때 disabled. PRD §A7의 "0개 이상 허용" 가정은 폐기 — 항상 1개 이상 필수.
- **D6. 별명 편집 엔드포인트 (구 OQ3):** `PATCH /route-stops/:id`(별명 전용)와 `PATCH /favorite-stops/:id`(별명 포함 부분 수정) 두 개 신설. 경로 전체 수정과 별명 변경은 분리.
- **D7. 내 경로 항목 메뉴 (구 OQ4):** 인라인 액션 시트(`...` 메뉴 통합)로 수정/삭제/활성 토글 노출.
- **D8. 경로 수정 흐름 (구 OQ5):** SetupRoute 재사용(`/setup?routeId=:id`). 신규 EditRoute 페이지 만들지 않음.
- **D9. `favorite_stops`/`favorite_stop_routes` 분리 (구 OQ1):** 노선 jsonb 인라인 대신 별도 테이블로 분리. `route_stops` ↔ `stop_routes` 추상화 유지.
- **D10. 공용 StopPicker + 지하철 호선/방향 선택 단계 (2026-05-08 추가):** 즐겨찾기 추가와 SetupRoute 수동 검색이 **동일 공용 컴포넌트**를 사용한다. 지하철역 결과 선택 시 **(1) 호선 선택 → (2) 방향 선택** 단계가 이어진다. 한 즐겨찾기/노드 = **한 호선 + 한 방향**(옵션 A). 환승역에서 두 호선을 단골로 쓰는 사용자는 별개 카드 두 개로 등록한다. 정류장(버스)은 기존 노선 다중 선택 흐름 그대로.
  - **목적:** 기존 SetupRoute 수동 검색은 지하철 추가 시 `directionHeadsign`/`directionUpdn`/`subwayCode`를 NULL로 저장 → 도착 카드가 호선 일치 fallback에 의존(legacy 안전망). 즐겨찾기에서는 정확한 매칭이 필수이므로 양쪽 진입점 모두를 손봐 NULL 저장 한계를 한 번에 해결한다.
  - **데이터 출처:** 호선 목록 + 양 종착지(호선 정방향/역방향)는 BE가 제공한다. 호출 형태는 be-agent + api-expert 조사 결과에 따라 (1) 신규 `GET /subway-station-info?stationId=...` 신설 또는 (2) 기존 `search-stops` 응답에 `subwayLines: [{ subwayCode, lineName, terminals: [headsignA, headsignB] }]` 확장 둘 중 1택. spec은 "BE가 호선/방향 정보를 제공한다"까지만 확정하고, 상세 endpoint/응답 모양은 SDD §3에서 BE 조사 후 확정.
  - **단일 호선역 처리:** 호선이 1개뿐인 역(예: 일반 동네 역)은 호선 선택 단계 자동 통과(스킵 가능). 방향 선택은 항상 노출.
  - **두 호선 단골 (환승역, 명시적 의도):** 사용자가 같은 환승역의 두 호선을 모두 단골로 쓰면 `+` → 같은 역 다시 검색 → 다른 호선 선택으로 별개 카드 등록. 한 카드에 두 호선 묶기는 **N6 비목표** 유지.
  - **데이터 폴백 정책:** BE가 호선/방향 정보를 못 줄 때(예: ODsay 미제공 역, 외부 API 일시 장애) FE는 기존 NULL 저장 동작으로 graceful fallback — 카드 inline 안내("방향 정보 없음 — 경로를 다시 등록하면 더 정확해요")는 기존 정책 그대로.
  - **호환성:** 기존에 NULL로 저장된 row는 그대로 두고 사용자가 재등록할 때만 정확한 값이 채워진다. 자동 백필/재매핑 없음(저장 시점의 사용자 의도가 필요).

- **D11. 양방향 다음 역 1개씩 표시 + 종착지 동적 노출 (2026-05-08 추가, D10 보강):** D10의 "방향 선택" 단계에서 **호선의 양방향 종착지 N개씩** 표시가 아니라, **양방향 다음 역 1개씩**만 표시한다. 즉 두 칩 (예: 1호선 = "시청 방향(상행)" / "남영 방향(하행)").
  - **데이터 출처:** ODsay `subwayStationInfo`의 `prevOBJ`/`nextOBJ` 한 칸씩. 단일 호출로 충분.
  - **새 endpoint:** `GET /subway-station-directions?stationId={ODsay stationID}`. 새 테이블/cron 불필요.
  - **저장 모델:**
    - `directionUpdn`: `"up"` 또는 `"down"` — 사용자가 선택한 다음 역이 상/하행 어느 쪽인지로 결정 (ODsay `prevOBJ`/`nextOBJ`가 어느 쪽 방향인지에 따라 매핑)
    - `directionNextStop`: 다음 역명 (예: `"남영"`)
    - `directionHeadsign`: **NULL** (저장하지 않음 — 매 도착 응답의 `headsign`으로 동적 표시)
  - **종착지(headsign)는 도착 카드에서 동적 노출:** 도착 응답 `item.headsign`(2026-05-08 BE 작업으로 이미 동봉됨)을 사용해 카드에 "인천행 3분 후 / 동인천행 8분 후 / 서동탄행 14분 후" 형태로 자연스럽게 표시. 사용자가 본 호선의 모든 종착지를 미리 알 필요 없이, 실제로 들어오는 열차의 행선지가 그대로 보임.
  - **D10 옵션 A/B/C 정리:**
    - 폐기: 옵션 A(`/subway-line-headsigns` + cron + 캐시 테이블), 옵션 C(정적 매핑)
    - 유지(역할 변경): 옵션 B(`search-stops` 응답에 `laneName`/`subwayId` 노출 — 호선 row 노출용)
    - 채택: 신규 `GET /subway-station-directions` 단일 호출 + 결과 응답
  - **결과:** Phase 2-2 task가 단순화됨 — 새 cron/테이블 마이그레이션 제거, T10-b/T10-b'를 단일 task `T10-b'' subway-station-directions endpoint 신설`로 통합.

---

## 9. 마일스톤

- **M0 (검토):** PRD/SDD/TASKS 승인 ← **현 단계**
- **M1 (BE DB+API):** 마이그레이션 + favorite-stops 4 메서드 + 별명/정렬 PATCH 확장 + 테스트
- **M2 (FE 공통 컴포넌트):** `<StopName>` / `<AliasEditor>` + 도메인 타입 확장 + lib/api 함수
- **M3 (FE 즐겨찾기 페이지):** Favorites + AddFavorite (검색 UI 추출 후 재사용)
- **M4 (FE 정렬 + 내 경로 개편):** Home 칩 DnD + Favorites 길게 누름 정렬 + RouteManagement 두 섹션 + 항목 메뉴
- **M5 (QA + 롤아웃):** 수동 QA 체크리스트 (별명 8개 자리, 정렬 영속성, 경기 정류장 즐겨찾기) → prod 배포

---

## 10. 사용자 액션 (배포 전)

- [ ] 마이그레이션 적용 시 기존 `routes` 테이블의 `display_order` 백필 — `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at)`. SDD에서 SQL 확정.
- [ ] 푸터 라벨 변경 안내 (in-app 1회 토스트 또는 release note) — 선택.
- [ ] 즐겨찾기 = 단일 정류장이라는 개념 안내 카피 (빈 상태 카드).
