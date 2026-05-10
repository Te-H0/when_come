# when_come 모노레포

한국 출퇴근 경로 앱. FE(React+TS) + BE(Supabase Edge Functions/Deno).

## 프로젝트 구조

```
when_come/
├── when_come_fe/   — React 18 + TypeScript + Vite 프론트엔드
├── when_come_be/   — Supabase Edge Functions (Deno) 백엔드
└── docs/           — 공유 문서 허브 (계약, 스펙, 협업 노트)
```

## 개발 원칙

- 사용자 요청을 맹목적으로 따르지 않는다. 더 나은 방향이 있으면 근거와 함께 제안한다.
- 새 기능은 반드시 Spec-Driven: `/spec` 스킬 → PRD→SDD→TASKS→승인→구현.
- 비자명한 기술 결정은 `docs/tech-notes/`에 자동 기록.
- UI 변경은 반드시 dev 서버에서 직접 확인. 타입 체크 통과 ≠ 기능 정상.
- 에러 핸들링: 모든 BE Edge Function과 FE catch는 [ADR-002](docs/decisions/ADR-002-error-handling.md) + [`.claude/rules/error-handling.md`](.claude/rules/error-handling.md) 규칙 준수. BE는 `_shared/errorCodes.ts` union literal만 사용, FE는 `showApiErrorToast` 헬퍼만 사용. 코드 카탈로그는 [`docs/api/error-codes.md`](docs/api/error-codes.md).

---

## 🚦 에이전트 라우팅 (자동 적용)

### FE-only → `fe-agent`
다음 중 하나라도 해당하면 반드시 `fe-agent` 사용:
- 컴포넌트, UI, 화면, 페이지, 스타일, 레이아웃, 애니메이션
- Hook, 타입 정의(FE), 라우팅
- `when_come_fe/src/` 하위 파일 수정

### BE-only → `be-agent`
다음 중 하나라도 해당하면 반드시 `be-agent` 사용:
- API 엔드포인트, Edge Function, DB, 스키마, 마이그레이션
- Deno 테스트, Supabase 설정, RLS
- `when_come_be/supabase/` 하위 파일 수정

### 풀스택 기능 → `architect` → `fe-agent` + `be-agent`
도메인이 걸쳐있거나 "새 기능" 키워드:
1. `architect`가 API 계약 설계 (`docs/api/contracts/`)
2. 의존성 없으면 `fe-agent` + `be-agent` 병렬 실행
3. 의존성 있으면 `be-agent` 완료 후 `fe-agent`

### 기획·UX 방향 → `product-advisor`
"어떻게", "방향", "UX", "사용자 경험", "기획", "우선순위"

### 외부 API 조회·문서화 → `api-expert`
ODsay, 서울버스, 지하철, 네이버지도, 대체 API 추천

### 코드 리뷰 → `code-reviewer`
"리뷰해줘", "review", PR 전 검토

---

## Agent Teams 패턴

API 계약 협의가 필요한 풀스택 기능:
```
architect (계약 설계)
    ↓ docs/api/contracts/ 작성
be-agent (구현) ←→ fe-agent (구현)  [병렬 또는 순차]
    ↓
docs/collab-notes.md 업데이트
```

독립적인 동시 작업 (예: FE 스타일 수정 + BE 버그픽스):
```
fe-agent ─┐  병렬 실행
be-agent ─┘
```

---

## 배포 방법 (절대 vercel CLI 수동 실행 금지)

| 대상 | 방법 | 트리거 |
|------|------|--------|
| **FE 운영** | `prod` 브랜치에 push | Vercel이 자동으로 프로덕션 배포 |
| **BE 운영** | `prod` 브랜치에 push | GitHub Actions CI/CD 자동 배포 |
| **FE/BE 개발** | `main` 브랜치에 push | 변경 없음 (prod merge 시 반영) |

**운영 배포 절차:**
```bash
git checkout prod
git merge main
git push origin prod
# → Vercel(FE) + GitHub Actions(BE) 자동 트리거됨
```

> `vercel --prod` 수동 실행 절대 금지. prod 브랜치 push가 유일한 배포 방법.

---

## FE 상세

@when_come_fe/CLAUDE.md

---

## BE 상세

@when_come_be/CLAUDE.md
