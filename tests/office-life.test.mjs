import test from 'node:test';
import assert from 'node:assert/strict';
import {planOfficeLife,walkingRoute,station,deskPositions} from '../lib/office-life.mjs';

test('leisure pairs share a zone, never exceed two places, and work stays at desks',()=>{
  for(let count=0;count<=8;count++) for(let cycle=0;cycle<12;cycle++) {
    const agents=Array.from({length:count},(_,i)=>({id:`idle-${i}`,status:i%2?'done':'idle'}));
    const plan=planOfficeLife(agents,cycle);
    for(const zone of ['pingpong','gaming','pantry','lounge']) {
      const entries=Object.values(plan).filter(p=>p.zone===zone);
      assert.ok(entries.length<=2);
      assert.equal(new Set(entries.map(p=>p.slot)).size,entries.length);
      if(zone==='pingpong') assert.notEqual(entries.length,1,'table tennis always has a partner');
    }
    assert.deepEqual(plan,planOfficeLife([...agents].reverse(),cycle),'poll ordering must not send people to new rooms');
  }
  const staff=['working','blocked','unknown','error','offline'].map(status=>({id:status,status}));
  for(const p of Object.values(planOfficeLife(staff,3))) assert.equal(p.zone,'work');
  const idle=planOfficeLife([{id:'a',status:'idle'}],0);
  const active=planOfficeLife([{id:'a',status:'working'}],0);
  assert.equal(idle.a.zone,'gaming');assert.equal(active.a.zone,'work');
});

test('routes use desk row aisles and arrive at distinct activity places',()=>{
  const seats=deskPositions.map(([x,y,z])=>[x,y,z+.95]);
  for(const seat of seats) for(const zone of ['pingpong','gaming','pantry','lounge']) for(let slot=0;slot<2;slot++) {
    const target=station(zone,slot,seat);
    const route=walkingRoute(seat,'work',0,seat,zone,slot,seat);
    assert.deepEqual(route.at(-1),target);
    assert.deepEqual(route[0],[seat[0],0,Math.min(6,seat[2]+.8)]);
    assert.ok(route.every(([x,,z])=>Math.abs(x)<9.5&&Math.abs(z)<6.5));
    assert.deepEqual(walkingRoute(target,zone,slot,seat,'work',0,seat).at(-1),seat);
  }
});
