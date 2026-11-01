import { env } from 'cloudflare:workers';
import { agentStatements, cleanupStatements, readBoundedJson, errorResponse, HttpError, requireOfficeWriter } from '@/lib/server-office';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    await requireOfficeWriter(request);
    if (!env.DB) throw new HttpError(503,'狀態儲存尚未設定');
    const raw=await readBoundedJson(request,65536), d=raw?.device;
    if (!d || typeof d.id!=='string' || !/^[a-z0-9_-]{1,40}$/.test(d.id) || typeof d.name!=='string' || !d.name.trim() || d.name.length>40 || !['win32','darwin','linux'].includes(d.platform) || !Array.isArray(d.tools) || d.tools.length>3 || d.tools.some((t:unknown)=>!['codex','claude','gemini'].includes(String(t)))) throw new HttpError(400,'裝置格式不正確');
    if (!Array.isArray(raw.agents) || raw.agents.length>20) throw new HttpError(400,'每次最多 20 筆狀態');
    const now=Date.now();
    const statements: D1PreparedStatement[]=[env.DB.prepare('INSERT INTO devices (id,name,platform,tools,seen_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,platform=excluded.platform,tools=excluded.tools,seen_at=excluded.seen_at').bind(d.id,d.name.trim(),d.platform,JSON.stringify(d.tools),now)];
    for(const a of raw.agents) {
      if (!a || typeof a !== 'object' || a.deviceId!==d.id || a.deviceName!==d.name.trim() || !d.tools.includes(a.provider)) throw new HttpError(400,'狀態與裝置不一致');
      statements.push(...agentStatements(a,now));
    }
    await env.DB.batch([...statements,...cleanupStatements()]);
    return Response.json({ok:true,at:now,accepted:raw.agents.length},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return errorResponse(error); }
}
