import { createHash } from 'node:crypto';

export const PROVIDERS = ['codex', 'claude', 'gemini'];
const labels = { codex: 'Codex', claude: 'Claude Code', gemini: 'Gemini CLI' };
export function agentId(deviceId, provider, sessionId) {
  return 's-' + createHash('sha256').update(JSON.stringify([deviceId, provider, sessionId])).digest('hex').slice(0, 40);
}
export function normalizeHook(provider, raw, observedAt = Date.now()) {
  if (!PROVIDERS.includes(provider) || !raw || typeof raw !== 'object') return null;
  const session = raw.session_id;
  if (typeof session !== 'string' || !session || session.length > 300) return null;
  const event = raw.hook_event_name;
  let status;
  if (['SessionStart'].includes(event)) status = 'idle';
  if (['UserPromptSubmit', 'BeforeAgent', 'PreToolUse', 'BeforeTool', 'PostToolUse', 'AfterTool', 'PostToolUseFailure'].includes(event)) status = 'working';
  if (event === 'PermissionRequest') status = 'blocked';
  if (event === 'Notification' && ['permission_prompt', 'ToolPermission', 'elicitation_dialog', 'elicitation_url_dialog'].includes(raw.notification_type)) status = 'blocked';
  if (['Stop', 'AfterAgent'].includes(event)) status = 'done';
  if (event === 'Interrupt') status = 'idle';
  if (event === 'SessionEnd') status = 'offline';
  if (!status) return null;
  // Project paths, prompts, tool inputs, responses and account data are never copied.
  return { provider, session, status, observedAt, source: 'hook', client: labels[provider], turn: typeof raw.turn_id === 'string' ? raw.turn_id.slice(0,300) : '' };
}
export function normalizeTranscript(record, meta) {
  if (record?.type !== 'event_msg' || !meta?.session) return null;
  const type = record.payload?.type;
  const status = { task_started: 'working', task_complete: 'done', turn_aborted: 'idle' }[type];
  const observedAt = Date.parse(record.timestamp);
  if (!status || !Number.isFinite(observedAt)) return null;
  return { provider: 'codex', session: meta.session, status, observedAt, source: 'transcript', turn: typeof record.payload.turn_id === 'string' ? record.payload.turn_id : '', client: /desktop/i.test(meta.originator ?? '') ? 'Codex App' : 'Codex CLI' };
}
export function toAgent(event, config) {
  const sessionKey = createHash('sha256').update(event.session).digest('hex').slice(0, 12);
  const messages = { working: '正在處理本機工作', idle: '等待下一個任務', blocked: '等待你在原工具中確認', done: '本輪工作已結束', offline: '工作階段已結束', unknown: '工作紀錄暫無更新，無法確認目前狀態' };
  return {
    id: agentId(config.deviceId, event.provider, event.session),
    name: `${labels[event.provider]} · ${sessionKey.slice(0, 4)}`,
    role: config.deviceName, status: event.status, task: messages[event.status] ?? '狀態待確認',
    deviceId: config.deviceId, deviceName: config.deviceName, provider: event.provider,
    client: event.client, sessionKey, source: event.source, stateAt: event.observedAt,
  };
}
export function acceptEvent(previous, incoming) {
  if (!previous) return true;
  if (previous.source === 'hook' && incoming.source === 'transcript' && incoming.status === 'working' && ['blocked','done','offline'].includes(previous.status) && !(incoming.turn && previous.turn && incoming.turn !== previous.turn)) return false;
  if (incoming.observedAt < previous.observedAt) return false;
  if (incoming.observedAt === previous.observedAt && previous.source === 'hook' && incoming.source !== 'hook') return false;
  return true;
}
