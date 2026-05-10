# 검은 배경 버튼 글씨 사라짐 회귀 — 시멘틱 타이포 utility 색 묶음의 함정

작성일: 2026-05-10
관련: ADR-003 디자인 토큰, 백로그 #17

## 현상

사용자 보고 (2026-05-10): SetupRoute "경로 검색" 버튼이 검은 직사각형으로만 보이고 글씨가 안 보임. SearchResultNode "추가" 버튼은 흐릿한 회색으로 보임 ("흐림"). 다크모드/라이트모드 무관하게 재현.

스크린샷에서 잘 보이는 검은 버튼("전체 추가")과 비교 시, 차이는 className에 `text-white`가 명시되어 있는지 여부.

## 원인

`src/styles/theme.css`의 시멘틱 타이포 `@utility`가 폰트 사이즈/굵기와 함께 **색까지 묶어서 정의**됨:

```css
@utility text-body {
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-primary);  /* ← 검정 */
}
@utility text-caption {
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-tertiary); /* ← 회색 */
}
@utility text-label {
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-secondary);
}
```

`bg-text-primary` (검정 배경) 버튼에서 `text-white` 없이 `text-body` 또는 `text-caption`을 쓰면, utility의 color가 적용되어 검은 배경 + 검정/회색 글씨가 됨.

shadcn `<Button>`의 default variant도 `text-primary-foreground` (light: 흰색, dark: 검정)이라 다크모드에서 더 악화될 수 있음.

## 임시 fix (이번 세션)

검은 버튼 8곳에 `text-white` 일괄 명시:

- `Home.tsx:455` 다시 시도
- `EmptyState.tsx:39` CTA
- `AddFavorite.tsx:208` 등록
- `Favorites.tsx:576` 다시 시도
- `RouteManagement.tsx:120, 522` 저장/다시 시도
- `RouteNodeCard.tsx:250` 추가
- `SearchResultNode.tsx:98` 추가
- `SetupRoute.tsx:584` 경로 검색

## 근본 fix (백로그 #17 확장)

utility에서 color 분리 옵션 두 가지:

A) **utility의 color 분리** — `text-body` 등을 font-only로 두고, 색은 별도 클래스 (`text-text-primary`)로 항상 명시. 깔끔하나 모든 사용처에 색 추가 필요해서 마이그레이션 큼.

B) **강조형 타이포 토큰 신설** — `text-body-on-dark`, `text-caption-on-dark` 등 검은 배경용 별도 토큰. 사용처 적어 작은 변경. 단 토큰 수 증가.

C) **현재 룰 강화** — `bg-text-primary` 사용처에 `text-white` 강제 lint/grep 룰. 코드리뷰 체크리스트에 추가. 표면적 처리지만 비용 가장 낮음.

추천: **C 우선 적용 + 장기적으로 A**.

## 회귀 방지

`.claude/rules/design-system.md` §9 `code-reviewer 체크리스트`에 다음 항목 추가 권장:

```
- [ ] `bg-text-primary` 사용처에 `text-white` 명시 (시멘틱 타이포 utility의 color 충돌 방지)
```

검은 배경 외에도 색 있는 배경(예: `bg-arrival-urgent` 같은 빨간 배경)에도 동일 함정 가능 → utility의 color가 의미 있게 동작하는 건 **배경이 light일 때만**임을 인지.

## 학습

시멘틱 토큰을 정의할 때 "사이즈 + weight + 색 + line-height"를 한 묶음으로 두면 호출자가 색을 잊을 때 함정에 빠진다. 시멘틱은 보통 한 컨텍스트(라이트 배경)를 가정하므로, 다른 컨텍스트(어두운 배경) 사용처에서 깨진다.

shadcn 같은 라이브러리가 색을 분리 (`text-foreground` 별도)하는 이유와 같다. 디자인 시스템 v2 설계 시 색-사이즈 분리 패턴 채택 검토.
