'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');

const ROOT=require('node:path').resolve(__dirname,'../..');
const {fixture}=require(ROOT+'/servidor/test/helpers/google-fixture.js');
const {browserFixture}=require(ROOT+'/servidor/test/helpers/browser-fixture.js');
const {registrarApelido}=require(ROOT+'/servidor/profile-nickname-routes.cjs');
const {criarPoliticaAutenticacao:createHomologMiddleware}=require('../auth-policy');
function setup(t){
 const f=fixture(t,{googleOnly:true});let handler,published=0;
 registrarApelido({post:(_path,fn)=>handler=fn},{partidas:f.partidas,getAuthenticatedSession:req=>f.context.getAuthenticatedSession(req),refreshAccounts:()=>f.context.refreshAccounts(),publicar:()=>published++});
 const call=({token,body,contentType='application/json'}={})=>{
  const req={headers:token?{authorization:'Bearer '+token}:{},body,is:type=>type===contentType};
  const res={code:200,set(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  handler(req,res);return res;
 };
 return {f,call,published:()=>published};
}
test('nickname update preserves identity Google binding credentials scores and session',t=>{
 const {f,call}=setup(t);f.bind();
 f.partidas.salvar({partidaId:'nickname-score',operadorId:'offline',username:'Ana',instrumento:'guitarra',modo:'freeplay',musica:'Fixture song',pontuacao:1000,precisao:100,maiorCombo:10,fullCombo:true,notasAcertadas:10,notasErradas:0});
 const token=f.session();const before=f.read().accounts.ana;
 const r=call({token,body:{nickname:'  Ana do Rock  '}});assert.equal(r.code,200);assert.equal(r.data.nickname,'Ana do Rock');
 const after=f.read().accounts.ana;
 const old=structuredClone(before),now=structuredClone(after);delete old.nickname;delete now.nickname;delete old.updatedAt;delete now.updatedAt;delete old.nicknameChosenAt;delete now.nicknameChosenAt;assert.deepEqual(now,old);
 assert.equal(f.partidas.ranking()[0].nome,'Ana do Rock');assert.equal(f.partidas.ranking()[0].jogadorId,'ana');assert.equal(f.partidas.ranking()[0].pontuacao,1000);
 assert.ok(f.context.getAuthenticatedSession({headers:{authorization:'Bearer '+token}}));
 assert.equal(f.authorized(token),false);
});
test('nickname requires local session and cannot target another profile or grant roles',t=>{
 const {f,call}=setup(t);const before=f.raw();
 assert.equal(call({body:{nickname:'Novo'}}).code,401);
 assert.equal(call({token:'not-a-session',body:{nickname:'Novo'}}).code,401);
 const token=f.session();
 for(const extra of [{username:'Bia'},{accountId:'another-account'},{role:'operator'},{currency:999999}])assert.equal(call({token,body:{nickname:'Novo',...extra}}).code,400);
 assert.equal(f.raw(),before);
});
test('invalid names controls markup and reserved operators never persist',t=>{
 const {f,call}=setup(t),token=f.session(),before=f.raw();
 for(const nickname of ['', ' '.repeat(4), 'x'.repeat(41), null, 123, '<script>', 'Name\nNew', 'Name\u202eNew'])assert.equal(call({token,body:{nickname}}).code,400);
 assert.equal(call({token,body:{nickname:'ALPARENGA'}}).code,403);assert.equal(f.raw(),before);
});
test('nickname failure is atomic and does not publish success',t=>{
 const {f,call,published}=setup(t),token=f.session(),before=f.raw();
 const original=fs.renameSync;fs.renameSync=()=>{throw Error('Synthetic disk failure');};
 try{const r=call({token,body:{nickname:'Novo'}});assert.equal(r.code,500);assert.equal(f.raw(),before);assert.equal(published(),0);}finally{fs.renameSync=original;}
});
test('nickname confirmation is once-only with idempotent retry and no account merging',t=>{
 const {f,call}=setup(t),token=f.session();
 assert.equal(call({token,body:{nickname:'Palco'}}).code,200);
 const before=f.raw();assert.equal(call({token,body:{nickname:'Palco'}}).code,200);assert.equal(f.raw(),before);
 const denied=call({token,body:{nickname:'Outro'}});assert.equal(denied.code,409);assert.equal(denied.data.code,'NICKNAME_ALREADY_SET');assert.equal(f.raw(),before);
 assert.equal(call({token:f.session('bia'),body:{nickname:'Palco'}}).code,200);
 const data=f.read();assert.notEqual(data.accounts.ana.accountId,data.accounts.bia.accountId);assert.equal(Object.keys(data.accounts).length,3);
});
test('client changes only visible nickname without changing session or authentication context',async()=>{
 const browser=browserFixture(async(url)=>({ok:true,status:200,json:async()=>url==='/api/perfil/apelido'?{ok:true,nickname:'Novo Apelido'}:{ok:true,username:'Ana'}}),{initialToken:'local-token',googleOnly:true});
 await browser.ui.init();const context=browser.account.authContext();
 await browser.account.updateNickname('Novo Apelido');assert.equal(browser.account.user,'Ana');assert.equal(browser.account.snapshot().nickname,'Novo Apelido');
 assert.equal(browser.account.isAuthContextCurrent(context),true);assert.equal(browser.account.token,'local-token');
 assert.ok(browser.ui.statusContainerEl.textContent.includes('Novo Apelido'));
});
test('the free profile editor is removed from the product',()=>{
 const html=fs.readFileSync(ROOT+'/docs/perfil.html','utf8');
 assert.equal(html.includes('profile-nickname-form'),false);assert.equal(html.includes('js/profile-nickname.js'),false);
 assert.equal(fs.existsSync(ROOT+'/docs/js/profile-nickname.js'),false);
});
