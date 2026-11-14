const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { criarCatalogoMusicas, instrumentosMidi, instrumentosChart, normalizarNomeMusica, registrarRotaCapas } = require('../catalogo-musicas');
const { avaliarMusica } = require('../../docs/js/music-policy');
function midi(tracks) {
 const header = Buffer.from('4d546864000000060001000000c0', 'hex'); header.writeUInt16BE(tracks.length, 10);
 return Buffer.concat([header, ...tracks.map(([name, notes]) => {
  const events = Buffer.from([0,255,3,name.length,...Buffer.from(name),...notes.flatMap(n=>[0,144,n,100]),0,255,47,0]);
  const h = Buffer.alloc(8);h.write('MTrk');h.writeUInt32BE(events.length,4);return Buffer.concat([h,events]);
 })]);
}
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shredder-songs-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 function song(folder, instruments, name='Música de teste') {
  const dir=path.join(root,folder);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'song.ini'),`[song]\nname = ${name}\nartist = Banda\ndiff_keys = 5\nsong_length = 123000\n`);
  fs.writeFileSync(path.join(dir,'notes.mid'),midi(instruments));fs.writeFileSync(path.join(dir,'song.ogg'),'fixture');return dir;
 }
 return {root,song};
}
test('MIDI uses charted playable notes, not metadata, velocity-zero, markers or vocals',()=>{
 const content=midi([['PART GUITAR',[96]],['PART BASS',[96]],['PART DRUMS',[96]],['PART KEYS',[96]],['PART VOCALS',[60]]]);
 assert.deepEqual(instrumentosMidi(content),['guitarra','baixo','bateria','teclado']);
 assert.deepEqual(instrumentosMidi(midi([['PART GUITAR',[116]],['PART VOCALS',[60]],['PART REAL_KEYS_X',[60]]])),['teclado']);
 const zero=midi([['PART GUITAR',[96]]]);zero[zero.length-5]=0;assert.deepEqual(instrumentosMidi(zero),[]);
 assert.throws(()=>instrumentosMidi(Buffer.from('bad')));
});
test('MIDI accepts running status and rejects a truncated event',()=>{
 const b=midi([['PART GUITAR',[96,97]]]);const index=b.indexOf(Buffer.from([0,144,97,100]));
 const running=Buffer.concat([b.subarray(0,index+1),b.subarray(index+2)]);running.writeUInt32BE(b.readUInt32BE(18)-1,18);
 assert.deepEqual(instrumentosMidi(running),['guitarra']);assert.throws(()=>instrumentosMidi(b.subarray(0,b.length-2)));
});
test('chart reads real note sections at all difficulties, skipping events and empty instruments',()=>{
 assert.deepEqual(instrumentosChart('[ExpertSingle]\n{\n0 = N 0 0\n}\n[HardDoubleBass]\n{\n1 = N 7 0\n}\n[ExpertDrums]\n{\n2 = N 1 0\n}\n[EasyKeyboard]\n{\n3 = N 2 0\n}'),['guitarra','baixo','bateria','teclado']);
 assert.deepEqual(instrumentosChart('[ExpertSingle]\n{\n0 = S 2 120\n}\n[ExpertDrums]\n{\n2 = N 66 0\n}'),[]);
});
test('recursive catalog includes nested charts with stable opaque IDs and no private filesystem paths',t=>{
 const f=fixture(t);f.song('pack/band/song',[['PART GUITAR',[96]]]);
 fs.mkdirSync(path.join(f.root,'audio only'));fs.writeFileSync(path.join(f.root,'audio only','guitar.ogg'),'audio');
 fs.symlinkSync(path.join(f.root,'pack'),path.join(f.root,'outside-link'),'dir');
 const c=criarCatalogoMusicas({raiz:f.root,ttl:0});const a=c.listar();assert.equal(a.musicas.length,1);assert.equal(a.indisponiveis,0);
 assert.deepEqual(a.musicas[0].instrumentos,['guitarra']);assert.equal(a.musicas[0].id,c.listar().musicas[0].id);
 assert.equal(JSON.stringify(a).includes(f.root),false);assert.equal(JSON.stringify(a).includes('pack/'),false);
});
test('unreadable charts are counted, missing audio blocks instruments, absence of folder fails safely',t=>{
 const f=fixture(t);const a=f.song('a',[['PART GUITAR',[96]]]);const b=f.song('b',[['PART BASS',[96]]]);
 fs.writeFileSync(path.join(a,'notes.mid'),'invalid');fs.unlinkSync(path.join(b,'song.ogg'));
 const result=criarCatalogoMusicas({raiz:f.root}).listar();assert.equal(result.indisponiveis,1);assert.deepEqual(result.musicas[0].instrumentos,[]);
 assert.throws(()=>criarCatalogoMusicas({raiz:path.join(f.root,'missing')}).listar());
});
test('policy blocks too many players, missing/wrong/duplicate instruments, while allowing subsets',()=>{
 const song={instrumentos:['guitarra','baixo']};
 for(const group of [[],[{instrumento:'bateria'}],[{instrumento:null}],[{instrumento:'guitarra'},{instrumento:'guitarra'}],[{instrumento:'guitarra'},{instrumento:'baixo'},{instrumento:'bateria'}]])assert.equal(avaliarMusica(song,group).permitida,false);
 assert.equal(avaliarMusica(song,[{instrumento:'baixo'}]).permitida,true);
 assert.equal(avaliarMusica(song,[{instrumento:'baixo'},{instrumento:'guitarra'}]).permitida,true);
});
test('selection ignores submitted names and checks authoritative room instrument ownership',t=>{
 const f=fixture(t);f.song('song',[['PART GUITAR',[96]]]);const c=criarCatalogoMusicas({raiz:f.root});const song=c.listar().musicas[0];
 const room={jogadores:[{id:'p'}],instrumentos:{guitarra:'p',baixo:null}};
 assert.equal(c.selecionar(song.id,room).nome,'Música de teste');
 room.jogadores.push({id:'q'});room.instrumentos.baixo='q';assert.throws(()=>c.selecionar(song.id,room),/2 jogadores/);
 assert.throws(()=>c.selecionar('../../accounts.json',room));assert.throws(()=>c.selecionar('f'.repeat(24),room));
});
function ticketHandler({owner=true,pending=false,players=1}={}) {
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');let handler;const emitted=[];
 const room={donoId:'owner',socketDonoId:'socket',jogadores:Array.from({length:players},(_,i)=>({id:'p'+i,username:'test'+i})),instrumentos:{guitarra:'p0',baixo:players>1?'p1':null},ticketsPendentes:pending?[{}]:[]};
 const ctx=vm.createContext({socket:{id:'socket',data:{operadorId:owner?'owner':'other',salaId:'r'},on:(_name,fn)=>handler=fn,emit:()=>{}},salas:{r:room},randomUUID:()=> 'test-ticket',proximaOrdemTicket:0,ticketsSessaoPendentes:[],io:{to:()=>({emit:(event,payload)=>emitted.push({event,payload})})},enviarEstadoSala(){},validarFaseDosJogadores(){},catalogoMusicas:{selecionar(id,sala){if(id!=='valid')throw Error('Escolha uma música do catálogo.');if(sala.jogadores.length>1)throw Error('Música incompatível.');return{id:'valid',nome:'Do catálogo',artista:'Banda',instrumentos:['guitarra']};}}});
 vm.runInContext(server.slice(server.indexOf('    socket.on(\n        "owner_emitir_ticket"'),server.indexOf('    function entrarNaSala(')),ctx);
 return{room,emitted,run(modo){let result;handler({roomId:'r',modo},r=>result=r);return result;}};
}
test('ticket socket rejects non-owner, pending ticket, stale group and missing song',()=>{
 for(const options of [{owner:false},{pending:true},{players:2}]){const f=ticketHandler(options);assert.equal(f.run({tipo:'freeplay',musicaId:'valid'}).ok,false);assert.equal(f.emitted.length,0);}
 assert.equal(ticketHandler().run({tipo:'freeplay'}).ok,false);
});
test('ticket and room broadcast carry canonical song; story still follows its existing flow',()=>{
 const f=ticketHandler();assert.equal(f.run({tipo:'freeplay',musicaId:'valid',musica:{nome:'Forged'},fase:99}).ok,true);
 assert.equal(f.room.ultimoTicket.musica,'Do catálogo');assert.equal(f.room.ultimoTicket.modo.fase,null);
 assert.equal(f.emitted[0].payload.modo.musica.nome,'Do catálogo');
 const story=ticketHandler();assert.equal(story.run({tipo:'historia',fase:1}).ok,true);assert.equal(story.room.ultimoTicket.modo.fase,1);
});
test('current library is entirely indexed, with stable unique IDs and known multi-instrument arrangements',()=>{
 const result=criarCatalogoMusicas().listar();assert.ok(result.musicas.length>100);assert.equal(result.indisponiveis,0);
 assert.equal(new Set(result.musicas.map(s=>s.id)).size,result.musicas.length);
 const chaos=result.musicas.find(s=>s.artista==='Chaosbay');assert.deepEqual(chaos.instrumentos,['guitarra','baixo','bateria','teclado']);
});

test('selected song comparison tolerates presentation markup and canonical Unicode only',()=>{
 assert.equal(normalizarNomeMusica(' <color=red>Águia</color> '),normalizarNomeMusica('ÁGUIA'));
 assert.notEqual(normalizarNomeMusica('Song A'),normalizarNomeMusica('Song B'));
});
test('unavailable catalog fails with a sanitized error rather than disclosing a filesystem path',t=>{
 const f=fixture(t);const c=criarCatalogoMusicas({raiz:path.join(f.root,'missing')});
 assert.throws(()=>c.selecionar('a'.repeat(24),{jogadores:[],instrumentos:{}}),error=>!error.message.includes(f.root)&&/Catálogo indisponível/.test(error.message));
});
test('catalog API serves metadata and returns a sanitized 503 when the library is unavailable',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 for(const failed of [false,true]){
  let handler;const ctx=vm.createContext({app:{get:(route,fn)=>{assert.equal(route,'/api/musicas');handler=fn;}},catalogoMusicas:{listar(){if(failed)throw Error('/private/path');return{musicas:[{id:'song'}],indisponiveis:0};}}});
  vm.runInContext(source.slice(source.indexOf('app.get("/api/musicas"'),source.indexOf('const ACCOUNTS_FILE')),ctx);
  const res={code:200,set(name,value){assert.equal(name,'Cache-Control');assert.equal(value,'no-store');},status(n){this.code=n;return this;},json(data){this.body=data;return this;}};
  handler({},res);assert.equal(res.code,failed?503:200);assert.equal(res.body.ok,!failed);assert.equal(JSON.stringify(res.body).includes('/private/path'),false);
 }
});
test('results for another song are rejected before being attached to a selected ticket',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');const start=source.indexOf('    if (ticket.modo?.musica?.nome');const end=source.indexOf('    const instrumentosTicket',start);
 const ctx=vm.createContext({normalizarNomeMusica});vm.runInContext(`function check(ticket,dados,res){${source.slice(start,end)}return 'accepted';}`,ctx);
 const ticket={modo:{musica:{nome:'Águia'}}};const res={status(n){this.code=n;return this;},json(value){return value;}};
 assert.equal(ctx.check(ticket,{musica:'Another song'},res).ok,false);assert.equal(res.code,409);assert.equal(ticket.resultadosExecutavel,undefined);
 assert.equal(ctx.check(ticket,{musica:' <b>ÁGUIA</b> '},res),'accepted');
 assert.equal(ctx.check({modo:{tipo:'historia'}},{musica:'Any campaign song'},res),'accepted');
});

test('cover metadata uses opaque URLs; only known image names from real song folders can be served',t=>{
 const f=fixture(t);const dir=f.song('with cover',[['PART GUITAR',[96]]]);f.song('without cover',[['PART GUITAR',[96]]],'No cover');
 fs.writeFileSync(path.join(dir,'album.jpg'),'test-image');fs.writeFileSync(path.join(dir,'private.txt'),'not-an-image');
 const c=criarCatalogoMusicas({raiz:f.root});const songs=c.listar().musicas;const song=songs.find(s=>s.nome==='Música de teste');
 assert.equal(song.capaUrl,`/api/musicas/${song.id}/capa`);assert.equal(c.localizarCapa(song.id),path.join(dir,'album.jpg'));
 assert.equal(songs.find(s=>s.nome==='No cover').capaUrl,null);assert.equal(c.localizarCapa('../../accounts.json'),null);
 assert.equal(c.localizarCapa('a'.repeat(24)),null);assert.equal(JSON.stringify(songs).includes(dir),false);
 fs.unlinkSync(path.join(dir,'album.jpg'));assert.equal(c.localizarCapa(song.id),null);
});
test('cover lookup rejects symlink replacement after caching',t=>{
 const f=fixture(t);const dir=f.song('song',[['PART GUITAR',[96]]]);const cover=path.join(dir,'album.png');fs.writeFileSync(cover,'cover');
 const c=criarCatalogoMusicas({raiz:f.root});const song=c.listar().musicas[0];
 const target=path.join(f.root,'private.txt');fs.writeFileSync(target,'private');fs.unlinkSync(cover);fs.symlinkSync(target,cover);
 assert.equal(c.localizarCapa(song.id),null);
});
test('cover endpoint only serves the resolved image with bounded caching and sanitized errors',()=>{
 for(const state of ['found','missing','unavailable','send-error']){
  let handler,sent;registrarRotaCapas({get:(route,fn)=>{assert.equal(route,'/api/musicas/:id/capa');handler=fn;}},{localizarCapa(id){assert.equal(id,'test-id');if(state==='unavailable')throw Error('/private');return state==='missing'?null:'/library/album.png';}});
  const res={code:200,set(name,value){assert.equal(name,'X-Content-Type-Options');assert.equal(value,'nosniff');},status(n){this.code=n;return this;},end(){this.ended=true;return this;},sendFile(file,options,callback){sent=file;assert.equal(options.maxAge,300000);if(state==='send-error')callback(Error('/private'));}};
  handler({params:{id:'test-id'}},res);assert.equal(res.code,state==='found'?200:state==='unavailable'?503:404);
  if(state==='found')assert.equal(sent,'/library/album.png');else assert.equal(res.ended,true);
 }
});
