import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { statusFromNotification, validateUpdate } from "../lib/agent-protocol.mjs";

const { values } = parseArgs({ options: {
  name: { type: "string", default: "Eric" }, id: { type: "string", default: "codex-eric" },
  role: { type: "string", default: "Codex 開發工程師" }, prompt: { type: "string" },
  task: { type: "string" }, cwd: { type: "string" }, "stdin-config": { type: "boolean" },
  check: { type: "boolean" }, "keep-alive": { type: "boolean" }, help: { type: "boolean" },
} });
if (values.help) {
  console.log('npm run agent -- --name Eric --prompt "你的任務" [--cwd /path] [--task 公開任務名稱]\n先設定 OFFICE_URL 與 OFFICE_SITE_TOKEN。--check 只檢查連線，不啟動模型工作。');
  process.exit(0);
}

let config = { url: process.env.OFFICE_URL, token: process.env.OFFICE_SITE_TOKEN };
if (values["stdin-config"]) {
  console.log("Ready for office connection JSON on stdin (input is hidden).");
  process.stdin.setEncoding("utf8");
  const line = await new Promise((res, rej) => {
    let input = "";
    const read = chunk => { input += chunk; if (input.includes("\n")) { process.stdin.off("data", read); process.stdin.pause(); try { res(JSON.parse(input.split("\n")[0])); } catch { rej(new Error("連線設定格式不正確")); } } };
    process.stdin.on("data", read); process.stdin.once("end", () => { if (!input.includes("\n")) rej(new Error("缺少連線設定")); });
  });
  config = { ...config, ...line };
}
if (!config.url) throw new Error("請設定 OFFICE_URL，指向你的工作室網址。");
const origin = new URL(config.url);
const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
if (origin.protocol !== "https:" && !(local && origin.protocol === "http:")) throw new Error("雲端工作室必須使用 HTTPS。");
if (!local && !config.token) throw new Error("私人工作室需要 OFFICE_SITE_TOKEN 服務存取憑證。");
if (!values.check && !values.prompt) throw new Error("請用 --prompt 提供任務，或用 --check 檢查連線。");

const cwd = resolve(values.cwd ?? process.cwd());
let state = validateUpdate({ id: values.id, name: values.name, role: values.role, status: "idle", task: (values.task ?? (values.check ? "本機 Codex 連線檢查" : "處理本機任務（內容保留在本機）")).slice(0, 240) });
let queue = Promise.resolve(); let stopped = false; let child; let heartbeat;
let nextId = 1; const pending = new Map(); let turnFinishedResolve;
const turnFinished = new Promise(resolve => { turnFinishedResolve = resolve; });

function publish(status = state.status) {
  state = { ...state, status }; const snapshot = { ...state };
  const operation = queue.catch(() => {}).then(async () => {
    const headers = { "Content-Type": "application/json" };
    if (config.token) headers["OAI-Sites-Authorization"] = `Bearer ${config.token}`;
    const response = await fetch(new URL("/api/office", origin), { method: "POST", headers, body: JSON.stringify(snapshot), redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`工作室同步失敗（HTTP ${response.status}），請確認網址與憑證。`);
    const result = await response.json(); if (result.ok !== true) throw new Error("工作室沒有確認狀態更新。");
  });
  queue = operation; return operation;
}
function send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); }
function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex 回應逾時：${method}`)); }, 30_000);
    pending.set(id, { resolve, reject, timer }); send({ id, method, params });
  });
}
async function shutdown(code, status = "offline") {
  if (stopped) return; stopped = true; clearInterval(heartbeat);
  child?.kill("SIGTERM");
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error("Codex 連線結束")); } pending.clear();
  try { await publish(status); } catch { console.error("最後狀態未送達，工作室會在心跳逾時後顯示離線。"); }
  process.exit(code);
}
process.once("SIGINT", () => shutdown(0)); process.once("SIGTERM", () => shutdown(0));

try {
  await publish();
  const childEnv = { ...process.env }; delete childEnv.OFFICE_SITE_TOKEN; delete childEnv.OFFICE_URL;
  child = spawn("codex", ["app-server", "--listen", "stdio://"], { cwd, env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
  child.once("error", () => { console.error("無法啟動 Codex，請確認 Codex CLI 已安裝。"); shutdown(1, "error"); });
  // Never copy the server's diagnostic output or model content to the hosted Site.
  child.stderr.on("data", () => {});
  const lines = createInterface({ input: child.stdout });
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  let approvalQueue = Promise.resolve();
  lines.on("line", line => {
    let message; try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && !message.method) {
      const request = pending.get(message.id);
      if (request) { pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message ?? "Codex 請求失敗")) : request.resolve(message.result); }
      return;
    }
    const status = statusFromNotification(message);
    if (status) publish(status).catch(e => console.error(e.message));
    if (message.method === "item/agentMessage/delta") process.stdout.write(message.params?.delta ?? "");
    if (message.method === "turn/completed") turnFinishedResolve(message.params.turn);
    if (message.id !== undefined && message.method) {
      approvalQueue = approvalQueue.then(async () => {
        if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(message.method)) {
          console.log(`\nCodex 需要確認：${message.params?.command ?? message.params?.reason ?? message.method}`);
          let approved = false;
          if (process.stdin.isTTY && !values["stdin-config"]) approved = await new Promise(resolve => terminal.question("允許這一次操作？輸入 yes，其餘拒絕：", answer => resolve(answer === "yes")));
          else console.log("目前沒有互動終端，已拒絕此操作。請在終端機重新啟動以自行確認。");
          send({ id: message.id, result: { decision: approved ? "accept" : "decline" } });
        } else if (message.method === "item/permissions/requestApproval") send({ id: message.id, result: { permissions: {}, scope: "turn" } });
        else send({ id: message.id, error: { code: -32601, message: "這個連線程式尚未支援此互動請求。" } });
        await publish("working").catch(e => console.error(e.message));
      }).catch(() => shutdown(1, "error"));
    }
  });
  child.once("exit", () => { if (!stopped) { console.error("Codex 連線已結束。"); shutdown(1, "error"); } });
  await rpc("initialize", { clientInfo: { name: "eric_agent_office", title: "Eric’s Agent Office", version: "0.1.0" } });
  send({ method: "initialized", params: {} });
  const account = await rpc("account/read", { refreshToken: false });
  if (!account.account) throw new Error("Codex 尚未登入，請先在終端機執行 codex login。");
  console.log("Codex 已連線，工作室狀態同步正常。");
  heartbeat = setInterval(() => publish().catch(e => console.error(e.message)), 15_000);
  if (values.check) {
    if (values["keep-alive"]) await new Promise(() => {});
    await shutdown(0);
  } else {
    // Default to read-only. Users may run the Codex CLI for broader work; do not
    // silently elevate an agent launched from a visualization tool.
    const started = await rpc("thread/start", { cwd, sandbox: "read-only", approvalPolicy: "on-request" });
    await rpc("turn/start", { threadId: started.thread.id, input: [{ type: "text", text: values.prompt }] });
    const result = await turnFinished;
    console.log(`\nCodex 任務結束：${result.status}`);
    if (values["keep-alive"]) { console.log("維持連線中，按 Control+C 離開。"); await new Promise(() => {}); }
    await shutdown(result.status === "completed" ? 0 : 1, result.status === "completed" ? "done" : result.status === "interrupted" ? "idle" : "error");
  }
} catch (error) { console.error(error instanceof Error ? error.message : "連線失敗"); await shutdown(1, "error"); }
