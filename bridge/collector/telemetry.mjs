import { createHash } from 'node:crypto';
import { agentId } from './events.mjs';

export function redact(text,max=7000) {
  return String(text??'').replace(/\x1b\[[0-9;]*[a-zA-Z]/g,'').replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g,'[REDACTED]').replace(/((?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|token|OFFICE_[A-Z_]*(?:TOKEN|KEY))["']?\s*[=:]\s*["']?)(?:Bearer\s+)?[^\s,;"'}]+/gi,'$1[REDACTED]').replace(/(https?:\/\/)[^@\s:/]+:[^@\s/]+@/g,'$1[REDACTED]@').slice(0,max);
}
export function privateRecord(record,meta,deviceId,calls=new Map()) {
  const p=record.payload,at=Date.parse(record.timestamp);if(!p||!Number.isFinite(at))return null;
  let kind,label,detail;
  if(record.type==='event_msg'&&p.type==='user_message'){kind='task';label='收到工作要求';detail=p.message;}
  else if(record.type==='event_msg'&&p.type==='task_complete'){kind='result';label='本輪回答';detail=p.last_agent_message;}
  else if(record.type==='response_item'&&['function_call','custom_tool_call'].includes(p.type)){
    kind='tool';label=`工具：${String(p.name).slice(0,100)}`;detail=p.arguments??p.input;calls.set(p.call_id,p.name);if(calls.size>128)calls.delete(calls.keys().next().value);
  }else if(record.type==='response_item'&&['function_call_output','custom_tool_call_output'].includes(p.type)){
    kind='output';label=`工具輸出：${calls.get(p.call_id)??'工具'}`;detail=typeof p.output==='string'?p.output:JSON.stringify(p.output);
  }else return null;
  if(typeof detail!=='string'||!detail)return null;
  return {id:createHash('sha256').update(JSON.stringify([meta.session,at,p])).digest('hex'),agentId:agentId(deviceId,'codex',meta.session),kind,label,detail:redact(detail),at};
}
