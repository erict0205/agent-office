import { homedir, platform } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { atomicJson, defaultConfig, readConfig } from './config.mjs';

export const MARKER = '--office-hook-v1';
export function mergeHooks(current, provider, command) {
  const next = structuredClone(current); next.hooks ??= {};
  const events = provider === 'gemini' ? ['SessionStart','SessionEnd','BeforeAgent','AfterAgent','BeforeTool','AfterTool','Notification'] : ['SessionStart','SessionEnd','UserPromptSubmit','PermissionRequest','PreToolUse','PostToolUse','Stop', ...(provider === 'codex' ? ['Interrupt'] : ['PostToolUseFailure','Notification'])];
  for (const [key, groups] of Object.entries(next.hooks)) {
    if (!Array.isArray(groups)) throw new Error(`既有 ${key} hooks 格式無法安全合併。`);
    next.hooks[key] = groups.map(g => ({ ...g, hooks: (g.hooks ?? []).filter(h => !h.command?.includes(MARKER)) })).filter(g => g.hooks.length);
  }
  for (const event of events) {
    const handler = { type:'command', command, timeout: provider === 'gemini' ? 1500 : 2 };
    // Codex supports an explicit Windows command; the shell-free Node handler is shared.
    if (provider === 'codex') handler.commandWindows = command;
    if (provider === 'gemini') handler.name = `agent-office-${event.toLowerCase()}`;
    const group = { hooks:[handler] };
    if (event === 'Notification') group.matcher = provider === 'gemini' ? 'ToolPermission' : 'permission_prompt|elicitation_dialog|elicitation_url_dialog';
    next.hooks[event] ??= []; next.hooks[event].push(group);
  }
  return next;
}
export function makeCommand(nodePath, hookPath, configPath, provider) {
  // JSON-style quoted paths, normalized for both Windows cmd and Git Bash.
  // Reject shell metacharacters instead of interpolating user text into commands.
  const q = p => { const s = String(p).replaceAll('\\','/'); if (/["\r\n$`%!]/.test(s)) throw new Error('安裝路徑包含不支援的 shell 字元，請選擇一般路徑。'); return `"${s}"`; };
  return `${q(nodePath)} ${q(hookPath)} --provider ${provider} --config ${q(configPath)} ${MARKER}`;
}
export async function setup({ deviceId, deviceName, tools=['codex'], configFile=defaultConfig(), userHome=homedir(), url='https://eric-agent-office.aglowant130.chatgpt.site', port=47831, codexFiles=true, dryRun=false }) {
  if (!/^[a-z0-9_-]{1,40}$/.test(deviceId) || !deviceName?.trim() || deviceName.length > 40 || !tools.length || tools.some(t=>!['codex','claude','gemini'].includes(t))) throw new Error('請提供有效裝置 ID、名稱與工具清單。');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('連接埠需介於 1024 與 65535。');
  const parsed = new URL(url); if (parsed.username || parsed.password) throw new Error('網址不可包含憑證。'); if (parsed.protocol !== 'https:' && !(parsed.protocol==='http:' && ['localhost','127.0.0.1'].includes(parsed.hostname))) throw new Error('網址需要 HTTPS。');
  let existing; try { existing=await readConfig(configFile); } catch(error) { if (error.code !== 'ENOENT') throw error; }
  const config = { version:1, deviceId, deviceName:deviceName.trim(), tools:[...new Set(tools)], platform:platform(), url:parsed.origin, port, localKey:existing?.localKey ?? randomBytes(32).toString('hex'), codexFiles };
  const paths = { codex:join(userHome,'.codex','hooks.json'), claude:join(userHome,'.claude','settings.json'), gemini:join(userHome,'.gemini','settings.json') };
  const changes=[];
  for (const provider of tools) {
    const path=paths[provider]; let original='{}'; try { original=await readFile(path,'utf8'); } catch(error) { if(error.code!=='ENOENT') throw error; }
    let current; try { current=JSON.parse(original); } catch { throw new Error(`${provider} 設定不是有效 JSON，已保留原檔。`); }
    const command=makeCommand(process.execPath,fileURLToPath(new URL('./hook.mjs',import.meta.url)),resolve(configFile),provider);
    changes.push({ provider,path,original,next:mergeHooks(current,provider,command) });
  }
  if (dryRun) return { files:changes.map(c=>c.path), configFile, deviceId, tools };
  // Validate every source before modifying any. Keep backups for exact recovery.
  for (const c of changes) {
    await mkdir(dirname(c.path),{recursive:true});
    try { await copyFile(c.path,`${c.path}.agent-office-${Date.now()}.bak`); } catch(error) { if(error.code!=='ENOENT') throw error; }
  }
  await atomicJson(configFile,config);
  for(const c of changes) await atomicJson(c.path,c.next);
  return { files:changes.map(c=>c.path), configFile, deviceId, tools };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options:{ device:{type:'string'},name:{type:'string'},tools:{type:'string',default:'codex'},config:{type:'string'},url:{type:'string'},port:{type:'string'},'no-codex-files':{type:'boolean'},'dry-run':{type:'boolean'} } });
  const result=await setup({ deviceId:values.device,deviceName:values.name,tools:values.tools.split(','),configFile:values.config,url:values.url,port:values.port?Number(values.port):undefined,codexFiles:!values['no-codex-files'],dryRun:values['dry-run'] });
  console.log(JSON.stringify(result,null,2));
  console.log('Codex hooks 需在 /hooks 中由你檢閱並信任；未信任前可使用 Codex 工作紀錄相容模式。');
  console.log('執行 npm run office:start -- --stdin-config 啟動收集器，服務憑證只透過隱藏輸入傳入。');
}
