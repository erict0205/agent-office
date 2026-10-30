import { createHash } from 'node:crypto';
import { humanName, validCategory } from '../../lib/work-labels.mjs';
import { classifyPrompt, toolWork, taskSummary, mergeWork } from './work.mjs';

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
  const resetWork = ['UserPromptSubmit','BeforeAgent','SessionStart'].includes(event);
  const category = resetWork ? classifyPrompt(raw.prompt) : undefined;
  const work = ['PreToolUse','BeforeTool','PostToolUse','AfterTool','PostToolUseFailure','PermissionRequest'].includes(event) ? toolWork(raw.tool_name,raw.tool_input) : null;
  // Only fixed enums leave this normalizer; original text is never copied.
  return { provider, session, status, observedAt, source: 'hook', client: labels[provider], turn: typeof raw.turn_id === 'string' ? raw.turn_id.slice(0,300) : '', ...(work ?? {}), ...(resetWork ? {resetWork,category,categoryFromPrompt:category!=='general'} : {}) };
}
export function normalizeTranscript(record, meta, previous) {
  if (!meta?.session) return null;
  const type = record.payload?.type;
  const userMessage = record.type === 'response_item' && type === 'message' && record.payload.role === 'user';
  const promptMessage = userMessage || (record.type === 'event_msg' && type === 'user_message');
  const lifecycle = promptMessage ? (previous?.status === 'working' ? 'working' : null) : record.type === 'event_msg' && { task_started: 'working', task_complete: 'done', turn_aborted: 'idle' }[type];
  const work = record.type === 'response_item' && ['function_call','custom_tool_call'].includes(type) ? toolWork(record.payload.name,record.payload.arguments ?? record.payload.input) : null;
  // An isolated tool record cannot make a completed session start again.
  const status = lifecycle || (work && previous?.status === 'working' ? 'working' : null);
  const observedAt = Date.parse(record.timestamp);
  if (!status || !Number.isFinite(observedAt)) return null;
  const resetWork = ['task_started','user_message'].includes(type) || userMessage;
  const localText = userMessage && Array.isArray(record.payload.content) ? record.payload.content.filter(c=>c.type==='input_text'&&typeof c.text==='string').map(c=>c.text.slice(0,12000)).join('\n').slice(0,12000) : record.payload.message;
  const category = type === 'user_message' || userMessage ? classifyPrompt(localText) : undefined;
  const event = { provider: 'codex', session: meta.session, status, observedAt, source: 'transcript', turn: typeof record.payload.turn_id === 'string' ? record.payload.turn_id : previous?.turn ?? '', client: /desktop/i.test(meta.originator ?? '') ? 'Codex App' : /cli|exec/i.test(meta.originator ?? '') || meta.source === 'cli' ? 'Codex CLI' : /vscode/i.test(meta.originator ?? '') || meta.source === 'vscode' ? 'Codex IDE' : 'Codex', ...(work ?? {}), ...(resetWork ? {resetWork,category,categoryFromPrompt:category!==undefined&&category!=='general'} : {}) };
  return { ...event, ...mergeWork(previous,event) };
}
export function toAgent(event, config) {
  const sessionKey = createHash('sha256').update(event.session).digest('hex').slice(0, 12);
  const id = agentId(config.deviceId, event.provider, event.session);
  return {
    id, name: humanName(id), category:validCategory(event.category),
    role: config.deviceName, status: event.status, task: taskSummary(event.status,event.category,event.action),
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
