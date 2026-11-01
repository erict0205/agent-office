import { categoryLabel, validCategory } from './work-labels.mjs';

export function ownerIdentity(user, pinnedId, bootstrapEmail) {
  if (!user?.userId || !user?.email) return false;
  return pinnedId ? user.userId === pinnedId : Boolean(bootstrapEmail && user.email.toLowerCase() === bootstrapEmail.toLowerCase());
}
export function publicAgent(a) {
  const category=validCategory(a.category);
  const task={working:`正在處理${categoryLabel(category)}`,blocked:'等待擁有者確認下一個步驟',error:'工作遇到問題，需要協助',done:'本輪工作已結束',idle:'等待下一個任務',offline:'工作階段已離線',unknown:'等待最新工作狀態'}[a.status]??'等待最新工作狀態';
  return {id:a.id,name:a.name,role:'工作室夥伴',status:a.status,reportedStatus:a.reportedStatus,task,category,seenAt:a.seenAt,stateAt:a.stateAt,color:a.color,attendance:a.attendance,provider:['codex','claude','gemini'].includes(a.provider)?a.provider:'legacy',client:{codex:'Codex',claude:'Claude Code',gemini:'Gemini CLI'}[a.provider]??'Agent',mode:a.mode??(String(a.id).startsWith('managed-')?'managed':'observed')};
}
export function publicEvent(e) {return {id:e.id,agentId:e.agentId,name:e.name,status:e.status,task:publicAgent(e).task,category:validCategory(e.category),at:e.at};}
