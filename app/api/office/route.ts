import { env } from 'cloudflare:workers';
import { Agent, Activity, colors } from '@/lib/office-types';
import { visibleStatus } from '@/lib/agent-protocol.mjs';
import { agentStatements, cleanupStatements, readBoundedJson, errorResponse } from '@/lib/server-office';
import { humanName } from '@/lib/work-labels.mjs';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control':'no-store' };
// Every route stays behind Sites' existing owner-private browser/service gate.
export async function GET() {
  if (!env.DB) return Response.json({error:'狀態儲存尚未設定'},{status:503,headers:noStore});
  try {
    const now=Date.now();
    const [agents,events,devices] = await env.DB.batch([
      env.DB.prepare('SELECT id,name,role,status,task,category,seen_at AS seenAt,device_id AS deviceId,device_name AS deviceName,provider,client,session_key AS sessionKey,source,state_at AS stateAt FROM agents ORDER BY CASE WHEN seen_at<? THEN 2 WHEN status IN (\'working\',\'blocked\') THEN 0 ELSE 1 END,seen_at DESC,id LIMIT 200').bind(now-45_000),
      env.DB.prepare('SELECT id,agent_id AS agentId,name,status,task,category,at,device_name AS deviceName,provider FROM events ORDER BY at DESC,id DESC LIMIT 200'),
      env.DB.prepare('SELECT id,name,platform,tools,seen_at AS seenAt FROM devices ORDER BY name LIMIT 32'),
    ]);
    return Response.json({ agents:(agents.results as Omit<Agent,'color'>[]).map(a=>({...a,name:a.provider!=='legacy'?humanName(a.id):a.name,status:visibleStatus(a.status,a.seenAt,now),color:colors[[...a.id].reduce((sum,c)=>sum+c.charCodeAt(0),0)%colors.length]})),events:(events.results as (Activity & {agentId:string})[]).map(e=>({...e,name:e.provider!=='legacy'?humanName(e.agentId):e.name})),devices:(devices.results as {seenAt:number}[]).map(d=>({...d,connected:now-d.seenAt<=45_000})),at:now },{headers:noStore});
  } catch(error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    if (!env.DB) return Response.json({error:'狀態儲存尚未設定'},{status:503});
    const raw=await readBoundedJson(request,4096); const now=Date.now();
    await env.DB.batch([...agentStatements(raw,now),...cleanupStatements()]);
    return Response.json({ok:true,at:now},{headers:noStore});
  } catch(error) { return errorResponse(error); }
}
