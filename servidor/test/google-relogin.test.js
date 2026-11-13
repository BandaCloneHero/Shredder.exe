require('./helpers/offline-network.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {fixture,GOOGLE_TOKEN}=require('./helpers/google-fixture');
const {browserFixture}=require('./helpers/browser-fixture');
const front=name=>import(pathToFileURL(path.join(__dirname,'../../docs/js',name)).href);
async function setup(t){
 const backend=fixture(t,{googleOnly:true});
 for(const [key,sub] of [['ana','google-ana'],['bia','google-bia']]){
  backend.partidas.vincularIdentidadeGoogle(backend.read().accounts[key].accountId,{provider:'google',sub});
  backend.partidas.alterarApelido(backend.read().accounts[key].accountId,key==='ana'?'Ana Rock':'Bia Rock');
 }
 let sub='google-ana';backend.hooks.verificar=async()=>({provider:'google',sub});
 const browser=browserFixture(async(url,options)=>{
  const r=await backend.call(`${options.method||'GET'} ${url}`,{body:options.body?JSON.parse(options.body):undefined,token:options.headers?.Authorization?.slice(7),autoAttempt:false});
  return {ok:r.code>=200&&r.code<300,status:r.code,json:async()=>r.data};
 },{googleOnly:true});await browser.ui.init();
 const initial=await browser.account.request('/api/auth/google/start',{method:'POST',body:{},auth:false});
 const initializations=[];let pending,renewHook;
 const {prepareGoogleClient}=await front('google-identity.js');
 const base=await prepareGoogleClient({enabled:true,config:initial,renewAttempt:()=>browser.account.request('/api/auth/google/start',{method:'POST',body:{},auth:false}),loadSdk:async()=>({initialize:options=>initializations.push(options),renderButton(){},disableAutoSelect(){}})});
 renewHook=()=>base.renew();
 const client={...base,mount(host,handler){base.mount(host,(...args)=>{pending=handler(...args);return pending;});},renew:()=>renewHook()};
 const {GoogleAccountUI}=await front('google-account-ui.js');
 const controller=new GoogleAccountUI({account:browser.account,ui:browser.ui,client,document:browser.document,window:browser.window});browser.ui.googleUI=controller;
 const login=async()=>{
  pending=undefined;initializations.at(-1).callback({credential:GOOGLE_TOKEN});assert.ok(pending,'fresh Google callback must not be discarded');await pending;
 };
 return {backend,browser,controller,initializations,base,login,setSub:value=>{sub=value;},renewWith:fn=>{renewHook=fn;}};
}
test('login logout and relogin work repeatedly without reloading the page or duplicating profile',async t=>{
 const f=await setup(t),before=f.backend.raw();
 for(let i=0;i<3;i++){
  await f.login();assert.equal(f.browser.account.user,'Ana');assert.equal(f.browser.account.nickname,'Ana Rock');assert.equal(f.controller.dialog.open,false);
  await f.browser.account.logout();await f.controller.refreshPromise;
  assert.equal(f.browser.account.token,null);assert.equal(f.controller.attemptReady,true);assert.equal(f.controller.mainButton.hidden,false);
 }
 assert.equal(f.initializations.length,4);assert.equal(new Set(f.backend.calls.map(c=>c.options.nonce)).size,3);assert.equal(f.backend.raw(),before);
});
test('Google account can be changed after logout without retaining prior session or nickname',async t=>{
 const f=await setup(t);await f.login();const first=f.browser.account.token;
 await f.browser.account.logout();await f.controller.refreshPromise;f.setSub('google-bia');await f.login();
 assert.equal(f.browser.account.user,'Bia');assert.equal(f.browser.account.nickname,'Bia Rock');assert.notEqual(f.browser.account.token,first);assert.equal(Object.keys(f.backend.read().accounts).length,3);
 assert.equal(f.backend.authorized(f.browser.account.token),false);
});
test('while renewal is pending no stale callback or duplicate retry can log in',async t=>{
 const f=await setup(t);await f.login();let finish;
 f.renewWith(()=>new Promise(r=>{finish=()=>f.base.renew().then(r); }));
 await f.browser.account.logout();const renewal=f.controller.refreshPromise;
 assert.equal(f.controller.mainButton.hidden,true);assert.equal(f.controller.preparingLogin,true);assert.equal(f.controller.prepareNextLogin(),renewal);
 const calls=f.backend.calls.length;await f.controller.receiveCredential(GOOGLE_TOKEN,'stale');assert.equal(f.backend.calls.length,calls);
 await finish();await renewal;assert.equal(f.controller.mainButton.hidden,false);await f.login();assert.equal(f.browser.account.user,'Ana');
});
test('renewal failure is visible and retry creates a new usable attempt',async t=>{
 const f=await setup(t);await f.login();f.renewWith(()=>{throw Object.assign(new Error('synthetic failure'),{code:'GOOGLE_AUTH_UNAVAILABLE'});});
 await f.browser.account.logout();await f.controller.refreshPromise;
 assert.equal(f.controller.attemptReady,false);assert.equal(f.controller.mainButton.hidden,true);assert.equal(f.controller.currentView,'error');assert.equal(f.controller.refreshPromise,null);
 f.renewWith(()=>f.base.renew());await f.controller.retry();assert.equal(f.controller.attemptReady,true);await f.login();assert.equal(f.browser.account.user,'Ana');
});
