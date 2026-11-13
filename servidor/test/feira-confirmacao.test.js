require('./helpers/offline-network.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {validarResultado}=require('../partidas');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
function fixture({authorized=true,persistFailure=false,creditFailure=false}={}){
 let handler,answer;const order=[];
 const ticket={ticketId:'fixture-ticket',roomId:'fixture-room',estado:'aguardando_confirmacao',modo:{tipo:'freeplay'},jogadores:[{id:'OP-TEST',nome:'fake_player',instrumento:'Guitarra'}],resultadosExecutavel:[{instrumentoNormalizado:'guitarra',pontuacao:100,precisao:100,maiorCombo:10,notasAcertadas:10,notasErradas:0,fullCombo:true,concluida:true}],musica:'Fake song'};
 const queue=[ticket], ctx=vm.createContext({socket:{on:(_event,fn)=>handler=fn},isOfficialOperator:()=>({ok:authorized,error:'Denied'}),ticketsNaFila:()=>queue,normalizarInstrumentoExecutavel:x=>x.toLowerCase(),normalizeUsername:x=>x.toLowerCase(),validarResultado,finalizarConquistaDaFeira(){},accountStore:{},partidas:{salvar(){order.push('save');if(persistFailure)throw Error('disk');return {raiz:{accounts:{}},records:[],novasConquistas:[]};}},io:{to:()=>({emit(){}})},salas:{},ticketsSessaoPendentes:queue,resultadosExecutavelRecentes:[],feiraCreditos:{registrarConfirmados(results){order.push('credits');assert.equal(results[0].partidaId,'unity_fixture-ticket_guitarra');if(creditFailure)throw Error('credit ledger');return {enabled:true,registered:1};},agendar(){order.push('schedule');}},console:{error(){}}});
 vm.runInContext(source.slice(source.indexOf('    socket.on("confirmar_resultados_ticket"'),source.indexOf('    socket.on("remover_ticket_sessao"')),ctx);
 return {order,ticket,call:()=>{handler({token:'fake-local-operator-token',ticketId:ticket.ticketId},r=>answer=r);return answer;}};
}
test('operator confirmation persists result before registering any credit entitlement',()=>{const f=fixture();assert.equal(f.call().ok,true);assert.deepEqual(f.order,['save','credits','schedule']);});
test('unauthorized operator never saves results or registers credits',()=>{const f=fixture({authorized:false});assert.equal(f.call().ok,false);assert.deepEqual(f.order,[]);});
test('failed result persistence never registers or sends credits',()=>{const f=fixture({persistFailure:true});assert.equal(f.call().ok,false);assert.deepEqual(f.order,['save']);});
test('credit ledger failure preserves confirmed game result and reports review needed',()=>{const f=fixture({creditFailure:true});const r=f.call();assert.equal(r.ok,true);assert.equal(r.creditosFeira.status,'registration_failed');assert.deepEqual(f.order,['save','credits']);});
test('repeating ticket confirmation never registers the payment again',()=>{const f=fixture();f.call();assert.equal(f.call().ok,false);assert.equal(f.order.filter(x=>x==='credits').length,1);});
test('credit status requires a local session and ignores requested target account',()=>{
 let handler,seen;const ctx=vm.createContext({app:{get:(_path,fn)=>handler=fn},getAuthenticatedSession:req=>req.session||null,feiraCreditos:{consultar:id=>{seen=id;return {enabled:false,entries:[]};}}});
 vm.runInContext(source.slice(source.indexOf('app.get("/api/feira/creditos"'),source.indexOf('const PROFILE_AVATAR_IDS')),ctx);
 const res={set(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 handler({},res);assert.equal(res.code,401);assert.equal(seen,undefined);
 handler({session:{account:{accountId:'own-account'}},query:{accountId:'another-account'}},res);assert.equal(seen,'own-account');
});
