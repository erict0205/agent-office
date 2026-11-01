import { parseArgs } from 'node:util';
import { readConfig,readSecretFromStdin } from '../collector/config.mjs';
import { deriveRunnerToken,writeFingerprint } from '../collector/write-auth.mjs';
import { readProjects } from './projects.mjs';
import { prepareWorkspace,workspaceChanges,CodexRun,resultEnvelope } from './codex.mjs';
import { redact } from '../collector/telemetry.mjs';


const {values}=parseArgs({options:{config:{type:'string'},projects:{type:'string'},'stdin-config':{type:'boolean'},'fingerprint-stdin':{type:'boolean'}}});
let token=process.env.OFFICE_SITE_TOKEN;
if(values['stdin-config']||values['fingerprint-stdin'])token=(await readSecretFromStdin()).token;
if(!token)throw new Error('需要隱藏輸入的 Sites 服務憑證');
if(values['fingerprint-stdin']){console.log(JSON.stringify({fingerprint:writeFingerprint(deriveRunnerToken(token))}));process.exit(0);}
const config=await readConfig(values.config),projects=await readProjects(values.projects);
const headers={'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${token}`,'X-Office-Runner':deriveRunnerToken(token)};
async function api(body){let text=JSON.stringify(body);if(text.length>58000)throw new Error('回報內容超過上限');const r=await fetch(new URL('/api/runner',config.url),{method:'POST',headers,body:text,redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
let active=null,polling=false,closing=false;
async function launch(job){
  active={job,events:new Map(),ack:[],approval:null,approvalChanged:false,leaseUntil:Date.now()+80000,commands:new Set(),run:null,finished:null};const state=active;
  try{
    const project=projects.find(p=>p.id===job.project_id);if(!project)throw new Error('專案未在本機登記');
    const workspace=await prepareWorkspace(project,job.workflow_id);
    if(active!==state||closing||state.cancelled){state.finished={outcome:'interrupted',result:'啟動前已取消',diff:''};return;}
    const run=new CodexRun({job,workspace,onEvent:event=>{state.events.set(event.id,event);if(state.events.size>128)state.events.delete(state.events.keys().next().value);},onApproval:approval=>{state.approval=approval;state.approvalChanged=true;}});state.run=run;
    const completed=await run.start();run.close();
    const changes=await workspaceChanges(workspace.folder);
    state.finished={outcome:completed.outcome,result:resultEnvelope(completed.result||'沒有可讀取的回答',{...workspace,...changes,diff:undefined,model:run.model}),diff:changes.diff.slice(0,12000)};
  }catch(e){state.run?.close();state.finished={outcome:'failed',result:redact(JSON.stringify({summary:e.message,verdict:'unknown',tests:[],artifacts:[]})),diff:''};}
}
async function report(){
  if(!active)return;const s=active;let events=[...s.events.values()].slice(0,3),body={op:'report',id:s.job.id,leaseToken:s.job.lease_token,events,ack:s.ack.slice(),...(s.approvalChanged?{approval:s.approval}:{})};
  // Drain evidence before the terminal update; retain data across transient failures.
  if(s.finished&&s.events.size<=events.length)Object.assign(body,s.finished);
  while(JSON.stringify(body).length>58000&&events.length){events=events.slice(0,-1);body.events=events;if(body.outcome)delete body.outcome;}
  const reply=await api(body);
  for(const event of events){if(s.events.get(event.id)===event)s.events.delete(event.id);}s.ack=s.ack.filter(id=>!body.ack.includes(id));
  if(body.approval===s.approval)s.approvalChanged=false;
  if(body.outcome||reply.settled){if(reply.settled)s.run?.stop();if(active===s)active=null;console.log('工作已回報，等待下一份工作。');}
}
async function poll(){
  if(polling||closing)return;polling=true;
  try{
    const result=await api({op:'poll',deviceId:config.deviceId,deviceName:config.deviceName,projects:projects.map(p=>({id:p.id,name:p.name})),active:active?[{id:active.job.id,leaseToken:active.job.lease_token}]:[]});
    if(active){const s=active,lease=result.leases.find(l=>l.id===s.job.id);if(lease)s.leaseUntil=Date.now()+80000;
      for(const command of result.commands){if(command.taskId!==s.job.id||s.commands.has(command.id))continue;try{if(!s.run&&command.kind!=='cancel')continue;if(command.kind==='cancel'&&!s.run)s.cancelled=true;await s.run?.command(command);s.commands.add(command.id);s.ack.push(command.id);}catch{}}
      if(!lease&&!s.finished){s.run?.stop();s.finished={outcome:'interrupted',result:'工作已取消或租約失效，請檢查本機變更。',diff:''};}
      await report();
    }else if(result.job){console.log('收到已授權的工作，準備獨立工作目錄。');void launch(result.job);}
  }catch{console.error('工作控制台暫時無法連線，將重試；不會重複領取執行中的工作。');}
  finally{polling=false;}
}
const timer=setInterval(poll,5000),watch=setInterval(()=>{if(active&&Date.now()>active.leaseUntil&&!active.finished){active.run?.stop();active.finished={outcome:'interrupted',result:'連線逾時，已停止執行。請檢查本機成果。',diff:''};}},1000);
async function stop(){if(closing)return;closing=true;clearInterval(timer);clearInterval(watch);active?.run?.stop();console.log('受控執行器已停止；尚未完成的工作會標記為待檢查。');setTimeout(()=>process.exit(0),2200).unref();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(`Office 受控執行器已啟動：${config.deviceName}；${projects.length} 個本機授權專案。`);await poll();
