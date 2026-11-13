const {test}=require('node:test'),assert=require('node:assert/strict');
const {configurarCodespaces,criarProxyCodespaces}=require('../codespaces-auth');
const {criarPoliticaAutenticacao,registrarOpcoesAutenticacao}=require('../auth-policy');
const origin='https://example-codespace-3000.app.github.dev';
const defaults=()=>({CODESPACES:'true',CODESPACE_NAME:'example-codespace',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'});
test('Codespaces derives exact 3000 origin and activates only its development configuration',()=>{
 const env=defaults();assert.deepEqual(configurarCodespaces(env),{origin,port:3000});assert.equal(env.SHREDDER_PUBLIC_ORIGIN,origin);assert.equal(env.SHREDDER_GOOGLE_AUTH_ENABLED,'true');
 const off={...defaults(),SHREDDER_GOOGLE_AUTH_ENABLED:'false'};configurarCodespaces(off);assert.equal(off.SHREDDER_GOOGLE_AUTH_ENABLED,'false');
 const custom={...defaults(),PORT:'3001'};assert.equal(configurarCodespaces(custom).origin,'https://example-codespace-3001.app.github.dev');
});
test('production is never automatically enabled or given localhost proxy exceptions',()=>{
 for(const env of [{},{CODESPACES:'false'},{CODESPACE_NAME:'example-codespace'}]){const before=structuredClone(env);assert.equal(configurarCodespaces(env),null);assert.deepEqual(env,before);}
 let handler;registrarOpcoesAutenticacao({get:(_p,fn)=>handler=fn},{env:{}});let body;
 handler({}, {set(){},json(data){body=data;}});assert.equal(body.providers.google.enabled,false);assert.equal(body.developmentProxy,undefined);
});
test('invalid or conflicting Codespaces settings fail before server initialization',()=>{
 for(const extra of [{CODESPACE_NAME:'evil.invalid'},{GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'evil.invalid'},{PORT:'0'},{PORT:'bad'},{SHREDDER_PUBLIC_ORIGIN:'https://evil.invalid'}])assert.throws(()=>configurarCodespaces({...defaults(),...extra}));
});
function setup(){
 const mw=criarProxyCodespaces({origin,port:3000}),policy=criarPoliticaAutenticacao({origemPublica:origin});
 function call(method,path,headers={},type='application/json'){
  let accepted=false;const req={method,path,headers,is:t=>t===type};
  const res={set(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  mw(req,res,()=>policy(req,res,()=>accepted=true));return {accepted,req,res};
 }
 const proof=call('GET','/api/dev/codespaces',{'sec-fetch-site':'same-origin'}).res.data;
 const headers={origin:'https://localhost:3000','sec-fetch-site':'same-origin','x-shredder-origin':origin,'x-shredder-nonce':proof.nonce};
 return {call,headers};
}
test('private proxy normalization still passes through the strict origin policy',()=>{
 const {call,headers}=setup();for(const path of ['/api/auth/google/start','/api/auth/google','/api/perfil/apelido','/API/AUTH/GOOGLE/']){
  const r=call('POST',path,{...headers});assert.equal(r.accepted,true);assert.equal(r.req.headers.origin,origin);
 }
});
test('cross-site wrong origin wrong port missing proof and non-JSON remain blocked',()=>{
 const {call,headers}=setup();
 for(const path of ['/api/auth/google/start','/api/auth/google','/api/perfil/apelido']){
  for(const extra of [{'sec-fetch-site':'cross-site'},{'sec-fetch-site':undefined},{origin:'https://evil.invalid'},{origin:'https://localhost:3001'},{'x-shredder-origin':'https://evil.invalid'},{'x-shredder-nonce':undefined},{'x-shredder-nonce':'x'.repeat(64)}])assert.equal(call('POST',path,{...headers,...extra}).res.code,403);
  assert.equal(call('POST',path,{...headers},'text/plain').res.code,403);
 }
 assert.equal(call('GET','/api/dev/codespaces',{'sec-fetch-site':'cross-site'}).res.code,403);
});
test('bootstrap nonce cannot be reused across independent processes',()=>{
 const a=setup(),b=setup();assert.notEqual(a.headers['x-shredder-nonce'],b.headers['x-shredder-nonce']);assert.equal(b.call('POST','/api/auth/google/start',a.headers).res.code,403);
});
test('client sends ephemeral proof only on same-origin Google and nickname writes',async()=>{
 const {browserFixture}=require('./helpers/browser-fixture');const f=browserFixture(async()=>({ok:true,json:async()=>({ok:true})}),{googleOnly:true});
 f.window.location.origin=origin;f.account.codespacesProof={origin,nonce:'a'.repeat(64)};
 for(const path of ['/api/auth/google/start','/api/auth/google','/api/perfil/apelido']){
  await f.account.request(path,{method:'POST',body:{},auth:false});const req=f.requests.at(-1);assert.equal(req.options.headers['X-Shredder-Origin'],origin);assert.equal(req.options.headers['X-Shredder-Nonce'],'a'.repeat(64));assert.equal(req.options.credentials,'same-origin');
 }
 for(const path of ['/api/auth/options','/api/perfil/Ana','https://evil.invalid/api/auth/google']){await f.account.request(path,{method:'POST',body:{},auth:false});assert.equal(f.requests.at(-1).options.headers['X-Shredder-Nonce'],undefined);}
 f.window.location.origin='https://different.invalid';await f.account.request('/api/auth/google',{method:'POST',body:{},auth:false});assert.equal(f.requests.at(-1).options.headers['X-Shredder-Nonce'],undefined);
 assert.equal([...f.data.values()].some(v=>v.includes('a'.repeat(64))),false);
});
test('UI obtains proxy proof before preparing Google and rejects foreign proof origin',async()=>{
 const {browserFixture}=require('./helpers/browser-fixture');
 for(const wrong of [false,true]){
  const f=browserFixture(async path=>({ok:true,status:200,json:async()=>path==='/api/auth/options'?{ok:true,googleOnly:true,providers:{google:{enabled:false}},developmentProxy:{origin,bootstrap:'/api/dev/codespaces'}}:{ok:true,origin:wrong?'https://evil.invalid':origin,nonce:'a'.repeat(64)}}),{googleOnly:true});
  f.window.location.origin=origin;f.window.SHREDDER_GOOGLE_LOGIN_ENABLED=true;
  await f.ui.init();await f.ui.googleReadyPromise;
  assert.deepEqual(f.requests.map(r=>r.url),['/api/auth/options','/api/dev/codespaces']);assert.equal(Boolean(f.account.codespacesProof),!wrong);assert.equal(f.main.hidden,true);
 }
});
