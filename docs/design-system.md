# when_come 디자인 시스템

> ADR: [`docs/decisions/ADR-003-design-system.md`](decisions/ADR-003-design-system.md)
> 강제 룰: [`.claude/rules/design-system.md`](../.claude/rules/design-system.md)
> 마지막 갱신: 2026-05-10

이 문서는 **사용 가이드**다. ADR이 "왜"를 답하고, 이 문서가 "어떻게"를 답한다. 신규 코드가 이 문서의 토큰만으로 충분히 표현 가능해야 한다 — 표현 안 되면 토큰을 추가하고 본 문서를 갱신하라.

---

## 0. 어떤 토큰부터 보면 되나

빠른 매핑:

| 의도 | 토큰 |
|------|------|
| 페이지 제목 (h1, 한 페이지 1개) | `text-page-title` |
| 섹션 헤더 (카드 그룹의 제목) | `text-section` |
| 카드 제목 (정류장명, 경로명) | `text-card-title` |
| 본문 텍스트 | `text-body` |
| 라벨 (폼 라벨, 메타 정보) | `text-label` |
| 캡션 (보조 설명, 작은 글씨) | `text-caption` |
| 버튼 텍스트 | `text-button` |
| 페이지 배경 | (PageShell이 처리, 직접 칠하지 마라) |
| 카드 배경 | `surface-card` |
| 인풋 배경 | `surface-input` |
| 1차 텍스트 (#111827) | `text-primary` |
| 2차 텍스트 (#6B7280) | `text-secondary` |
| 3차 텍스트 (#9CA3AF) | `text-tertiary` |
| 비활성 텍스트 (#D1D5DB) | `text-disabled` |
| 카드 radius | `rounded-card` |
| 인풋/버튼 radius | `rounded-control` |
| 카드 그림자 | `shadow-card` |

---

## 1. Spacing scale

페이지 코드 grep 결과 가장 많이 등장하는 단위는 4·8·12·16·20·24px. 4의 배수 7단계로 통합한다.

Tailwind v4의 `--spacing-N` 토큰을 그대로 활용 (Tailwind는 기본적으로 `--spacing: 0.25rem`을 곱하기 때문에 `space-1` = 4px, `space-2` = 8px ... 자동). 명시적으로 시멘틱 alias만 추가한다.

| 토큰 | px | 용도 | 등장 위치 |
|------|-----|------|-----------|
| `space-1` (gap-1, p-1, ...) | 4px | 인라인 아이콘과 텍스트 사이, 도착 시간 단위(분, 행) 사이 | 카드 내부 텍스트 행간 보정 |
| `space-2` | 8px | 작은 그룹 사이, 칩 사이 | 칩 가로 간격 |
| `space-3` | 12px | 카드 내부 elem 간격, 카드 간 세로 간격 | 즐겨찾기 카드 사이 (`space-y-3`) |
| `space-4` | 16px | **카드 내부 표준 패딩 (p-4)** | 카드 헤더, 카드 본문 |
| `space-5` | 20px | 카드 본문 패딩 (강조형 카드, p-5) | 현재 도착 카드 정류장 정보 영역 |
| `space-6` | 24px | **페이지 좌우 패딩 (px-6)** | PageShell이 적용 |
| `space-8` | 32px | 섹션 간 큰 분리, EmptyState 내부 패딩 | EmptyState, 에러 카드 |

> 페이지 좌우 패딩은 현재 `px-4`(16px)이지만 모바일 카드 디자인 표준은 16px이다 — `px-4`를 유지한다. `space-6`은 큰 화면 또는 인-카드 컨텐츠 hero 영역용으로 둔다.

**사용 규칙:**
- 카드 내부 padding은 `p-4`(표준) 또는 `p-5`(강조). 그 외 금지.
- 카드 사이 세로 간격은 `space-y-3`(12px). 그 외 금지.
- 페이지 본문과 헤더 사이 top padding은 `pt-4`. PageShell이 내부에서 처리하지만 페이지 컴포넌트가 직접 추가하지 않는다.
- `py-3.5`/`py-2.5` 등 비-4의 배수 금지. 시각적으로 어쩔 수 없는 경우(아이콘 정렬) leading-trim/line-height로 해결한다.

---

## 2. Typography scale

페이지 코드 실측: 10/11/12/13/14/15/16/17/18/20/24px 폰트 사이즈가 혼재. 8단계까지는 정당화 가능하지만 12·13, 14·15, 16·17이 같은 의도로 섞여 쓰임. **시멘틱 7개로 통합.**

| 토큰 | font-size | weight | line-height | 용도 |
|------|-----------|--------|-------------|------|
| `text-page-title` | 24px (1.5rem) | 600 | 1.3 | 페이지 h1. PageHeader가 자동 적용 |
| `text-section` | 18px (1.125rem) | 600 | 1.4 | 섹션 헤더. "지금 타야할 교통수단" 등 |
| `text-card-title` | 16px (1rem) | 600 | 1.4 | 카드 제목. 정류장명, 경로명 |
| `text-body` | 14px (0.875rem) | 400 | 1.5 | 본문, 일반 텍스트, 도착 시간 본문 |
| `text-label` | 13px (0.8125rem) | 500 | 1.4 | 폼 라벨, 칩 텍스트, 메타 정보 ("전철", "버스") |
| `text-caption` | 12px (0.75rem) | 400 | 1.4 | 작은 캡션, 부가 설명 ("3정거장 전") |
| `text-button` | 14px (0.875rem) | 600 | 1.4 | 버튼 텍스트 (size별로 height만 다름) |

**숫자 강조 패턴 (도착 시간 등):**
- 도착 시간 메인: `text-card-title font-bold tabular-nums` 또는 `text-section font-bold tabular-nums`.
- 도착 시간 작은 표시: `text-label font-bold tabular-nums`.
- 단위(`분`, `행`): 메인 사이즈보다 한 단계 작게 + `font-normal`.
- `tabular-nums`는 항상 숫자 카운트다운에 사용.

**사용 규칙:**
- `text-[NNpx]` 임의 픽셀 금지.
- 한 페이지에 `text-page-title`은 1개. PageHeader가 책임지므로 페이지 본문에서 직접 쓰지 않는다.
- 위 7개 시멘틱으로 표현 안 되는 케이스가 보이면 디자인 의도를 다시 확인 — 거의 항상 이 7개 안에 있다.

---

## 3. Radius scale

페이지 실측: `rounded-md`(6px), `rounded-lg`(8px), `rounded-xl`(12px), `rounded-2xl`(16px), `rounded-full` 5단계 + 일부 `rounded-[NNpx]`.

shadcn 기본 `--radius`는 0.75rem(12px). 이 위에 시멘틱 4개를 새로 정의:

| 토큰 | 값 | 용도 |
|------|-----|------|
| `rounded-chip` | 4px | 작은 칩, 노선 번호 라벨, 메타 라벨 (`#F1F3F5` 배경 위) |
| `rounded-control` | 12px | 인풋, 버튼, 작은 카드, 메뉴 dropdown |
| `rounded-card` | 16px | **카드 표준** — 정류장 카드, EmptyState 카드, 대화상자 |
| `rounded-pill` | 9999px | pill 칩 (활성 경로 칩, 정렬 칩), 원형 버튼 |

**사용 규칙:**
- 카드는 무조건 `rounded-card`. `rounded-2xl` 직접 사용 금지.
- 버튼/인풋은 무조건 `rounded-control`. `rounded-xl` 직접 사용 금지.
- 노선 번호 작은 라벨은 `rounded-chip`. `rounded-md` 직접 사용 금지.

> shadcn `--radius` (0.75rem = 12px = `rounded-control`)은 그대로 두고, 4개 시멘틱을 별도로 추가. 기존 `radius-sm`/`radius-md`/`radius-lg`/`radius-xl`(shadcn 자동 생성)은 ui/ 라이브러리 컴포넌트 내부 호환용으로 남기되 페이지 코드에서 직접 사용 금지.

---

## 4. Elevation (shadow)

| 토큰 | 정의 | 용도 |
|------|------|------|
| `shadow-flat` | none | 평면 카드 (예: 즐겨찾기 row 같은 정적 리스트 항목) |
| `shadow-card` | `0 1px 2px rgba(17, 24, 39, 0.04), 0 1px 3px rgba(17, 24, 39, 0.06)` | 표준 카드 — 페이지 본문에 떠 있는 카드 |
| `shadow-floating` | `0 10px 15px -3px rgba(17, 24, 39, 0.10), 0 4px 6px -4px rgba(17, 24, 39, 0.05)` | 모달, dropdown, sticky 저장 버튼 영역 |

**사용 규칙:**
- 페이지 카드는 `shadow-card`. 현재 `shadow-sm` 직접 사용 금지.
- 모달, dropdown은 `shadow-floating`.
- BottomNav, 헤더 sticky는 그림자 대신 `border-subtle`로 분리.

---

## 5. Motion

| 토큰 | 값 | 용도 |
|------|-----|------|
| `duration-fast` | 150ms | hover 색 전환, 버튼 press, micro 인터랙션 |
| `duration-normal` | 200ms | accordion expand/collapse, 토스트 in/out, 토글 |
| `duration-slow` | 300ms | 페이지 전환 fade, 드래그 reorder commit |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 기본 — 들어올 때 빠르게 들어와 부드럽게 정착 (Material Standard) |
| `ease-emphasis` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | 강조 (사용자 액션 직후 시각적 피드백) |

**사용 규칙:**
- `transition-colors`/`transition-opacity`는 기본 `duration-normal` + `ease-standard`로 적용 (theme.css에 default 박는다).
- 명시적으로 빠르게 (예: hover 즉응) → `duration-fast`.
- prefers-reduced-motion 감지 시 모든 duration을 0으로 처리하는 `@media` 룰을 theme.css에 포함.

---

## 6. Color (semantic)

기존 shadcn 41개 토큰을 유지하되, 도메인 시멘틱을 위에 추가한다. 페이지 코드에서 자주 등장하는 hex를 시멘틱으로 묶음.

### 6.1 Text colors

페이지 실측 빈도순 매핑:

| 토큰 | 값 (light) | 페이지에서 자주 등장한 hex |
|------|-----------|---------------------------|
| `text-primary` | `#111827` | 본문 1차, 카드 제목 (가장 빈번 — 약 95건) |
| `text-secondary` | `#6B7280` | 본문 2차, 캡션, 비활성 메뉴 (약 85건) |
| `text-tertiary` | `#9CA3AF` | 보조 메타, 회색 캡션 (약 90건) |
| `text-disabled` | `#D1D5DB` | 비활성/없음 표시 (약 15건) |
| `text-danger` | `#DC2626` | 에러, 삭제 액션, isUrgent 도착 시간 (약 12건) |
| `text-info` | `#1D4ED8` | "반대 방향 등록 중" 안내, 정보성 inline (약 4건) |

> shadcn `--foreground`(#111827)는 `text-primary`와 동의어 — alias로 둔다. `--muted-foreground`(#6B7280)는 `text-secondary`와 동의어.

### 6.2 Surface colors

| 토큰 | 값 | 용도 |
|------|-----|------|
| `surface-page` | `#F6F7F9` | 페이지 배경 (PageShell 자동 적용 + body 배경) |
| `surface-card` | `#FFFFFF` | 카드, 시트, 모달 배경 |
| `surface-input` | `#F9FAFB` | 인풋 배경, dropdown 호버 배경 |
| `surface-elevated` | `#FFFFFF` (light) | 모달, sticky 저장 버튼 영역 |
| `surface-muted` | `#F1F3F5` | 비활성 칩 배경, 메타 라벨 배경 |
| `surface-info-soft` | `#EFF6FF` | 정보성 안내 배경 ("반대 방향 등록 중") |
| `surface-info-border` | `#BFDBFE` | 정보성 안내 보더 |
| `surface-danger-soft` | `#FEF2F2` | 위험/삭제 액션 hover 배경 (red-50, Favorites 삭제 메뉴 hover 등) |

### 6.3 Border colors

| 토큰 | 값 | 용도 |
|------|-----|------|
| `border-subtle` | `rgba(17, 24, 39, 0.05)` | 카드 보더, 헤더 하단 보더 — 거의 보이지 않는 분리선 |
| `border-default` | `rgba(17, 24, 39, 0.10)` | 인풋 보더, 명시적 보더 |
| `border-strong` | `#E5E7EB` | 강조 보더 — 거의 사용 안 함 |
| `border-accent` | `#3B82F6` | 활성 인풋 focus, 정보성 안내 보더 |

> `border-black/5`/`border-black/10`이 페이지 곳곳에 박혀 있는데, 시멘틱(`border-subtle`/`border-default`)으로 일괄 치환하라.

### 6.4 Domain semantic — arrival

도착 시간 표시는 출퇴근 앱의 핵심 시각 정보다. 시멘틱을 명시:

| 토큰 | 값 | 용도 |
|------|-----|------|
| `arrival-urgent` | `#DC2626` | remainSec < 180 (3분 미만) — 빨강 강조 |
| `arrival-normal` | `#111827` | 일반 도착 시간 — 1차 텍스트와 같음 |
| `arrival-muted` | `#9CA3AF` | 다음 차, 비활성 도착 — 3차 텍스트와 같음 |
| `arrival-empty` | `#D1D5DB` | "도착 정보 없음" — disabled와 같음 |

> 실용상 `text-danger`/`text-primary`/`text-tertiary`/`text-disabled`와 동일 값이지만 **의도를 분리**한다. 향후 다크모드/색약자 지원 시 arrival-urgent만 별도 조정 가능.

### 6.5 Transit colors (별도 시스템)

지하철 노선색, 버스 종류별 색은 `src/utils/transitColors.ts`가 책임 — 디자인 시스템 토큰화 대상 아님 (외부 표준 색이므로). 단, transit color를 카드 배경 등에 사용할 때는 토큰의 `border-subtle`로 둘러서 카드 자체는 시스템에 종속되도록 한다.

---

## 7. theme.css 확장 명세

`src/styles/theme.css`에 추가할 내용. **fe-agent가 실제 CSS 작성** — 본 문서는 키와 값만 명세.

### 7.1 `:root` 추가 항목

```css
:root {
  /* 기존 41개 색 + radius 유지 */

  /* === Surfaces === */
  --surface-page: #F6F7F9;
  --surface-card: #FFFFFF;
  --surface-input: #F9FAFB;
  --surface-elevated: #FFFFFF;
  --surface-muted: #F1F3F5;
  --surface-info-soft: #EFF6FF;
  --surface-info-border: #BFDBFE;

  /* === Text === */
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --text-tertiary: #9CA3AF;
  --text-disabled: #D1D5DB;
  --text-danger: #DC2626;
  --text-info: #1D4ED8;

  /* === Borders === */
  --border-subtle: rgba(17, 24, 39, 0.05);
  --border-default: rgba(17, 24, 39, 0.10);
  --border-strong: #E5E7EB;
  --border-accent: #3B82F6;

  /* === Domain — arrival === */
  --arrival-urgent: #DC2626;
  --arrival-normal: #111827;
  --arrival-muted: #9CA3AF;
  --arrival-empty: #D1D5DB;

  /* === Radii === */
  --radius-chip: 4px;
  --radius-control: 12px;
  --radius-card: 16px;
  --radius-pill: 9999px;

  /* === Shadows === */
  --shadow-flat: none;
  --shadow-card: 0 1px 2px rgba(17, 24, 39, 0.04), 0 1px 3px rgba(17, 24, 39, 0.06);
  --shadow-floating: 0 10px 15px -3px rgba(17, 24, 39, 0.10), 0 4px 6px -4px rgba(17, 24, 39, 0.05);

  /* === Motion === */
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasis: cubic-bezier(0.3, 0, 0.8, 0.15);

  /* === Layout === */
  --bottom-nav-height: 64px;       /* nav body */
  --bottom-nav-total: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom));
  --page-header-height: 56px;
  --page-max-width: 42rem;          /* max-w-2xl */
  --page-padding-x: 1rem;           /* 16px */
}
```

### 7.2 `@theme inline` 매핑

Tailwind utility로 노출시킬 항목:

```css
@theme inline {
  /* 기존 색/radius 매핑 유지 */

  /* Surfaces */
  --color-surface-page: var(--surface-page);
  --color-surface-card: var(--surface-card);
  --color-surface-input: var(--surface-input);
  --color-surface-elevated: var(--surface-elevated);
  --color-surface-muted: var(--surface-muted);
  --color-surface-info-soft: var(--surface-info-soft);
  --color-surface-info-border: var(--surface-info-border);
  --color-surface-danger-soft: var(--surface-danger-soft);

  /* Text */
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-tertiary: var(--text-tertiary);
  --color-text-disabled: var(--text-disabled);
  --color-text-danger: var(--text-danger);
  --color-text-info: var(--text-info);

  /* Borders */
  --color-border-subtle: var(--border-subtle);
  --color-border-default: var(--border-default);
  --color-border-strong: var(--border-strong);
  --color-border-accent: var(--border-accent);

  /* Arrival (domain) */
  --color-arrival-urgent: var(--arrival-urgent);
  --color-arrival-normal: var(--arrival-normal);
  --color-arrival-muted: var(--arrival-muted);
  --color-arrival-empty: var(--arrival-empty);

  /* Radii — 새 시멘틱 (기존 radius-sm/md/lg/xl과 공존) */
  --radius-chip: var(--radius-chip);
  --radius-control: var(--radius-control);
  --radius-card: var(--radius-card);
  --radius-pill: var(--radius-pill);

  /* Shadows */
  --shadow-flat: var(--shadow-flat);
  --shadow-card: var(--shadow-card);
  --shadow-floating: var(--shadow-floating);
}
```

이걸로 `bg-surface-card`, `text-text-primary`, `rounded-card`, `shadow-card` 같은 utility가 자동 노출된다.

### 7.3 `@utility` 시멘틱 클래스 (typography)

Tailwind v4 `@utility`로 typography 시멘틱 클래스를 정의:

```css
@utility text-page-title {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-primary);
}
@utility text-section {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
}
@utility text-card-title {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
}
@utility text-body {
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-primary);
}
@utility text-label {
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-secondary);
}
@utility text-caption {
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-tertiary);
}
@utility text-button {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
}
```

`text-` 접두사가 충돌 가능 — fe-agent가 검증 후 필요 시 `type-page-title` 등으로 변경. 본 문서에서는 `text-` 사용을 가정한다.

### 7.4 `@layer base` 보강

```css
@layer base {
  /* 기존 border-border outline-ring/50 유지 */

  body {
    background-color: var(--surface-page);   /* 페이지 깜빡임 방지 — body 배경 통일 */
    color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
  }

  /* prefers-reduced-motion */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0ms !important;
      transition-duration: 0ms !important;
    }
  }
}
```

### 7.5 BottomNav 높이 노출

`BottomNav.tsx` 또는 `theme.css`에서 `--bottom-nav-total`이 계산된 후, `<PageShell>`이 `padding-bottom: var(--bottom-nav-total)`로 자동 잡는다. 페이지 컴포넌트는 `pb-N`을 직접 달지 않는다.

---

## 8. PageShell / PageHeader 명세

> **코드는 fe-agent가 작성**. 본 절은 props/책임/구조만 명세.

### 8.1 `<PageShell>`

```tsx
// src/components/PageShell.tsx
interface PageShellProps {
  children: ReactNode
  /** 페이지 본문 추가 클래스 (대부분 필요 없음) */
  className?: string
  /** sticky 저장 버튼 등 BottomNav 위에 떠 있는 영역 — true면 padding-bottom 추가로 늘려줌 */
  reserveStickyFooter?: boolean
  /** 헤더 sticky 사용 안 함 (예: 풀스크린 검색 모달) */
  noHeader?: boolean
}
```

**책임:**
1. `min-h-dvh` (모바일 viewport — 키보드 올라와도 안 잘림).
2. `background-color: var(--surface-page)` — body 배경과 동일이지만 명시.
3. `padding-bottom: var(--bottom-nav-total)` — BottomNav 높이 + safe-area-bottom 합산. `reserveStickyFooter` 시 추가 +56px.
4. `padding-top` 없음 — `<PageHeader>`가 sticky이므로 `<PageShell>`은 top padding 없이 컨텐츠 시작.
5. 좌우 padding은 `<PageShell>`이 직접 적용하지 않음 — 내부의 inner container가 `max-w-page` + `px-page` 적용. 이유: 헤더는 BG가 sticky 영역 전체를 덮어야 해서 좌우 padding을 페이지 컨테이너가 잡으면 헤더 BG가 좁아진다. **inner content wrapper만 좌우 padding 적용.**
6. `<BottomNav />` 자동 렌더링 — 모든 페이지에서 매번 import해서 다는 패턴 제거.

**구조:**
```tsx
<div class="min-h-dvh bg-surface-page">
  {!noHeader && /* 헤더 children에서 받음 — children 첫 번째가 PageHeader면 그대로 두고 BottomNav만 추가 */}
  <main class="pb-[var(--bottom-nav-total)]">
    {children}
  </main>
  <BottomNav />
</div>
```

> 실제로는 PageShell이 PageHeader와 별도 슬롯이 아니라 children 안에 PageHeader가 들어가는 형태가 깔끔. PageShell은 main + BottomNav만 책임진다.

### 8.2 `<PageHeader>`

```tsx
// src/components/PageHeader.tsx
interface PageHeaderProps {
  title?: string
  /** 좌측 back 버튼:
   *  - undefined/false: 표시 안 함
   *  - true: navigate(-1)
   *  - 함수: 직접 호출
   */
  back?: boolean | (() => void)
  /** 우측 액션 슬롯 (Settings, +, RefreshCw 등 아이콘 버튼들) */
  right?: ReactNode
  /** 제목 좌측 (back 우측)에 들어갈 보조 슬롯 — 예: "내 경로" + Navigation 아이콘 */
  leading?: ReactNode
  /** 제목 우측에 들어갈 inline 배지 슬롯 — 예: "반대 방향 등록 중" */
  badge?: ReactNode
  /** 헤더 아래에 붙는 secondary row (탭 바, 칩 스크롤 등) */
  bottom?: ReactNode
}
```

**책임:**
1. `position: sticky; top: 0; z-index: 10`.
2. `background-color: rgba(255,255,255,0.8); backdrop-filter: blur(20px); border-bottom: 1px solid var(--border-subtle)`.
3. `padding-top: env(safe-area-inset-top)` — iOS notch 대응.
4. inner container: `max-w-[var(--page-max-width)] mx-auto px-[var(--page-padding-x)]`.
5. height 표준 56px (title row). `bottom` 슬롯이 있으면 그 아래 자유 높이.
6. `title`은 `text-card-title` 적용 (h1은 PageHeader 단 한 번만 — 시멘틱 h1이지만 시각 사이즈는 16~17px 수준이 모바일 헤더 표준).

**구조:**
```tsx
<header class="page-header">
  <div class="page-header__inner">
    <div class="page-header__row">
      {back && <BackButton />}
      {leading}
      <h1 class="text-card-title flex-1 truncate">{title}</h1>
      {badge}
      <div class="flex items-center gap-1">{right}</div>
    </div>
    {bottom && <div class="page-header__bottom">{bottom}</div>}
  </div>
</header>
```

### 8.3 `<Section>`, `<Stack>` — 보류

현재 페이지에서 도메인 컨텐츠 구조가 페이지마다 다르기 때문에 (Home 타임라인, RouteManagement 카드 리스트, Favorites dnd 카드 리스트) 일반화 효용이 낮다. Tailwind utility(`space-y-3`)로 충분. 필요해지면 본 문서에 추가 + ADR 갱신.

### 8.4 `<EmptyState>` 정비

기존 `src/components/EmptyState.tsx`는 토큰 마이그레이션 대상. 인터페이스는 그대로 유지하되 hex/px → 토큰. 본 문서에서 별도 명세 불필요.

---

## 9. 페이지별 마이그레이션 매핑

8개 페이지 각각의 hex/px 사용 카운트와 적용할 토큰. fe-agent가 FE-DS-4에서 이 표를 체크리스트로 사용.

| # | 페이지 | hex 카운트 (대략) | 임의 px 카운트 (대략) | 우선순위 | 특이사항 |
|---|--------|-------------------|----------------------|----------|----------|
| 1 | `Home.tsx` | 약 95 | 약 70 | **1** (가장 노출 많음 + dnd 칩 + 타임라인) | 칩 가로 스크롤 dnd 보존, isUrgent 빨강은 `arrival-urgent`, 호선 색은 transitColors 그대로 |
| 2 | `Favorites.tsx` | 약 60 | 약 50 | 2 | 카드 세로 dnd 보존, 양방향 분리 UI 보존 |
| 3 | `RouteManagement.tsx` | 약 35 | 약 25 | 3 | 탭 바를 `<PageHeader bottom={...}>`로 이전, AlertDialog는 ui/ 라이브러리 그대로 |
| 4 | `SetupRoute.tsx` | 약 25 | 약 20 | 4 | sticky 저장 버튼은 `<PageShell reserveStickyFooter>`로, `bottom-16` 매직 넘버 제거 |
| 5 | `AddFavorite.tsx` | 약 15 | 약 10 | 5 | `min-h-screen` → `<PageShell>` 사용. 인풋은 `<Input>` ui 컴포넌트로 전환 권장 (현재 raw `<input>`) |
| 6 | `UnifiedStopPicker.tsx` | 약 10 | 약 8 | 6 | feature 컴포넌트 (페이지 아님) — PageShell 적용 X. 인풋만 토큰화 |
| 7 | `BottomNav.tsx` | 약 4 | 약 4 | 7 | `--bottom-nav-height` CSS 노출, height 측정값 64px 그대로 |
| 8 | `EmptyState.tsx` | 약 4 | 약 3 | 8 | 가장 단순 — 토큰 치환만 |

> 페이지에 묻혀있는 inline `style={{ ... }}` (예: dnd transform, transit color)는 그대로 둔다 — 동적이거나 외부 라이브러리 색이라서 토큰화 대상이 아님.

### 9.1 페이지별 변환 가이드 (예시 — Home.tsx)

```diff
- <div className="h-dvh overflow-y-auto bg-[#F6F7F9] pb-24">
-   <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-10 border-b border-black/5">
-     <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
-       ...
-     </div>
-   </div>
-   ...
-   <BottomNav />
- </div>
+ <PageShell>
+   <PageHeader
+     leading={<Navigation className="w-4 h-4 text-text-secondary" />}
+     title={currentRoute?.name ?? '내 경로'}
+     right={<>
+       <IconButton onClick={handleRefresh} icon={RefreshCw} />
+       <IconButton onClick={() => navigate('/routes')} icon={Settings} />
+     </>}
+     bottom={<RouteChipsRow ... />}
+   />
+   <PageContent>
+     ...
+   </PageContent>
+ </PageShell>
```

```diff
- className="px-4 py-3.5 border-b border-black/5"
+ className="p-4 border-b border-border-subtle"

- className="text-[15px] font-semibold text-[#111827]"
+ className="text-card-title"

- className={`... ${isUrgent ? 'text-[#DC2626]' : 'text-[#111827]'}`}
+ className={`... ${isUrgent ? 'text-arrival-urgent' : 'text-arrival-normal'}`}

- className="rounded-2xl border border-black/5 shadow-sm bg-white"
+ className="rounded-card border border-border-subtle shadow-card bg-surface-card"

- className="text-[13px] text-[#6B7280]"
+ className="text-label"   // 이미 color-secondary 포함

- className="text-[12px] text-[#9CA3AF]"
+ className="text-caption"
```

---

## 10. 강제 룰 (요약)

상세는 [`.claude/rules/design-system.md`](../.claude/rules/design-system.md). 신규 코드에서 다음 패턴은 **PR 차단**:

- `text-\[#[0-9a-fA-F]+\]` — 임의 hex 색
- `bg-\[#[0-9a-fA-F]+\]`
- `border-\[#[0-9a-fA-F]+\]`
- `text-\[\d+px\]` — 임의 px 폰트
- `(w|h)-\[\d+px\]` — 임의 px 사이즈 (lucide 아이콘 등 예외)
- `rounded-\[\d+px\]`
- 페이지 컴포넌트에 `h-dvh`/`min-h-screen`/`pb-2[04]` 직접 사용
- 페이지 컴포넌트에 `<BottomNav />` 직접 import (PageShell이 자동 처리)

예외 처리: 외부 라이브러리(lucide 아이콘 stroke width 등)는 인라인 size 허용. transitColors의 동적 색은 inline style로 유지.

---

## 11. 토큰 추가 절차

새 토큰이 필요할 때:

1. **먼저 기존 토큰으로 표현 가능한지 확인.** 가능하면 추가하지 말 것.
2. 본 문서의 해당 섹션에 토큰명/값/용도/등장 위치 추가.
3. `src/styles/theme.css`의 `:root` + `@theme inline`에 추가.
4. 카테고리 변동(새 카테고리 신설)이면 ADR-003에 항목 추가.
5. PR description에 "토큰 추가: X — 이유: Y"로 명시.

---

## 12. 카테고리별 토큰 개수 요약

| 카테고리 | 신규 추가 | 기존 유지 | 합 |
|----------|-----------|-----------|----|
| Color (semantic) | 19 (text 6, surface 8, border 4, info 1) + 4 (arrival domain) | 41 (shadcn) | 64 |
| Spacing | 0 (Tailwind 기본 활용, 시멘틱 alias 없음) | 8 (시멘틱 사용 단계 1~8) | 8 |
| Typography | 7 (시멘틱 utility 클래스) | 0 | 7 |
| Radius | 4 (chip/control/card/pill) | 4 (shadcn sm/md/lg/xl) | 8 |
| Elevation | 3 | 0 | 3 |
| Motion | 5 (3 duration + 2 ease) | 0 | 5 |
| Layout | 5 (`--bottom-nav-*`, `--page-*`) | 0 | 5 |

**핵심 신규 토큰: 46개 (color 22 + radius 4 + shadow 3 + motion 5 + layout 5 + typography 7)**

---

## 13. fe-agent 구현 task 분배

다음 task들로 분리. 각 task는 독립 PR 가능.

### FE-DS-1. theme.css 확장
- 위 §7의 `:root`, `@theme inline`, `@utility`, `@layer base` 블록을 `src/styles/theme.css`에 추가.
- 기존 41개 색 토큰은 그대로 유지 (ui/ shadcn 컴포넌트 호환).
- typecheck 통과 확인.
- 산출물: `src/styles/theme.css` 확장본.
- 검증: `npm run dev` → 기존 페이지 시각 회귀 없음 확인 (이 단계에서는 페이지 코드 변경 X).

### FE-DS-2. PageShell + PageHeader 신설
- `src/components/PageShell.tsx`, `src/components/PageHeader.tsx` 신설.
- §8의 props 인터페이스 그대로 구현.
- Storybook 없으므로 dev 서버에서 1개 페이지(예: AddFavorite)에 테스트 적용해 검증.
- 의존: FE-DS-1 완료.

### FE-DS-3. BottomNav 높이 노출
- `BottomNav.tsx`에서 `--bottom-nav-height: 64px`를 root style로 set 하거나, theme.css에 박는다.
- height 측정: 현재 `py-2 + py-2 + icon h-6 + label text-[11px]` ≈ 약 64px. 정확히 측정 후 고정.
- BottomNav 자체의 hex/px 토큰화는 FE-DS-4에 포함.
- 의존: FE-DS-1 완료.

### FE-DS-4. 페이지 8개 일괄 마이그레이션
- §9 표 순서대로 페이지별 토큰 치환.
- PageShell + PageHeader 적용.
- BottomNav `<BottomNav />` 직접 import 제거 (PageShell이 처리).
- `pb-NN`/`h-dvh` 매직 넘버 제거.
- SetupRoute의 `bottom-16` sticky 저장 영역 → PageShell `reserveStickyFooter` + 별도 footer 슬롯 컨벤션.
- 페이지별 PR 분리 권장 (8개 PR 또는 도메인별로 묶어 4개 PR).
- 의존: FE-DS-2, FE-DS-3 완료.

### FE-DS-5. 토큰 미사용 검출 체크리스트
- `package.json`에 grep 기반 npm script 추가:
  ```json
  "check:tokens": "! grep -rE 'text-\\[#|bg-\\[#|border-\\[#|text-\\[[0-9]+px|rounded-\\[[0-9]+px' src/features src/components src/app/components --include='*.tsx' --include='*.ts'"
  ```
- pre-commit hook 도입 시점은 별도 결정 (현재 lint 미설정 상태). 일단 수동 실행 + code-reviewer 체크리스트.
- 의존: FE-DS-4 완료 (먼저 클린한 상태가 되어야 검출 의미 있음).

---

## 14. CLAUDE.md 갱신 계획

`when_come_fe/CLAUDE.md`의 `## 개발 원칙` 섹션 또는 `## Tech Stack` 섹션에 다음을 추가:

```markdown
- **디자인 토큰만 사용** — hex/px hardcode 금지. 페이지는 `<PageShell>` + `<PageHeader>` 사용. 상세 가이드 [`docs/design-system.md`](../docs/design-system.md), 정책 [ADR-003](../docs/decisions/ADR-003-design-system.md), 강제 룰 [`.claude/rules/design-system.md`](../.claude/rules/design-system.md).
```

`## Tech Stack` 섹션의 Tailwind v4 줄에 추가:
```markdown
- **Tailwind v4** — `@tailwindcss/vite`. 토큰 정의 `src/styles/theme.css`. 시멘틱 토큰만 사용 (hex/px 금지).
```
