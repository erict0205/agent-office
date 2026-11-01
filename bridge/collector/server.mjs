import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { agentId, acceptEvent, toAgent, PROVIDERS } from './events.mjs';
import { mergeWork } from './work.mjs';
import { deriveWriteToken } from './write-auth.mjs';

function equal(a, b) { const aa = Buffer.from(a ?? ''), bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb); }
export function createCollector(config, { token, writeToken = token ? deriveWriteToken(token) : '', fetcher = fetch, now = Date.now, onSync = () => {} } = {}) {
  const details=new Map();
  const sessions = new Map(); let timer, flushing = false, dirty = false, closed = false;
  let lastSync = 0, lastError = '', lastAttempt = 0;
  function record(event) {
    if (!event || !PROVIDERS.includes(event.provider) || typeof event.session !== 'string' || !event.session || event.session.length > 300 || !['working','idle','blocked','done','offline','unknown'].includes(event.status) || !['hook','transcript'].includes(event.source) || !Number.isFinite(event.observedAt) || event.observedAt > now() + 60_000 || event.observedAt < now() - 3 * 86_400_000) return false;
    if (!config.tools.includes(event.provider)) return false;
    const id = agentId(config.deviceId, event.provider, event.session), previous = sessions.get(id);
    if (!acceptEvent(previous, event)) return false;
    const work = mergeWork(previous,event);
    if (previous?.observedAt === event.observedAt && previous.status === event.status && previous.source === event.source && previous.category === work.category && previous.action === work.action) return true;
    if (!previous && sessions.size >= 64) {
      const removable = [...sessions.entries()].filter(([, v]) => !['working','blocked'].includes(v.status)).sort((a,b) => a[1].observedAt-b[1].observedAt)[0];
      if (!removable) return false; sessions.delete(removable[0]);
    }
    // Strip everything except normalized observation fields, including local secrets.
    sessions.set(id, { provider: event.provider, session: event.session, status: event.status, observedAt: event.observedAt, source: event.source, turn: typeof event.turn === 'string' ? event.turn.slice(0,300) : previous?.turn ?? '', client: String(event.client ?? event.provider).slice(0,40), ...work });
    dirty = true; clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), 250); return true;
  }
  async function flush() {
    if (closed || flushing) return; flushing = true; dirty = false; lastAttempt = now();
    try {
      for (const [id, event] of sessions) if (event.observedAt < now() - 86_400_000) sessions.delete(id);
      const agents = [...sessions.values()].map(e => toAgent(e, config));
      const headers = { 'Content-Type': 'application/json' };
      if(writeToken)headers['X-Office-Token']=writeToken;
      if (token) headers['OAI-Sites-Authorization'] = `Bearer ${token}`;
      for (let i = 0; i < Math.max(1, agents.length); i += 20) {
        const response = await fetcher(new URL('/api/ingest', config.url), { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(8000), body: JSON.stringify({ device: { id: config.deviceId, name: config.deviceName, platform: config.platform, tools: config.tools }, agents: agents.slice(i,i+20) }) });
        if (!response.ok || (await response.json()).ok !== true) throw new Error(`HTTP ${response.status}`);
      }
      if(details.size){const batch=[...details.values()].sort((a,b)=>b.at-a.at).slice(0,6);while(JSON.stringify({events:batch}).length>58000&&batch.length>1)batch.pop();const result=await fetcher(new URL('/api/telemetry',config.url),{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(8000),body:JSON.stringify({events:batch})});if(!result.ok)throw new Error('private sync failed');for(const event of batch)details.delete(event.id);}
      lastSync = now(); lastError = ''; onSync({ lastSync, count: agents.length });
    } catch { lastError = '無法同步工作室，將於下次心跳重試'; dirty = true; }
    finally { flushing = false; }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
    const finish = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.headers.origin || req.headers['sec-fetch-site']) return finish(403, { error: 'Local hooks only' });
    if (!equal(req.headers.authorization, `Bearer ${config.localKey}`)) return finish(401,{error:'Unauthorized'});
    if (req.method === 'GET' && req.url === '/health') return finish(200,{ ok:true, deviceId:config.deviceId, sessions:sessions.size, lastSync, lastAttempt, lastError });
    if (req.method !== 'POST' || req.url !== '/events') return finish(404,{error:'Not found'});
    const parts = []; let bytes = 0;
    try {
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 8192) return finish(413,{error:'Too large'}); parts.push(chunk); }
      const event = JSON.parse(Buffer.concat(parts).toString('utf8')); if (!record(event)) return finish(400,{error:'Invalid observation'});
      finish(202,{ok:true});
    } catch { if (!res.headersSent) finish(400,{error:'Invalid JSON'}); }
  });
  return {
    server, record, detail:(event)=>{details.set(event.id,event);if(details.size>256){const oldest=[...details.values()].sort((a,b)=>a.at-b.at)[0];details.delete(oldest.id);}}, flush, health: () => ({ count:sessions.size, lastSync, lastError }),
    start: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port,'127.0.0.1',resolve); }),
    stop: async () => { closed = true; clearTimeout(timer); await new Promise(resolve => server.close(resolve)); },
  };
}
