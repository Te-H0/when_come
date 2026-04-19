---
paths: []
---

# 문서 유지보수 규칙

## Task 완료 시 (매번 필수)

Task 구현이 완료되면 반드시 해당 TASKS.md를 업데이트한다.

```markdown
- [x] T1. RouteCard 컴포넌트 구현 (완료일: YYYY-MM-DD)
```

모든 Task가 완료되면 PRD.md, SDD.md의 상태도 업데이트한다.

## 구조 변경 시 아키텍처 문서 업데이트

| 변경 종류 | 업데이트 파일 |
|-----------|--------------|
| 새 도메인/피처 추가 | `docs/architecture/overview.md` → 도메인 섹션 |
| API 연동 추가/변경 | 해당 SDD.md → API 설계 섹션 |
| 전역 상태 구조 변경 | `docs/architecture/state.md` |
| 라우팅 구조 변경 | `docs/architecture/overview.md` |

## 백엔드 협업 노트

백엔드 API 스펙 변경이 필요하거나 논의가 필요한 사항 발견 시 즉시 `docs/collab-notes.md`에 추가한다.
