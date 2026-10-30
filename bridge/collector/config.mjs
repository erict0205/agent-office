import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile, mkdir, writeFile, rename, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

export const defaultConfig = () => join(homedir(), '.agent-office', 'device.json');
export async function readConfig(file = defaultConfig()) {
  const c = JSON.parse(await readFile(file, 'utf8'));
  if (c.version !== 1 || !/^[a-z0-9_-]{1,40}$/.test(c.deviceId) || typeof c.deviceName !== 'string' || !c.deviceName.trim() || c.deviceName.length > 40 || !/^[a-f0-9]{64}$/.test(c.localKey) || !Number.isInteger(c.port) || c.port < 1024 || c.port > 65535) throw new Error('裝置設定格式不正確，請重新執行 office:setup。');
  const url = new URL(c.url);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))) throw new Error('雲端網址需要 HTTPS。');
  if (url.username || url.password) throw new Error('網址不可包含登入憑證。');
  return c;
}
export async function atomicJson(file, value) {
  const folder = resolve(file, '..'); await mkdir(folder, { recursive: true });
  const temp = `${file}.${randomBytes(5).toString('hex')}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temp, file); await chmod(file, 0o600);
}
export async function readSecretFromStdin() {
  const raw = Boolean(process.stdin.isTTY && process.stdin.setRawMode);
  if (raw) process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  console.log('Ready for office connection JSON on stdin (input is hidden).');
  try {
    return await new Promise((resolve, reject) => {
      let input = '';
      const cleanup = () => { process.stdin.off('data', receive); process.stdin.off('end', end); process.stdin.pause(); };
      const end = () => { cleanup(); reject(new Error('缺少連線憑證。')); };
      const receive = chunk => {
        input += chunk;
        if (input.length > 32_768) { cleanup(); reject(new Error('連線設定過大。')); return; }
        if (input.includes('\n')) { cleanup(); try { resolve(JSON.parse(input.split('\n')[0])); } catch { reject(new Error('連線設定格式不正確。')); } }
      };
      process.stdin.on('data', receive); process.stdin.once('end', end); process.stdin.resume();
    });
  } finally { if (raw) process.stdin.setRawMode(false); }
}
