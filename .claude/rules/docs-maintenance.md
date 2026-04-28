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

## 문서 위치 원칙

| 내용 | 위치 |
|------|------|
| FE-BE API 계약 | `docs/api/contracts/` |
| 기능 스펙 (PRD/SDD/TASKS) | `docs/specs/{feature-name}/` |
| FE-BE 협업 노트 | `docs/collab-notes.md` |
| 통합 백로그 | `docs/backlog.md` |
| 아이디어 메모 | `docs/ideas/` |
| 기술 결정 노트 | `docs/tech-notes/` |
| FE 컴포넌트 설계 | `when_come_fe/docs/` |
| BE Edge Function 설계 | `when_come_be/docs/` |
| 외부 API 레퍼런스 | `when_come_be/docs/external-apis/` |
| 환경변수 가이드 | `docs/env-guide.md` |

## 구조 변경 시 아키텍처 문서 업데이트

| 변경 종류 | 업데이트 파일 |
|-----------|--------------|
| 새 도메인/피처 추가 | `docs/architecture/overview.md` → 도메인 섹션 |
| API 연동 추가/변경 | `docs/api/contracts/` + `docs/collab-notes.md` |
| 전역 상태 구조 변경 | `docs/architecture/overview.md` → 상태 관리 섹션 |
| 라우팅 구조 변경 | `when_come_fe/docs/architecture/overview.md` |
| 외부 API 추가/변경 | `when_come_be/docs/external-apis/` |

## API 계약 변경 시

1. `architect` 에이전트로 계약서 설계 (`docs/api/contracts/{endpoint}.md`)
2. `docs/collab-notes.md`에 변경 요약 기록 (breaking change 여부 명시)
3. FE/BE 구현 완료 후 계약서에 실제 응답 예시 업데이트
