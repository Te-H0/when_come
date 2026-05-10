#!/usr/bin/env bash
# FE-DS-5: 디자인 토큰 린트 스크립트
# 하드코딩된 hex 색상, 임의 px 타이포그래피 값, 매직 넘버 클래스를 감지한다.
# shadcn/ui (src/components/ui/) 내부는 검사 제외.
# 0 위반 = 0 exit, 1+ 위반 = exit 1

set -euo pipefail

SRC="src"
EXCLUDE_UI="src/components/ui"

# 검사 패턴:
#   1. 인라인 hex 색상 유틸: text-[#...], bg-[#...], border-[#...], fill-[#...] 등
#   2. 임의 px 타이포그래피: text-[NNpx] (문자 크기 — @utility text-* 토큰 사용)
#   3. 임의 px rounded: rounded-[NNpx] (— @theme 토큰 사용)
#   4. 하드코딩 페이지 height:
#      min-h-screen, h-screen (PageShell 없이 직접 사용)
#      pb-24, pb-32, pb-36 (BottomNav 매직 넘버 padding-bottom)
#      bottom-16 (BottomNav 위 고정 매직 넘버)
#
# 제외 (의도적 임의값):
#   w-[Npx] h-[Npx] — 아이콘/이미지 고정 크기 (SVG 픽셀 정밀 제어, 토큰화 불필요)
#   max-w-[Npx] min-w-[Npx] — 컨테이너 최대폭 제약
#   ml-[Npx] — 레이아웃 오프셋

VIOLATIONS=0

check_pattern() {
  local label="$1"
  local pattern="$2"
  local results
  results=$(grep -rn --include="*.tsx" --include="*.ts" -E "$pattern" "$SRC" \
    | grep -v "^${EXCLUDE_UI}/" || true)
  if [ -n "$results" ]; then
    echo ""
    echo "[$label]"
    echo "$results"
    VIOLATIONS=$((VIOLATIONS + $(echo "$results" | wc -l | tr -d ' ')))
  fi
}

echo "=== Design Token Lint ==="
echo "검사 대상: $SRC/ (제외: $EXCLUDE_UI/)"
echo ""

# 1. hex 색상 유틸 (text/bg/border/fill/stroke/ring/from/via/to/shadow/caret)
check_pattern "hex 색상 클래스 — src/styles/theme.css 토큰으로 교체" \
  '(text|bg|border|fill|stroke|ring|from|via|to|shadow|outline|caret|accent|decoration)-\[#[0-9a-fA-F]{3,8}\]'

# 2. 임의 px 타이포그래피 (text-[Npx])
check_pattern "text-[Npx] — @utility text-* 토큰으로 교체 (text-caption/label/body/section/card-title/page-title/button)" \
  '\btext-\[[0-9]+(px|rem)\]'

# 3. 임의 px rounded (rounded-[Npx])
check_pattern "rounded-[Npx] — @theme rounded-* 토큰으로 교체 (rounded-chip/control/card/pill)" \
  '\brounded-\[[0-9]+px\]'

# 4. 페이지 높이 매직 넘버 (PageShell 미사용)
check_pattern "min-h-screen / h-screen — PageShell (min-h-dvh) 사용 권장" \
  '\bmin-h-screen\b|\bh-screen\b'

# 5. BottomNav 높이 매직 넘버 padding
check_pattern "pb-24 / pb-32 / pb-36 — BottomNav 매직 넘버 (var(--bottom-nav-total) 사용)" \
  '\bpb-(24|32|36)\b'

# 6. BottomNav 위 고정 매직 넘버
check_pattern "bottom-16 — BottomNav 매직 넘버 (var(--bottom-nav-height) 사용)" \
  '\bbottom-16\b'

# 7. BottomNav padding-bottom 매직 넘버
check_pattern "pb-20 — BottomNav 매직 넘버 (var(--bottom-nav-total) 사용)" \
  '\bpb-20\b'

# 8. Tailwind 기본 빨간 계열 임의 사용
check_pattern "bg-red-*/hover:bg-red-* — surface-danger-soft 또는 text-danger/N 토큰으로 교체" \
  '(^|[[:space:]])(hover:)?bg-red-[0-9]+'

# 9. viewport 비율 임의값 (50vh, 100dvh 등)
check_pattern "h-[Nvh/dvh] / w-[Nvw/dvw] — flex-1 flex items-center justify-center py-16 패턴으로 교체" \
  '\b[hw]-\[[0-9]+(vh|dvh|vw|dvw)\]'

echo ""
if [ "$VIOLATIONS" -eq 0 ]; then
  echo "✓ 위반 없음 — 모든 토큰이 시맨틱 클래스를 사용합니다"
  exit 0
else
  echo "✗ 위반 ${VIOLATIONS}건 발견 — src/styles/theme.css 토큰 사용으로 교체하세요"
  exit 1
fi
