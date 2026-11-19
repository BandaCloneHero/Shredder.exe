require('./helpers/offline-network.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {registrarRotasFeira}=require('../feira-creditos-routes');
const {criarPoliticaAutenticacao}=require('../auth-policy');
function setup(){
 const routes={},calls=[];registrarRotasFeira({get:(p,h)=>routes['GET '+p]=h,post:(p,h)=>routes['POST '+p]=h},{getAuthenticatedSession:req=>req.session,feiraCreditos:{vincular:async id=>{calls.push(['link',id]);return{linked:true,userId:101};},consultarSaldo:async id=>{calls.push(['balance',id]);return{balance:100};}}});
 const run=async(method,url,extra={})=>{const req={method,path:url,body:{},...extra};const res={code:200,set(){},status(n){this.code=n;return this;},json(data){this.body=data;return this;}};await routes[method+' '+url](req,res);return res;};
 return{run,calls};
}
test('Feira link/balance require the local session and never trust requested accountId/userId/email',async()=>{
 const f=setup();for(const [method,path]of [['POST','/api/feira/vincular'],['GET','/api/feira/saldo']])assert.equal((await f.run(method,path)).code,401);
 const result=await f.run('POST','/api/feira/vincular',{session:{account:{accountId:'own'}},body:{consent:true,userId:999}});assert.equal(result.code,400);assert.equal(f.calls.length,0);
 const own=await f.run('POST','/api/feira/vincular',{session:{account:{accountId:'own-other'}},body:{consent:true}});assert.equal(own.code,200);assert.deepEqual(f.calls,[['link','own-other']]);
 const balance=await f.run('GET','/api/feira/saldo',{session:{account:{accountId:'own'}},query:{accountId:'victim'}});assert.equal(balance.body.balance,100);assert.deepEqual(f.calls.at(-1),['balance','own']);
});
test('public reward configuration includes fixed tiers without secrets or performing a financial call',async()=>{
 const f=setup();const result=await f.run('GET','/api/feira/recompensas');assert.deepEqual(result.body.fases.map(f=>f.total),[400,600,800]);assert.equal(f.calls.length,0);assert.deepEqual(result.body.fases.map(f=>f.musicas),[['Kairós'],['Neon em Ruínas'],['Colapso do Núcleo']]);
});
test('linking requires an explicit JSON consent and rejects cross-site origins',()=>{
 const middleware=criarPoliticaAutenticacao();
 const req={method:'POST',path:'/api/feira/vincular',headers:{origin:'https://evil.example'},is:()=>true};let code,next=false;const res={set(){},status(n){code=n;return this;},json(){}};middleware(req,res,()=>next=true);assert.equal(code,403);assert.equal(next,false);
 req.headers={origin:'https://shredder.feira-de-jogos.dev.br'};req.is=()=>false;middleware(req,res,()=>next=true);assert.equal(code,415);
});
