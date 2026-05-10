# SPA 새 버전 감지 메커니즘

날짜: 2026-05-10

## 배경

운영 사용자는 iOS Safari "홈 화면에 추가" 또는 Android Chrome 단순 Web Shortcut으로 standalone 모드에서 앱을 사용한다. 다음 두 요인 때문에 새 배포된 변경이 즉시 반영되지 않는다.

1. **Service Worker 미사용** — vite-plugin-pwa 도입 안 함. 단순 manifest.json만 있음.
2. **`overscroll-behavior: none`로 pull-to-refresh 차단** — 모바일 앱 풍 UX 위해 의도적으로 막아둠. 결과적으로 사용자가 페이지를 새로고침할 트리거 자체가 없음.

→ 사용자는 앱을 강종(앱 스위처에서 위로 스와이프)하고 다시 열어야 새 코드를 받음. 그 전까지 stale.

iOS는 메모리 압박 시 비교적 빠르게 standalone 앱을 종료시키지만, Android Chrome은 더 보수적으로 메모리에 유지하므로 stale 콘텐츠가 더 오래 보일 가능성이 큼.

## 결정

전체 PWA화(Service Worker + WebAPK)는 비용 대비 과함. 다음 두 메커니즘으로 충분.

1. **빌드 시 BUILD_ID 주입 + `/version.txt` emit**
2. **FE에서 5분 polling + visibilitychange 시 추가 check → 새 버전 감지 시 sonner 토스트**

자동 reload는 채택하지 않음. SetupRoute 등 폼 입력 도중 데이터 소실 위험 때문에 모든 알림은 토스트로 통일하고 사용자가 직접 새로고침 클릭.

## 구현

### 빌드 — `vite.config.ts`

```ts
const BUILD_ID = (() => {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    return `${sha}-${Date.now()}`
  } catch {
    return `dev-${Date.now()}`
  }
})()

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [..., emitVersionPlugin()],  // 빌드 후 dist/version.txt 생성
})
```

타임스탬프는 같은 커밋을 재배포하는 케이스도 감지하기 위함. 같은 커밋을 로컬에서 여러 번 빌드해도 dev guard로 polling이 안 돌아 운영 영향 없음.

### FE — `src/lib/useVersionCheck.ts`

핵심 동작:

| 트리거 | 동작 |
|--------|------|
| 컴포넌트 mount | 즉시 1회 check |
| 5분 interval | check |
| `visibilitychange` hidden → visible | check (항상) |
| 새 버전 감지 (응답 BUILD_ID ≠ `__BUILD_ID__`) | sonner 토스트 + "새로고침" 액션 버튼 |

토스트는 module-scope `hasShownNewVersionToast` 플래그로 1회만 표시. 사용자가 닫으면 다시 안 뜸 (다음 reload까지). `duration: Infinity`로 사용자가 직접 닫거나 새로고침할 때까지 유지.

dev 환경 가드 두 겹:
- `import.meta.env.PROD === false` → 훅 noop
- `__BUILD_ID__.startsWith('dev-')` → 훅 noop

### Vercel — `vercel.json`

```json
{
  "rewrites": [
    { "source": "/((?!.*\\.).*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/version.txt",
      "headers": [{ "key": "Cache-Control", "value": "no-store, max-age=0" }]
    }
  ]
}
```

**rewrite 패턴:** `/((?!.*\.).*)` — 경로에 `.`이 없는 path만 `/index.html`로 rewrite. 확장자 있는 정적 파일(`/version.txt`, `/icon_*.png`, `/assets/*.js`, `/manifest.json`, `/favicon.ico` 등)은 그대로 정적 서빙. 향후 루트에 정적 파일 추가해도 vercel.json 수정 불필요. 단, 라우트 path에 `.`을 사용하면 안 됨 (현재 `/`, `/setup`, `/routes`, `/favorites`, `/favorites/add` 모두 안전).

**headers:** Vercel 기본은 정적 파일을 immutable cache로 깔지만, `/version.txt`만 명시적으로 `no-store`. 매 polling이 fresh 응답을 받음.

## 자동 reload를 안 채택한 이유

리뷰 단계에서 "30분 이상 백그라운드 후 복귀 시 즉시 reload" 안이 나왔음. 다음 이유로 채택 거절.

- SetupRoute에서 정류장 추가 도중 30분 백그라운드 → 복귀 시 자동 reload되면 입력한 노드/노선이 모두 소실
- RouteManagement의 AliasEditor 인라인 편집 중 같은 사고
- 출퇴근 앱 특성상 짧은 사용 세션이 일반적이지만, 폼이 있는 화면에서의 데이터 소실은 신뢰도에 직격
- 토스트 통일이 일관성 + 안전성 모두 우월

자동 reload의 유일한 이점("사용자가 토스트를 무시하면 구버전 계속 사용")은 토스트 무한 duration으로 어느 정도 보완.

## iOS / Android 차이

| 항목 | iOS Safari | Android Chrome |
|------|-----------|----------------|
| 홈 화면 추가 | Web Clip + standalone | Web Shortcut + standalone (SW 없음 → WebAPK 안 됨) |
| 메모리 보존 | 짧음 — 자주 종료 → 강종 효과로 자연 reload 흔함 | 길음 — stale 더 오래 → 본 메커니즘 효과 큼 |
| Page Visibility API | 지원 | 지원 |
| sonner 토스트 / fetch | 동일 동작 | 동일 동작 |

훅 자체는 순수 JS라 양쪽 동일하게 작동. 플랫폼 분기 없음.

## 향후 옵션

본격 PWA가 필요해지면 `vite-plugin-pwa` 도입 검토:
- WebAPK 자동 설치 (Android)
- Service Worker 캐시 → 오프라인 동작 + 로딩 가속
- 새 SW 감지 + skipWaiting 패턴 (지금 메커니즘과 거의 동일하지만 SW 라이프사이클 기반)
- iOS는 14.5+ 부분 지원이라 효과는 Android에 집중

비용/편익 대비 현재 메커니즘이 충분하다고 판단. 본격 PWA화는 오프라인 모드가 요구사항으로 올라올 때 진행.

## 관련 파일

- `vite.config.ts` — BUILD_ID 주입 + emitVersionPlugin
- `src/vite-env.d.ts` — `__BUILD_ID__` 타입 선언
- `src/lib/useVersionCheck.ts` — 훅 본체
- `src/app/App.tsx` — `useVersionCheck()` 호출
- `vercel.json` — rewrite 정규식 + version.txt 헤더
