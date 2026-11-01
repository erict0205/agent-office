import { env } from 'cloudflare:workers';
import { HttpError } from './server-office';

export const taskSelect='SELECT id,workflow_id AS workflowId,stage,title,prompt,device_id AS deviceId,project_id AS projectId,role,status,agent_id AS agentId,created_at AS createdAt,updated_at AS updatedAt,lease_until AS leaseUntil,attempt,result,diff,approval FROM office_tasks';
export const stages=['development','testing','review'];
export const taskLabels:Record<string,string>={queued:'等待執行',waiting:'等待前一步',running:'工作中',blocked:'等待權限確認',succeeded:'本輪結束',failed:'執行失敗',cancelled:'已取消',interrupted:'已中斷',stale:'連線中斷，需檢查',changes_requested:'需要修改',awaiting_acceptance:'等待你的驗收',accepted:'已驗收'};
export function db(){if(!env.DB)throw new HttpError(503,'儲存空間尚未設定');return env.DB;}
export function bounded(value:unknown,max:number){if(typeof value!=='string'||value.length>max)throw new HttpError(400,'內容格式不正確');return value;}
export async function controlView(agentId:string|null,taskId:string|null) {
  const database=db();
  await database.prepare("UPDATE office_tasks SET status='stale',updated_at=? WHERE status IN ('running','blocked') AND lease_until<?").bind(Date.now(),Date.now()).run();
  const task=taskId?await database.prepare(taskSelect+' WHERE id=?').bind(taskId).first<any>():agentId?await database.prepare(taskSelect+' WHERE agent_id=? ORDER BY created_at DESC LIMIT 1').bind(agentId).first<any>():null;
  const detailAgent=task?.agentId??agentId;
  const [tasks,projects,events]=await database.batch([
    database.prepare('SELECT id,workflow_id AS workflowId,stage,title,device_id AS deviceId,project_id AS projectId,role,status,agent_id AS agentId,created_at AS createdAt,updated_at AS updatedAt,attempt FROM office_tasks ORDER BY created_at DESC,stage LIMIT 100'),
    database.prepare('SELECT device_id AS deviceId,project_id AS projectId,name,seen_at AS seenAt FROM office_projects ORDER BY name LIMIT 100'),
    database.prepare('SELECT id,agent_id AS agentId,task_id AS taskId,kind,label,detail,at FROM private_events WHERE agent_id=? ORDER BY at DESC,id DESC LIMIT 100').bind(detailAgent??''),
  ]);
  const agent=detailAgent?await database.prepare('SELECT id,task,device_name AS deviceName,provider,client,session_key AS sessionKey,source FROM agents WHERE id=?').bind(detailAgent).first():null;
  return {task,tasks:tasks.results,projects:projects.results,events:events.results,agent,labels:taskLabels,at:Date.now()};
}
export async function ownerCommand(body:any) {
  const database=db(),now=Date.now();
  if(body.op==='create') {
    const id=bounded(body.id,60);if(!/^[a-f0-9-]{36}$/.test(id))throw new HttpError(400,'工作識別不正確');
    if(await database.prepare('SELECT id FROM office_tasks WHERE workflow_id=? LIMIT 1').bind(id).first())return {id};
    const title=bounded(body.title,160).trim(),prompt=bounded(body.prompt,12000).trim();if(!title||!prompt)throw new HttpError(400,'請填寫工作名稱與要求');
    const deviceId=bounded(body.deviceId,40),projectId=bounded(body.projectId,40);
    const project=await database.prepare('SELECT name FROM office_projects WHERE device_id=? AND project_id=?').bind(deviceId,projectId).first();if(!project)throw new HttpError(400,'請選擇本機已登記的專案');
    const roles=body.workflow==='pipeline'?stages:[body.role];if(roles.some((r:any)=>!stages.includes(r)))throw new HttpError(400,'工作角色不正確');
    await database.batch(roles.map((role:string,i:number)=>database.prepare('INSERT OR IGNORE INTO office_tasks(id,workflow_id,stage,title,prompt,device_id,project_id,role,status,agent_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${id}-${i}`,id,i,title,prompt,deviceId,projectId,role,i===0?'queued':'waiting',`managed-${id}-${i}`,now,now)));
    return {id};
  }
  const id=bounded(body.id,80);const task=await database.prepare('SELECT * FROM office_tasks WHERE id=?').bind(id).first<any>();if(!task)throw new HttpError(404,'找不到工作');
  if(body.op==='cancel') {
    await database.batch([
      database.prepare("UPDATE office_tasks SET status='cancelled',updated_at=? WHERE workflow_id=? AND status IN ('waiting','queued','running','blocked','stale')").bind(now,task.workflow_id),
      database.prepare("INSERT INTO office_commands(id,task_id,kind,payload,created_at) SELECT lower(hex(randomblob(16))),id,'cancel','{}',? FROM office_tasks WHERE workflow_id=? AND lease_token IS NOT NULL").bind(now,task.workflow_id),
    ]);return {ok:true};
  }
  if(body.op==='retry') {
    if(!['failed','interrupted','stale','changes_requested'].includes(task.status))throw new HttpError(409,'這份工作目前不能重試');
    // Expired leases never auto-retry: the owner must first confirm local side effects.
    if(!body.checked)throw new HttpError(400,'請先檢查前次執行結果');
    if(task.lease_until && task.lease_until>now)throw new HttpError(409,'執行器仍持有工作，請先停止並等候連線結束');
    await database.prepare("UPDATE office_tasks SET status='queued',approval=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status=?").bind(now,id,task.status).run();return {ok:true};
  }
  if(body.op==='return') {
    if(!['changes_requested','awaiting_acceptance','succeeded'].includes(task.status)||!body.checked)throw new HttpError(409,'請先檢查成果，再退回修改');
    if(await database.prepare('SELECT id FROM office_tasks WHERE workflow_id=? AND lease_until>? LIMIT 1').bind(task.workflow_id,now).first())throw new HttpError(409,'仍有角色持有工作連線，請先停止並等候執行器確認');
    const note=bounded(body.message,6000).trim();if(!note)throw new HttpError(400,'請填寫修改要求');
    const first=await database.prepare('SELECT id,prompt,status FROM office_tasks WHERE workflow_id=? ORDER BY stage LIMIT 1').bind(task.workflow_id).first<any>();
    if(!first||!['succeeded','changes_requested','awaiting_acceptance'].includes(first.status))throw new HttpError(409,'前一步仍在執行');
    await database.batch([
      database.prepare("UPDATE office_tasks SET status='waiting',result='',diff='',lease_token=NULL,lease_until=NULL,approval=NULL,updated_at=? WHERE workflow_id=? AND stage>0").bind(now,task.workflow_id),
      database.prepare("UPDATE office_tasks SET status='queued',prompt=?,lease_token=NULL,lease_until=NULL,approval=NULL,updated_at=? WHERE id=?").bind(`${first.prompt.slice(0,12000)}\n\n擁有者退回修改：${note}`,now,first.id),
    ]);return {ok:true};
  }
  if(body.op==='accept') {
    if(task.status!=='awaiting_acceptance')throw new HttpError(409,'這份工作尚未等待驗收');
    await database.prepare("UPDATE office_tasks SET status='accepted',updated_at=? WHERE id=? AND status='awaiting_acceptance'").bind(now,id).run();return {ok:true};
  }
  if(body.op==='steer'||body.op==='approval') {
    if(!['running','blocked'].includes(task.status)||task.lease_until<now)throw new HttpError(409,'工作目前沒有可操作的連線');
    let payload;
    if(body.op==='steer'){const message=bounded(body.message,6000).trim();if(!message)throw new HttpError(400,'請填寫補充要求');payload={message};}
    else {const approval=task.approval?JSON.parse(task.approval):null;if(!approval||body.requestId!==approval.requestId||!['accept','decline','answer'].includes(body.decision))throw new HttpError(409,'確認要求已變更');if(body.decision==='answer'&&approval.kind!=='item/tool/requestUserInput')throw new HttpError(400,'這不是文字回答要求');payload={requestId:approval.requestId,decision:body.decision,...(body.decision==='answer'?{answer:bounded(body.answer,6000)}:{})};}
    await database.prepare('INSERT INTO office_commands(id,task_id,kind,payload,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),id,body.op,JSON.stringify(payload),now).run();return {ok:true};
  }
  throw new HttpError(400,'未知操作');
}
