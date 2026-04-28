#!/usr/bin/env bash
# PostToolUse hook — 파일 수정 경로 기반으로 업데이트가 필요한 문서를 리마인드.
# Claude가 Edit/Write 할 때마다 발동, stderr 출력은 Claude 컨텍스트에 추가됨.

set -u

input=$(cat)
path=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" <<< "$input" 2>/dev/null)

[[ -z "$path" ]] && exit 0

reminders=()

# ─ BE Edge Function 수정 → API 스펙 관련 문서
if [[ "$path" == *"when_come_be/supabase/functions/"*"/index.ts" ]]; then
  reminders+=("📝 Edge Function 수정됨. API 스펙 변경이면:")
  reminders+=("   - docs/collab-notes.md 업데이트 필수")
  reminders+=("   - docs/api/contracts/ 계약서 확인")
fi

# ─ DB 마이그레이션 추가
if [[ "$path" == *"when_come_be/supabase/migrations/"*".sql" ]]; then
  reminders+=("📝 DB 마이그레이션 추가됨.")
  reminders+=("   - docs/architecture/overview.md DB 테이블 섹션 확인")
fi

# ─ 외부 API 클라이언트 수정
if [[ "$path" == *"when_come_be/supabase/functions/_shared/"*"Client.ts" ]]; then
  reminders+=("📝 외부 API 클라이언트 수정됨.")
  reminders+=("   - when_come_be/docs/external-apis/ 해당 API 문서 확인")
fi

# ─ 새 FE feature 페이지 추가/변경
if [[ "$path" == *"when_come_fe/src/features/"*"/pages/"*".tsx" ]]; then
  reminders+=("📝 FE Feature 페이지 변경됨.")
  reminders+=("   - 새 도메인이면 docs/architecture/overview.md 도메인 테이블 업데이트")
  reminders+=("   - 새 라우트면 when_come_fe/src/app/routes.ts 확인")
fi

# ─ 환경변수 파일
if [[ "$path" == *".env.example" ]]; then
  reminders+=("📝 .env.example 변경됨. docs/env-guide.md 설명 업데이트 확인.")
fi

# ─ TASKS.md
if [[ "$path" == *"TASKS.md" ]]; then
  reminders+=("📝 TASKS.md 변경됨. 모든 task 완료면 같은 폴더의 PRD.md/SDD.md 상태도 업데이트.")
fi

# ─ 타입 정의 파일 (FE)
if [[ "$path" == *"when_come_fe/src/types/api.ts" ]]; then
  reminders+=("📝 FE API 타입 변경됨. BE 응답과 싱크 맞는지 확인 (docs/collab-notes.md).")
fi

# ─ package.json 변경
if [[ "$path" == *"when_come_fe/package.json" ]]; then
  reminders+=("📝 FE 의존성 변경됨. CLAUDE.md Tech Stack 섹션 확인.")
fi

# 출력
if [[ ${#reminders[@]} -gt 0 ]]; then
  printf '%s\n' "${reminders[@]}" >&2
fi

exit 0
