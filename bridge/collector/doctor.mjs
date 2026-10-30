import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { readConfig } from './config.mjs';
const { values }=parseArgs({options:{config:{type:'string'}}});
const report={node:process.version,platform:platform(),tools:{},configured:false,collector:null};
for(const tool of ['codex','claude','gemini']) report.tools[tool]=spawnSync(platform()==='win32'?'where.exe':'which',[tool],{timeout:3000,stdio:'ignore'}).status===0;
try {
  const config=await readConfig(values.config); report.configured=true; report.device={id:config.deviceId,name:config.deviceName,url:config.url,tools:config.tools,codexCompatibilityReader:config.codexFiles};
  try { const response=await fetch(`http://127.0.0.1:${config.port}/health`,{headers:{Authorization:`Bearer ${config.localKey}`},signal:AbortSignal.timeout(2000)}); if(response.ok) report.collector=await response.json(); } catch {}
  const hooks=await readFile(join(homedir(),'.codex','hooks.json'),'utf8').catch(()=> ''); report.codexHooksConfigured=hooks.includes('--office-hook-v1');
} catch { report.message='請先執行 office:setup。'; }
console.log(JSON.stringify(report,null,2));
console.log('hooks 是否信任需在工具內確認；本檢查不會自動核准 hooks。');
