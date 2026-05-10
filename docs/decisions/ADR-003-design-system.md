# ADR-003 — 디자인 시스템 토큰화 + Page Shell 표준화

- **상태:** 채택 (2026-05-10)
- **결정자:** architect
- **영향 범위:** when_come_fe 전 페이지(8개) + 공용 컴포넌트
- **관련 문서:**
  - 실전 가이드: [`docs/design-system.md`](../design-system.md)
  - 강제 룰: [`.claude/rules/design-system.md`](../../.claude/rules/design-system.md)
  - 협업 노트: [`docs/collab-notes.md`](../collab-notes.md)

---

## 1. 결정 배경

`when_come_fe`는 Figma Make 자동 생성 코드를 base로 시작했고 이후 8개 페이지가 각자 풍토병처럼 자라왔다. 시스템 부재로 누적된 증상은 다음과 같다.

### 1.1 토큰 결손

- `src/styles/theme.css`에는 shadcn/ui가 가져온 색 41개 + `--radius` 1개만 존재.
- spacing scale, typography scale, elevation, motion 정의 없음.
- `@theme inline`에는 색상/radius만 노출 — Tailwind utility는 사실상 색만 토큰화됨.

### 1.2 페이지 코드 실측 (8개 페이지 grep)

| 패턴 | 출현 | 비고 |
|------|------|------|
| `text-[#…]` 임의 hex 색 | 약 230건 | `#111827`/`#6B7280`/`#9CA3AF`/`#DC2626`/`#F6F7F9`/`#EFF6FF`/`#1D4ED8`/`#3B82F6` 반복 |
| `text-[NNpx]` 임의 폰트크기 | 약 190건 | 10/11/12/13/14/15/16/17/18px 9단계가 일관성 없이 혼재 |
| `bg-[#…]` 임의 배경 | 약 110건 | `#FFFFFF`/`#F6F7F9`/`#F1F3F5`/`#F9FAFB`/`#F3F4F6`/`#EFF6FF` 등 |
| `rounded-(2xl|xl|lg|md)` + `rounded-[NNpx]` | 약 95건 | 2xl/xl 혼용, 카드/모달/칩/버튼 기준 없음 |
| `border-[#…]`/`border-black/5\|10` | 약 60건 | subtle/default 구분 없음 |
| `px-N py-N` (4의 배수 외) | 약 40건 | `py-3.5`/`py-2.5`/`px-3.5` 등 비표준 |
| 페이지 좌우 패딩 | `px-4` 8/8 페이지 | **유일하게 일관된 값** |
| 페이지 max-width | `max-w-2xl` 8/8 페이지 | **유일하게 일관된 값** |
| 페이지 헤더 sticky 패턴 | `bg-white/80 backdrop-blur-xl sticky top-0 z-10 border-b border-black/5` | **각 페이지 복붙. z-index/blur 강도가 미세하게 다른 곳도 있음** |
| 페이지 hero container | 일부 `h-dvh overflow-y-auto pb-20\|24\|36` | 미세 차이로 BottomNav 가림/공백 케이스 동시 존재 |

### 1.3 BottomNav · Layout 이슈

- `BottomNav`는 `position: fixed bottom-0` + `paddingBottom: env(safe-area-inset-bottom)` (좋음).
- 그러나 페이지 본문은 BottomNav 높이를 모름. 각 페이지가 `pb-20`(Home 로딩) / `pb-24`(Home/Favorites/RouteManagement) / `pb-36`(SetupRoute, sticky 저장 버튼 때문) 등 임의값으로 보정.
- `AddFavorite`은 `h-dvh` 대신 `min-h-screen`을 써서 가상 키보드 올라올 때 동작이 다름.
- `SetupRoute`의 sticky 저장 버튼은 `bottom-16` 매직 넘버 — BottomNav 실 높이 변경 시 깨짐.

### 1.4 화면 깜빡임

- 페이지 라우팅 시 `bg-[#F6F7F9]`을 `<div>`에 매번 다시 칠함 (body 배경 미통일). Vite HMR/라우터 전환 한 프레임에서 흰 배경 노출.
- 각 페이지가 자기 헤더 sticky를 새로 깔고 `body` 위에 white blur layer 깔리는 패턴이라 백 네비 시 모달처럼 미끄러져 보일 때가 있다.

### 1.5 결론

토큰 시스템 부재 + 페이지 shell 부재가 동시에 누적된 상태. 페이지마다 같은 디자인을 손으로 다시 그리고 있고, 색·폰트·여백 단위 의사결정이 코드 곳곳에 흩어져 있다. **수정 비용은 페이지 수에 정비례한다 — 즉 신기능을 추가할 때마다 시스템 비용이 커진다.**

---

## 2. 대안 검토

### Option A — 현행 유지 + 페이지별 정리

페이지를 하나씩 손보면서 hex/px를 줄여간다.

- 장점: 진입 비용 0.
- 단점: 시스템이 없으니 한 페이지를 정리해도 다음 페이지에 같은 패턴이 다시 등장. 리뷰 기준이 없어서 정리가 회귀한다. **실측 4개월간 누적된 증거가 있는 안티패턴.**
- 판정: 기각.

### Option B — shadcn/ui 토큰 그대로 사용

`theme.css`의 기존 41개 색 토큰만 active 상태로 끌어올리고 페이지에서 `text-foreground`/`text-muted-foreground` 등으로 치환.

- 장점: 추가 토큰 정의 비용 0.
- 단점:
  - shadcn 시멘틱(`primary`/`muted`/`accent`)은 라이브러리 컴포넌트용 — 도메인 시멘틱(text-tertiary, arrival-urgent 등)이 부족.
  - typography·spacing·elevation·motion이 여전히 비어있음 → 절반의 해결.
  - "출퇴근 앱" 도메인 색(arrival-urgent 빨강 등)을 표현할 자리가 없음.
- 판정: 부분 채택. shadcn 토큰은 재활용하되 그 위에 도메인 시멘틱을 얹는다.

### Option C — 자체 토큰 시스템 (Tailwind v4 `@theme`)

`theme.css`의 `@theme inline` 블록을 확장해 color/spacing/typography/radius/elevation/motion 6개 카테고리를 정의. `@layer base` 또는 `@utility`로 시멘틱 클래스(`text-page-title`, `surface-card` 등)를 정의.

- 장점:
  - Tailwind v4 native — `tailwind.config.js` 도입 없이 처리 가능 (현재 `@tailwindcss/vite` 플러그인 + `tailwind.config.js` 부재 정책 유지).
  - 도메인 시멘틱을 자유롭게 추가 가능 (arrival-urgent 등).
  - 토큰 정의가 한 파일(`theme.css`)에 응집.
- 단점:
  - Tailwind v4 `@theme` 문법 학습 곡선 약간.
  - 토큰 추가 절차(ADR 갱신 + theme.css 추가)를 컨벤션으로 강제해야 토큰 폭발 방지.
- 판정: **채택.**

### Option D — Tailwind preset (`tailwind.config.js` 도입)

`tailwind.config.js`로 preset 정의. v3 시절의 표준 패턴.

- 장점: 학습 자료 풍부.
- 단점: **현재 `@tailwindcss/vite` 플러그인 + `tailwind.config.js` 없음 정책과 충돌.** 도입 시 빌드 파이프라인 변경 필요. 보상으로 얻는 게 없다 — `@theme`만으로 동등하게 가능.
- 판정: 기각.

---

## 3. 채택 결정

**Option C — Tailwind v4 `@theme` 확장 + `@utility` 시멘틱 클래스 + PageShell/PageHeader 공용 컴포넌트.**

### 3.1 토큰 카테고리 (6개)

| 카테고리 | 개수 | 정의 위치 |
|----------|------|-----------|
| Color (semantic) | 18 | `:root` + `@theme inline` |
| Spacing | 7 | `@theme inline --spacing-*` |
| Typography | 7 (시멘틱) | `@utility` 클래스 |
| Radius | 4 | `@theme inline --radius-*` |
| Elevation | 3 | `@theme inline --shadow-*` |
| Motion | 5 (3 duration + 2 easing) | `@theme inline --duration-*`, `--ease-*` |

상세 키와 값은 [`docs/design-system.md`](../design-system.md) 참고.

### 3.2 컴포넌트 표준

- `<PageShell>` — `min-h-dvh`, BottomNav 자동 padding-bottom, safe-area, max-width, 좌우 padding을 단일 책임화.
- `<PageHeader>` — sticky / blur / back-button / right-actions 표준화.
- 페이지는 반드시 `<PageShell>`로 감싸고, 헤더는 `<PageHeader>` 사용 (또는 미사용 시 의도적으로 명시).
- `<Section>` / `<Stack>`은 도입 보류 — Tailwind utility로 충분. 필요 시 추후 ADR 갱신.

### 3.3 마이그레이션 정책 — **일괄 진행**

점진 마이그레이션은 Option A의 함정을 그대로 답습한다. 토큰 시스템을 도입하는 김에 8개 페이지를 한 번에 정리한다 (단, FE-DS-1~5 task 단위로는 분리해서 PR 가능).

### 3.4 강제 룰

신규 코드는 다음 모두 금지:
- `text-[#…]`, `bg-[#…]`, `border-[#…]` (임의 hex)
- `text-[NNpx]`, `w-[NNpx]`, `h-[NNpx]` (임의 px) — 단 외부 라이브러리(lucide 아이콘 size 등) 인라인 size는 예외
- `rounded-[NNpx]` (임의 radius)
- 페이지 컴포넌트가 `h-dvh`/`min-h-screen`/`pb-N`을 직접 다는 행위 — `<PageShell>`이 책임짐

상세는 [`.claude/rules/design-system.md`](../../.claude/rules/design-system.md).

### 3.5 토큰 추가 절차

새 토큰이 필요한 경우 (예: `arrival-urgent`처럼 도메인 강제 색):

1. `docs/design-system.md`에 추가 (이름, 값, 용도, 사용 예).
2. `src/styles/theme.css`에 정의 추가.
3. 카테고리 변동(예: 새 카테고리 신설)은 본 ADR에 항목 추가하고 사유 명시.

토큰 폭발을 막기 위해, **신규 추가가 기존 토큰으로 표현 가능하면 기각.** 예: `text-[15px]`이 필요해 보여도 `text-card-title`(16px) 또는 `text-body`(14px) 중 하나로 통합한다.

---

## 4. 결과

- 페이지 개발 시 결정해야 할 디자인 디테일이 시멘틱 토큰 7~10개 + PageShell 1개로 줄어든다.
- BottomNav 가림 현상이 PageShell 단일 책임으로 해소.
- 페이지 전환 시 흰 배경 깜빡임이 body 배경 통일로 해소.
- 향후 다크모드 도입 시 `:root.dark` 블록만 갱신하면 됨 (이미 shadcn 토큰이 dark 분기됨).

---

## 5. 트레이드오프

- 마이그레이션 시점에 8개 페이지 동시 변경 → 한 PR이 커지거나 PR 5개로 쪼개지는 부담.
- 신규 코드에 강제력 있는 룰이 없으면 안티패턴 회귀 → `.claude/rules/design-system.md` + code-reviewer 체크리스트 필수.
- 임시 hex/px가 빠른 시도엔 편한데 룰이 그걸 막음 — 시도용 코드는 PR 직전 토큰화 의무.

---

## 6. 후속 작업

`fe-agent`에 분배 (FE-DS-1 ~ FE-DS-5):

- **FE-DS-1.** `src/styles/theme.css` 확장.
- **FE-DS-2.** `<PageShell>`, `<PageHeader>` 컴포넌트 신설.
- **FE-DS-3.** `BottomNav` 높이를 CSS custom property로 노출 + PageShell이 padding-bottom 자동 처리.
- **FE-DS-4.** 8개 페이지 일괄 마이그레이션 (페이지별 PR 분리 권장).
- **FE-DS-5.** grep 기반 lint 체크리스트 (`text-\[#`, `text-\[\d+px\]` 등 금지 패턴).

상세는 [`docs/design-system.md`](../design-system.md) §7 "마이그레이션 task 분배".
