import { env } from 'cloudflare:workers';
import { validWriteToken } from './write-auth.mjs';
import { HttpError,agentStatements } from './server-office';
import { db,bounded,taskSelect } from './server-control';
import { telemetryStatements,trimTelemetry } from './server-telemetry';
import { humanName } from './work-labels.mjs';

export async function requireRunner(request:Request) {
  if(!env.OFFICE_RUNNER_TOKEN_SHA256)throw new HttpError(503,'執行器憑證尚未設定');
  if(!await validWriteToken(request.headers.get('X-Office-Runner'),env.OFFICE_RUNNER_TOKEN_SHA256))throw new HttpError(401,'需要執行器憑證');
}
function publicState(task:any,status:string,now:number){
  return agentStatements({id:task.agent_id,name:humanName(task.agent_id),role:'受控工作',status,task:status==='working'?'正在執行已指派的工作':status==='blocked'?'等待擁有者確認':'本輪工作已結束',category:task.role==='testing'?'testing':task.role==='review'?'review':'development',deviceId:task.device_id,deviceName:task.device_name??'工作電腦',provider:'codex',client:'Office Managed',sessionKey:task.id.slice(0,12),source:'runner',stateAt:now},now);
}
export async function runnerMessage(body:any) {
  const database=db(),now=Date.now();
  if(body.op==='poll') {
    const deviceId=bounded(body.deviceId,40),deviceName=bounded(body.deviceName,40);
    if(!/^[a-z0-9_-]{1,40}$/.test(deviceId)||!Array.isArray(body.projects)||body.projects.length>20||!Array.isArray(body.active)||body.active.length>1)throw new HttpError(400,'執行器設定不正確');
    const statements=body.projects.map((p:any)=>{
      if(!/^[a-z0-9_-]{1,40}$/.test(p.id))throw new HttpError(400,'專案識別不正確');
      return database.prepare('INSERT INTO office_projects(key,device_id,project_id,name,seen_at) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET name=excluded.name,seen_at=excluded.seen_at').bind(`${deviceId}:${p.id}`,deviceId,p.id,bounded(p.name,80),now);
    });
    statements.push(database.prepare("UPDATE office_tasks SET status='stale',updated_at=? WHERE status IN ('running','blocked') AND lease_until<?").bind(now,now));
    await database.batch(statements);
    const commands:any[]=[],leases:any[]=[];
    for(const active of body.active){
      const id=bounded(active.id,80),token=bounded(active.leaseToken,80);
      const task=await database.prepare('SELECT * FROM office_tasks WHERE id=? AND device_id=? AND lease_token=?').bind(id,deviceId,token).first<any>();
      if(!task)continue;
      if(['running','blocked'].includes(task.status)&&task.lease_until>now){
        await database.prepare('UPDATE office_tasks SET lease_until=? WHERE id=? AND lease_token=? AND lease_until>?').bind(now+90000,id,token,now).run();
        leases.push({id,until:now+90000});
        await database.batch(publicState({...task,device_name:deviceName},task.status==='blocked'?'blocked':'working',now));
      }
      const pending=await database.prepare('SELECT id,task_id AS taskId,kind,payload FROM office_commands WHERE task_id=? AND acknowledged=0 ORDER BY created_at,id LIMIT 20').bind(id).all();commands.push(...pending.results);
    }
    let job=null;
    if(!body.active.length && body.projects.length){
      const token=crypto.randomUUID(),allowed=body.projects.map((p:any)=>p.id);
      const placeholders=allowed.map(()=>'?').join(',');
      const claimed=await database.prepare(`UPDATE office_tasks SET status='running',lease_token=?,lease_until=?,attempt=attempt+1,updated_at=? WHERE id=(SELECT id FROM office_tasks WHERE status='queued' AND device_id=? AND project_id IN (${placeholders}) AND NOT EXISTS (SELECT 1 FROM office_tasks WHERE device_id=? AND status IN ('running','blocked') AND lease_until>?) ORDER BY created_at,stage LIMIT 1) AND status='queued' RETURNING *`).bind(token,now+90000,now,deviceId,...allowed,deviceId,now).first<any>();
      if(claimed){
        const prior=await database.prepare('SELECT role,result FROM office_tasks WHERE workflow_id=? AND stage<? ORDER BY stage').bind(claimed.workflow_id,claimed.stage).all();
        job={...claimed,previous:prior.results};
      }
    }
    return {ok:true,job,commands,leases,at:now};
  }
  if(body.op==='report') {
    const id=bounded(body.id,80),token=bounded(body.leaseToken,80);
    const task=await database.prepare('SELECT * FROM office_tasks WHERE id=? AND lease_token=?').bind(id,token).first<any>();
    if(!task)throw new HttpError(409,'工作連線已變更');
    if(!['running','blocked'].includes(task.status)){await database.prepare('UPDATE office_tasks SET lease_until=NULL WHERE id=? AND lease_token=?').bind(id,token).run();return {ok:true,settled:true};}
    if(task.lease_until<now)throw new HttpError(409,'工作連線已逾時，請由擁有者檢查');
    if(body.ack!==undefined&&(!Array.isArray(body.ack)||body.ack.length>20))throw new HttpError(400,'確認清單不正確');
    const statements=telemetryStatements(body.events??[],id,task.agent_id);
    for(const command of body.ack??[]){statements.push(database.prepare('UPDATE office_commands SET acknowledged=1 WHERE id=? AND task_id=?').bind(bounded(command,80),id));}
    let approval=task.approval;
    if(body.approval!==undefined){
      if(body.approval===null)approval=null;
      else {const a=body.approval;approval=JSON.stringify({requestId:bounded(a.requestId,100),kind:bounded(a.kind,100),description:bounded(a.description,6000)});}
    }
    let status=approval?'blocked':'running';
    const outcome=body.outcome;
    if(outcome){
      if(!['completed','failed','interrupted'].includes(outcome))throw new HttpError(400,'結束狀態不正確');
      const result=bounded(body.result??'',20000),diff=bounded(body.diff??'',20000);
      let verdict='unknown';try{verdict=JSON.parse(result).verdict;}catch{}
      const next=await database.prepare('SELECT id FROM office_tasks WHERE workflow_id=? AND stage=?').bind(task.workflow_id,task.stage+1).first<any>();
      status=outcome!=='completed'?outcome:verdict==='changes_requested'?'changes_requested':next?'succeeded':'awaiting_acceptance';
      statements.push(database.prepare('UPDATE office_tasks SET status=?,result=?,diff=?,approval=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND status IN (\'running\',\'blocked\')').bind(status,result,diff,now,id,token));
      if(status==='succeeded'&&next)statements.push(database.prepare("UPDATE office_tasks SET status='queued',updated_at=? WHERE id=? AND status='waiting'").bind(now,next.id));
      statements.push(...publicState(task,outcome==='completed'?'done':outcome==='failed'?'error':'idle',now));
    }else{
      statements.push(database.prepare('UPDATE office_tasks SET status=?,approval=?,updated_at=? WHERE id=? AND lease_token=? AND status IN (\'running\',\'blocked\')').bind(status,approval,now,id,token));
      statements.push(...publicState(task,status==='blocked'?'blocked':'working',now));
    }
    await database.batch([...statements,trimTelemetry()]);return {ok:true,status};
  }
  throw new HttpError(400,'未知執行器操作');
}
