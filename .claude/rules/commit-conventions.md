---
paths: []
---

# 커밋 메시지 컨벤션

## 형식

```
type(scope): 한글 설명
```

한 줄로 끝낼 수 있으면 한 줄. 맥락이 필요하면 본문 추가.

## Type

| type | 용도 | 예시 |
|------|------|------|
| `feat` | 새 기능 | `feat(route): 경로 목록 페이지 구현` |
| `fix` | 버그 수정 | `fix(home): 도착 시간 갱신 누락 수정` |
| `refactor` | 리팩토링 (동작 변경 없음) | `refactor(setup): StopCard 컴포넌트 분리` |
| `test` | 테스트 추가/수정 | `test(arrival): arrival-info 인증 실패 케이스 추가` |
| `docs` | 문서 변경 | `docs: collab-notes API 계약 업데이트` |
| `chore` | 빌드, 설정, 의존성 등 | `chore: vitest 의존성 추가` |
| `style` | 포맷팅, 세미콜론 등 | `style: prettier 적용` |
| `perf` | 성능 개선 | `perf(home): 세그먼트 목록 가상화 적용` |

## 규칙

- 제목은 50자 이내
- 마침표 없음
- "무엇을 했는지"가 아니라 "왜/무엇이 바뀌었는지" 중심
- feat/fix는 가능하면 도메인 명시: `feat(route): ...`
