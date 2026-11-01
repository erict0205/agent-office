import { publicAgent,publicEvent } from '@/lib/office-access.mjs';
import { env } from 'cloudflare:workers';
import { Agent, Activity, colors } from '@/lib/office-types';
import { visibleStatus } from '@/lib/agent-protocol.mjs';
import { agentStatements, cleanupStatements, readBoundedJson, errorResponse, requireOfficeWriter } from '@/lib/server-office';
import { humanName } from '@/lib/work-labels.mjs';
import { attendanceFor } from '@/lib/office-attendance.mjs';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control':'no-store' };
// Public reads; every update independently authenticates the collector.
export async function GET() {
  if (!env.DB) return Response.json({error:'狀態儲存尚未設定'},{status:503,headers:noStore});
  try {
    const now=Date.now();
    const [agents,events,devices] = await env.DB.batch([
      env.DB.prepare('SELECT id,name,role,status,task,category,seen_at AS seenAt,device_id AS deviceId,device_name AS deviceName,provider,client,session_key AS sessionKey,source,state_at AS stateAt FROM agents ORDER BY CASE WHEN seen_at<? THEN 2 WHEN status IN (\'working\',\'blocked\') THEN 0 ELSE 1 END,seen_at DESC,id LIMIT 200').bind(now-45_000),
      env.DB.prepare('SELECT id,agent_id AS agentId,name,status,task,category,at,device_name AS deviceName,provider FROM events ORDER BY at DESC,id DESC LIMIT 200'),
      env.DB.prepare('SELECT id,name,platform,tools,seen_at AS seenAt FROM devices ORDER BY name LIMIT 32'),
    ]);
    return Response.json({ agents:(agents.results as Omit<Agent,'color'>[]).map(a=>{
      const agent={...a,name:a.provider!=='legacy'?humanName(a.id):a.name,reportedStatus:a.status,status:visibleStatus(a.status,a.seenAt,now),color:colors[[...a.id].reduce((sum,c)=>sum+c.charCodeAt(0),0)%colors.length]};
      return publicAgent({...agent,attendance:attendanceFor(agent,now)});
    }),events:(events.results as (Activity & {agentId:string})[]).map(e=>publicEvent({...e,name:e.provider!=='legacy'?humanName(e.agentId):e.name})),devices:[],connectedDevices:(devices.results as {seenAt:number}[]).filter(d=>now-d.seenAt<=45_000).length,at:now },{headers:noStore});
  } catch(error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    await requireOfficeWriter(request);
    if (!env.DB) return Response.json({error:'狀態儲存尚未設定'},{status:503});
    const raw=await readBoundedJson(request,4096); const now=Date.now();
    await env.DB.batch([...agentStatements(raw,now),...cleanupStatements()]);
    return Response.json({ok:true,at:now},{headers:noStore});
  } catch(error) { return errorResponse(error); }
}
