# 모바일 전용 플랫폼 정책 (color-scheme / theme-color / 키보드 회피)

작성일: 2026-05-11
관련: ADR-003 디자인 토큰, backlog #27 검은 버튼 룰 강화, dark-button-text-disappear tech-note

## 배경

앱은 라이트 모드 단일 기준으로 디자인됐는데 다음 3개의 모바일 전용 빈칸이 한 번에 드러났다.

1. **검은 상태바 / 다크모드 침투**
   - `<meta theme-color="#000000">` + manifest `theme_color: #000000` — 라이트 앱인데 모바일 브라우저 상태바가 검정.
   - `<html data-color-scheme>` 또는 `<meta name="color-scheme">` 미지정 → iOS Safari가 OS 다크모드일 때 native input 배경/글씨를 다크로 칠해버려 검은 input 글씨가 안 보이는 회귀 가능.
   - 어제(2026-05-10) "검은 버튼 글씨 사라짐" 회고와 같은 결의 회귀.

2. **키보드가 sticky 저장 버튼을 가림**
   - SetupRoute의 sticky 저장 버튼(`fixed bottom: var(--bottom-nav-total)`)이 input focus 시 키보드 영역에 들어가 안 보임.
   - `interactive-widget=resizes-content`는 Android Chrome에서만 동작 (iOS Safari 미지원 — 2026-01 현재).
   - `env(keyboard-inset-height)`도 미지원 / 부분 지원.

3. **iOS Safari input zoom-in (font-size < 16px)**
   - viewport `maximum-scale=1.0, user-scalable=no`로 일부 차단되지만 OS 설정 따라 무력화 가능.
   - 직접 `<input>`을 사용한 곳(`UnifiedStopPicker`, `AddFavorite` alias)이 `text-body`(14px) 적용 중이라 잠재 트리거.

## 채택 정책

### color-scheme 강제 light

- `<meta name="color-scheme" content="light">` (`index.html`)
- 이 한 줄로 iOS Safari/Android Chrome이 OS 다크모드와 무관하게 native form widget 색을 light로 강제.
- 본 앱은 라이트 단일 디자인이라 `.dark` 토큰은 정의돼 있어도 사용처 없음. 안전망 차원에서도 명시.

### theme-color light surface

- `<meta name="theme-color" content="#F6F7F9">` (= `--surface-page`)
- `manifest.json` `theme_color`/`background_color`도 동일.
- 검은 상태바 부조화 해소. PWA 설치 시 splash 색도 일치.

### `--keyboard-inset-height` CSS 변수

`src/lib/useKeyboardInset.ts`가 visualViewport API로 매 프레임 갱신.

```ts
const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
document.documentElement.style.setProperty('--keyboard-inset-height', `${inset}px`)
```

App 최상위(`src/app/App.tsx`)에서 1회 호출. 다음 3곳에 적용:

| 컴포넌트 | 적용 |
|---------|------|
| `PageShell` | `main` padding-bottom에 `+ var(--keyboard-inset-height, 0px)` |
| `BottomNav` | `bottom: var(--keyboard-inset-height, 0px)` (키보드 위로 떠 있음) |
| `SetupRoute` sticky 저장 버튼 | `bottom: calc(var(--bottom-nav-total) + var(--keyboard-inset-height, 0px))` |

`viewport-fit=cover`와 `interactive-widget=resizes-content`도 함께 추가 — Android Chrome에서는 native가 viewport 자체를 줄이므로 visualViewport listener와 중복돼도 안전(`Math.max(0, ...)` clamp).

### BottomNav 띄움 vs 숨김

키보드 떴을 때 옵션은 (a) 숨김 (b) 키보드 위로 띄움. 본 앱은 **(b)**.
- 이유: 형식 입력 중에도 탭 전환 가능 (홈/즐겨찾기/내 경로).
- 다음 PR에서 사용자 피드백 확인 후 (a)로 전환 가능성 검토.

### 직접 input의 font-size 16px 보장

shadcn `<Input>`은 `text-base md:text-sm`이라 모바일 16px → OK.
직접 `<input className="text-body">`(14px)를 쓰는 곳은 inline `style={{ fontSize: '16px' }}` 추가:

- `UnifiedStopPicker.tsx` 검색 input
- `AddFavorite.tsx` alias input 2곳

> 디자인 토큰으로 `text-input-mobile` 같은 별도 utility를 신설할지는 follow-up 검토. 현재는 inline로 충분.

## 회귀 방지

`.claude/rules/design-system.md` §8 (Mobile Scroll 정책) 옆에 §11 항목 추가 권장:

```
- [ ] `<input>` 직접 사용 시 font-size ≥ 16px 보장 (iOS zoom-in 차단)
- [ ] sticky/fixed bottom 요소는 `+ var(--keyboard-inset-height, 0px)` 보정
- [ ] 새 페이지 추가 시 `<PageShell>` + `<PageHeader>` 통과 (둘이 키보드/safe-area 처리)
```

## 알려진 제한

- iOS PWA standalone 모드에서 BottomNav가 키보드 위로 떠 있을 때 흐릿한 상태바 잔상이 생길 수 있음 (Safari quirk). 실 디바이스 모니터링 필요.
- `useKeyboardInset`은 `window.visualViewport`가 없는 환경(고전 Android WebView)에서 no-op. 자동 회피 없음 — 본 앱은 모바일 브라우저/PWA가 주 타깃이라 무시.

## 학습

"라이트 단일 앱"이라도 운영체제가 다크일 때의 침투, 키보드, viewport quirk 같은 **모바일 전용 빈칸**은 별도 정책을 박지 않으면 화면마다 산발적으로 회귀한다. 화면별 후처리(검은 버튼 fix, ARS 표시 누락 같은 것)는 결국 같은 정책 부재의 다른 표현이었다. ADR-003에 시각 토큰을 정리한 것처럼 **모바일 플랫폼 정책**도 별도 명문화 필요. 이 노트가 출발점.

---

## 2026-05-11 추가 — M1~M14 후속 정책

### 화면 가시성 + Polling 일시정지 + 포그라운드 복귀 refetch

`src/lib/usePageVisibility.ts` 신규 — `document.visibilitychange` 기반.

**두 가지 효과 동시 처리:**
1. Home / Favorites의 카운트다운 `setInterval(forceUpdate, 1000)`을 화면 안 보일 때 정지.
   - 모바일 백그라운드 진입 시 배터리/CPU 영향 큰 매초 tick 제거.
2. visible 복귀 시 도착정보 강제 `refetch()` — TanStack Query `staleTime: 30s`로 갭이 있는 부분 보강.
   - 사용자가 카톡 답장 10초 후 복귀해도 즉시 새 도착 정보 확인 가능.
   - TanStack의 `refetchOnWindowFocus` 자동 동작은 30초 이상 백그라운드에서만 작동 — staleTime 무시 명시 refetch가 체감 신선도 차이.
   - 첫 mount는 `skipFirstVisibleRef`로 스킵 — useQuery가 이미 자동 fetch 함.

**iOS Safari PWA standalone 신뢰성 보강 (2026-05-12~):**

`visibilitychange` 단독으로는 iOS PWA가 메모리에서 freeze된 후 복귀하는 일부 esoteric 케이스 누락 가능. `pageshow` 이벤트(특히 `event.persisted=true` bfcache 복원)를 함께 listen해 안전망 확보.

| 케이스 | visibilitychange | pageshow |
|---|---|---|
| 앱 스위처 / 화면 잠금 / 다른 탭 전환 | ✅ | ─ |
| bfcache 복원 (뒤로가기) | ✅ | ✅ (persisted=true) |
| iOS PWA 메모리 freeze 후 복귀 | 일부 환경 누락 | ✅ |
| 일반 사파리 탭 복귀 | ✅ | ─ |

알려진 한계: 페이지가 visible 상태 유지하면서 pageshow만 발화하는 케이스에선 React state 멱등이라 refetch effect 트리거 안 됨. 실제 발생률 매우 낮음 — 사용자가 새로고침 버튼 누르면 해소.

### LocalStorage 안전 wrapper

`src/lib/safeStorage.ts` 신규 — try/catch wrapper.

- 사파리 사적 브라우징/quota 차단 환경에서 `getItem`/`setItem` throw → 첫 호출 페이지 흰 화면 멈춤 차단.
- 모든 신규 코드는 `safeStorage` 만 사용. 직접 `localStorage` 접근 금지.

### 오프라인 안내

`src/lib/useOnlineStatus.ts` 신규 — `online`/`offline` 이벤트 + sonner 토스트.

- 오프라인 진입: `duration: Infinity` 토스트 "인터넷 연결이 끊어졌어요" + dismiss 가능.
- 온라인 복귀: 토스트 dismiss + "다시 연결됐어요" 성공 토스트.
- 초기 진입에서 `navigator.onLine === false`이면 즉시 안내.
- App 최상위에서 1회 호출.

### 저장 버튼 더블탭 가드

`src/lib/useSubmitGuard.ts` 존재. 단 핸들러별 lockRef를 갖는 헬퍼 형태라 같은 컴포넌트에서 두 핸들러가 lock을 공유해야 하는 케이스(AddFavorite의 bus/subway)에는 부적합.

→ 4곳(SetupRoute, AddFavorite bus/subway, RouteManagement rename Dialog) 모두 **inline ref 패턴**으로 통일.

```ts
const savingLockRef = useRef(false)
const handleSave = async () => {
  if (savingLockRef.current) return
  savingLockRef.current = true
  setIsSaving(true)
  try { ... } finally { setIsSaving(false); savingLockRef.current = false }
}
```

### Dialog 키보드 회피

shadcn `<DialogContent>` `top-[50%] left-[50%]` 기본 — 키보드 떴을 때 가림.

해결: className의 `translate-y-[-50%]`를 `translate-y-[calc(-50%-var(--keyboard-inset-height,0px)/2)]`로 교체.
- Tailwind translate 클래스로 박아야 `zoom-in-95`/`zoom-out-95` 애니메이션(`transform: scale`)과 합성 가능.
- inline `style.transform`은 zoom keyframe을 무력화하므로 절대 사용하지 말 것.

### `touch-action: manipulation` 전역

`theme.css @layer base`에 추가:
```css
button, a, [role="button"], input, textarea, select, label {
  touch-action: manipulation;
}
```

- 모바일 더블탭 zoom 지연(~300ms) 제거. iOS Safari/Android Chrome 모두 지원.
- input/textarea long-press context menu에 영향 없음 (manipulation은 pan/pinch만 허용).

### Toaster 안전 영역

`<Toaster position="top-center" offset="calc(env(safe-area-inset-top) + 12px)" />`

- iPhone 14 Pro+ Dynamic Island 영역 회피.

### Backdrop-blur fallback

BottomNav `backgroundColor: rgba(255, 255, 255, 0.96)` + `backdropFilter: 'blur(20px)'` 동시 지정.

- blur 미지원 환경(구형 Android WebView 일부)에서도 0.96 alpha로 본문 글씨 비침 차단.
- 지원 환경은 blur 효과 그대로 적용 (alpha는 시각적으로 거의 차이 없음).

### PWA manifest 보강

```json
{
  "orientation": "portrait",
  "display_override": ["standalone", "minimal-ui"],
  "categories": ["travel", "navigation", "utilities"],
  "icons": [ {"purpose": "any"}, {"purpose": "maskable"} ]
}
```

- 가로모드 진입 차단.
- iOS PWA `display_override` 비표준 무시되지만 무해.
- maskable 아이콘은 현재 icon_192/icon_512 동일 파일 중복 등록 — safe zone(80%) 검증은 별도 백로그(maskable.app).

### 한글 IME composition 안전 디바운스

UnifiedStopPicker 검색 input `onCompositionStart`/`onCompositionEnd` + `isComposingRef`.

- 조합 중("강+", "강나")에는 API 호출 보류, `compositionend`에서 완성형으로 재발사.
- 다른 input(별명, 경로 이름 등)은 디바운스 검색 없으므로 영향 없음.
