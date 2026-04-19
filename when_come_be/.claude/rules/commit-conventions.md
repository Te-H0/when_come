---
paths: []
---
# 커밋 메시지 컨벤션

## 형식
type(scope): 한글 설명

## Type
| type | 용도 | 예시 |
|------|------|------|
| `feat` | 새 기능 | `feat(arrival): 버스 도착정보 조회 구현` |
| `fix` | 버그 수정 | `fix(routes): 경로 삭제 권한 검증 누락 수정` |
| `refactor` | 리팩토링 | `refactor(shared): ODsay 클라이언트 분리` |
| `docs` | 문서 | `docs: API 스펙 업데이트` |
| `chore` | 설정/의존성 | `chore: supabase cli 설정` |
| `test` | 테스트 | `test(arrival): 도착정보 파싱 테스트 추가` |

## 규칙
- 제목 50자 이내, 마침표 없음
- "무엇을 했는지"가 아니라 "왜/무엇이 바뀌었는지" 중심
