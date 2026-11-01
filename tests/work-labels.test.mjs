import test from 'node:test';
import assert from 'node:assert/strict';
import { humanName } from '../lib/work-labels.mjs';
import { normalizeHook, normalizeTranscript, toAgent } from '../bridge/collector/events.mjs';
import { mergeWork } from '../bridge/collector/work.mjs';
import { createCollector } from '../bridge/collector/server.mjs';
import { validateUpdate } from '../lib/agent-protocol.mjs';

const config={deviceId:'test-mac',deviceName:'測試 Mac',platform:'darwin',tools:['codex','claude','gemini'],url:'http://localhost',port:0,localKey:'x'.repeat(64)};

test('human names remain stable across reconnects and App/CLI observations',()=>{
  const event={provider:'codex',session:'same-session',status:'working',observedAt:Date.now(),source:'hook',client:'Codex CLI'};
  const a=toAgent(event,config),b=toAgent({...event,client:'Codex App'},config);
  assert.equal(a.id,b.id);assert.equal(a.name,b.name);assert.match(a.name,/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.equal(a.name,humanName(a.id));
  assert.equal(validateUpdate(a).category,'general');
  assert.throws(()=>validateUpdate({...a,category:'PRIVATE TEXT'}));
});

test('prompt intent survives incidental tools, stops and new turns without exporting text',async()=>{
  const uploaded=[];const now=Date.now();
  const collector=createCollector(config,{now:()=>now+100,fetcher:async(_url,options)=>{uploaded.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true})};}});
  // A deployment can run tests without becoming a testing task.
  for(const provider of ['codex','claude','gemini']) {
    const session_id=provider+'-s';
    collector.record(normalizeHook(provider,{session_id,hook_event_name:provider==='gemini'?'BeforeAgent':'UserPromptSubmit',prompt:'請部署網站，PRIVATE_KEY=topsecret'},now));
    collector.record(normalizeHook(provider,{session_id,hook_event_name:provider==='gemini'?'BeforeTool':'PreToolUse',tool_name:provider==='gemini'?'run_shell_command':'Bash',tool_input:{command:'npm test /private/company/topsecret'}},now+1));
    collector.record(normalizeHook(provider,{session_id,hook_event_name:provider==='gemini'?'AfterAgent':'Stop'},now+2));
  }
  try {
    await collector.flush();
    for(const a of uploaded.at(-1).agents) {assert.equal(a.category,'deployment');assert.match(a.task,/執行檢查/);assert.equal(a.status,'done');}
    const payload=JSON.stringify(uploaded);
    for(const secret of ['PRIVATE_KEY','topsecret','/private/company','npm test']) assert.equal(payload.includes(secret),false);
    collector.record(normalizeHook('codex',{session_id:'codex-s',hook_event_name:'UserPromptSubmit',prompt:'請幫我除錯'},now+3));
    await collector.flush();
    const updated=uploaded.at(-1).agents.find(a=>a.provider==='codex');assert.equal(updated.category,'debugging');assert.equal(updated.task,'正在處理任務');
  } finally {await collector.stop();}
});

test('Codex App transcript observes wrapped tool actions and preserves them through completion',()=>{
  const meta={session:'app-session',originator:'codex_work_desktop'};
  const record=(type,payload,t)=>({type,payload,timestamp:new Date(1000+t).toISOString()});
  let last=normalizeTranscript(record('event_msg',{type:'task_started',turn_id:'t1'},0),meta);
  last=normalizeTranscript(record('response_item',{type:'message',role:'user',content:[{type:'input_text',text:'請實作功能，保留 PRIVATE_PROJECT 的內容'}]},1),meta,last);
  assert.equal(last.category,'development');
  last=normalizeTranscript(record('response_item',{type:'custom_tool_call',name:'exec',input:'await tools.exec_command({cmd:"npm test /private/PRIVATE_PROJECT"})'},2),meta,last);
  assert.equal(last.action,'checking');assert.equal(last.category,'development');
  last=normalizeTranscript(record('event_msg',{type:'task_complete',turn_id:'t1',last_agent_message:'PRIVATE ANSWER'},3),meta,last);
  assert.equal(last.status,'done');assert.equal(last.category,'development');assert.equal(last.action,'checking');
  assert.equal(JSON.stringify(last).includes('PRIVATE'),false);
  assert.equal(normalizeTranscript(record('response_item',{type:'function_call',name:'Bash',arguments:'{}'},4),meta,last),null);
  last=normalizeTranscript(record('event_msg',{type:'task_started',turn_id:'t2'},5),meta,last);
  assert.equal(last.category,'general');assert.equal(last.action,'processing');
  assert.equal(mergeWork({category:'testing',action:'checking',categoryFromPrompt:true,turn:'a',observedAt:1},{turn:'b',observedAt:2}).category,'general');
});
