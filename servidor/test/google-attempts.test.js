const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,GOOGLE_TOKEN}=require('./helpers/google-fixture');
const START='POST /api/auth/google/start',LOGIN='POST /api/auth/google';
test('nonce attempts are random short-lived and consumed once before verification',async t=>{
 const f=fixture(t,{googleOnly:true});const a=await f.call(START,{body:{}}),b=await f.call(START,{body:{}});
 assert.match(a.data.nonce,/^[a-f0-9]{64}$/);assert.notEqual(a.data.nonce,b.data.nonce);assert.notEqual(a.data.loginId,b.data.loginId);
 const body={idToken:GOOGLE_TOKEN,loginId:a.data.loginId};
 assert.equal((await f.call(LOGIN,{body,autoAttempt:false})).code,201);
 assert.equal(f.calls[0].options.nonce,a.data.nonce);
 assert.equal((await f.call(LOGIN,{body,autoAttempt:false})).data.code,'GOOGLE_ATTEMPT_EXPIRED');assert.equal(f.calls.length,1);
});
test('invalid token consumes attempt and expired attempt never verifies',async t=>{
 const f=fixture(t);const a=await f.call(START,{body:{}});
 assert.equal((await f.call(LOGIN,{body:{idToken:'invalid',loginId:a.data.loginId},autoAttempt:false})).code,401);
 assert.equal((await f.call(LOGIN,{body:{idToken:GOOGLE_TOKEN,loginId:a.data.loginId},autoAttempt:false})).data.code,'GOOGLE_ATTEMPT_EXPIRED');
 const b=await f.call(START,{body:{}});f.hooks.agora=()=>Date.now()+300001;
 const count=f.calls.length;assert.equal((await f.call(LOGIN,{body:{idToken:GOOGLE_TOKEN,loginId:b.data.loginId},autoAttempt:false})).code,401);assert.equal(f.calls.length,count);
});
test('start rejects cross-site non-JSON unexpected fields and missing token attempts',async t=>{
 const f=fixture(t);const before=f.raw();
 assert.equal((await f.call(START,{body:{},origin:'https://evil.invalid'})).code,403);
 assert.equal((await f.call(START,{body:{},contentType:'text/plain'})).code,415);
 assert.equal((await f.call(START,{body:{role:'operator'}})).code,400);
 assert.equal((await f.call(LOGIN,{body:{idToken:GOOGLE_TOKEN},autoAttempt:false})).code,400);
 assert.equal(f.calls.length,0);assert.equal(f.raw(),before);
});
test('Firebase-only profiles block automatic duplicate creation without conversion by email',async t=>{
 const f=fixture(t,{googleOnly:true});f.bind();f.hooks.verificar=async()=>({provider:'google',sub:'new-direct-subject'});const before=f.raw();
 const result=await f.call(LOGIN,{body:{idToken:GOOGLE_TOKEN}});
 assert.equal(result.code,409);assert.equal(result.data.code,'GOOGLE_TRANSITION_REQUIRED');assert.equal(f.raw(),before);
});
test('native Google subject reuses profile and preserves role and progress',async t=>{
 const f=fixture(t,{googleOnly:true});const identity={provider:'google',sub:'new-direct-subject'};
 f.partidas.vincularIdentidadeGoogle(f.read().accounts.ana.accountId,identity);f.hooks.verificar=async()=>identity;
 const before=f.raw();const result=await f.call(LOGIN,{body:{idToken:GOOGLE_TOKEN}});
 assert.equal(result.data.username,'Ana');assert.equal(f.raw(),before);assert.equal(f.authorized(result.data.token),false);
 assert.throws(()=>f.partidas.vincularIdentidadeGoogle(f.read().accounts.bia.accountId,identity),{status:409});
});
