const {test}=require('node:test');
const assert=require('node:assert/strict');
const {criarPoliticaAutenticacao,registrarOpcoesAutenticacao}=require('../auth-policy');
const origin='https://shredder.feira-de-jogos.dev.br';
function call({path='/api/auth/google',method='POST',headers={origin},type='application/json',config={}}={}) {
 let next=false;
 const res={set(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 criarPoliticaAutenticacao(config)({path,method,headers,is:value=>value===type},res,()=>{next=true;});
 return {next,res};
}
test('production origin accepts JSON and rejects proxy rewrites and cross-site posts',()=>{
 for(const path of ['/api/auth/google','/api/perfil/apelido']){
  assert.equal(call({path}).next,true);
  for(const headers of [{origin:'https://localhost:3001','x-homolog-origin':origin},{origin:'https://evil.invalid'},{origin,'sec-fetch-site':'cross-site'}]) assert.equal(call({path,headers}).res.code,403);
  assert.equal(call({path,type:'text/plain'}).res.code,415);
 }
});
test('invalid configured origin fails closed without affecting unrelated endpoints',()=>{
 assert.equal(call({config:{origemPublica:origin+'/'}}).res.code,503);
 assert.equal(call({path:'/api/auth/session',method:'GET',config:{origemPublica:'invalid'}}).next,true);
});
test('password routes cannot bypass Google-only policy through case or trailing slash',()=>{
 for(const path of ['/api/auth/login','/API/AUTH/LOGIN/','/api/auth/register/','/api/auth/google/link/']) assert.equal(call({path}).res.code,410);
 assert.equal(call({path:'/api/auth/login',config:{googleOnly:false}}).next,true);
 assert.equal(call({path:'/api/auth/google/register'}).res.data.code,'PROFILE_CREATION_AUTOMATIC');
});
test('public readiness requires activation and valid OAuth client ID without ADC',()=>{
 for(const [env,enabled] of [[{},false],[{SHREDDER_GOOGLE_AUTH_ENABLED:'true',GOOGLE_CLIENT_ID:'bad'},false],[{SHREDDER_GOOGLE_AUTH_ENABLED:'true',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com'},true]]){
  let handler;registrarOpcoesAutenticacao({get:(path,fn)=>{assert.equal(path,'/api/auth/options');handler=fn;}},{env});
  let body;handler({}, {set(){},json(data){body=data;}});assert.equal(body.providers.google.enabled,enabled);assert.equal(body.providers.password,false);
 }
});
test('disabled backend leaves Google UI unavailable without importing SDK or authenticating',async()=>{
 const {browserFixture}=require('./helpers/browser-fixture');
 const f=browserFixture(async()=>({ok:true,status:200,json:async()=>({ok:true,googleOnly:true,providers:{google:{enabled:false}}})}),{googleOnly:true});
 f.window.SHREDDER_GOOGLE_LOGIN_ENABLED=true;
 await f.ui.init();await f.ui.googleReadyPromise;
 assert.equal(f.ui.googleUI,undefined);assert.equal(f.ui.googlePrepareFailed,true);assert.equal(f.main.hidden,true);
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/auth/options');
 assert.equal(f.requests[0].options.headers.Authorization,undefined);assert.equal(f.account.token,null);
});
