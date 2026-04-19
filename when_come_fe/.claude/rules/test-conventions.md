---
paths:
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
  - "src/**/*.spec.ts"
  - "src/**/*.spec.tsx"
---

# 테스트 컨벤션

> **현재 상태:** vitest + testing-library 미설치. 테스트 작성 전 세팅 선행 필요.
> 세팅 명령: `npm install -D vitest @testing-library/react @testing-library/user-event jsdom`

## 테스트 네이밍

설명형 한국어, 조건-결과 구조:

```typescript
it('경로 목록이 없으면 빈 상태 메시지를 렌더링한다', () => { ... })
it('경로 카드 클릭 시 onSelect 콜백이 호출된다', () => { ... })
```

## 테스트 구조 (AAA)

```typescript
it('검색어 입력 시 경로 목록이 필터링된다', async () => {
  // given
  render(<RouteList routes={mockRoutes} />)

  // when
  await userEvent.type(screen.getByRole('searchbox'), '2호선')

  // then
  expect(screen.getByText('강남역')).toBeInTheDocument()
  expect(screen.queryByText('홍대입구역')).not.toBeInTheDocument()
})
```

## 레이어별 테스트 전략

| 레이어 | 방식 | 도구 | 언제 |
|--------|------|------|------|
| 커스텀 훅 | 단위테스트 | `renderHook` + testing-library | 복잡한 상태 로직 |
| 컴포넌트 | 통합테스트 | React Testing Library | 렌더링, 사용자 인터랙션 |
| 서비스(API) | 단위테스트 | msw + vitest | API 호출 파라미터, 응답 변환 |
| 유틸 함수 | 단위테스트 | vitest | 순수 함수 로직 (`transitColors` 등) |

## 쿼리 우선순위

1. `getByRole` (최우선)
2. `getByLabelText`
3. `getByPlaceholderText`
4. `getByText`
5. `getByTestId` (최후 수단)

## API 모킹

- MSW(Mock Service Worker)로 네트워크 레벨 모킹
- axios/fetch 직접 모킹 금지

## 무엇을 테스트하지 않는가

- 단순 렌더링만 하는 UI 컴포넌트 (스냅샷 테스트 금지)
- React Query/Zustand 라이브러리 자체 동작
- 구현 세부사항 (내부 state, private 함수)
