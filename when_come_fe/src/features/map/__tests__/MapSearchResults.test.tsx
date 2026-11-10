import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createFakeSdk, getSdkReadyCallback, stops } from './fixtures';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_ENABLE_STOP_MAP', 'true');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 480, width: 320, height: 480, toJSON() {} });
});

afterEach(() => {
  vi.unstubAllEnvs();
  document.querySelector('script[data-when-come-maps]')?.remove();
  delete window.naver;
  delete window.navermap_authFailure;
});

it('큰 지도에서 ESC로 돌아가고 핀을 선택하면 목록을 접고 확인으로 이동한다', async () => {
  vi.stubEnv('VITE_NAVER_MAPS_CLIENT_ID', 'public-test-id');
  const { MapSearchResults } = await import('../components/MapSearchResults');
  const fake = createFakeSdk();
  const onConfirm = vi.fn();
  function SearchResults() {
    const [key, setKey] = useState<string | null>(null);
    return <MapSearchResults stops={stops} resultsKey="results" itemLabel="정류장" listLabel="정류장 검색 결과"
      selectedKey={key} onSelect={setKey} confirmLabel="이 정류장 선택" onConfirm={() => onConfirm(key)} />;
  }

  const user = userEvent.setup();
  render(<SearchResults />);
  const script = document.querySelector<HTMLScriptElement>('script[data-when-come-maps]');
  if (!script) throw new Error('SDK script missing');
  window.naver = { maps: fake.sdk };
  await act(async () => { getSdkReadyCallback(script)(); });
  const enlarge = screen.getByRole('button', { name: '지도 크게 보기' });

  await user.click(enlarge);
  const dialog = await screen.findByRole('dialog', { name: '정류장 지도' });
  expect(within(dialog).getByRole('region', { name: '정류장 위치 지도' })).toBeInTheDocument();
  expect(fake.maps[0].destroy).toHaveBeenCalledOnce();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(enlarge).toHaveFocus());

  await user.click(enlarge);
  await waitFor(() => expect(fake.clicks.size).toBe(3));
  const lastMarker = fake.markers.at(-1);
  if (!lastMarker) throw new Error('SDK marker missing');
  act(() => fake.clicks.get(lastMarker)?.());
  const confirm = await screen.findByRole('button', { name: '이 정류장 선택' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('list', { name: '정류장 검색 결과' })).not.toBeInTheDocument();
  await waitFor(() => expect(confirm).toHaveFocus());
  expect(onConfirm).not.toHaveBeenCalled();
  await user.click(confirm);
  expect(onConfirm).toHaveBeenCalledWith('bus:three');

  await user.click(screen.getByRole('button', { name: '검색 결과 다시 보기' }));
  expect(screen.getByRole('list', { name: '정류장 검색 결과' })).toBeInTheDocument();
  expect(screen.getByText('검색 결과 3개')).toHaveFocus();
});

it('큰 지도 로딩에 실패하면 닫고 같은 후보 목록을 사용할 수 있다', async () => {
  vi.stubEnv('VITE_NAVER_MAPS_CLIENT_ID', undefined);
  const { MapSearchResults } = await import('../components/MapSearchResults');
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(<MapSearchResults stops={stops} resultsKey="results" itemLabel="정류장" listLabel="정류장 검색 결과"
    selectedKey={null} onSelect={onSelect} confirmLabel="이 정류장 선택" onConfirm={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: '지도 크게 보기' }));
  const dialog = await screen.findByRole('dialog', { name: '정류장 지도' });
  expect(await within(dialog).findByText(/지도를 불러오지 못했어요/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: '목록에서 선택' }));
  const list = await screen.findByRole('list', { name: '정류장 검색 결과' });
  await user.click(within(list).getByRole('button', { name: /건너편/ }));
  expect(onSelect).toHaveBeenCalledWith('bus:three');
});
