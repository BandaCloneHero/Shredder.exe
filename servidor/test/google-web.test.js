const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');const {browserFixture}=require('./helpers/browser-fixture');
const front=name=>import(pathToFileURL(path.join(__dirname,'../../docs/js',name)).href);
const config={clientId:'test.apps.googleusercontent.com',loginId:'a'.repeat(64),nonce:'b'.repeat(64)};
const response=payload=>({ok:true,status:200,json:async()=>payload});
async function ui({restored=false,fail=false}={}){
 const browser=browserFixture(async(url,options)=>{
  if(url==='/api/auth/session')return response({ok:true,username:'Ana',nickname:'Ana',needsNickname:true});
  if(url==='/api/perfil/apelido')return response({ok:true,nickname:JSON.parse(options.body).nickname,needsNickname:false});
  if(fail)return {ok:false,status:401,json:async()=>({ok:false,code:'INVALID_GOOGLE_TOKEN',error:'raw-not-displayed'})};
  return response({ok:true,username:'jogador_abcdef123456',token:'local-session',needsNickname:true});
 },{googleOnly:true,initialToken:restored?'existing-local-session':undefined});
 await browser.ui.init();let callback,signOuts=0,renewals=0;
 const client={mount(_host,handler){callback=handler;},signOut:async()=>{signOuts++;},renew:async()=>{renewals++;},dispose(){}};
 const {GoogleAccountUI}=await front('google-account-ui.js');const controller=new GoogleAccountUI({account:browser.account,ui:browser.ui,client,document:browser.document,window:browser.window});
 return {browser,controller,callback:()=>callback,signOuts:()=>signOuts,renewals:()=>renewals};
}
test('public frontend configuration has no Firebase or invented OAuth client ID',()=>{
 const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../docs/google-config.js'),'utf8'),{window});
 assert.deepEqual(Object.keys(window).sort(),['SHREDDER_GOOGLE_LOGIN_ENABLED','SHREDDER_GOOGLE_ONLY']);assert.equal(window.SHREDDER_GOOGLE_ONLY,true);
});
test('disabled or incomplete configuration never loads Google SDK',async()=>{
 const {prepareGoogleClient}=await front('google-identity.js');let loads=0;const loadSdk=async()=>{loads++;};
 assert.equal(await prepareGoogleClient({enabled:false,config,loadSdk}),null);
 assert.equal(await prepareGoogleClient({enabled:true,config:{clientId:'invented'},loadSdk}),null);assert.equal(loads,0);
});
test('official Google button uses server nonce and accepts callback only once',async()=>{
 const {prepareGoogleClient,GOOGLE_SDK_URL}=await front('google-identity.js');assert.equal(GOOGLE_SDK_URL,'https://accounts.google.com/gsi/client?hl=pt-BR');
 let initialized,received=[],buttons=0;
 const client=await prepareGoogleClient({enabled:true,config,loadSdk:async()=>({initialize:o=>{initialized=o;},renderButton:(_host,o)=>{buttons++;assert.equal(o.state,config.loginId);},disableAutoSelect(){}})});
 client.mount({replaceChildren(){}},(...args)=>received.push(args));
 assert.equal(initialized.client_id,config.clientId);assert.equal(initialized.nonce,config.nonce);assert.equal(initialized.ux_mode,'popup');assert.equal(initialized.auto_select,false);
 initialized.callback({credential:'synthetic-token',state:'wrong'});assert.equal(received.length,0);
 initialized.callback({credential:'synthetic-token',state:config.loginId});initialized.callback({credential:'synthetic-token',state:config.loginId});
 assert.deepEqual(received,[['synthetic-token',config.loginId]]);assert.equal(buttons,1);
});
test('old callbacks and disposed clients cannot log in after attempt renewal',async()=>{
 const {prepareGoogleClient}=await front('google-identity.js');let initializations=[],received=0;
 const client=await prepareGoogleClient({enabled:true,config,renewAttempt:async()=>({...config,loginId:'c'.repeat(64)}),loadSdk:async()=>({initialize:o=>initializations.push(o),renderButton(){}})});
 client.mount({replaceChildren(){}},()=>received++);await client.renew();initializations[0].callback({credential:'synthetic-token'});assert.equal(received,0);
 client.dispose();initializations[1].callback({credential:'synthetic-token'});assert.equal(received,0);
});
test('Google credential becomes a local session then immediately requires nickname',async()=>{
 const f=await ui();await f.callback()('synthetic-token',config.loginId);
 assert.equal(f.browser.account.token,'local-session');assert.equal(f.controller.currentView,'nickname');assert.equal(f.controller.dialog.open,true);
 const req=f.browser.requests.find(r=>r.url==='/api/auth/google');assert.deepEqual(JSON.parse(req.options.body),{idToken:'synthetic-token',loginId:config.loginId});assert.equal(req.options.headers.Authorization,undefined);
 assert.equal([...f.browser.data.values()].some(v=>v.includes('synthetic-token')),false);assert.ok(f.signOuts()>0);
});
test('nickname is mandatory and confirmation preserves canonical username and local session',async()=>{
 const f=await ui();await f.callback()('synthetic-token',config.loginId);const canonical=f.browser.account.user;
 f.controller.cancel();assert.equal(f.controller.dialog.open,true);await f.controller.dialog.dispatch('cancel');assert.equal(f.controller.dialog.open,true);
 f.controller.nicknameInput.value='Meu Apelido';await f.controller.saveNickname();assert.equal(f.browser.account.nickname,'Meu Apelido');
 assert.equal(f.browser.account.user,canonical);assert.equal(f.browser.account.token,'local-session');assert.equal(f.controller.dialog.open,false);
});
test('restored pending profile asks nickname automatically without Google callback',async()=>{
 const f=await ui({restored:true});assert.equal(f.controller.currentView,'nickname');assert.equal(f.controller.dialog.open,true);assert.equal(f.browser.requests.some(r=>r.url==='/api/auth/google'),false);
});
test('failed login exposes fixed message and never stores token or requests nickname',async()=>{
 const f=await ui({fail:true});await f.callback()('synthetic-token',config.loginId);
 assert.equal(f.controller.currentView,'error');assert.equal(f.browser.account.token,null);assert.equal(f.controller.status.textContent.includes('raw-not-displayed'),false);
 assert.equal(f.browser.requests.some(r=>r.url==='/api/perfil/apelido'),false);await f.controller.retry();assert.equal(f.renewals(),1);
});
test('parallel callbacks cannot duplicate authentication requests',async()=>{
 const f=await ui();await Promise.all([f.callback()('synthetic-token',config.loginId),f.callback()('synthetic-token',config.loginId)]);assert.equal(f.browser.requests.filter(r=>r.url==='/api/auth/google').length,1);
});
test('stale local session context cannot be replaced by delayed authentication',async()=>{
 const f=await ui();let resolve;f.browser.account.request=()=>new Promise(r=>{resolve=r;});
 const pending=f.callback()('synthetic-token',config.loginId);f.browser.account.cancelPendingAuthentication();resolve({ok:true,username:'Other',token:'wrong-session'});await pending;
 assert.equal(f.browser.account.token,null);assert.equal(f.controller.status.textContent.includes('sessão mudou'),true);
});
