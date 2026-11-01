// Attendance is a local presentation rule. It never starts agents or model calls.
export const OFFICE_TIME_ZONE = 'Asia/Taipei';
export const AFTER_HOURS_REST_MS = 60 * 60_000;
const ONLINE_MS = 45_000;
const clock = new Intl.DateTimeFormat('en-CA', {
  timeZone: OFFICE_TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit', weekday:'short',
  hour:'2-digit', minute:'2-digit', hourCycle:'h23',
});

export function officeHours(now = Date.now()) {
  const parts = Object.fromEntries(clock.formatToParts(now).map(p=>[p.type,p.value]));
  const workday = !['Sat','Sun'].includes(parts.weekday);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const opensAt = Date.parse(`${date}T08:00:00+08:00`);
  const closesAt = Date.parse(`${date}T18:00:00+08:00`);
  return { workday, inHours:workday&&now>=opensAt&&now<closesAt, opensAt, closesAt };
}

export function attendanceFor(agent, now = Date.now()) {
  const hours = officeHours(now);
  const reported = agent.reportedStatus ?? agent.status;
  const connected = Number.isFinite(agent.seenAt)&&now-agent.seenAt<=ONLINE_MS;
  const busy = connected&&['working','blocked','error'].includes(reported);
  const observed = agent.stateAt ?? agent.seenAt;
  const stateAt = Number.isFinite(observed)&&observed>0&&observed<=now+300_000 ? observed : 0;
  const sceneStatus = busy ? reported : 'idle';
  const connectionNote = !connected ? '目前未連線，場景僅依排班顯示角色' : reported==='unknown' ? '工作狀態未確認，暫留休息區' : reported==='offline' ? '工具工作階段已關閉，角色仍依排班出勤' : '';
  const result = (phase,label,reason,present,clockOutAt=null,clockedOutAt=null) => ({phase,label,reason,present,sceneStatus,connected,clockOutAt,clockedOutAt});

  if(hours.inHours) return result('on-duty','上班中',connectionNote||(busy?'正在處理已指派的工作':'上班時間內沒有工作，留在休息區'),true,hours.closesAt);
  if(busy) return result('overtime','加班中','上班時間外仍有工作；結束後會在休息區待一小時',true);

  // Only an actual off-hours event qualifies. Heartbeats and an idle weekday
  // task completed before 18:00 must not extend attendance into the evening.
  const offHoursUse = stateAt>0&&!officeHours(stateAt).inHours;
  const deadline = offHoursUse ? stateAt+AFTER_HOURS_REST_MS : 0;
  if(deadline>now) return result('cooldown','下班前休息',connectionNote||'工作已告一段落，休息滿一小時後下班',true,deadline);

  let regularClose = 0;
  for(let days=0;days<8;days++) {
    const shift=officeHours(now-days*86_400_000);
    if(shift.workday&&shift.closesAt<=now){regularClose=shift.closesAt;break;}
  }
  const clockedOutAt=Math.max(deadline,regularClose);
  return result('off-duty','已下班',deadline>=regularClose?'休息滿一小時，已下班':'正常上班時間已結束，已下班',false,null,clockedOutAt||null);
}

export function isInOffice(agent, now = Date.now()) { return attendanceFor(agent,now).present; }

export function countdownLabel(deadline, now = Date.now()) {
  const seconds = Math.max(0,Math.ceil((deadline-now)/1000));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
