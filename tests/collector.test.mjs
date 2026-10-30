import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateUpdate } from '../lib/agent-protocol.mjs';
import { agentId, normalizeHook, normalizeTranscript, toAgent, acceptEvent } from '../bridge/collector/events.mjs';
import { createCollector } from '../bridge/collector/server.mjs';
import { setup, mergeHooks, makeCommand, MARKER } from '../bridge/collector/setup.mjs';
import { CodexTranscriptReader } from '../bridge/collector/transcripts.mjs';

const config={version:1,deviceId:'company-mac',deviceName:'公司 Mac',platform:'darwin',tools:['codex','claude','gemini'],port:0,localKey:'a'.repeat(64),url:'http://127.0.0.1:5173'};

test('provider hooks normalize lifecycle and ignore unrelated notifications',()=>{
  for (const provider of ['codex','claude','gemini']) {
    const e=normalizeHook(provider,{session_id:'session',hook_event_name:provider==='gemini'?'BeforeAgent':'UserPromptSubmit',prompt:'PRIVATE PROMPT',cwd:'/private/company',tool_input:{command:'secret'}});
    assert.equal(e.status,'working');
    const a=toAgent(e,config), serialized=JSON.stringify(a);
    for(const secret of ['PRIVATE PROMPT','/private/company','secret']) assert.equal(serialized.includes(secret),false);
    assert.equal(a.deviceId,'company-mac'); assert.equal(a.provider,provider);
  }
  assert.equal(normalizeHook('codex',{session_id:'s',hook_event_name:'PermissionRequest'}).status,'blocked');
  assert.equal(normalizeHook('claude',{session_id:'s',hook_event_name:'Stop'}).status,'done');
  assert.equal(normalizeHook('gemini',{session_id:'s',hook_event_name:'SessionEnd'}).status,'offline');
  assert.equal(normalizeHook('gemini',{session_id:'s',hook_event_name:'Notification',notification_type:'ToolPermission'}).status,'blocked');
  assert.equal(normalizeHook('claude',{session_id:'s',hook_event_name:'Notification',notification_type:'random'}),null);
});
test('same session deduplicates App and CLI; device and provider remain distinct',()=>{
  assert.equal(agentId('home-windows','codex','s'),agentId('home-windows','codex','s'));
  assert.notEqual(agentId('home-windows','codex','s'),agentId('company-mac','codex','s'));
  assert.notEqual(agentId('company-mac','codex','s'),agentId('company-mac','claude','s'));
  assert.equal(acceptEvent({source:'hook',status:'blocked',observedAt:200},{source:'transcript',status:'working',observedAt:300}),false);
  assert.equal(acceptEvent({source:'hook',status:'blocked',observedAt:200,turn:'t1'},{source:'transcript',status:'working',observedAt:300,turn:'t2'}),true);
  assert.equal(acceptEvent({source:'hook',status:'working',observedAt:200},{source:'hook',status:'done',observedAt:100}),false);
});
test('collector enforces localhost credentials, rejects browser posts, strips unknown fields and retries', async()=>{
  let fail=true; const uploaded=[];
  const collector=createCollector(config,{fetcher:async(url,options)=>{ if(fail) throw new Error('offline');uploaded.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true})}; }});
  await collector.start(); const port=collector.server.address().port, endpoint=`http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${endpoint}/health`)).status,401);
    const headers={Authorization:`Bearer ${config.localKey}`,'Content-Type':'application/json'};
    assert.equal((await fetch(`${endpoint}/events`,{method:'POST',headers:{...headers,Origin:'https://malicious.example'},body:'{}'})).status,403);
    const event={provider:'codex',session:'real-session',status:'working',observedAt:Date.now(),source:'hook',client:'Codex App',prompt:'DO NOT UPLOAD',token:'NEVER UPLOAD'};
    assert.equal((await fetch(`${endpoint}/events`,{method:'POST',headers,body:JSON.stringify(event)})).status,202);
    await collector.flush(); assert.ok(collector.health().lastError);
    fail=false;await collector.flush(); assert.equal(collector.health().lastError,'');
    assert.equal(uploaded[0].agents.length,1); assert.equal(uploaded[0].device.id,'company-mac');
    assert.equal(JSON.stringify(uploaded).includes('DO NOT UPLOAD'),false);assert.equal(JSON.stringify(uploaded).includes('NEVER UPLOAD'),false);
    assert.equal((await fetch(`${endpoint}/events`,{method:'POST',headers,body:'x'.repeat(9000)})).status,413);
    assert.equal((await fetch(`${endpoint}/events`,{method:'POST',headers,body:'{'})).status,400);
  } finally { await collector.stop(); }
});
test('hook configuration preserves existing handlers and is idempotent',()=>{
  for(const provider of ['codex','claude','gemini']) {
    const current={model:'keep-me',hooks:{SessionStart:[{matcher:'custom',hooks:[{type:'command',command:'echo existing'}]}]}};
    const once=mergeHooks(current,provider,`node hook.mjs ${MARKER}`),twice=mergeHooks(once,provider,`node hook.mjs ${MARKER}`);
    assert.deepEqual(once,twice); assert.equal(current.hooks.SessionStart.length,1); assert.equal(twice.model,'keep-me'); assert.equal(twice.hooks.SessionStart[0].hooks[0].command,'echo existing');
  }
  assert.equal(makeCommand('C:\\Program Files\\nodejs\\node.exe','C:\\agent office\\hook.mjs','C:\\Users\\Eric\\device.json','codex').includes('"C:/Program Files/nodejs/node.exe"'),true);
  assert.throws(()=>makeCommand('/tmp/$(malicious)/node','/hook','/config','codex'));
});
test('installer validates all settings before writing, backs up and avoids storing site credentials',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'office-setup-'));
  try {
    await mkdir(join(dir,'.claude'));await writeFile(join(dir,'.claude','settings.json'),JSON.stringify({theme:'preserved'}));
    const configFile=join(dir,'.agent-office','device.json');
    await setup({deviceId:'home-windows',deviceName:'家裡 Windows',tools:['codex','claude'],configFile,userHome:dir});
    const saved=JSON.parse(await readFile(configFile,'utf8'));assert.equal(saved.deviceId,'home-windows');assert.equal(saved.localKey.length,64);assert.equal('token' in saved,false);
    assert.equal(JSON.parse(await readFile(join(dir,'.claude','settings.json'),'utf8')).theme,'preserved');
    await writeFile(join(dir,'.claude','settings.json'),'{invalid');
    const original=await readFile(join(dir,'.codex','hooks.json'),'utf8');
    await assert.rejects(setup({deviceId:'company-mac',deviceName:'公司',tools:['codex','claude'],configFile,userHome:dir}));
    assert.equal(await readFile(join(dir,'.codex','hooks.json'),'utf8'),original);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('Codex compatibility reader handles partial JSONL, sees explicit completion, and never exports messages',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'office-records-')); const now=Date.now();const d=new Date(now);
  const folder=join(dir,String(d.getUTCFullYear()),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0'));
  await mkdir(folder,{recursive:true}); const file=join(folder,'rollout-test.jsonl');const events=[];
  const started={type:'event_msg',timestamp:new Date(now).toISOString(),payload:{type:'task_started',turn_id:'t',prompt:'PRIVATE'}};
  const complete={type:'event_msg',timestamp:new Date(now+1).toISOString(),payload:{type:'task_complete',last_agent_message:'PRIVATE ANSWER'}};
  try {
    await writeFile(file,JSON.stringify({type:'session_meta',payload:{id:'app-session',originator:'codex_work_desktop'}})+'\n'+JSON.stringify(started)+'\n'+JSON.stringify(complete).slice(0,30));
    const reader=new CodexTranscriptReader({root:dir,onEvent:e=>events.push(e)}); await reader.poll();
    assert.equal(events.at(-1).status,'working');assert.equal(events.at(-1).client,'Codex App');
    assert.ok(Number.isSafeInteger(events.at(-1).observedAt)); validateUpdate(toAgent(events.at(-1),config));
    await appendFile(file,JSON.stringify(complete).slice(30)+'\n');await reader.poll(); assert.equal(events.at(-1).status,'done');
    assert.equal(JSON.stringify(events).includes('PRIVATE'),false);
    assert.equal(normalizeTranscript({type:'event_msg',payload:{type:'random'}},{session:'s'}),null);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('real hook entrypoint returns neutral JSON and forwards only normalized data',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'office-hook-process-'));const uploaded=[];
  const collector=createCollector(config,{fetcher:async(url,options)=>{uploaded.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true})};}});
  await collector.start();
  try {
    const configFile=join(dir,'device.json');await writeFile(configFile,JSON.stringify({...config,port:collector.server.address().port}));
    for(const provider of ['codex','claude','gemini']) {
      const result=await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,[fileURLToPath(new URL('../bridge/collector/hook.mjs',import.meta.url)),'--provider',provider,'--config',configFile,MARKER],{stdio:['pipe','pipe','pipe']});
        let output='';child.stdout.on('data',c=>output+=c);child.on('error',reject);child.on('exit',code=>resolve({code,output}));
        child.stdin.end(JSON.stringify({session_id:provider+'-session',hook_event_name:provider==='gemini'?'BeforeAgent':'UserPromptSubmit',prompt:'PRIVATE COMPANY SOURCE',cwd:'/sensitive/repository'}));
      });
      assert.equal(result.code,0);assert.deepEqual(JSON.parse(result.output),{});
    }
    await collector.flush();const last=uploaded.at(-1);assert.equal(last.agents.length,3);assert.equal(JSON.stringify(last).includes('PRIVATE COMPANY SOURCE'),false);assert.equal(JSON.stringify(last).includes('/sensitive'),false);
  } finally {await collector.stop();await rm(dir,{recursive:true,force:true});}
});
