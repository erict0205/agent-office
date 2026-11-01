import { db,bounded } from './server-control';
import { HttpError } from './server-office';
export function telemetryStatements(events:any[],taskId:string|null=null,agentId:string|null=null) {
  if(!Array.isArray(events)||events.length>16)throw new HttpError(400,'每次最多 16 筆活動');
  const database=db(),now=Date.now();
  return events.map(e=>{
    const id=bounded(e.id,120),agent=agentId??bounded(e.agentId,100),kind=bounded(e.kind,40),label=bounded(e.label,160),detail=bounded(e.detail,8000);
    if(!Number.isSafeInteger(e.at)||e.at>now+300000||e.at<now-7*86400000)throw new HttpError(400,'活動時間不正確');
    return database.prepare('INSERT INTO private_events(id,agent_id,task_id,kind,label,detail,at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,detail=excluded.detail,at=excluded.at WHERE excluded.agent_id=private_events.agent_id AND excluded.at>=private_events.at').bind(id,agent,taskId,kind,label,detail,e.at);
  });
}
export function trimTelemetry(){return db().prepare('DELETE FROM private_events WHERE id IN (SELECT id FROM private_events ORDER BY at DESC LIMIT -1 OFFSET 3000)');}
