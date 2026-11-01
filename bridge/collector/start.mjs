import { parseArgs } from 'node:util';
import { readConfig, readSecretFromStdin } from './config.mjs';
import { createCollector } from './server.mjs';
import { CodexTranscriptReader } from './transcripts.mjs';

const { values } = parseArgs({ options: { config:{type:'string'}, 'stdin-config':{type:'boolean'}, 'no-codex-files':{type:'boolean'}, details:{type:'boolean'} } });
const config = await readConfig(values.config);
let token = process.env.OFFICE_SITE_TOKEN;
let writeToken=process.env.OFFICE_WRITE_TOKEN;
if (values['stdin-config']) { const secret = await readSecretFromStdin(); token = secret.token; writeToken=secret.writeToken; }
const url = new URL(config.url);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) && !token&&!writeToken) throw new Error('需要收集器更新憑證；請透過隱藏 stdin 或 OFFICE_SITE_TOKEN 傳入。');
const collector = createCollector(config, { token, ...(writeToken?{writeToken}:{}) });
await collector.start();
console.log(`Agent Office 收集器已啟動：${config.deviceName}（${config.deviceId}）`);
console.log(values.details?'已啟用擁有者私人紀錄；工作要求、工具內容與回答只供擁有者登入後查看。':'只回報簡要狀態，不回報對話或專案路徑。');
const reader = config.tools.includes('codex') && config.codexFiles !== false && !values['no-codex-files'] ? new CodexTranscriptReader({ onEvent: event => collector.record(event), ...(values.details?{deviceId:config.deviceId,onDetail:event=>collector.detail(event)}:{}) }) : null;
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
