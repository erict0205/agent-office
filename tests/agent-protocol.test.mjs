import test from "node:test";
import assert from "node:assert/strict";
import { statusFromNotification, validateUpdate, visibleStatus } from "../lib/agent-protocol.mjs";

test("completion, failure and interruption stay distinct", () => {
  for (const [input, expected] of [["completed", "done"], ["failed", "error"], ["interrupted", "idle"]]) assert.equal(statusFromNotification({ method: "turn/completed", params: { turn: { status: input } } }), expected);
  assert.equal(statusFromNotification({ method: "turn/started" }), "working");
  assert.equal(statusFromNotification({ method: "item/commandExecution/requestApproval", id: 7 }), "blocked");
  assert.equal(statusFromNotification({ method: "item/agentMessage/delta", params: { delta: "secret content" } }), null);
});
test("heartbeat expiry becomes offline using server time", () => {
  assert.equal(visibleStatus("working", 10_000, 55_000), "working");
  assert.equal(visibleStatus("working", 10_000, 55_001), "offline");
});
test("updates whitelist fields and reject invalid or oversized payloads", () => {
  const body = { id: "codex-eric", name: " Eric ", role: "開發", status: "working", task: "摘要", token: "never stored" };
  const result = validateUpdate(body);
  assert.equal(result.name, "Eric"); assert.equal("token" in result, false);
  for (const override of [{ id: "../../secret" }, { name: "" }, { status: "made-up" }, { task: "x".repeat(241) }]) assert.throws(() => validateUpdate({ ...body, ...override }));
});
