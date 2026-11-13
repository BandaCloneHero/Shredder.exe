require('./helpers/offline-network.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {criarCreditosFeira,configuracaoCreditos,URL_CREDIT}=require('../feira-creditos');
const TOKEN='synthetic-google-credit-proof';
function fixture(t,{env={SHREDDER_FEIRA_CREDITS_ENABLED:'true',SHREDDER_FEIRA_CREDIT_VALUE:'12'},request}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shredder-credits-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'ledger.json'),calls=[];
 let now=Date.now();
 const account={accountId:'fake-account',username:'fake_player',authProviders:{google:{provider:'google',sub:'synthetic-sub'}},resultadosPartidas:{'result-1':{concluida:true},'result-2':{concluida:true},'incomplete':{concluida:false}}};
 const make=()=>criarCreditosFeira({arquivo:file,env,agora:()=>now,resolverConta:({username,accountId})=>username===account.username||accountId===account.accountId?account:null,fetch:async(...args)=>{calls.push(args);return request?request(...args):{status:201,json:async()=>({operation:42})};}});
 const service=make(),proof=()=>service.guardarCredencial({identidade:{provider:'google',sub:'synthetic-sub'},token:TOKEN,expiresAt:now+60000});
 return {service,make,proof,calls,file,account,env,read:()=>JSON.parse(fs.readFileSync(file,'utf8')),advance:ms=>{now+=ms;},result:{username:account.username,partidaId:'result-1'}};
}
test('credits remain disabled with missing value or activation flag',async t=>{
 for(const env of [{},{SHREDDER_FEIRA_CREDITS_ENABLED:'true'},{SHREDDER_FEIRA_CREDIT_VALUE:'12'}]){
  const f=fixture(t,{env});f.proof();assert.equal(f.service.registrarConfirmados([f.result]).enabled,false);await f.service.processarPendentes();assert.equal(f.calls.length,0);assert.equal(fs.existsSync(f.file),false);
 }
});
test('invalid amount never silently defaults to a payment',()=>{
 for(const value of ['','0','-1','3001','1.5','12abc',12,' 12'])assert.equal(configuracaoCreditos({SHREDDER_FEIRA_CREDITS_ENABLED:'true',SHREDDER_FEIRA_CREDIT_VALUE:value}).enabled,false);
 assert.equal(configuracaoCreditos({SHREDDER_FEIRA_CREDITS_ENABLED:'true',SHREDDER_FEIRA_CREDIT_VALUE:'3000'}).enabled,true);
});
test('saving verified Google proof alone never pays or creates ledger',t=>{
 const f=fixture(t);f.proof();assert.equal(f.calls.length,0);assert.equal(fs.existsSync(f.file),false);
});
test('confirmed persisted result sends fixed product and backend amount only once',async t=>{
 const f=fixture(t);f.proof();f.service.registrarConfirmados([{...f.result,value:2999,product:999}]);assert.equal(f.calls.length,0);
 await f.service.processarPendentes();assert.equal(f.calls.length,1);const [url,options]=f.calls[0];
 assert.equal(url,URL_CREDIT);assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer '+TOKEN);assert.deepEqual(JSON.parse(options.body),{product:87,value:12});assert.equal(options.redirect,'error');
 const entry=Object.values(f.read().entries)[0];assert.equal(entry.status,'paid');assert.equal(entry.operation,42);
 f.service.registrarConfirmados([f.result]);await f.service.processarPendentes();assert.equal(f.calls.length,1);
 assert.equal(fs.readFileSync(f.file,'utf8').includes(TOKEN),false);
});
test('unconfirmed unknown incomplete and band results never create payment jobs',t=>{
 const f=fixture(t);assert.equal(f.service.registrarConfirmados([{username:'unknown',partidaId:'x'},{...f.result,partidaId:'not-saved'},{...f.result,partidaId:'incomplete'},{...f.result,tipo:'banda'}]).registered,0);assert.equal(fs.existsSync(f.file),false);
});
test('missing or expired proof waits for a fresh Google login without network',async t=>{
 const f=fixture(t);f.service.registrarConfirmados([f.result]);await f.service.processarPendentes();assert.equal(f.calls.length,0);assert.equal(Object.values(f.read().entries)[0].status,'awaiting_login');
 f.proof();f.advance(60001);await f.service.processarPendentes();assert.equal(f.calls.length,0);
 f.proof();await f.service.processarPendentes();assert.equal(f.calls.length,1);assert.equal(Object.values(f.read().entries)[0].status,'paid');
});
test('parallel workers in the same process cannot duplicate a transfer',async t=>{
 let resolve;const f=fixture(t,{request:()=>new Promise(r=>{resolve=r;})});f.proof();f.service.registrarConfirmados([f.result]);
 const first=f.service.processarPendentes();await f.service.processarPendentes();assert.equal(f.calls.length,1);resolve({status:201,json:async()=>({operation:9})});await first;
});
test('paid jobs remain paid across process recreation without persisting Google token',async t=>{
 const f=fixture(t);f.proof();f.service.registrarConfirmados([f.result]);await f.service.processarPendentes();await f.make().processarPendentes();assert.equal(f.calls.length,1);assert.equal(Object.values(f.read().entries).length,1);
});
test('network ambiguity is never automatically retried',async t=>{
 const f=fixture(t,{request:async()=>{throw Error('SENSITIVE ERROR '+TOKEN);}});f.proof();f.service.registrarConfirmados([f.result]);await f.service.processarPendentes();
 assert.equal(Object.values(f.read().entries)[0].status,'unknown');await f.service.processarPendentes();await f.make().processarPendentes();assert.equal(f.calls.length,1);assert.equal(fs.readFileSync(f.file,'utf8').includes(TOKEN),false);
});
for(const status of [400,401,403,429,500])test('HTTP '+status+' never causes a silent payment retry',async t=>{
 const f=fixture(t,{request:async()=>({status,json:async()=>({error:TOKEN})})});f.proof();f.service.registrarConfirmados([f.result]);await f.service.processarPendentes();await f.service.processarPendentes();
 assert.equal(f.calls.length,1);assert.equal(Object.values(f.read().entries)[0].status,status>=500?'unknown':'rejected');assert.equal(fs.readFileSync(f.file,'utf8').includes(TOKEN),false);
});
test('invalid success response is ambiguous and never re-sent',async t=>{
 const f=fixture(t,{request:async()=>({status:201,json:async()=>({operation:'not-an-int',token:TOKEN})})});f.proof();f.service.registrarConfirmados([f.result]);await f.service.processarPendentes();await f.service.processarPendentes();assert.equal(f.calls.length,1);assert.equal(Object.values(f.read().entries)[0].status,'unknown');
});
test('interrupted send is quarantined after restart',async t=>{
 const f=fixture(t);f.service.registrarConfirmados([f.result]);const data=f.read();Object.values(data.entries)[0].status='sending';fs.writeFileSync(f.file,JSON.stringify(data));await f.make().processarPendentes();assert.equal(f.calls.length,0);assert.equal(Object.values(f.read().entries)[0].status,'unknown');
});
test('disk failure before sending prevents the remote call',async t=>{
 const f=fixture(t);f.proof();f.service.registrarConfirmados([f.result]);const rename=fs.renameSync;fs.renameSync=()=>{throw Error('disk');};
 try{await assert.rejects(f.service.processarPendentes());assert.equal(f.calls.length,0);}finally{fs.renameSync=rename;}
});
test('disk failure after remote success never retries the already sent job',async t=>{
 const rename=fs.renameSync;const f=fixture(t,{request:async()=>{fs.renameSync=()=>{throw Error('disk');};return {status:201,json:async()=>({operation:12})};}});
 f.proof();f.service.registrarConfirmados([f.result]);try{await assert.rejects(f.service.processarPendentes());}finally{fs.renameSync=rename;}
 await f.make().processarPendentes();assert.equal(f.calls.length,1);assert.equal(Object.values(f.read().entries)[0].status,'unknown');
});
test('status only exposes entries of the authenticated internal account',async t=>{
 const f=fixture(t);f.proof();f.service.registrarConfirmados([f.result]);await f.service.processarPendentes();assert.equal(f.service.consultar('other-account').entries.length,0);
 const status=f.service.consultar(f.account.accountId);assert.equal(status.entries.length,1);assert.equal(JSON.stringify(status).includes(TOKEN),false);assert.equal(JSON.stringify(status).includes('synthetic-sub'),false);
});
