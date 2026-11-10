import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { server } from '@/test/server';

vi.mock('@/lib/supabase', () => ({ getJwt: async () => null }));

afterEach(() => vi.unstubAllEnvs());

it('장소 변경과 재검색 시 이전 추천을 숨기고 늦게 도착한 응답을 무시한다', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55421');
  vi.stubEnv('VITE_ENABLE_STOP_MAP', 'false');
  vi.stubEnv('VITE_LOCAL_DEMO', 'false');

  let releaseResponse: () => void = () => {};
  const heldResponse = new Promise<void>(resolve => { releaseResponse = resolve; });
  const routeSearch = vi.fn();
  const route = { id: 'old-route', totalMinutes: 25, transferCount: 0, segments: [] };
  server.use(
    http.get('*/functions/v1/place-search', ({ request }) => {
      const query = new URL(request.url).searchParams.get('q');
      return HttpResponse.json([{ name: query, address: '테스트 주소', x: '126.8', y: '37.4' }]);
    }),
    http.post('*/functions/v1/route-search', async () => {
      routeSearch();
      if (routeSearch.mock.calls.length === 2) await heldResponse;
      return HttpResponse.json([route]);
    }),
  );

  const { default: SetupRoute } = await import('../pages/SetupRoute');
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/setup']}><SetupRoute /></MemoryRouter>
    </QueryClientProvider>,
  );
  await user.type(screen.getByRole('searchbox', { name: '출발지' }), '개봉역');
  await user.click(await screen.findByRole('button', { name: /개봉역.*테스트 주소/ }));
  await user.click(screen.getByRole('button', { name: '출발지로 선택' }));
  await user.type(screen.getByRole('searchbox', { name: '도착지' }), '뚝섬역');
  await user.click(await screen.findByRole('button', { name: /뚝섬역.*테스트 주소/ }));
  await user.click(screen.getByRole('button', { name: '도착지로 선택' }));

  const searchButton = screen.getByRole('button', { name: '경로 검색' });
  await user.click(searchButton);
  expect(await screen.findByText('25분')).toBeInTheDocument();

  await user.click(searchButton);
  await waitFor(() => expect(routeSearch).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('25분')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '출발지 변경' }));

  const responseSent = new Promise<void>(resolve => {
    function onMockedResponse() {
      server.events.removeListener('response:mocked', onMockedResponse);
      resolve();
    }
    server.events.on('response:mocked', onMockedResponse);
  });
  await act(async () => {
    releaseResponse();
    await responseSent;
  });

  expect(searchButton).toBeDisabled();
  expect(screen.queryByText('25분')).not.toBeInTheDocument();
});
