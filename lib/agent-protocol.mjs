export const statusValues = ["working", "idle", "blocked", "done", "error", "offline", "unknown"];
export const OFFLINE_AFTER_MS = 45_000;
import { workCategories } from './work-labels.mjs';

export function validateUpdate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("請提供員工資料");
  if (typeof body.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.id)) throw new Error("員工 ID 格式不正確");
  for (const [key, limit] of [["name", 40], ["role", 60], ["task", 240]]) {
    if (typeof body[key] !== "string" || body[key].length > limit || (key !== "task" && !body[key].trim())) throw new Error(`${key} 格式不正確`);
  }
  if (!statusValues.includes(body.status)) throw new Error("員工狀態不正確");
  const category = body.category ?? 'general';
  if (typeof category !== 'string' || !Object.hasOwn(workCategories,category)) throw new Error('工作分類不正確');
  const extra = {};
  for (const [key, limit, fallback] of [["deviceId", 40, "legacy"], ["deviceName", 40, "手動連線"], ["provider", 16, "legacy"], ["client", 40, "Codex CLI"], ["sessionKey", 40, ""], ["source", 16, "runner"]]) {
    const value = body[key] ?? fallback;
    if (typeof value !== "string" || value.length > limit) throw new Error(`${key} 格式不正確`);
    extra[key] = value;
  }
  if (!/^[a-z0-9_-]{1,40}$/.test(extra.deviceId) || !["codex","claude","gemini","legacy"].includes(extra.provider) || !["hook","transcript","runner"].includes(extra.source)) throw new Error("來源格式不正確");
  const stateAt = body.stateAt ?? Date.now();
  if (!Number.isSafeInteger(stateAt) || stateAt < 0 || stateAt > Date.now() + 300_000) throw new Error("狀態時間不正確");
  return { id: body.id, name: body.name.trim(), role: body.role.trim(), status: body.status, task: body.task.trim(), category, deviceId: extra.deviceId, deviceName: extra.deviceName, provider: extra.provider, client: extra.client, sessionKey: extra.sessionKey, source: extra.source, stateAt };
}

export function visibleStatus(status, seenAt, now = Date.now()) {
  return now - seenAt > OFFLINE_AFTER_MS ? "offline" : status;
}

export function statusFromNotification(message) {
  if (message.method === "turn/started") return "working";
  if (message.method === "turn/completed") {
    const status = message.params?.turn?.status;
    return status === "completed" ? "done" : status === "interrupted" ? "idle" : "error";
  }
  if (message.id !== undefined && message.method) return "blocked";
  return null;
}
