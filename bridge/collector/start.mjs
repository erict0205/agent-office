import { parseArgs } from 'node:util';
import { readConfig, readSecretFromStdin } from './config.mjs';
import { createCollector } from './server.mjs';
import { CodexTranscriptReader } from './transcripts.mjs';

const { values } = parseArgs({ options: { config:{type:'string'}, 'stdin-config':{type:'boolean'}, 'no-codex-files':{type:'boolean'} } });
const config = await readConfig(values.config);
let token = process.env.OFFICE_SITE_TOKEN;
if (values['stdin-config']) { const secret = await readSecretFromStdin(); token = secret.token; }
const url = new URL(config.url);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) && !token) throw new Error('需要 Sites 服務存取憑證；請透過隱藏 stdin 或 OFFICE_SITE_TOKEN 傳入。');
const collector = createCollector(config, { token });
await collector.start();
console.log(`Agent Office 收集器已啟動：${config.deviceName}（${config.deviceId}）`);
console.log('只回報狀態、工具與工作階段識別，不回報對話或專案路徑。');
const reader = config.tools.includes('codex') && config.codexFiles !== false && !values['no-codex-files'] ? new CodexTranscriptReader({ onEvent: event => collector.record(event) }) : null;
let polling = false;
async function poll() { if (polling || !reader) return; polling = true; try { await reader.poll(); } catch { console.error('部分 Codex 工作紀錄無法讀取，其他來源繼續運作。'); } finally { polling = false; } }
await poll(); await collector.flush();
if (collector.health().lastError) console.error('工作室暫時無法同步，收集器會持續重試。');
else console.log(`雲端已同步，觀察到 ${collector.health().count} 個工作階段。`);
const heart = setInterval(() => collector.flush(), 15_000);
const scan = setInterval(poll, 2500);
let stopping = false;
async function stop() { if (stopping) return; stopping = true; clearInterval(heart); clearInterval(scan); await collector.stop(); console.log('收集器已停止；雲端會在心跳逾時後顯示離線。'); process.exit(0); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
