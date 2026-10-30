export const statusValues = ["working", "idle", "blocked", "done", "error", "offline"];
export const OFFLINE_AFTER_MS = 45_000;

export function validateUpdate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("請提供員工資料");
  if (typeof body.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(body.id)) throw new Error("員工 ID 格式不正確");
  for (const [key, limit] of [["name", 40], ["role", 60], ["task", 240]]) {
    if (typeof body[key] !== "string" || body[key].length > limit || (key !== "task" && !body[key].trim())) throw new Error(`${key} 格式不正確`);
  }
  if (!statusValues.includes(body.status)) throw new Error("員工狀態不正確");
  return { id: body.id, name: body.name.trim(), role: body.role.trim(), status: body.status, task: body.task.trim() };
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
