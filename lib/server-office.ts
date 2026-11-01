import { env } from 'cloudflare:workers';
import { validateUpdate } from './agent-protocol.mjs';
import { validWriteToken } from './write-auth.mjs';

export async function requireOfficeWriter(request: Request) {
  if(!env.OFFICE_INGEST_TOKEN_SHA256)throw new HttpError(503,'狀態更新憑證尚未設定');
  if(!await validWriteToken(request.headers.get('X-Office-Token'),env.OFFICE_INGEST_TOKEN_SHA256))throw new HttpError(401,'需要有效的收集器更新憑證');
}

export async function readBoundedJson(request: Request, limit: number) {
  if (request.headers.has('origin') || request.headers.has('sec-fetch-site')) throw new HttpError(403, '請由本機連線程式更新狀態');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, '需要 JSON');
  const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, '沒有資料');
  const decoder = new TextDecoder(); let bytes = 0, input = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.byteLength; if (bytes > limit) { await reader.cancel(); throw new HttpError(413, '資料太大'); }
    input += decoder.decode(value, { stream:true });
  }
  input += decoder.decode();
  try { return JSON.parse(input); } catch { throw new HttpError(400, 'JSON 格式不正確'); }
}
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error:error.message },{status:error.status});
  return Response.json({error:'狀態同步暫時無法完成，請稍後重試'},{status:500});
}
export function agentStatements(body: unknown, now: number): D1PreparedStatement[] {
  if (!env.DB) throw new HttpError(503,'狀態儲存尚未設定');
  let a; try { a=validateUpdate(body); } catch(error) { throw new HttpError(400,error instanceof Error?error.message:'資料不正確'); }
  return [
    env.DB.prepare('INSERT INTO events (agent_id,name,status,task,at,device_name,provider,category) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM agents WHERE id=? AND (state_at>? OR (status=? AND task=? AND category=?)))').bind(a.id,a.name,a.status,a.task,a.stateAt,a.deviceName,a.provider,a.category,a.id,a.stateAt,a.status,a.task,a.category),
    env.DB.prepare('INSERT INTO agents (id,name,role,status,task,seen_at,device_id,device_name,provider,client,session_key,source,state_at,category) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,status=excluded.status,task=excluded.task,seen_at=excluded.seen_at,device_id=excluded.device_id,device_name=excluded.device_name,provider=excluded.provider,client=excluded.client,session_key=excluded.session_key,source=excluded.source,state_at=excluded.state_at,category=excluded.category WHERE excluded.state_at>=agents.state_at').bind(a.id,a.name,a.role,a.status,a.task,now,a.deviceId,a.deviceName,a.provider,a.client,a.sessionKey,a.source,a.stateAt,a.category),
  ];
}
export function cleanupStatements(): D1PreparedStatement[] {
  if (!env.DB) return [];
  return [env.DB.prepare('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 200)')];
}
