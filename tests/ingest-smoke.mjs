import assert from 'node:assert/strict';
import { agentId } from '../bridge/collector/events.mjs';
const base=new URL(process.env.OFFICE_TEST_URL??'http://127.0.0.1:5173');
if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname)) throw new Error('只測試本機資料庫');
const post=body=>fetch(new URL('/api/ingest',base),{method:'POST',headers:{'Content-Type':'application/json','X-Office-Token':'a'.repeat(64)},body:JSON.stringify(body)});
const now=Date.now(), devices=[{id:'test-home',name:'測試家裡',platform:'win32',tools:['codex']},{id:'test-company',name:'測試公司',platform:'darwin',tools:['codex']}];
const make=(d,status,stateAt)=>({id:agentId(d.id,'codex','same-session'),name:'Codex',role:d.name,status,task:'本機多裝置驗證',category:'testing',deviceId:d.id,deviceName:d.name,provider:'codex',client:'Codex App',sessionKey:'test',source:'hook',stateAt});
for(const device of devices) assert.equal((await post({device,agents:[make(device,'working',now)]})).status,200);
assert.equal((await post({device:devices[0],agents:[make(devices[0],'done',now+1)]})).status,200);
assert.equal((await post({device:devices[0],agents:[make(devices[0],'working',now-1000)]})).status,200);
assert.equal((await post({device:devices[0],agents:[null]})).status,400);
const data=await(await fetch(new URL('/api/office',base))).json();
assert.equal(data.agents.find(a=>a.id===make(devices[0],'',0).id).status,'done');
assert.equal(data.agents.find(a=>a.id===make(devices[1],'',0).id).status,'working');
assert.equal(data.agents.find(a=>a.id===make(devices[0],'',0).id).category,'testing');
assert.equal(data.agents.find(a=>a.id===make(devices[0],'',0).id).reportedStatus,'done');
assert.equal(typeof data.agents.find(a=>a.id===make(devices[0],'',0).id).attendance.present,'boolean');
assert.equal(typeof data.agents.find(a=>a.id===make(devices[0],'',0).id).attendance.reason,'string');
assert.equal(data.devices.find(d=>d.id==='test-home').connected,true);
assert.equal(data.events.filter(e=>e.deviceName==='測試家裡'&&e.task==='本機多裝置驗證'&&e.status==='working').length>=1,true);
assert.equal((await post({device:devices[0],agents:[{...make(devices[0],'working',now+2),category:'private raw text'}]})).status,400);
for(const device of devices) await post({device,agents:[make(device,'offline',now+2)]});
console.log('批次回報驗證通過：雙裝置隔離、工作階段去重、舊事件不覆蓋、新裝置心跳。');

for(const path of ['/api/office','/api/ingest']) {
  for(const headers of [{},{'X-Office-Token':'invalid'},{'OAI-Sites-Authorization':'Bearer forged','X-OpenAI-User-ID':'forged'}])
    assert.equal((await fetch(new URL(path,base),{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'})).status,401);
}
console.log('公開讀取與更新授權驗證通過：匿名／錯誤憑證／偽造身分皆無法更新。');
