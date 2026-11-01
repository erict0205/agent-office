const weekdayByName={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};

function dateParts(at,timezone) {
  const values=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(new Date(at)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {year:Number(values.year),month:Number(values.month),day:Number(values.day),hour:Number(values.hour),minute:Number(values.minute),weekday:weekdayByName[values.weekday]};
}

function localTimeToEpoch(year,month,day,hour,minute,timezone) {
  const target=Date.UTC(year,month-1,day,hour,minute);let guess=target;
  for(let attempt=0;attempt<5;attempt++) {
    const local=dateParts(guess,timezone),observed=Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute),delta=target-observed;
    if(!delta)break;
    guess+=delta;
  }
  return guess;
}

export function nextScheduleAt({cadence,weekday=1,minuteOfDay,timezone='Asia/Taipei'},after=Date.now()) {
  if(!['daily','weekdays','weekly'].includes(cadence)||!Number.isInteger(minuteOfDay)||minuteOfDay<0||minuteOfDay>1439||!Number.isInteger(weekday)||weekday<0||weekday>6)throw new Error('排程格式不正確');
  const local=dateParts(after,timezone);
  for(let offset=0;offset<=14;offset++) {
    const day=new Date(Date.UTC(local.year,local.month-1,local.day+offset)),dayOfWeek=day.getUTCDay();
    if(cadence==='weekdays'&&(dayOfWeek===0||dayOfWeek===6))continue;
    if(cadence==='weekly'&&dayOfWeek!==weekday)continue;
    const at=localTimeToEpoch(day.getUTCFullYear(),day.getUTCMonth()+1,day.getUTCDate(),Math.floor(minuteOfDay/60),minuteOfDay%60,timezone);
    if(at>after)return at;
  }
  throw new Error('無法計算下次排程時間');
}
