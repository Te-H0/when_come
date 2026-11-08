import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { Startup } from '../Startup';

afterEach(() => vi.useRealTimers());
it('인증 실패도 빈 화면 대신 재시도를 보여 주고 성공 시 앱을 연다', async () => {
  const initialize = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  render(<Startup initialize={initialize}><p>앱 준비 완료</p></Startup>);
  await userEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('앱 준비 완료')).toBeInTheDocument();
  expect(initialize).toHaveBeenCalledTimes(2);
});
it('응답 없는 인증은 8초 후 복구 화면을 열고 늦은 성공으로 덮지 않는다', async () => {
  vi.useFakeTimers();
  let finish: (() => void) | undefined;
  const initialize = () => new Promise<void>(resolve => { finish = resolve; });
  render(<Startup initialize={initialize}><p>늦은 앱</p></Startup>);
  await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
  expect(screen.getByRole('alert')).toBeInTheDocument();
  await act(async () => { finish?.(); });
  expect(screen.queryByText('늦은 앱')).toBeNull();
});
