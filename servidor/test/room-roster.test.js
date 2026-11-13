const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {browserFixture}=require('./helpers/browser-fixture');
const {nomePublicoJogador}=require('../nomes-publicos');
const source=fs.readFileSync(path.join(__dirname,'../../docs/app.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
function fixture(){
 const f=browserFixture(async()=>{throw Error('No network');});const list=f.document.createElement('div');list.id='lobby-list';f.document.body.append(list);
 const select=f.document.querySelector.bind(f.document);f.document.querySelector=s=>s.includes(',')?list:select(s);
 const local={id:'OP-LOCAL',nome:'jogador_abcdef123456',apelido:'Nina'};const actions=[];
 const window={kickPlayer:(...args)=>actions.push(args)};
 const ctx=vm.createContext({window,document:f.document,getPlayer:()=>local});
 vm.runInContext(source.slice(source.indexOf('function nomeParaExibir('),source.indexOf('function formatInstrument('))+source.slice(source.indexOf('window.renderLobbyPlayers ='),source.indexOf('function initializeInstruments()')),ctx);
 return{...f,list,local,window,ctx,actions};
}
test('room roster shows nickname and instrument without internal IDs',()=>{
 const f=fixture();f.window.renderLobbyPlayers({donoId:f.local.id,participantes:[{id:f.local.id,username:f.local.nome,apelido:'Nina',instrumento:'guitarra'},{id:'OP-OTHER',username:'jogador_000000000000',apelido:'Leo',instrumento:'baixo'}]},f.local.nome);
 assert.equal(f.list.children[0].querySelector('strong').textContent,'Nina');assert.equal(f.list.children[0].querySelector('small').textContent,'Guitarra');
 assert.equal(f.list.textContent.includes('OP-'),false);assert.equal(f.list.textContent.includes('jogador_'),false);assert.equal(f.list.textContent.includes('/ VOCÊ'),false);
});
test('legacy OP identifiers resolve current nickname and instrument ownership',()=>{
 const f=fixture();f.window.renderLobbyPlayers({operadores:[f.local.id],instrumentos:{guitarra:f.local.id}},f.local.nome);
 assert.equal(f.list.querySelector('strong').textContent,'Nina');assert.equal(f.list.querySelector('small').textContent,'Guitarra');
});
test('pending instrument selection is explicit without displaying account name',()=>{
 const f=fixture();f.window.renderLobbyPlayers({operadores:[f.local.nome],instrumentos:{}},f.local.nome);
 assert.equal(f.list.querySelector('strong').textContent,'Nina');assert.equal(f.list.querySelector('small').textContent,'Escolhendo instrumento');
});
test('room actions use canonical username while displaying nickname',async()=>{
 const f=fixture();f.window.renderLobbyPlayers({id:'room',donoId:f.local.id,participantes:[{id:'OP-OTHER',username:'canonical_other',apelido:'Leo',instrumento:'baixo'}]},f.local.nome);
 await f.list.querySelector('button').click();assert.deepEqual(f.actions,[['canonical_other','room']]);
});
test('server room state publishes display metadata separately from internal instrument owner',()=>{
 let payload;const username='jogador_abcdef123456';const room={roomId:'room',instrumentos:{guitarra:'OP-LOCAL'},jogadores:[{id:'OP-LOCAL',username}],operadores:{'OP-LOCAL':{nome:username}}};
 const ctx=vm.createContext({nomePublicoJogador,accountStore:{accounts:{[username]:{nickname:'Nina'}}},salas:{room},io:{to:()=>({emit:(_event,data)=>payload=data})}});
 vm.runInContext(server.slice(server.indexOf('function enviarEstadoSala('),server.indexOf('function criarSala()')),ctx);ctx.enviarEstadoSala('room');
 assert.equal(payload.participantes[0].apelido,'Nina');assert.equal(payload.participantes[0].instrumento,'guitarra');assert.equal(payload.instrumentos.guitarra,'OP-LOCAL');assert.equal(payload.operadores[0],username);
});
test('only the actual connected room owner can remove another participant',()=>{
 for(const owner of [true,false]){
  let handler;const room={donoId:'OP-OWNER',socketDonoId:'socket-owner',operadores:{'OP-OTHER':{nome:'canonical_other'}},jogadores:[{id:'OP-OTHER'}],instrumentos:{baixo:'OP-OTHER'}};
  const socket={id:owner?'socket-owner':'socket-other',data:{operadorId:owner?'OP-OWNER':'OP-OTHER',salaId:'room'},username:owner?'canonical_owner':'canonical_other',on:(_e,fn)=>handler=fn};
  const ctx=vm.createContext({socket,salas:{room},io:{to:()=>({emit(){}}),sockets:{adapter:{rooms:new Map()}}},enviarEstadoSala(){},transmitirSalas(){}});
  vm.runInContext(server.slice(server.indexOf('    socket.on("kick_player"'),server.indexOf('    socket.on(\n        "escolher_instrumento"')),ctx);
  handler({roomId:'room',targetUsername:'canonical_other'});assert.equal(Boolean(room.operadores['OP-OTHER']),!owner);
 }
});
