# CLAUDE.md

## Commands

```bash
npm install       # 의존성 설치
npm run dev       # Vite 개발 서버 (http://localhost:5173)
npm run build     # 프로덕션 빌드 → dist/
```

> 테스트/린트 미설정. 추가 시 이 섹션 업데이트.

## 배포 방법 (vercel CLI 수동 실행 금지)

**운영 배포 = `prod` 브랜치에 push → Vercel 자동 트리거**

```bash
git checkout prod && git merge main && git push origin prod
```

`vercel`, `vercel --prod` 명령어 직접 실행 금지. prod 브랜치 push가 유일한 배포 경로.

## 개발 원칙

- 사용자 요청을 맹목적으로 따르지 않는다. 기술적으로 더 나은 방향이 있으면 근거를 들어 먼저 제안한다.
- 기능 개발 전 반드시 Spec-Driven 순서: PRD→SDD→TASKS→승인→구현. Task 범위 밖 변경 금지.
- 비자명한 기술 결정, 문제 해결, 인사이트는 `docs/tech-notes/`에 자동 기록.
- 컴포넌트/API/도메인 구조 변경 시 `docs/architecture/overview.md` 업데이트.
- 기획/마케팅 논의는 `docs/ideas/`, 횡단 기술 결정은 `docs/decisions/ADR-NNN.md`.
- UI 변경은 반드시 dev 서버에서 직접 확인. 타입 체크 통과 ≠ 기능 정상.

## 아키텍처

한국 출퇴근 경로 앱 — React 18 + TypeScript + Vite, Figma Make 생성 기반.  
현재 전체 데이터 mock (`src/app/data/mockData.ts`), 상태는 컴포넌트 `useState`.

**라우팅:**

| Route | Page | Purpose |
|-------|------|---------|
| `/` | `Home.tsx` | 활성 경로 대시보드 — 현재 구간, 도착 시간 |
| `/setup` | `SetupRoute.tsx` | 경로 빌더 — 정류장 검색/추가 |
| `/routes` | `RouteManagement.tsx` | 저장된 경로 CRUD |

**폴더 전략:**  
초기 코드는 `src/app/` 아래 있음. **신규 기능은 `src/features/{domain}/` 구조로 작성**하고 기존 코드는 점진적 이전.

**주요 유틸:** `src/app/utils/transitColors.ts` — 버스 번호 범위·서울 지하철 노선 번호를 공식 색상으로 매핑.

## Tech Stack

- **Tailwind v4** — `@tailwindcss/vite` 플러그인, `tailwind.config.js` 없음. 테마 토큰은 `src/styles/theme.css` CSS custom properties.
- **shadcn/ui** — `src/app/components/ui/` (Radix UI primitives, MIT)
- **Path alias:** `@` → `src/`
- **Figma asset:** `vite.config.ts`의 `figma:asset/` 플러그인 제거 금지.
- **Drag-and-drop:** `react-dnd` + `react-dnd-html5-backend`
- **Animations:** `motion` (Framer Motion v12)
- **Toast:** `sonner`

## 에이전트/스킬 사용 규칙

| 상황 | 사용 | 비고 |
|------|------|------|
| 설계 논의 (컴포넌트 구조, 상태 설계, API 연동) | architect 에이전트 | opus, 깊은 추론 |
| 코드 리뷰 | code-reviewer 에이전트 | sonnet, 패턴 매칭 |
| 기획/마케팅/서비스 방향 깊은 논의 | product-advisor 에이전트 | opus, 전략적 사고 |
| 새 기능 개발 시작 | `/spec` 스킬 | PRD→SDD→TASKS |
| 백로그 추가/조회/정리 | `/backlog` 스킬 | |
| 기술 인사이트 기록 | `/tech-note` 스킬 | |
| 간단한 아이디어 메모 | `/idea` 스킬 | |

## 규칙 참고

`.claude/rules/` 하위 컨벤션이 경로 기반으로 자동 적용됨:

- `typescript-conventions.md` → `src/**/*.{ts,tsx}`
- `component-rules.md` → `src/**/components/**/*.tsx`, `src/**/pages/**/*.tsx`
- `test-conventions.md` → `src/**/*.{test,spec}.{ts,tsx}`
- `docs-maintenance.md` → 항상 적용 (Task 완료, 문서 동기화)
- `commit-conventions.md` → 커밋 시 항상 적용

@docs/architecture/overview.md

## 현재 미적용 사항 (향후 전환 필요)

| 항목 | 현황 | 전환 시점 |
|------|------|----------|
| TDD | 테스트 인프라 없음 (vitest 미설치) | 테스트 세팅 후 |
| TanStack Query | mock + useState 사용 중 | 실제 API 연동 시 |
| Zustand | 미사용 | 전역 상태 필요 시 |
| `src/features/` 구조 | 기존 코드 `src/app/`에 위치 | 신규 기능부터 적용, 기존은 점진적 이전 |
