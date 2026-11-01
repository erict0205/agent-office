import { env } from 'cloudflare:workers';
import { HttpError } from './server-office';
import { nextScheduleAt } from './schedule-time.mjs';

export const taskSelect='SELECT id,workflow_id AS workflowId,stage,title,prompt,device_id AS deviceId,project_id AS projectId,role,status,agent_id AS agentId,model_id AS modelId,schedule_id AS scheduleId,created_at AS createdAt,updated_at AS updatedAt,lease_until AS leaseUntil,attempt,result,diff,approval FROM office_tasks';
export const stages=['development','testing','review'];
export const taskLabels:Record<string,string>={queued:'等待執行',waiting:'等待前一步',running:'工作中',blocked:'等待權限確認',succeeded:'本輪結束',failed:'執行失敗',cancelled:'已取消',interrupted:'已中斷',stale:'連線中斷，需檢查',changes_requested:'需要修改',awaiting_acceptance:'等待你的驗收',accepted:'已驗收'};
export function db(){if(!env.DB)throw new HttpError(503,'儲存空間尚未設定');return env.DB;}
export function bounded(value:unknown,max:number){if(typeof value!=='string'||value.length>max)throw new HttpError(400,'內容格式不正確');return value;}
export async function controlView(agentId:string|null,taskId:string|null) {
  const database=db();
  await database.prepare("UPDATE office_tasks SET status='stale',updated_at=? WHERE status IN ('running','blocked') AND lease_until<?").bind(Date.now(),Date.now()).run();
  const task=taskId?await database.prepare(taskSelect+' WHERE id=?').bind(taskId).first<any>():agentId?await database.prepare(taskSelect+' WHERE agent_id=? ORDER BY created_at DESC LIMIT 1').bind(agentId).first<any>():null;
  const detailAgent=task?.agentId??agentId;
  const [tasks,projects,events,schedules,models]=await database.batch([
    database.prepare('SELECT id,workflow_id AS workflowId,stage,title,device_id AS deviceId,project_id AS projectId,role,status,agent_id AS agentId,model_id AS modelId,schedule_id AS scheduleId,created_at AS createdAt,updated_at AS updatedAt,attempt FROM office_tasks ORDER BY created_at DESC,stage LIMIT 100'),
    database.prepare('SELECT device_id AS deviceId,project_id AS projectId,name,seen_at AS seenAt FROM office_projects ORDER BY name LIMIT 100'),
    database.prepare('SELECT id,agent_id AS agentId,task_id AS taskId,kind,label,detail,at FROM private_events WHERE agent_id=? ORDER BY at DESC,id DESC LIMIT 100').bind(detailAgent??''),
    database.prepare('SELECT id,title,prompt,device_id AS deviceId,project_id AS projectId,workflow,role,model_id AS modelId,cadence,weekday,minute_of_day AS minuteOfDay,timezone,active,next_run_at AS nextRunAt,last_run_at AS lastRunAt,last_workflow_id AS lastWorkflowId,created_at AS createdAt FROM office_schedules ORDER BY active DESC,next_run_at LIMIT 50'),
    database.prepare('SELECT device_id AS deviceId,model_id AS modelId,name,is_default AS isDefault,seen_at AS seenAt FROM office_models ORDER BY device_id,is_default DESC,name LIMIT 200'),
  ]);
  const agent=detailAgent?await database.prepare('SELECT id,task,device_name AS deviceName,provider,client,session_key AS sessionKey,source FROM agents WHERE id=?').bind(detailAgent).first():null;
  return {task,tasks:tasks.results,projects:projects.results,events:events.results,schedules:schedules.results,models:models.results,agent,labels:taskLabels,at:Date.now()};
}
export async function ownerCommand(body:any) {
  const database=db(),now=Date.now();
  if(body.op==='schedule.create') {
    const id=bounded(body.id,60);if(!/^[a-f0-9-]{36}$/.test(id))throw new HttpError(400,'排程識別不正確');
    if(await database.prepare('SELECT id FROM office_schedules WHERE id=?').bind(id).first())return {id};
    if(Number((await database.prepare('SELECT COUNT(*) AS count FROM office_schedules').first<any>())?.count??0)>=50)throw new HttpError(409,'最多可以建立 50 個排程');
    const title=bounded(body.title,160).trim(),prompt=bounded(body.prompt,12000).trim();if(!title||!prompt)throw new HttpError(400,'請填寫工作名稱與要求');
    const deviceId=bounded(body.deviceId,40),projectId=bounded(body.projectId,40),modelId=bounded(body.modelId,120);
    if(!await database.prepare('SELECT key FROM office_projects WHERE device_id=? AND project_id=?').bind(deviceId,projectId).first())throw new HttpError(400,'請選擇本機已登記的專案');
    if(!await database.prepare('SELECT key FROM office_models WHERE device_id=? AND model_id=?').bind(deviceId,modelId).first())throw new HttpError(400,'請選擇這台執行器目前提供的模型');
    const workflow=bounded(body.workflow,20),role=bounded(body.role,30),roles=workflow==='pipeline'?stages:workflow==='single'?[role]:[];if(!roles.length||roles.some((r:string)=>!stages.includes(r)))throw new HttpError(400,'工作角色不正確');
    const cadence=bounded(body.cadence,20);if(!['daily','weekdays','weekly'].includes(cadence))throw new HttpError(400,'排程頻率不正確');
    const time=bounded(body.time,5),match=time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);if(!match)throw new HttpError(400,'請使用 24 小時制時間');
    const weekday=Number(body.weekday);if(!Number.isInteger(weekday)||weekday<0||weekday>6)throw new HttpError(400,'請選擇每週執行日');
    const timezone='Asia/Taipei',minuteOfDay=Number(match[1])*60+Number(match[2]),nextRunAt=nextScheduleAt({cadence,weekday,minuteOfDay,timezone},now);
    await database.prepare('INSERT INTO office_schedules(id,title,prompt,device_id,project_id,workflow,role,model_id,cadence,weekday,minute_of_day,timezone,active,next_run_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)').bind(id,title,prompt,deviceId,projectId,workflow,workflow==='pipeline'?'development':role,modelId,cadence,weekday,minuteOfDay,timezone,nextRunAt,now,now).run();
    return {id,nextRunAt};
  }
  if(body.op==='schedule.toggle'||body.op==='schedule.delete') {
    const id=bounded(body.id,60),schedule=await database.prepare('SELECT * FROM office_schedules WHERE id=?').bind(id).first<any>();if(!schedule)throw new HttpError(404,'找不到這個排程');
    if(body.op==='schedule.delete'){await database.prepare('DELETE FROM office_schedules WHERE id=?').bind(id).run();return {ok:true};}
    const active=body.active===true?1:body.active===false?0:-1;if(active<0)throw new HttpError(400,'排程狀態不正確');
    const nextRunAt=active&&!schedule.active?nextScheduleAt({cadence:schedule.cadence,weekday:schedule.weekday,minuteOfDay:schedule.minute_of_day,timezone:schedule.timezone},now):schedule.next_run_at;
    await database.prepare('UPDATE office_schedules SET active=?,next_run_at=?,updated_at=? WHERE id=?').bind(active,nextRunAt,now,id).run();return {ok:true,nextRunAt};
  }
  if(body.op==='create') {
    const id=bounded(body.id,60);if(!/^[a-f0-9-]{36}$/.test(id))throw new HttpError(400,'工作識別不正確');
    if(await database.prepare('SELECT id FROM office_tasks WHERE workflow_id=? LIMIT 1').bind(id).first())return {id};
    const title=bounded(body.title,160).trim(),prompt=bounded(body.prompt,12000).trim();if(!title||!prompt)throw new HttpError(400,'請填寫工作名稱與要求');
    const deviceId=bounded(body.deviceId,40),projectId=bounded(body.projectId,40),modelId=bounded(body.modelId,120);
    const project=await database.prepare('SELECT name FROM office_projects WHERE device_id=? AND project_id=?').bind(deviceId,projectId).first();if(!project)throw new HttpError(400,'請選擇本機已登記的專案');
    if(!await database.prepare('SELECT key FROM office_models WHERE device_id=? AND model_id=?').bind(deviceId,modelId).first())throw new HttpError(400,'請選擇這台執行器目前提供的模型');
    const roles=body.workflow==='pipeline'?stages:[body.role];if(roles.some((r:any)=>!stages.includes(r)))throw new HttpError(400,'工作角色不正確');
    await database.batch(roles.map((role:string,i:number)=>database.prepare('INSERT OR IGNORE INTO office_tasks(id,workflow_id,stage,title,prompt,device_id,project_id,role,status,agent_id,model_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${id}-${i}`,id,i,title,prompt,deviceId,projectId,role,i===0?'queued':'waiting',`managed-${id}-${i}`,modelId,now,now)));
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
