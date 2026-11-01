import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough,Writable } from 'node:stream';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { ownerIdentity,publicAgent,publicEvent } from '../lib/office-access.mjs';
import { redact,privateRecord } from '../bridge/collector/telemetry.mjs';
import { deriveRunnerToken,deriveWriteToken,writeFingerprint } from '../bridge/collector/write-auth.mjs';
import { createCollector } from '../bridge/collector/server.mjs';
import { validWriteToken } from '../lib/write-auth.mjs';
import { CodexRun,prepareWorkspace,workspaceChanges,taskPrompt,resultEnvelope } from '../bridge/runner/codex.mjs';
const exec=promisify(execFile);

test('owner pin uses site identity; visitors cannot bootstrap or switch account by email',()=>{
  assert.equal(ownerIdentity(null,null,'owner@example.com'),false);
  assert.equal(ownerIdentity({userId:'visitor',email:'visitor@example.com'},null,'owner@example.com'),false);
  assert.equal(ownerIdentity({userId:'owner-id',email:'owner@example.com'},null,'owner@example.com'),true);
  assert.equal(ownerIdentity({userId:'visitor',email:'owner@example.com'},'owner-id','owner@example.com'),false);
  assert.equal(ownerIdentity({userId:'owner-id',email:'changed@example.com'},'owner-id',null),true);
});
test('public projections cannot leak commands, project names, paths, output or session metadata',()=>{
  const privateData={id:'a',name:'Emma',status:'working',task:'SECRET COMMAND',category:'development',deviceName:'SECRET COMPANY',deviceId:'SECRET ID',sessionKey:'SECRET SESSION',prompt:'SECRET PROMPT',result:'SECRET OUTPUT',path:'/secret/company',diff:'SECRET CODE'};
  assert.equal(JSON.stringify(publicAgent(privateData)).includes('SECRET'),false);
  assert.equal(JSON.stringify(publicEvent(privateData)).includes('SECRET'),false);
  assert.match(publicAgent(privateData).task,/功能開發/);assert.equal(publicEvent({...privateData,id:12}).id,12);
});
test('observed details exclude reasoning and redact known credentials',()=>{
  const meta={session:'s'},timestamp=new Date().toISOString();
  assert.equal(privateRecord({timestamp,type:'response_item',payload:{type:'reasoning',text:'private thought'}},meta,'mac'),null);
  const event=privateRecord({timestamp,type:'response_item',payload:{type:'function_call',name:'shell',call_id:'c',arguments:'API_KEY=sk-12345678901234567890 npm test'}},meta,'mac');
  assert.equal(event.detail.includes('123456789'),false);assert.equal(event.kind,'tool');
  assert.equal(redact('OFFICE_SITE_TOKEN=VERY_PRIVATE').includes('VERY_PRIVATE'),false);assert.equal(redact(JSON.stringify({accessToken:'VERY_PRIVATE',authorization:'Bearer VERY_PRIVATE'})).includes('VERY_PRIVATE'),false);
});
test('runner privilege is separate from collector write access',async()=>{
  const key=deriveRunnerToken('service'),write=deriveWriteToken('service');assert.notEqual(key,write);
  assert.equal(await validWriteToken(write,writeFingerprint(key)),false);
  assert.equal(await validWriteToken(key,writeFingerprint(key)),true);
});
test('isolated workspaces preserve original checkout and reuse only the expected worktree',async()=>{
  const root=await mkdtemp(join(tmpdir(),'office-worktree-')),repo=join(root,'repo');await mkdir(repo);
  try{
    await exec('git',['init',repo]);await writeFile(join(repo,'README.md'),'original\n');await exec('git',['add','.'],{cwd:repo});await exec('git',['-c','user.name=Office Test','-c','user.email=test@example.invalid','commit','-m','fixture'],{cwd:repo});
    const p={id:'fixture',path:repo,worktreeRoot:join(root,'workers')},id='12345678-1234-1234-1234-123456789abc';
    const workspace=await prepareWorkspace(p,id);await writeFile(join(workspace.folder,'README.md'),'changed\n');await writeFile(join(workspace.folder,'new.txt'),'artifact\n');
    const changes=await workspaceChanges(workspace.folder);assert.match(changes.diff,/changed/);assert.match(changes.diff,/artifact/);
    assert.equal(await readFile(join(repo,'README.md'),'utf8'),'original\n');
    assert.equal((await prepareWorkspace(p,id)).folder,workspace.folder);await assert.rejects(prepareWorkspace(p,'../escape'));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('managed protocol streams evidence, waits for explicit approval and distinguishes turn failure',async()=>{
  let child,spawnOptions,sent=[];const events=[],approvals=[];
  const job={id:'job',agent_id:'managed-job',attempt:1,title:'fixture',prompt:'test',role:'review',previous:[]};
  const run=new CodexRun({job,workspace:{folder:'/tmp'},onEvent:e=>events.push(e),onApproval:a=>approvals.push(a),spawnProcess:(cmd,args,options)=>{
    spawnOptions=options;child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.emit('exit',0);return true;};
    child.stdin=new Writable({write(chunk,_,done){const m=JSON.parse(chunk.toString());sent.push(m);if(m.method){const result=m.method==='model/list'?{data:[{model:'catalog-model',isDefault:true}]}:m.method==='account/read'?{account:{type:'chatgpt'}}:m.method==='thread/start'?{thread:{id:'thread'}}:m.method==='turn/start'?{turn:{id:'turn'}}:{};queueMicrotask(()=>child.stdout.write(JSON.stringify({id:m.id,result})+'\n'));}done();}});return child;
  }});
  const promise=run.start();await new Promise(resolve=>setTimeout(resolve,20));
  run.receive({id:42,method:'item/commandExecution/requestApproval',params:{command:'npm test'}});
  assert.equal(sent.some(m=>m.id===42),false);assert.equal(approvals.at(-1).requestId,'42');
  await run.command({kind:'approval',payload:JSON.stringify({requestId:'42',decision:'decline'})});assert.deepEqual(sent.at(-1),{id:42,result:{decision:'decline'}});
  run.receive({method:'item/completed',params:{item:{id:'cmd',type:'commandExecution',command:'npm test',exitCode:1,aggregatedOutput:'FAILED'}}});
  run.receive({method:'turn/completed',params:{turn:{status:'failed',error:{message:'test failure'}}}});
  assert.equal((await promise).outcome,'failed');assert.ok(events.some(e=>e.label.includes('exit 1')));
  assert.equal(sent.find(m=>m.method==='thread/start').params.approvalsReviewer,'user');
  assert.equal(Object.keys(spawnOptions.env).some(k=>k.startsWith('OFFICE_')),false);run.close();
  assert.match(taskPrompt(job),/不要 merge、push/);
});

test('large results remain bounded valid JSON rather than losing the evidence structure',()=>{const encoded=resultEnvelope(JSON.stringify({summary:'"'.repeat(25000),tests:Array.from({length:50},()=>({name:'check',status:'passed',detail:'"'.repeat(10000)})),verdict:'pass'}),{files:'x'.repeat(5000)});assert.ok(encoded.length<=18000);assert.equal(JSON.parse(encoded).verdict,'pass');});

test('private collector prioritizes current evidence over startup history',async()=>{const sent=[];const collector=createCollector({deviceId:'test',deviceName:'Test',platform:'darwin',tools:['codex'],url:'http://127.0.0.1',port:0,localKey:'a'.repeat(64)},{fetcher:async(url,options)=>{sent.push({url:String(url),body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true})};}});collector.detail({id:'new',at:200,detail:'current'});collector.detail({id:'old',at:100,detail:'history'});await collector.flush();assert.equal(sent.find(s=>s.url.endsWith('/api/telemetry')).body.events[0].id,'new');});
