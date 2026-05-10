# 디자인 시스템 강제 룰

> 자동 적용 경로: `when_come_fe/src/**/*.{ts,tsx}`, `when_come_fe/src/styles/**/*.css`
> 정책: [ADR-003](../../docs/decisions/ADR-003-design-system.md)
> 가이드: [`docs/design-system.md`](../../docs/design-system.md)

본 룰은 PR 차단 기준이다. 위반 발견 시 fe-agent / code-reviewer는 반드시 수정 요청.

---

## 1. 금지 패턴 (regex)

다음 패턴은 신규 코드에서 등장 금지:

| Pattern | 이유 | 대안 |
|---------|------|------|
| `text-\[#[0-9a-fA-F]+\]` | 임의 hex 색 | `text-text-primary` / `text-text-secondary` / `text-text-tertiary` / `text-arrival-urgent` 등 시멘틱 토큰 |
| `bg-\[#[0-9a-fA-F]+\]` | 임의 hex 배경 | `bg-surface-card` / `bg-surface-input` / `bg-surface-muted` 등 |
| `border-\[#[0-9a-fA-F]+\]` | 임의 hex 보더 | `border-border-subtle` / `border-border-default` |
| `text-\[\d+px\]` | 임의 px 폰트 | `text-page-title` / `text-section` / `text-card-title` / `text-body` / `text-label` / `text-caption` / `text-button` |
| `(w\|h)-\[\d+px\]` (lucide 아이콘 stroke 제외) | 임의 px 사이즈 | 4의 배수 spacing scale (`w-9 h-9`) 또는 시멘틱 토큰 |
| `rounded-\[\d+px\]` | 임의 px radius | `rounded-chip` / `rounded-control` / `rounded-card` / `rounded-pill` |
| `border-black/(5\|10\|20)` | 시멘틱 부재 | `border-border-subtle` (≈ black/5) / `border-border-default` (≈ black/10) |
| `pb-\d+` (페이지 컨테이너) | BottomNav 가림/공백 야기 | `<PageShell>`이 자동 처리 — 직접 사용 금지 |
| `h-dvh` / `min-h-screen` (페이지 컨테이너) | viewport 처리 분산 | `<PageShell>`이 자동 처리 |
| `bg-white/80 backdrop-blur-xl sticky top-0` (페이지 헤더) | 헤더 패턴 분산 | `<PageHeader>` 사용 |

---

## 2. 페이지 작성 규칙

페이지(`src/features/{domain}/pages/*.tsx`)는 다음을 반드시 따른다:

### 2.1 최상위 구조

```tsx
// 허용
export default function MyPage() {
  return (
    <PageShell>
      <PageHeader title="..." back right={...} />
      <div className="..."> {/* 페이지 본문 */} </div>
    </PageShell>
  )
}

// 금지
export default function MyPage() {
  return (
    <div className="h-dvh overflow-y-auto bg-[#F6F7F9] pb-24">
      <div className="bg-white/80 backdrop-blur-xl sticky top-0 z-10 ...">
        ...
      </div>
      ...
      <BottomNav />
    </div>
  )
}
```

### 2.2 페이지에서 직접 import 금지

- `BottomNav` — `<PageShell>`이 자동 렌더링
- `safe-area-inset-bottom` 직접 사용 — `<PageShell>`이 처리
- `env(safe-area-inset-top)` 직접 사용 — `<PageHeader>`가 처리

### 2.3 sticky footer (예: SetupRoute 저장 버튼)

```tsx
<PageShell reserveStickyFooter>
  <PageHeader ... />
  <div>...</div>
  <StickyFooter>
    <Button>저장</Button>
  </StickyFooter>
</PageShell>
```

`bottom-16` 같은 매직 넘버 사용 금지. `<PageShell reserveStickyFooter>`가 BottomNav 위 +56px padding 추가.

---

## 3. 카드 컴포넌트 규칙

```tsx
// 허용
<Card className="rounded-card border border-border-subtle shadow-card bg-surface-card">

// 금지
<Card className="rounded-2xl border border-black/5 shadow-sm bg-white">
```

`shadcn/ui`의 `<Card>` 자체는 사용 OK. **className에 임의값을 넣지 말 것.**

---

## 4. 색상 사용 규칙

### 4.1 도메인 시멘틱 우선

| 의도 | 토큰 | 금지 패턴 |
|------|------|----------|
| 도착 시간 긴급 (3분 미만) | `text-arrival-urgent` | `text-[#DC2626]`, `text-text-danger`(의미 다름) |
| 도착 시간 일반 | `text-arrival-normal` | `text-[#111827]` |
| 도착 시간 다음/회색 | `text-arrival-muted` | `text-[#9CA3AF]` |
| "도착 정보 없음" | `text-arrival-empty` | `text-[#D1D5DB]` |
| 에러 메시지, 삭제 버튼 | `text-text-danger` | `text-[#DC2626]` |
| 정보 안내 ("반대 방향 등록 중") | `text-text-info` + `bg-surface-info-soft` | `text-[#1D4ED8]` + `bg-[#EFF6FF]` |

### 4.2 transit 색 (지하철 노선, 버스 종류)

`src/utils/transitColors.ts`의 동적 색은 **inline `style`로 적용**. 이건 시스템 토큰화 대상 아님. 단, transit 색을 둘러싼 카드/배지는 토큰 사용:

```tsx
// 허용
<span
  className="text-label px-2 py-0.5 rounded-chip border"
  style={{ backgroundColor: subwayColorInfo.bgColor, color: subwayColorInfo.textColor, borderColor: `${subwayColorInfo.color}33` }}
>
  {headsign}방향
</span>
```

---

## 5. 예외 사항

다음은 룰에서 제외:

- **lucide-react 아이콘 size**: `<Icon className="w-[18px] h-[18px]" />` 같은 중간 사이즈는 4의 배수가 아니지만 디자인 의도임. 단 `w-4 h-4`(16px), `w-5 h-5`(20px) 같은 표준 사이즈가 있으면 그걸 우선.
- **transit color inline style**: §4.2 참고.
- **dnd transform inline style**: `style={{ transform: CSS.Transform.toString(transform) }}` 같은 동적 변환.
- **외부 라이브러리 props**: shadcn `<Switch>`, Radix `<Dialog>` 등의 props는 그대로 사용.

---

## 6. 신규 토큰 필요 시

기존 토큰으로 표현 불가능한 색/사이즈가 필요하면:

1. **먼저 기존으로 가능한지 재확인.** 거의 항상 가능하다. 의심되면 architect 에이전트에 문의.
2. 정당한 경우:
   - `docs/design-system.md`에 토큰 추가 (이름/값/용도).
   - `src/styles/theme.css`에 정의 추가.
   - 카테고리 신설이면 ADR-003 갱신.
3. PR description에 "토큰 추가: X — 이유: Y" 명시.

---

## 7. code-reviewer 체크리스트

PR 리뷰 시 확인:

- [ ] `text-\[#`, `bg-\[#`, `border-\[#` grep 결과 0건
- [ ] `text-\[\d+px\]`, `rounded-\[\d+px\]` grep 결과 0건
- [ ] 페이지 컴포넌트가 `<PageShell>` 사용
- [ ] 페이지 컴포넌트가 `<BottomNav />` 직접 import 안 함
- [ ] 페이지 컴포넌트가 `pb-\d+`, `h-dvh`, `min-h-screen` 직접 사용 안 함
- [ ] 페이지 헤더가 `<PageHeader>` 사용 (또는 의도적 미사용 명시)
- [ ] 새 토큰 추가 시 design-system.md / theme.css 동기화

---

## 8. 마이그레이션 시점 예외

ADR-003 채택 시점(2026-05-10) 이전 코드는 점진적으로 정리한다. 단, **기존 코드를 수정할 때 같은 파일의 다른 hex/px도 함께 정리**할 것을 권장. "안 건드린 부분은 그대로 두기" 원칙 + "건드리는 김에 이 파일은 다 정리하기"의 절충.

새 파일 / 새 컴포넌트는 처음부터 본 룰 100% 준수.
