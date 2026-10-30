import assert from "node:assert/strict";

const base = new URL(process.env.OFFICE_TEST_URL ?? "http://127.0.0.1:5173");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) throw new Error("HTTP 測試只可使用本機資料庫。");
const url = new URL("/api/office", base);
const send = (body, headers = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const a = { id: "office-http-test", name: "連線測試", role: "測試員工", status: "working", task: `本機驗證 ${Date.now()}` };
assert.equal((await send(a)).status, 200);
assert.equal((await send(a)).status, 200);
const data = await (await fetch(url)).json();
const saved = data.agents.find(row => row.id === a.id);
assert.equal(saved.status, "working"); assert.ok(saved.seenAt > 0);
assert.equal(data.events.filter(row => row.name === a.name && row.task === a.task).length, 1, "相同心跳不重複建立動態");
assert.equal((await send({ ...a, status: "invalid" })).status, 400);
assert.equal((await send({ ...a, task: "x".repeat(5000) })).status, 413);
assert.equal((await send(a, { Origin: base.origin })).status, 403);
assert.equal((await send({ ...a, status: "offline" })).status, 200);
console.log("HTTP 驗證通過：狀態讀寫、心跳去重、格式檢查、大小限制、瀏覽器寫入限制。");
