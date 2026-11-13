const {test}=require('node:test');
const assert=require('node:assert/strict');
const {criarGoogleIdentity,configuracaoGoogle}=require('../google-identity');
const env={SHREDDER_GOOGLE_AUTH_ENABLED:'true',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com'};
const nonce='a'.repeat(64),now=1800000000000;
const claims=()=>({iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,sub:'123456789',nonce,iat:now/1000,exp:now/1000+3600});
function setup(payload=claims(),options={}) {
 const calls=[];const auth=criarGoogleIdentity({env,agora:()=>now,carregarCliente:()=>({verifyIdToken:async request=>{calls.push(request);return {getPayload:()=>payload};}}),...options});
 return {...auth,calls};
}
test('Google verifier returns only verified subject and passes exact audience to official library',async()=>{
 const f=setup({...claims(),email:'not-returned',name:'not-returned',role:'operator'});
 assert.deepEqual(await f.verificarIdTokenGoogle('synthetic-token',{nonce}),{provider:'google',sub:'123456789'});
 assert.deepEqual(f.calls,[{idToken:'synthetic-token',audience:env.GOOGLE_CLIENT_ID}]);
});
test('missing client configuration does not initialize Google SDK or ADC',async()=>{
 let loads=0;const f=setup(undefined,{env:{},carregarCliente:()=>{loads++;}});
 await assert.rejects(f.verificarIdTokenGoogle('token',{nonce}),{code:'GOOGLE_AUTH_UNAVAILABLE',status:503});assert.equal(loads,0);
 assert.equal(configuracaoGoogle({...env,GOOGLE_CLIENT_ID:'bad'}),false);
});
for(const [label,change] of Object.entries({audience:{aud:'other'},issuer:{iss:'https://securetoken.google.com/shredder-d22a2'},subject:{sub:''},nonce:{nonce:'wrong'},expired:{exp:now/1000-1},future:{iat:now/1000+31},old:{iat:now/1000-301},azp:{azp:'other'},missingTime:{iat:undefined}})) {
 test('Google verifier rejects '+label,async()=>{await assert.rejects(setup({...claims(),...change}).verificarIdTokenGoogle('token',{nonce}),{code:'INVALID_GOOGLE_TOKEN',status:401});});
}
test('malformed tokens and missing challenge never reach certificate verification',async()=>{
 const f=setup();for(const value of ['',null,'a b','x'.repeat(16385)])await assert.rejects(f.verificarIdTokenGoogle(value,{nonce}),{code:'INVALID_GOOGLE_TOKEN'});
 await assert.rejects(f.verificarIdTokenGoogle('token'),{code:'INVALID_GOOGLE_TOKEN'});assert.equal(f.calls.length,0);
});
test('signature errors and infrastructure failures are sanitized',async()=>{
 for(const [code,expected] of [['INVALID_SIGNATURE','INVALID_GOOGLE_TOKEN'],['EAI_AGAIN','GOOGLE_AUTH_UNAVAILABLE']]){
  const f=setup(undefined,{carregarCliente:()=>({verifyIdToken:async()=>{throw Object.assign(new Error('SENSITIVE RAW ERROR'),{code});}})});
  await assert.rejects(f.verificarIdTokenGoogle('token',{nonce}),error=>error.code===expected&&!error.message.includes('SENSITIVE'));
 }
});
test('verification timeout fails closed',async()=>{
 const f=setup(undefined,{timeoutMs:5,carregarCliente:()=>({verifyIdToken:()=>new Promise(()=>{})})});
 await assert.rejects(f.verificarIdTokenGoogle('token',{nonce}),{code:'GOOGLE_AUTH_UNAVAILABLE'});
});
test('official Google library checks real cryptographic signature offline',async()=>{
 const {OAuth2Client}=require('google-auth-library');const {generateKeyPairSync,sign}=require('node:crypto');
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const client=new OAuth2Client();client.getFederatedSignonCertsAsync=async()=>({certs:{test:publicKey.export({type:'spki',format:'pem'})}});
 const seconds=Math.floor(Date.now()/1000),payload={...claims(),iat:seconds,exp:seconds+300};
 const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const unsigned=part({alg:'RS256',kid:'test'})+'.'+part(payload);
 const signature=sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url');const token=unsigned+'.'+signature;
 const f=criarGoogleIdentity({env,carregarCliente:()=>client});
 assert.equal((await f.verificarIdTokenGoogle(token,{nonce})).sub,payload.sub);
 const tampered=unsigned+'.'+(signature[0]==='a'?'b':'a')+signature.slice(1);
 await assert.rejects(f.verificarIdTokenGoogle(tampered,{nonce}),{code:'INVALID_GOOGLE_TOKEN'});
});
test('registered public client ID is shared by configuration and token verification',async()=>{
 const {obterClientIdGoogle}=require('../google-identity');
 const clientId=obterClientIdGoogle({});assert.equal(clientId,require('../google-config.json').clientId);
 assert.equal(configuracaoGoogle({SHREDDER_GOOGLE_AUTH_ENABLED:'true'}),true);
 let audience;const f=criarGoogleIdentity({env:{SHREDDER_GOOGLE_AUTH_ENABLED:'true'},agora:()=>now,carregarCliente:()=>({verifyIdToken:async request=>{audience=request.audience;return {getPayload:()=>({...claims(),aud:clientId})};}})});
 await f.verificarIdTokenGoogle('synthetic-token',{nonce});assert.equal(audience,clientId);
});
test('public client ID never activates Google by itself and invalid explicit overrides fail closed',()=>{
 const {obterClientIdGoogle}=require('../google-identity');
 assert.equal(configuracaoGoogle({}),false);
 for(const GOOGLE_CLIENT_ID of ['', 'invalid'])assert.equal(configuracaoGoogle({SHREDDER_GOOGLE_AUTH_ENABLED:'true',GOOGLE_CLIENT_ID}),false);
 assert.equal(obterClientIdGoogle({GOOGLE_CLIENT_ID:'other.apps.googleusercontent.com'}),'other.apps.googleusercontent.com');
});
test('credit proof observer runs only after Google verification and receives real expiry',async()=>{
 let proof;const f=setup(claims(),{aoValidar:value=>{proof=value;}});
 await f.verificarIdTokenGoogle('synthetic-token',{nonce});assert.equal(proof.token,'synthetic-token');assert.equal(proof.expiresAt,claims().exp*1000);assert.deepEqual(proof.identidade,{provider:'google',sub:claims().sub});
 let observed=false;const bad=setup({...claims(),nonce:'wrong'},{aoValidar:()=>{observed=true;}});await assert.rejects(bad.verificarIdTokenGoogle('synthetic-token',{nonce}));assert.equal(observed,false);
});
test('credit preparation errors cannot prevent Google login',async()=>{
 const f=setup(claims(),{aoValidar:()=>{throw Error('credit preparation');}});assert.equal((await f.verificarIdTokenGoogle('synthetic-token',{nonce})).sub,claims().sub);
});
