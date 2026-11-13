'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');

const ROOT=require('node:path').resolve(__dirname,'../..');
const {fixture,GOOGLE_TOKEN}=require(ROOT+'/servidor/test/helpers/google-fixture.js');
const {browserFixture}=require(ROOT+'/servidor/test/helpers/browser-fixture.js');
const {criarPoliticaAutenticacao:createHomologMiddleware}=require('../auth-policy');
const origin='https://example-3001.app.github.dev';
async function integrated(t,{linked=false,rejectGoogle=false}={}){
 const backend=fixture(t,{googleOnly:true});if(linked){backend.bind();const data=backend.read();data.accounts.ana.nicknameChosenAt='2026-11-11T00:00:00.000Z';fs.writeFileSync(backend.file,JSON.stringify(data));}
 let nicknameHandler;
 require(ROOT+'/servidor/profile-nickname-routes.cjs').registrarApelido({post:(_p,fn)=>nicknameHandler=fn},{partidas:backend.partidas,getAuthenticatedSession:req=>backend.context.getAuthenticatedSession(req),refreshAccounts:()=>backend.context.refreshAccounts()});
 const browser=browserFixture(async(url,options)=>{
  if(url==='/api/perfil/apelido'){
   const req={body:JSON.parse(options.body),headers:{authorization:options.headers.Authorization},is:t=>t==='application/json'};
   const res={code:200,set(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
   nicknameHandler(req,res);return {ok:res.code>=200&&res.code<300,status:res.code,json:async()=>res.data};
  }
  const result=await backend.call((options.method||'GET')+' '+url,{body:options.body?(()=>{const body=JSON.parse(options.body);delete body.loginId;return body;})():undefined,token:options.headers?.Authorization?.slice(7)});
  return {ok:result.code>=200&&result.code<300,status:result.code,json:async()=>result.data};
 },{googleOnly:true});
 await browser.ui.init();let signIns=0;
 const {GoogleAccountUI}=await import(pathToFileURL(ROOT+'/docs/js/google-account-ui.js').href);
 const controller=new GoogleAccountUI({account:browser.account,ui:browser.ui,client:{mount(){},renew:async()=>{},signOut:async()=>{}},document:browser.document,window:browser.window});
 browser.ui.googleUI=controller;
 return {backend,browser,controller,signIns:()=>signIns,login:()=>{signIns++;return controller.receiveCredential(rejectGoogle?'invalid-offline-token':GOOGLE_TOKEN,'fixture-attempt');}};
}
test('Google-only modal has no password or local registration fields',async t=>{
 const f=await integrated(t);f.browser.ui.openModal();
 assert.equal(f.browser.document.querySelector('#shredder-password'),null);
 assert.equal(f.browser.document.querySelector('#shredder-username'),null);
 assert.equal(f.browser.document.querySelector('#shredder-mode-switch'),null);
 assert.equal(f.browser.document.querySelector('#google-current-password'),null);
 assert.equal(f.browser.document.querySelector('#google-account-settings'),null);
 assert.ok(f.controller.modalButton.isConnected);
 f.browser.ui.closeModal();assert.equal(f.browser.ui.modalEl.classList.contains('open'),false);
});
test('first Google access creates a session then requests one nickname choice',async t=>{
 const f=await integrated(t);const original=f.backend.read();
 await f.login();
 assert.equal(f.controller.dialog.open,true);assert.equal(f.controller.currentView,'nickname');assert.ok(f.browser.account.token);
 assert.equal(f.browser.account.snapshot().needsNickname,true);
 assert.equal(f.controller.nicknameInput.isConnected,true);
 assert.equal(f.controller.nicknameInput.value,'');
 assert.match(f.browser.account.user,/^jogador_[a-f0-9]{12}$/);
 assert.equal(f.browser.document.querySelector('#google-username'),null);
 assert.equal(f.browser.document.querySelector('#google-current-password'),null);
 const current=f.backend.read();assert.equal(Object.keys(current.accounts).length,4);
 const profile=current.accounts[f.browser.account.user.toLowerCase()];
 assert.ok(profile.accountId);assert.equal(profile.passwordHash,undefined);
 assert.equal(profile.currency,0);assert.equal(f.backend.authorized(f.browser.account.token),false);
 assert.deepEqual(current.accounts.ana,original.accounts.ana);assert.equal(f.signIns(),1);
 assert.match(f.backend.calls[0].options.nonce,/^[a-f0-9]{64}$/);
});
test('existing Google returns same profile without registration and preserves progress',async t=>{
 const f=await integrated(t,{linked:true});const before=f.backend.read();
 await f.login();assert.equal(f.browser.account.user,'Ana');
 assert.equal(f.controller.dialog.open,false);assert.deepEqual(f.backend.read(),before);
 assert.equal(Object.keys(f.backend.read().accounts).length,3);
});
test('browser cannot select account identity username or role during automatic login',async t=>{
 const f=fixture(t,{googleOnly:true});const original=f.raw();
 for(const extras of [{username:'ALPARENGA'},{uid:'browser-identity'},{email:'synthetic@example.invalid'},{role:'operator'}]){
  const r=await f.call('POST /api/auth/google',{body:{idToken:GOOGLE_TOKEN,...extras}});
  assert.equal(r.code,400);
 }
 assert.equal(f.calls.length,0);assert.equal(f.raw(),original);
});
test('rejected Google does not fall back to password or create a profile',async t=>{
 const f=await integrated(t,{rejectGoogle:true});const before=f.backend.raw();
 await f.login();assert.equal(f.controller.currentView,'error');assert.equal(/senha|usuário/.test(f.controller.status.textContent),false);
 assert.equal(f.backend.raw(),before);assert.equal(f.browser.account.token,null);
 assert.equal(f.browser.requests.some(r=>['/api/auth/login','/api/auth/register'].includes(r.url)),false);
});
test('Google-only middleware denies password login/signup/link without invoking next',()=>{
 const mw=createHomologMiddleware({origemPublica:origin,googleOnly:true});
 for(const path of ['/api/auth/login','/api/auth/register','/api/auth/google/link']){
  let next=false;const res={set(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
  mw({method:'POST',path,headers:{},body:{}},res,()=>{next=true;});
  assert.equal(next,false);assert.equal(res.code,410);assert.equal(res.data.code,'PASSWORD_AUTH_DISABLED');
 }
 let next=false;mw({method:'GET',path:'/api/auth/session',headers:{}},{set(){}},()=>{next=true;});assert.equal(next,true);
});
test('entry page only continues after an authenticated session and retains gameplay identity format',()=>{
 const source=fs.readFileSync(ROOT+'/docs/app.js','utf8');
 const code=source.slice(source.indexOf('function initializeLogin() {'),source.indexOf('\nfunction renderLobby('));
 const events={},button={hidden:true,addEventListener(name,fn){events[name]=fn;}},status={},choose={hidden:true,addEventListener(){}};
 let change,modal=0,choices=0,saved;
 const state={isLoggedIn:false,isRestoring:false,needsNickname:false};
 const window={location:{href:'',search:'?__conteudo=1'},shredderAccount:{snapshot:()=>state,onChange(fn){change=fn;fn(state);}},shredderUI:{openModal(){modal++;},googleUI:{showNickname(){choices++;}}}};
 const context=vm.createContext({window,document:{querySelector:id=>id==='#login-continue'?button:id==='#login-choose-nickname'?choose:status},getPlayer:()=>null,makePlayerId:()=> 'OP-TEST',writeJson:(_key,value)=>{saved=value;},STORAGE:{player:'fixture'},upsertPlayer(){},localStorage:{setItem(){}}});
 vm.runInContext(code+'\ninitializeLogin();',context);assert.equal(button.hidden,true);events.click();assert.equal(modal,1);assert.equal(saved,undefined);
 Object.assign(state,{isLoggedIn:true,user:'Ana',needsNickname:true});change(state);assert.equal(button.hidden,true);events.click();assert.equal(choices,1);assert.equal(saved,undefined);
 state.needsNickname=false;change(state);assert.equal(button.hidden,false);events.click();
 assert.equal(saved.nome,'Ana');assert.equal(saved.id,'OP-TEST');assert.equal(window.location.href,'lobby.html?__conteudo=1');
});

test('automatic first access is idempotent under concurrent requests and retries',async t=>{
 const f=fixture(t,{googleOnly:true});
 const call=()=>f.call('POST /api/auth/google',{body:{idToken:GOOGLE_TOKEN}});
 const results=await Promise.all([call(),call()]);
 assert.deepEqual(results.map(r=>r.code),[201,200]);
 assert.equal(results[0].data.username,results[1].data.username);
 const original=f.read();const again=await call();assert.equal(again.code,200);
 assert.deepEqual(f.read(),original);assert.equal(Object.keys(f.read().accounts).length,4);
});
test('generated-name collision cannot overwrite another profile',async t=>{
 let count=0;const f=fixture(t,{googleOnly:true,gerarUsername:()=>++count===1?'Ana':'jogador_abcdef123456'});
 const old=f.read().accounts.ana;
 const r=await f.call('POST /api/auth/google',{body:{idToken:GOOGLE_TOKEN}});
 assert.equal(r.code,201);assert.equal(count,2);assert.equal(r.data.username,'jogador_abcdef123456');
 assert.deepEqual(f.read().accounts.ana,old);
});
test('session-write failure can recover the created profile without duplicating it',async t=>{
 const f=fixture(t,{googleOnly:true});const create=f.context.createSession;let first=true;
 f.context.createSession=(...args)=>{if(first){first=false;throw Error('Synthetic storage failure');}return create(...args);};
 const initial=await f.call('POST /api/auth/google',{body:{idToken:GOOGLE_TOKEN}});assert.equal(initial.code,500);
 const after=f.read();assert.equal(Object.keys(after.accounts).length,4);
 const retry=await f.call('POST /api/auth/google',{body:{idToken:GOOGLE_TOKEN}});assert.equal(retry.code,200);
 assert.deepEqual(f.read(),after);
});
test('invalid Google token never creates a profile',async t=>{
 const f=fixture(t,{googleOnly:true});const before=f.raw();
 const r=await f.call('POST /api/auth/google',{body:{idToken:'invalid-offline-token'}});
 assert.equal(r.code,401);assert.equal(f.raw(),before);
});
test('manual Google registration is disabled only in Google-only mode',()=>{
 const mw=createHomologMiddleware({origemPublica:origin,googleOnly:true});let next=false;
 const res={set(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
 mw({method:'POST',path:'/api/auth/google/register',headers:{}},res,()=>{next=true;});
 assert.equal(next,false);assert.equal(res.code,410);assert.equal(res.data.code,'PROFILE_CREATION_AUTOMATIC');
});

test('nickname is chosen after Google without another popup and is saved only once',async t=>{
 const f=await integrated(t);await f.login();
 const username=f.browser.account.user;const original=f.backend.read().accounts[username];
 assert.equal(f.controller.currentView,'nickname');
 f.controller.nicknameInput.value='Nome no Jogo';await f.controller.saveNickname();
 assert.equal(f.signIns(),1);assert.equal(f.browser.account.snapshot().needsNickname,false);
 assert.equal(f.browser.account.snapshot().nickname,'Nome no Jogo');assert.equal(f.controller.dialog.open,false);
 const after=f.backend.read().accounts[username];assert.equal(after.accountId,original.accountId);assert.deepEqual(after.authProviders,original.authProviders);assert.ok(after.nicknameChosenAt);
 const retry=await f.browser.account.request('/api/perfil/apelido',{method:'POST',body:{nickname:'Nome no Jogo'}});assert.equal(retry.ok,true);
 await assert.rejects(f.browser.account.updateNickname('Outro Nome'),error=>error.status===409);
});
test('confirmed Google profile enters directly without asking nickname again',async t=>{
 const f=await integrated(t,{linked:true});await f.login();
 assert.equal(f.browser.account.snapshot().needsNickname,false);assert.equal(f.controller.dialog.open,false);
 assert.equal(f.backend.read().accounts.ana.nicknameChosenAt,'2026-11-11T00:00:00.000Z');
});
test('nickname is an automatic mandatory step that can only be completed or logged out',async t=>{
 const f=await integrated(t);await f.login();const id=f.browser.account.user;
 assert.equal(f.controller.currentView,'nickname');assert.equal(f.controller.dialog.open,true);
 assert.equal(f.controller.cancelButton.hidden,true);assert.equal(f.controller.nicknameLogoutButton.hidden,false);
 f.controller.cancel();assert.equal(f.controller.dialog.open,true);assert.equal(f.browser.account.snapshot().needsNickname,true);
 await f.controller.dialog.dispatch('cancel');assert.equal(f.controller.dialog.open,true);
 assert.equal(f.browser.account.user,id);assert.equal(f.signIns(),1);
 await f.controller.nicknameLogoutButton.click();assert.equal(f.browser.account.snapshot().isLoggedIn,false);assert.equal(f.controller.dialog.open,false);
 assert.equal(f.signIns(),1);
});

