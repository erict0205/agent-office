import assert from 'node:assert/strict';
const base=new URL(process.env.OFFICE_TEST_URL??'http://127.0.0.1:5173');
if(!['127.0.0.1','localhost'].includes(base.hostname))throw new Error('只可測試本機');
const marker='PRIVATE_FIXTURE_'+Date.now(),owner={Cookie:'__sites_local_auth=1'},action={...owner,Origin:base.origin,'X-Office-Action':'1','Content-Type':'application/json'};
const request=(path,body,headers={})=>fetch(new URL(path,base),body?{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}:{headers});
const runner=async body=>{const r=await request('/api/runner',body,{'X-Office-Runner':'b'.repeat(64)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
const operate=async body=>{const r=await request('/api/control',body,action);const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
assert.equal((await(await request('/api/viewer')).json()).isOwner,false);
assert.equal((await(await request('/api/viewer',null,owner)).json()).isOwner,true);
for(const headers of [{},{'oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'seedy@sites.test'}]){
  assert.equal((await request('/api/control',null,headers)).status,403);
  assert.equal((await request('/api/control',{op:'create'},headers)).status,403);
}
assert.equal((await request('/api/control',{op:'create'},owner)).status,403,'CSRF guard');
assert.equal((await request('/api/runner',{op:'poll'},{'X-Office-Runner':'a'.repeat(64)})).status,401,'collector cannot claim tasks');
assert.equal((await request('/api/telemetry',{events:[]})).status,401);
await runner({op:'poll',deviceId:'test-control',deviceName:'Test Runner',projects:[{id:'fixture',name:marker}],active:[]});
const workflow=crypto.randomUUID();
await operate({op:'create',id:workflow,title:marker,prompt:marker,deviceId:'test-control',projectId:'fixture',workflow:'pipeline'});
const poll=active=>runner({op:'poll',deviceId:'test-control',deviceName:'Test Runner',projects:[{id:'fixture',name:marker}],active});
let first;
for(let stage=0;stage<3;stage++){
 const results=await Promise.all([poll([]),poll([])]),jobs=results.map(r=>r.job).filter(Boolean);assert.equal(jobs.length,1,'atomic single claim');const job=jobs[0];assert.equal(job.stage,stage);assert.equal(job.prompt,marker);if(stage===0)first=job;
 const active=[{id:job.id,leaseToken:job.lease_token}];
 if(stage===0){
  await runner({op:'report',id:job.id,leaseToken:job.lease_token,approval:{requestId:'42',kind:'item/commandExecution/requestApproval',description:marker},events:[{id:workflow+'-event',kind:'command',label:'fixture tool',detail:marker,at:Date.now()}]});
  await operate({op:'approval',id:job.id,requestId:'42',decision:'decline'});
  const pending=await poll(active);assert.equal(pending.commands[0].kind,'approval');
  await runner({op:'report',id:job.id,leaseToken:job.lease_token,approval:null,ack:pending.commands.map(c=>c.id),events:[]});
  assert.equal((await poll(active)).commands.length,0);
 }
 const result=await runner({op:'report',id:job.id,leaseToken:job.lease_token,outcome:'completed',result:JSON.stringify({summary:marker,verdict:'pass',tests:[{name:'fixture',status:'passed',detail:'exit 0'}],artifacts:[]}),diff:marker,events:[]});
 assert.equal(result.status,stage===2?'awaiting_acceptance':'succeeded');
}
const privateRead=await(await request('/api/control?agent='+first.agent_id,null,owner)).json();assert.ok(JSON.stringify(privateRead).includes(marker));
const publicRead=await(await request('/api/office')).json();assert.equal(JSON.stringify(publicRead).includes(marker),false);
assert.equal('sessionKey' in publicRead.agents.find(a=>a.id===first.agent_id),false);
await operate({op:'accept',id:workflow+'-2'});
assert.equal((await request('/api/control?agent='+first.agent_id)).status,403);
const id=crypto.randomUUID();await operate({op:'create',id,title:'cancel fixture',prompt:'cancel',deviceId:'test-control',projectId:'fixture',workflow:'pipeline'});const job=(await poll([])).job;
await operate({op:'cancel',id:job.id});assert.equal((await runner({op:'report',id:job.id,leaseToken:job.lease_token,outcome:'completed',result:'{}',events:[]})).settled,true);assert.equal((await poll([])).job,null);
const failedId=crypto.randomUUID();await operate({op:'create',id:failedId,title:'failure fixture',prompt:'fixture',deviceId:'test-control',projectId:'fixture',workflow:'single',role:'development'});
const failedJob=(await poll([])).job;assert.equal((await runner({op:'report',id:failedJob.id,leaseToken:failedJob.lease_token,outcome:'failed',result:'failure evidence',events:[]})).status,'failed');
assert.equal((await request('/api/control',{op:'retry',id:failedJob.id},action)).status,400);
await operate({op:'retry',id:failedJob.id,checked:true});const retried=(await poll([])).job;assert.equal(retried.attempt,2);await operate({op:'cancel',id:retried.id});await runner({op:'report',id:retried.id,leaseToken:retried.lease_token,events:[]});
console.log('控制台整合驗證通過：訪客拒絕、偽造身分拒絕、CSRF 拒絕、私人資料隔離、原子領取、人工確認、三階段交接、驗收、取消。');
