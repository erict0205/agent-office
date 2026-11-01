import test from 'node:test';
import assert from 'node:assert/strict';
import {officeHours,attendanceFor,isInOffice,countdownLabel,AFTER_HOURS_REST_MS} from '../lib/office-attendance.mjs';
import {planOfficeLife} from '../lib/office-life.mjs';

const time=s=>Date.parse(s+'+08:00');
const person=(status,stateAt,seenAt=stateAt)=>({id:'milo',status,reportedStatus:status,stateAt,seenAt});

test('Taipei weekday shift includes 08:00 and excludes 18:00 regardless of UTC date',()=>{
  for(const day of ['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06']) {
    assert.equal(officeHours(time(day+'T07:59:59')).inHours,false);
    assert.equal(officeHours(time(day+'T08:00:00')).inHours,true);
    assert.equal(officeHours(time(day+'T17:59:59')).inHours,true);
    assert.equal(officeHours(time(day+'T18:00:00')).inHours,false);
  }
  for(const day of ['2026-11-01','2026-11-07']) assert.equal(officeHours(time(day+'T12:00:00')).inHours,false);
  assert.equal(officeHours(Date.parse('2026-11-02T00:00:00Z')).inHours,true);
});

test('known staff attend the full weekday, rest when idle and retain offline truth',()=>{
  const now=time('2026-11-02T12:00:00'),old=time('2026-10-30T16:00:00');
  for(const status of ['idle','done','unknown','offline']) {
    const a=person(status,old,now), attendance=attendanceFor(a,now);
    assert.equal(attendance.phase,'on-duty');assert.equal(attendance.present,true);assert.equal(attendance.sceneStatus,'idle');
    assert.equal(a.status,status,'presentation never overwrites actual work state');
    assert.notEqual(planOfficeLife([{id:a.id,status:attendance.sceneStatus}]).milo.zone,'work');
  }
  const disconnected=attendanceFor(person('working',old,old),now);
  assert.equal(disconnected.present,true);assert.equal(disconnected.connected,false);assert.equal(disconnected.sceneStatus,'idle');
  assert.match(disconnected.reason,/未連線/);
  const busy=attendanceFor(person('working',now),now);assert.equal(busy.sceneStatus,'working');
});

test('weekday idle staff clock out at 18:00; heartbeats do not create overtime',()=>{
  const finish=time('2026-11-02T17:50:00'),close=time('2026-11-02T18:00:00');
  assert.equal(isInOffice(person('done',finish,close-1),close-1),true);
  assert.equal(attendanceFor(person('working',finish,close),close).phase,'overtime');
  const lateFinish=close+5*60_000;
  assert.equal(attendanceFor(person('done',lateFinish),lateFinish).clockOutAt,lateFinish+3_600_000);
  for(const heartbeat of [close,close+30*60_000,close+3*3_600_000]) {
    const p=attendanceFor(person('done',finish,heartbeat),heartbeat);
    assert.equal(p.present,false);assert.equal(p.label,'已下班');assert.equal(p.clockedOutAt,close);
  }
});

test('after-hours work stays at the desk, then rests exactly one hour before clocking out',()=>{
  for(const start of ['2026-11-02T19:00:00','2026-11-01T10:00:00','2026-11-02T06:00:00']) {
    const began=time(start),finish=began+10*60_000,leave=finish+AFTER_HOURS_REST_MS;
    for(const status of ['working','blocked','error']) {
      const busy=attendanceFor(person(status,began,finish),finish);
      assert.equal(busy.present,true);assert.equal(busy.phase,'overtime');assert.equal(busy.sceneStatus,status);
    }
    for(const status of ['done','idle','offline','unknown']) {
      const a=person(status,finish,finish),rest=attendanceFor(a,finish);
      assert.equal(rest.phase,'cooldown');assert.equal(rest.clockOutAt,leave);assert.equal(rest.sceneStatus,'idle');
      assert.equal(attendanceFor({...a,seenAt:leave-1},leave-1).present,true);
      const gone=attendanceFor({...a,seenAt:leave},leave);
      assert.equal(gone.present,false);assert.equal(gone.clockedOutAt,leave);assert.equal(gone.label,'已下班');
    }
    // Reloading, collector heartbeats and repeated reads cannot restart the rest timer.
    assert.equal(attendanceFor(person('done',finish,leave-5),leave-5).clockOutAt,leave);
  }
});

test('new work interrupts rest, and the next completion starts a fresh hour',()=>{
  const first=time('2026-11-02T20:00:00'),restart=first+30*60_000,finish=restart+5*60_000;
  assert.equal(attendanceFor(person('done',first,restart),restart).phase,'cooldown');
  assert.equal(attendanceFor(person('working',restart),restart).phase,'overtime');
  assert.equal(attendanceFor(person('done',finish),finish).clockOutAt,finish+3_600_000);
  const stale=attendanceFor(person('working',first,first),first+2*3_600_000);
  assert.equal(stale.connected,false);assert.equal(stale.present,false,'a stale busy record cannot stay all night');
});

test('cross-midnight rest and next weekday shift use wall-clock rules without old overtime resurfacing',()=>{
  const late=time('2026-11-01T23:40:00'),afterMidnight=time('2026-11-02T00:10:00');
  assert.equal(attendanceFor(person('done',late,afterMidnight),afterMidnight).clockOutAt,time('2026-11-02T00:40:00'));
  const morning=time('2026-11-02T08:00:00');
  assert.equal(attendanceFor(person('done',late,late),morning).phase,'on-duty');
  const beforeShift=time('2026-11-02T07:40:00');
  assert.equal(attendanceFor(person('done',beforeShift,beforeShift),morning).phase,'on-duty');
  assert.equal(attendanceFor(person('done',beforeShift,beforeShift),time('2026-11-02T08:40:00')).phase,'on-duty');
  const evening=time('2026-11-02T18:00:00');
  assert.equal(attendanceFor(person('done',late,late),evening).clockedOutAt,evening,'the later regular shift supersedes old overtime');
  assert.equal(countdownLabel(afterMidnight+61_000,afterMidnight),'01:01');
  assert.equal(countdownLabel(afterMidnight-1,afterMidnight),'00:00');
});
