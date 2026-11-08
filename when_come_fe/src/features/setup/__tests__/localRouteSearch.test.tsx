import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/server';

const API = 'http://127.0.0.1:55421/functions/v1';
const MISSING_ID = 'NAVER_SEARCH_CLIENT_ID not configured';
const MISSING_SECRET = 'NAVER_SEARCH_CLIENT_SECRET not configured';
const ORIGIN = { name: '개봉', type: 'subway', lat: 37.4946, lng: 126.8587, id: '101', laneName: '수도권 1호선' };
const DESTINATION = { name: '뚝섬', type: 'subway', lat: 37.5472, lng: 127.0474, id: '201', laneName: '수도권 2호선' };

vi.mock('@/lib/supabase', () => ({ getJwt: async () => null }));

beforeEach(() => {
  vi.stubEnv('DEV', true);
  vi.stubEnv('MODE', 'localdev');
  vi.stubEnv('VITE_LOCAL_DEMO', 'false');
  vi.stubEnv('VITE_ENABLE_STOP_MAP', 'false');
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55421');
  server.use(http.post(`${API}/client-log`, () => new HttpResponse(null, { status: 204 })));
});

afterEach(() => vi.unstubAllEnvs());

describe('운영 장소 선택', () => {
  it.each(['false', 'true'])('지도 플래그가 %s이고 지도 ID가 없으면 목록에서 장소를 선택한다', async flag => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_ENABLE_STOP_MAP', flag);
    vi.stubEnv('VITE_NAVER_MAPS_CLIENT_ID', undefined);
    const place = { name: '테스트 장소', address: '테스트 주소', x: '126.8', y: '37.4' };
    server.use(http.get(`${API}/place-search`, () => HttpResponse.json([place])));
    const { default: PlacePicker } = await import('../components/PlacePicker');
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PlacePicker label="출발지" placeholder="장소·주소 검색" value={null} onChange={onChange} />);

    await user.type(screen.getByRole('searchbox', { name: '출발지' }), '테스트');
    const option = await screen.findByRole('button', { name: /테스트 장소/ });
    if (flag === 'true') {
      await screen.findByRole('button', { name: '지도 다시 시도' });
      expect(screen.getByRole('status')).not.toHaveAttribute('data-map-failure');
    } else {
      expect(screen.queryByRole('region', { name: '장소 위치 지도' })).toBeNull();
      expect(screen.queryByRole('button', { name: '지도 다시 시도' })).toBeNull();
    }
    expect(document.querySelector('script[data-when-come-maps]')).toBeNull();
    await user.click(option);
    await user.click(screen.getByRole('button', { name: '출발지로 선택' }));
    expect(onChange).toHaveBeenLastCalledWith(place);
  });
});

describe('로컬 자동 경로 등록', () => {
  it('검색 ID가 없으면 좌표가 있는 역을 선택하여 경로를 검색한다', async () => {
    const routeSearch = vi.fn();
    server.use(
      http.get(`${API}/place-search`, () => HttpResponse.json({ error: MISSING_ID }, { status: 500 })),
      http.get(`${API}/search-stops`, ({ request }) => {
        const query = new URL(request.url).searchParams.get('q');
        return HttpResponse.json(query === '개봉역' ? [
          ORIGIN,
          { ...ORIGIN, id: '102', laneName: '수도권 2호선' },
          { ...ORIGIN, id: '103', lat: 91 },
          { ...ORIGIN, id: '104', lng: null },
        ] : query === '뚝섬' ? [DESTINATION] : []);
      }),
      http.post(`${API}/route-search`, async ({ request }) => {
        routeSearch(await request.json());
        return HttpResponse.json([{ id: 'candidate', totalMinutes: 25, transferCount: 0, segments: [] }]);
      }),
    );

    const { default: SetupRoute } = await import('../pages/SetupRoute');
    const user = userEvent.setup();
    render(<QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/setup']}><SetupRoute /></MemoryRouter>
    </QueryClientProvider>);

    await user.type(screen.getByRole('searchbox', { name: '출발지' }), '개봉역');
    const origins = within(screen.getByRole('list', { name: '출발지 검색 결과' }));
    const origin = await origins.findByRole('button', { name: /개봉.*지하철역.*수도권 1호선.*역 ID 101/ });
    expect(screen.getByText('장소·주소 검색을 사용할 수 없어 역·정류장 검색 결과를 표시해요.')).toBeInTheDocument();
    expect(origins.getByRole('button', { name: /개봉.*수도권 2호선.*역 ID 102/ })).toBeInTheDocument();
    expect(origins.getAllByRole('button')).toHaveLength(2);
    await user.click(origin);
    await user.click(screen.getByRole('button', { name: '출발지로 선택' }));

    await user.type(screen.getByRole('searchbox', { name: '도착지' }), '뚝섬');
    await user.click(await screen.findByRole('button', { name: /뚝섬.*수도권 2호선.*역 ID 201/ }));
    await user.click(screen.getByRole('button', { name: '도착지로 선택' }));
    await user.click(screen.getByRole('button', { name: '경로 검색' }));

    expect(await screen.findByText('25분')).toBeInTheDocument();
    expect(routeSearch).toHaveBeenCalledWith({
      startX: ORIGIN.lng,
      startY: ORIGIN.lat,
      endX: DESTINATION.lng,
      endY: DESTINATION.lat,
    });
  });

  it('장소 검색이 성공하면 실제 장소 응답을 그대로 사용한다', async () => {
    const place = { name: '테스트 장소', address: '테스트 주소', x: '126.8', y: '37.4' };
    server.use(http.get(`${API}/place-search`, () => HttpResponse.json([place])));

    const { searchRoutePlaces } = await import('../services/searchRoutePlaces');
    expect(await searchRoutePlaces('테스트')).toEqual([place]);
  });

  it.each([
    { dev: true, mode: 'development', status: 500, message: MISSING_ID },
    { dev: true, mode: 'demo', status: 500, message: MISSING_ID },
    { dev: false, mode: 'localdev', status: 500, message: MISSING_ID },
    { dev: true, mode: 'localdev', status: 502, message: MISSING_ID },
    { dev: true, mode: 'localdev', status: 500, message: `${MISSING_ID}!` },
  ])('DEV=$dev, MODE=$mode, $status $message 응답에서 기존 오류를 보존한다', async ({ dev, mode, status, message }) => {
    vi.stubEnv('DEV', dev);
    vi.stubEnv('MODE', mode);
    server.use(http.get(`${API}/place-search`, () => HttpResponse.json({ error: message }, { status })));

    const { searchRoutePlaces } = await import('../services/searchRoutePlaces');
    await expect(searchRoutePlaces('개봉역')).rejects.toMatchObject({ status, message });
  });

  it('검색 secret 누락으로 시작한 정류장 검색도 취소할 수 있다', async () => {
    const stopSearch = vi.fn();
    server.use(
      http.get(`${API}/place-search`, () => HttpResponse.json({ error: MISSING_SECRET }, { status: 500 })),
      http.get(`${API}/search-stops`, async () => {
        stopSearch();
        await delay(300);
        return HttpResponse.json([ORIGIN]);
      }),
    );

    const { searchRoutePlaces } = await import('../services/searchRoutePlaces');
    const controller = new AbortController();
    const result = expect(searchRoutePlaces('개봉역', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await waitFor(() => expect(stopSearch).toHaveBeenCalledOnce());
    controller.abort();
    await result;
  });
});
