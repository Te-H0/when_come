# BottomNav safe-area squish 회고 (2026-05-10)

## 증상

Safari mobile web으로 접속했을 때 BottomNav 라벨(홈/즐겨찾기/내 경로)이 위쪽 아이콘과 거의 붙어 보이고, 아이콘+라벨 영역이 짜부러져 보임. PWA(홈화면 추가)에서는 덜 티남.

## 원인

`BottomNav.tsx`와 `PageShell.tsx`가 같은 디자인 토큰을 다르게 참조하고 있었다.

```css
--bottom-nav-height: 64px;
--bottom-nav-total: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom));
```

- `PageShell`은 본문 padding-bottom으로 `--bottom-nav-total`(64px + safe-area)을 reserving
- `BottomNav`는 컨테이너 height로 `--bottom-nav-height`(64px)만 잡고, 그 안에서 `padding-bottom: env(safe-area-inset-bottom)`을 적용

결과적으로 BottomNav 컨테이너 64px 안에서 iPhone home indicator 약 34px 분량이 padding으로 빠지면서 실제 아이콘+라벨 가용 공간이 30px로 squish됨. PageShell이 reserving한 공간(64+safe-area)과 BottomNav 실제 시각 높이(64px)도 어긋나 빈 띠가 생김.

PWA에서 덜 티가 났던 이유: viewport가 한 번 정착되면 시각적 squish가 다소 가려짐. Safari에서는 visual viewport ≠ layout viewport 때문에 더 명확히 드러남.

## 해결

BottomNav 컨테이너 height를 `--bottom-nav-total`로 통일.

```diff
  style={{
-   height: 'var(--bottom-nav-height)',
+   height: 'var(--bottom-nav-total)',
    paddingBottom: 'env(safe-area-inset-bottom)',
  }}
```

이제 시각 높이 = 64 + safe-area, 안쪽 content 영역 = 64px로 일정. PageShell의 본문 reserving과 정확히 맞물린다.

## 일반화 가능한 룰

> 고정 푸터(BottomNav, sticky CTA)는 **반드시 `var(--bottom-nav-total)` 단일 토큰을 시각 높이로 사용**한다.
> `--bottom-nav-height`는 내부 content 가용 영역을 지칭하는 의미이며, 컨테이너 height에 직접 쓰지 않는다.

safe-area를 padding으로 빼는 컴포넌트의 컨테이너 높이는 항상 "padding 포함 총 높이"여야 한다. 그렇지 않으면 부모 layout의 reserving과 어긋나 아래/위로 빈 띠 또는 squish가 발생한다.

## 검증

- 데스크탑(safe-area=0): `--bottom-nav-total` = 64px, 기존 동작 동일
- 모바일 PWA: 시각 높이 = 64 + 34 = 98px, content 64px
- 모바일 Safari web: 동일. URL bar overlap은 별개 이슈(layout viewport vs visual viewport)이며 본 수정 범위 밖
