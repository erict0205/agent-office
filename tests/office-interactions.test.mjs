import test from 'node:test';
import assert from 'node:assert/strict';
import {characterReply,deskDisplayMode} from '../lib/office-interactions.mjs';
import {deriveWriteToken,writeFingerprint} from '../bridge/collector/write-auth.mjs';
import {validWriteToken} from '../lib/write-auth.mjs';

test('write credentials are scoped, hashed and fail closed',async()=>{
  const service='test-service-secret',token=deriveWriteToken(service),fingerprint=writeFingerprint(token);
  assert.notEqual(token,service);assert.equal(token,deriveWriteToken(service));
  assert.equal(await validWriteToken(token,fingerprint),true);
  for(const invalid of [null,'',service,deriveWriteToken('other-service'),'a'.repeat(64)])assert.equal(await validWriteToken(invalid,fingerprint),false);
  assert.equal(await validWriteToken(token,undefined),false);
});
test('character lines respect work, uncertainty and attendance without changing tasks',()=>{
  const agent={status:'working',category:'development',task:'original'};
  assert.match(characterReply(agent,'coffee').text,/這輪完成/);
  assert.match(characterReply(agent,'status').text,/處理/);
  assert.match(characterReply({...agent,status:'unknown'},'status').text,/還沒收到/);
  assert.match(characterReply({...agent,attendance:{present:false}},'greet').text,/下班/);
  assert.match(characterReply({...agent,status:'idle',attendance:{present:true,phase:'cooldown',clockOutAt:120000}},'status',null,60000).text,/1 分鐘/);
  assert.equal(agent.task,'original');assert.equal(agent.status,'working');
});
test('desk turns off for absent agents, screensaves away, works after arriving',()=>{
  const agent={status:'working'},work={zone:'work',moving:false};
  assert.equal(deskDisplayMode(undefined,work),'off');
  assert.equal(deskDisplayMode({...agent,attendance:{present:false}},work),'off');
  assert.equal(deskDisplayMode({...agent,status:'offline'},work),'off');
  assert.equal(deskDisplayMode(agent,{...work,moving:true}),'saver');
  assert.equal(deskDisplayMode(agent,{zone:'pantry',moving:false}),'saver');
  assert.equal(deskDisplayMode({...agent,status:'idle'},work),'saver');
  assert.equal(deskDisplayMode(agent,work),'work');
  assert.equal(deskDisplayMode({...agent,status:'blocked'},work),'work');
});
