# CLAUDE.md

## Commands
```bash
supabase start        # 로컬 Supabase 실행
supabase functions serve  # Edge Functions 로컬 개발
supabase db push      # 마이그레이션 적용
supabase deploy       # 전체 배포
```

## 개발 원칙
- 사용자 요청을 맹목적으로 따르지 않는다. 기술적으로 더 나은 방향이 있으면 근거를 들어 먼저 제안한다.
- 기능 개발 전 반드시 Spec-Driven 순서: PRD→SDD→TASKS→승인→구현. Task 범위 밖 변경 금지.
- 비자명한 기술 결정, 문제 해결, 인사이트는 `docs/tech-notes/`에 자동 기록.
- 구조 변경 시 `docs/architecture/overview.md` 업데이트.
- 기획/마케팅 논의는 `docs/ideas/`, 횡단 기술 결정은 `docs/decisions/ADR-NNN.md`.
- ODsay/네이버 API 키는 절대 코드에 하드코딩 금지 — 환경변수만 사용.
- 프론트와 공유되는 API 스펙 변경 시 즉시 `docs/collab-notes.md`에 기록.

## TDD 원칙
이 프로젝트는 TDD(테스트 주도 개발)로 진행한다.

**워크플로우: 테스트 작성 → 통과 확인 → 배포**
```bash
# 테스트 실행
cd supabase/functions/_tests
npx deno test --allow-env --no-check <파일명>_test.ts

# 전체 테스트
npx deno test --allow-env --no-check *.ts
```

**테스트 파일 위치:** `supabase/functions/_tests/`

**커버리지 기준 (새 기능 추가 시 필수):**
- 정상 동작 (happy path)
- 파라미터 누락/잘못된 값 (400 케이스)
- 인증 실패 (401 케이스, 인증 필요 엔드포인트)
- 외부 API HTTP 오류 (502 케이스)
- 존재하지 않는 리소스 (404 케이스)
- OPTIONS preflight (CORS)

타입 패턴, 테스트 작성법 상세는 `.claude/rules/` 참고.

## 아키텍처
한국 출퇴근 경로 앱 — Supabase Edge Functions (Deno/TypeScript).
ODsay API 프록시 + Supabase PostgreSQL + Auth.

### Edge Functions 구조
```
supabase/functions/
├── _shared/           ← 공통 유틸 (auth, error, odsay client, cors)
├── search-stops/      ← 정류장 검색 (ODsay 프록시)
├── arrival-info/      ← 실시간 도착정보 (ODsay 프록시)
├── route-search/      ← 대중교통 경로탐색 (ODsay 프록시)
└── routes/            ← 사용자 경로 CRUD
```

### 환경변수
```
ODSAY_API_KEY
NAVER_MAP_CLIENT_ID      # 필요 시
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## 에이전트/스킬 사용 규칙
| 상황 | 사용 | 비고 |
|------|------|------|
| 설계 논의 (DB 스키마, API 설계, 구조) | architect 에이전트 | opus, 깊은 추론 |
| 코드 리뷰 | code-reviewer 에이전트 | sonnet |
| 기획/서비스 방향 논의 | product-advisor 에이전트 | opus |
| 새 기능 개발 시작 | `/spec` 스킬 | PRD→SDD→TASKS |
| 백로그 추가/조회 | `/backlog` 스킬 | |
| 기술 인사이트 기록 | `/tech-note` 스킬 | |

## 규칙 참고
`.claude/rules/` 하위 컨벤션이 경로 기반으로 자동 적용됨:
- `typescript-conventions.md` → `supabase/**/*.ts`
- `edge-function-rules.md` → `supabase/functions/**/*.ts`
- `docs-maintenance.md` → 항상 적용
- `commit-conventions.md` → 커밋 시 항상 적용

@docs/architecture/overview.md
