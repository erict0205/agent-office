import { categoryLabel } from './work-labels.mjs';

// These are local character lines, never messages from the underlying model.
export function characterReply(agent, action = 'greet', life, now = Date.now(), variant = 0) {
  if (agent.attendance && !agent.attendance.present) return {text:'我下班囉，下次開工再見！',gesture:'wave'};
  if (agent.status === 'offline' || agent.status === 'unknown') return {text:'還沒收到最新工作狀態，先跟你打個招呼！',gesture:'wave'};
  const busy = ['working','blocked','error'].includes(agent.status);
  const text = action === 'coffee' ? busy ? '謝謝咖啡！等手邊這輪完成，再好好休息。' : '咖啡收到！一起充個電吧 ☕' :
    action === 'cheer' ? busy ? '收到你的打氣，我會繼續專心！' : '謝謝你！休息一下，下一輪繼續加油。' :
    action === 'status' ? agent.status === 'blocked' ? '目前正在等待確認，工作狀態以清單回報為準。' : agent.status === 'error' ? '目前遇到問題，需要回原本的工具查看。' : busy ? `我正在處理${categoryLabel(agent.category)}，先讓我專心一下。` :
      agent.attendance?.phase === 'cooldown' ? `工作告一段落，再休息約 ${Math.max(1,Math.ceil((agent.attendance.clockOutAt-now)/60000))} 分鐘就下班。` : `目前在${life?.label ?? '休息區'}，準備迎接下一個任務。` :
    busy ? ['嗨！我正在忙，先跟你揮個手～','看到你了！這輪工作結束再聊。'][variant % 2] : ['嗨，今天也一起好好工作、好好休息！','歡迎來找我！要不要一起喝杯咖啡？'][variant % 2];
  return {text,gesture:action === 'coffee' ? 'coffee' : 'wave'};
}

export function deskDisplayMode(agent, life) {
  if (!agent || agent.attendance?.present === false || agent.status === 'offline') return 'off';
  return life?.moving || life?.zone !== 'work' || !['working','blocked','error'].includes(agent.status) ? 'saver' : 'work';
}
