import { spawn,execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { access,mkdir,realpath,readFile } from 'node:fs/promises';
import { join,sep,dirname } from 'node:path';
import { redact } from '../collector/telemetry.mjs';
const exec=promisify(execFile);
const schema={type:'object',properties:{summary:{type:'string'},verdict:{type:'string',enum:['pass','changes_requested','unknown']},tests:{type:'array',items:{type:'object',properties:{name:{type:'string'},status:{type:'string',enum:['passed','failed','not_run']},detail:{type:'string'}},required:['name','status','detail'],additionalProperties:false}},artifacts:{type:'array',items:{type:'object',properties:{label:{type:'string'},path:{type:'string'}},required:['label','path'],additionalProperties:false}}},required:['summary','verdict','tests','artifacts'],additionalProperties:false};
export async function prepareWorkspace(project,workflow) {
  if(!/^[a-f0-9-]{36}$/.test(workflow))throw new Error('工作識別不正確');
  const repo=await realpath(project.path);if((await exec('git',['rev-parse','--show-toplevel'],{cwd:repo})).stdout.trim()!==repo)throw new Error('登記的 Git 專案已變更');
  await mkdir(project.worktreeRoot,{recursive:true});const root=await realpath(project.worktreeRoot),folder=join(root,workflow),branch=`office/${project.id}/${workflow}`;
  const listed=JSON.parse(JSON.stringify((await exec('git',['worktree','list','--porcelain'],{cwd:repo})).stdout));
  if(listed.split('\n').includes(`worktree ${folder}`)){
    if(await realpath(folder)!==folder)throw new Error('工作目錄不可重新導向');
    if((await exec('git',['branch','--show-current'],{cwd:folder})).stdout.trim()!==branch)throw new Error('工作分支已變更，請先檢查');
  } else await exec('git',['worktree','add','-b',branch,folder,'HEAD'],{cwd:repo});
  return {folder,branch,baseCommit:(await exec('git',['rev-parse','HEAD'],{cwd:folder})).stdout.trim()};
}
export async function workspaceChanges(folder) {
  let diff='';try{diff=(await exec('git',['diff','HEAD','--'],{cwd:folder,maxBuffer:256000})).stdout;}catch{diff='變更內容超過預覽上限，請在本機查看。';}
  const files=(await exec('git',['status','--short'],{cwd:folder})).stdout;
  const untracked=(await exec('git',['ls-files','--others','--exclude-standard','-z'],{cwd:folder})).stdout.split('\0').filter(Boolean).slice(0,10);
  for(const file of untracked){try{const path=await realpath(join(folder,file));if(!path.startsWith(folder+sep))continue;const data=await readFile(path);if(data.length>12000||data.includes(0))continue;diff+=`\n--- 新檔案 ${file}\n${data.toString('utf8')}\n`;}catch{}}
  return {diff:redact(diff,18000),files:redact(files,5000),headCommit:(await exec('git',['rev-parse','HEAD'],{cwd:folder})).stdout.trim()};
}
export function taskPrompt(job) {
  const role={development:'你負責實作。只修改此獨立工作目錄內的內容，驗證必要行為。',testing:'你負責測試上一階段的實作。先檢查變更，再執行有意義的測試。不要以改掉測試期待來掩蓋問題。',review:'你負責獨立審查。檢查程式差異與測試證據，列出具體問題；有待修正時 verdict 必須為 changes_requested。'}[job.role];
  return `${role}\n任務：${job.title}\n${job.prompt}\n\n前階段交付：\n${JSON.stringify(job.previous??[]).slice(0,18000)}\n\n請保留變更於此工作目錄，供下一角色檢查。不要 merge、push、刪除工作目錄或修改原始 checkout。輸出遵守指定 JSON 格式；未執行的測試標記 not_run，不要把本輪結束當作測試通過。verdict 的 pass 表示你本階段的判斷，最終仍由擁有者驗收。`;
}
export async function codexLaunch(platform=process.platform) {
  if(platform!=='win32')return {command:'codex',args:['app-server','--listen','stdio://']};
  const located=(await exec('where.exe',['codex'])).stdout.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const binary=located.find(p=>p.toLowerCase().endsWith('.exe'));if(binary)return {command:binary,args:['app-server','--listen','stdio://']};
  for(const shim of located){const script=join(dirname(shim),'node_modules','@openai','codex','bin','codex.js');try{await access(script);return {command:process.execPath,args:[script,'app-server','--listen','stdio://']};}catch{}}
  throw new Error('找不到可直接啟動的 Codex，請安裝官方 Codex CLI 或使用 WSL。');
}
export class CodexRun {
  constructor({job,workspace,onEvent=()=>{},onApproval=()=>{},spawnProcess=spawn}) {this.job=job;this.workspace=workspace;this.onEvent=onEvent;this.onApproval=onApproval;this.spawnProcess=spawnProcess;this.requests=new Map();this.approvals=new Map();this.next=0;this.turnId=null;this.final='';this.ended=false;this.agentText=new Map();}
  send(message){if(this.child?.stdin.writable)this.child.stdin.write(JSON.stringify(message)+'\n');}
  rpc(method,params={}){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.requests.delete(id);reject(new Error(`${method} 沒有回應`));},30000);this.requests.set(id,{resolve,reject,timer});this.send({id,method,params});});}
  event(kind,label,detail,key=String(++this.next)){this.onEvent({id:`${this.job.id}:${this.job.attempt}:${key}`.slice(0,120),agentId:this.job.agent_id,kind,label,detail:redact(typeof detail==='string'?detail:JSON.stringify(detail),7000),at:Date.now()});}
  async start(){
    const childEnv={...process.env};for(const key of Object.keys(childEnv))if(key.startsWith('OFFICE_')||key==='ACCESS_TOKEN')delete childEnv[key];
    const launch=await codexLaunch();
    this.child=this.spawnProcess(launch.command,launch.args,{cwd:this.workspace.folder,env:childEnv,stdio:['pipe','pipe','pipe']});
    const completion=new Promise(resolve=>{this.finish=outcome=>{if(this.ended)return;this.ended=true;resolve({outcome,result:this.final});};});
    this.child.once('error',()=>{this.final='無法啟動 Codex，請確認本機已安裝並登入。';this.finish('failed');});
    this.child.once('exit',()=>{if(!this.ended){this.final=this.final||'Codex 程序已結束，未收到完成事件。';this.finish(this.stopping?'interrupted':'failed');}});
    this.child.stderr.on('data',chunk=>this.event('diagnostic','執行器訊息',String(chunk)));
    const lines=createInterface({input:this.child.stdout});lines.on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}this.receive(m);});
    try{
      await this.rpc('initialize',{clientInfo:{name:'agent_office_managed',title:'Eric Agent Office',version:'0.3.0'},capabilities:{experimentalApi:true}});this.send({method:'initialized',params:{}});
      const account=await this.rpc('account/read',{refreshToken:false});if(!account.account)throw new Error('本機 Codex 尚未登入');
      const catalog=await this.rpc('model/list',{}),selected=catalog.data?.find(m=>m.isDefault)??catalog.data?.[0];if(!selected)throw new Error('Codex 沒有回傳可用的模型清單');this.model=selected.model??selected.id;this.event('model','執行模型',this.model);
      const thread=await this.rpc('thread/start',{model:this.model,cwd:this.workspace.folder,approvalPolicy:'on-request',approvalsReviewer:'user',sandbox:this.job.role==='review'?'read-only':'workspace-write'});this.threadId=thread.thread.id;
      this.event('workspace','獨立工作目錄',this.workspace);
      const turn=await this.rpc('turn/start',{threadId:this.threadId,input:[{type:'text',text:taskPrompt(this.job)}],outputSchema:schema});this.turnId=turn.turn.id;
    }catch(e){this.final=redact(e.message);this.finish('failed');}
    return completion;
  }
  receive(m){
    if(m.id!==undefined&&!m.method){const request=this.requests.get(m.id);if(request){clearTimeout(request.timer);this.requests.delete(m.id);m.error?request.reject(new Error(m.error.message)):request.resolve(m.result);}return;}
    const p=m.params??{};
    if(m.id!==undefined){
      if(['item/commandExecution/requestApproval','item/fileChange/requestApproval','item/tool/requestUserInput'].includes(m.method)){
        this.approvals.set(String(m.id),{id:m.id,method:m.method,params:p});const description=redact(p.command??p.reason??JSON.stringify(p.questions??p),6000);
        this.event('approval','需要你的確認',description);this.onApproval({requestId:String(m.id),kind:m.method,description});
      }else if(m.method==='item/permissions/requestApproval'){this.send({id:m.id,result:{permissions:{},scope:'turn'}});this.event('approval','額外權限未授予','此版本不自動擴張執行器權限。');}
      else this.send({id:m.id,error:{code:-32601,message:'Office 尚未支援這項互動'}});
      return;
    }
    if(m.method==='item/agentMessage/delta'){const key=p.itemId??'message';const text=(this.agentText.get(key)??'')+(p.delta??'');this.agentText.set(key,text.slice(-20000));this.event('message','Agent 回應',text,key);}
    if(m.method==='item/commandExecution/outputDelta'){const key=`output-${p.itemId}`,text=(this.agentText.get(key)??'')+(p.delta??'');this.agentText.set(key,text.slice(-16000));this.event('output','即時指令輸出',text,key);}
    if(['item/started','item/completed'].includes(m.method)){
      const item=p.item??{};
      if(item.type==='agentMessage'&&m.method==='item/completed'){this.final=String(item.text??this.agentText.get(item.id)??'');this.event('message','Agent 回答',this.final,item.id);}
      if(item.type==='commandExecution')this.event('command',m.method==='item/completed'?`指令結束 · exit ${item.exitCode??'未知'}`:'執行指令',{command:item.command,status:item.status,exitCode:item.exitCode,output:item.aggregatedOutput},item.id);
      if(item.type==='fileChange')this.event('file','程式變更',item.changes??item,item.id);
      // Reasoning records are deliberately excluded.
    }
    if(m.method==='turn/diff/updated')this.event('diff','本輪程式差異',p.diff,'turn-diff');
    if(m.method==='thread/tokenUsage/updated')this.event('usage','本輪用量',p.tokenUsage??{},'usage');
    if(m.method==='turn/completed'){const status=p.turn?.status;if(p.turn?.error){this.event('error','執行錯誤',p.turn.error);if(!this.final)this.final=JSON.stringify({summary:redact(p.turn.error.message??JSON.stringify(p.turn.error)),verdict:'unknown',tests:[],artifacts:[]});}this.finish(status==='completed'?'completed':status==='interrupted'?'interrupted':'failed');}
  }
  async command(command){
    const p=JSON.parse(command.payload);
    if(command.kind==='cancel'){this.stop();return;}
    if(command.kind==='steer'){if(!this.threadId||!this.turnId)throw new Error('工作尚未開始');await this.rpc('turn/steer',{threadId:this.threadId,expectedTurnId:this.turnId,input:[{type:'text',text:p.message}]});this.event('instruction','收到補充要求',p.message);return;}
    if(command.kind==='approval'){
      const pending=this.approvals.get(p.requestId);if(!pending)return;
      let result={decision:p.decision};
      if(pending.method==='item/tool/requestUserInput')result={answers:Object.fromEntries((pending.params.questions??[]).map(q=>[q.id,{answers:[p.answer??'擁有者拒絕回答']}]))};
      this.send({id:pending.id,result});this.approvals.delete(p.requestId);this.onApproval(this.approvals.size?{requestId:[...this.approvals.keys()][0],kind:[...this.approvals.values()][0].method,description:redact(JSON.stringify([...this.approvals.values()][0].params),6000)}:null);
    }
  }
  stop(){this.stopping=true;if(this.threadId&&this.turnId)this.send({id:++this.next,method:'turn/interrupt',params:{threadId:this.threadId,turnId:this.turnId}});this.close();}
  close(){for(const p of this.requests.values()){clearTimeout(p.timer);p.reject(new Error('執行器已關閉'));}this.requests.clear();this.child?.kill('SIGTERM');const force=setTimeout(()=>this.child?.kill('SIGKILL'),2000);force.unref();}
}

export function resultEnvelope(final,execution) {
  let source;try{source=JSON.parse(final);}catch{source={summary:final};}
  const result={summary:redact(source.summary??final,5000),verdict:['pass','changes_requested'].includes(source.verdict)?source.verdict:'unknown',tests:Array.isArray(source.tests)?source.tests.slice(0,12).map(t=>({name:redact(t.name,120),status:['passed','failed'].includes(t.status)?t.status:'not_run',detail:redact(t.detail,350)})):[],artifacts:Array.isArray(source.artifacts)?source.artifacts.slice(0,10).map(a=>({label:redact(a.label,100),path:redact(a.path,300)})):[],execution};
  while(JSON.stringify(result).length>18000){if(result.tests.length)result.tests.pop();else if(result.artifacts.length)result.artifacts.pop();else {result.summary=result.summary.slice(0,Math.floor(result.summary.length/2));if(result.execution?.files)result.execution.files=result.execution.files.slice(0,1000);}}
  return JSON.stringify(result);
}
