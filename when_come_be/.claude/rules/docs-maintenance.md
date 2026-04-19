---
paths: []
---
# 문서 유지보수 규칙

## Task 완료 시 (매번 필수)
TASKS.md 해당 항목을 완료 처리:
- [x] T1. ODsay 클라이언트 구현 (완료일: YYYY-MM-DD)

## 구조 변경 시
| 변경 종류 | 업데이트 파일 |
|-----------|--------------|
| 새 Edge Function 추가 | `docs/architecture/overview.md` |
| DB 스키마 변경 | 해당 SDD.md + `docs/architecture/overview.md` |
| 외부 API 연동 변경 | 해당 SDD.md |

## 프론트 협업
API 스펙(요청/응답 구조, 엔드포인트) 변경 시 즉시 `docs/collab-notes.md`에 추가.
