import { env } from "cloudflare:workers";
import { Agent, colors } from "@/lib/office-types";
import { validateUpdate, visibleStatus } from "@/lib/agent-protocol.mjs";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

// The shared office relies on Sites' owner-private gate for browser and service access.
export async function GET() {
  if (!env.DB) return Response.json({ error: "狀態儲存尚未設定" }, { status: 503, headers: noStore });
  const [agents, events] = await env.DB.batch([
    env.DB.prepare("SELECT id, name, role, status, task, seen_at AS seenAt FROM agents ORDER BY id LIMIT 8"),
    env.DB.prepare("SELECT id, name, status, task, at FROM events ORDER BY id DESC LIMIT 30"),
  ]);
  return Response.json({
    agents: (agents.results as Omit<Agent, "color">[]).map((a, i) => ({ ...a, status: visibleStatus(a.status, a.seenAt), color: colors[i % colors.length] })),
    events: events.results, at: Date.now(),
  }, { headers: noStore });
}

export async function POST(request: Request) {
  if (request.headers.has("origin") || request.headers.get("sec-fetch-site")) return Response.json({ error: "請由本機連線程式更新狀態" }, { status: 403 });
  if (!env.DB) return Response.json({ error: "狀態儲存尚未設定" }, { status: 503 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "需要 JSON" }, { status: 415 });
  const reader = request.body?.getReader();
  let raw = "";
  if (!reader) return Response.json({ error: "沒有員工資料" }, { status: 400 });
  const decoder = new TextDecoder();
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) { await reader.cancel(); return Response.json({ error: "資料太大" }, { status: 413 }); }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  let a;
  try { a = validateUpdate(JSON.parse(raw)); } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "資料不正確" }, { status: 400 }); }
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO events (agent_id,name,status,task,at) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM agents WHERE id=? AND status=? AND task=?)").bind(a.id, a.name, a.status, a.task, now, a.id, a.status, a.task),
    env.DB.prepare("INSERT INTO agents (id,name,role,status,task,seen_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,status=excluded.status,task=excluded.task,seen_at=excluded.seen_at").bind(a.id, a.name, a.role, a.status, a.task, now),
    env.DB.prepare("DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 100)"),
  ]);
  return Response.json({ ok: true, at: now }, { headers: noStore });
}
