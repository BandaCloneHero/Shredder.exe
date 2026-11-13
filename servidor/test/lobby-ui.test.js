const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {browserFixture}=require('./helpers/browser-fixture');
const source=fs.readFileSync(path.join(__dirname,'../../docs/app.js'),'utf8');
const lobby=source.slice(source.indexOf('function initializeLobby()'),source.indexOf('function getProgress()'));
function fixture(search=''){
 const f=browserFixture(async()=>{throw Error('No network');});
 for(const id of ['room-list','room-name','band-name','form-criar-sala','lobby-status','lobby-empty','lobby-player']){const e=f.document.createElement(id==='form-criar-sala'?'form':'div');e.id=id;f.document.body.append(e);}
 const handlers={},calls=[];const socket={connected:true,on:(event,fn)=>handlers[event]=fn,emit:(...args)=>calls.push(args)};
 const player={id:'OP-FAKE',nome:'canonical_user',apelido:'Meu Apelido'};
 const window={socket,shredderAccount:{token:'fake-local-session'},location:{search,href:''}};
 const context=vm.createContext({window,document:f.document,ensurePlayer:()=>player,getPlayer:()=>player,saveRoom(){},URLSearchParams});
 vm.runInContext(source.slice(source.indexOf('function nomeParaExibir('),source.indexOf('function formatInstrument('))+lobby+'\ninitializeLobby();',context);return{...f,window,handlers,calls};
}
const room={roomId:'room-test',roomName:'Ensaio',criadorUsername:'Other',quantidadeJogadores:1,limiteJogadores:4};
test('lobby without room invitation renders rooms without throwing or autojoining',()=>{
 const f=fixture();assert.doesNotThrow(()=>f.handlers.salas_atualizadas([room]));
 assert.equal(f.document.querySelector('#room-list').children.length,1);assert.equal(f.calls.some(c=>c[0]==='entrarSala'),false);
 assert.equal(f.document.querySelector('#lobby-player').textContent,'Meu Apelido');
});
test('missing invitation and empty room list remain usable',()=>{
 const f=fixture('?roomId=gone');assert.doesNotThrow(()=>f.handlers.salas_atualizadas([room]));
 assert.equal(f.calls.some(c=>c[0]==='entrarSala'),false);f.handlers.salas_atualizadas([]);assert.equal(f.document.querySelector('#lobby-empty').hidden,false);
});
test('valid invitation joins once using canonical identity rather than visible nickname',()=>{
 const f=fixture('?roomId=room-test');f.handlers.salas_atualizadas([room]);f.handlers.salas_atualizadas([room]);
 const joins=f.calls.filter(c=>c[0]==='entrarSala');assert.equal(joins.length,1);assert.equal(joins[0][1].username,'canonical_user');
});
test('full invited room is disabled and does not send a join request',()=>{
 const f=fixture('?roomId=room-test');f.handlers.salas_atualizadas([{...room,quantidadeJogadores:4}]);
 assert.equal(f.calls.some(c=>c[0]==='entrarSala'),false);assert.equal(f.document.querySelector('#room-list').children[0].disabled,true);
 assert.match(f.document.querySelector('#lobby-status').textContent,/cheia/);
});

test('room creator displays the saved nickname and never a generated account name',()=>{
 const f=fixture();f.handlers.salas_atualizadas([{...room,criadorUsername:'jogador_abcdef123456',criadorApelido:'Nome da Banda'}]);
 assert.equal(f.document.querySelector('#room-list').children[0].querySelector('small').textContent,'Criada por Nome da Banda');
 f.handlers.salas_atualizadas([{...room,criadorUsername:'jogador_abcdef123456'}]);
 assert.equal(f.document.querySelector('#room-list').textContent.includes('jogador_abcdef123456'),false);
});
