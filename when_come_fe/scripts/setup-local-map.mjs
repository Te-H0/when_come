import { readFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Only the public Dynamic Map ID is read/copied. Never print env contents or secrets.
const root = new URL('../', import.meta.url);
const mode = process.argv[2] ?? 'all';
if (!['all', 'demo', 'localdev'].includes(mode)) throw new Error('mode: all | demo | localdev');
const source = await readFile(new URL('../when_come_be/.env.local', root), 'utf8');
const match = source.match(/^\s*NAVER_MAP_CLIENT_ID\s*=\s*(.*?)\s*$/m);
const value = match?.[1]?.replace(/^(['"])(.*)\1$/, '$2').trim();
if (!value || /^(your|placeholder|example|changeme|<)/i.test(value)) {
  throw new Error('사용 가능한 공개 지도 ID가 설정되어 있지 않습니다.');
}
if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('공개 지도 ID의 형식을 확인해 주세요.');
for (const targetMode of mode === 'all' ? ['demo', 'localdev'] : [mode]) {
  const target = new URL(`.env.${targetMode}.local`, root);
  let previous = '';
  try { previous = await readFile(target, 'utf8'); } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  if (/^\s*VITE_NAVER_MAPS_CLIENT_ID\s*=/m.test(previous)) {
    process.stdout.write(`${targetMode}: 기존 지도 ID 설정 보존\n`);
    continue;
  }
  await appendFile(fileURLToPath(target), `${previous && !previous.endsWith('\n') ? '\n' : ''}VITE_NAVER_MAPS_CLIENT_ID=${value}\n`, { mode: 0o600 });
  process.stdout.write(`${targetMode}: 공개 지도 ID 설정 완료 (값 비출력)\n`);
}
