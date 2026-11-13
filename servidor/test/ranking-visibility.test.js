const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const policy=require('../../docs/js/ranking-policy');
const {criarPersistenciaPartidas}=require('../partidas');
const {nomePublicoJogador}=require('../nomes-publicos');
test('ranking excludes the requested title with case whitespace and unicode normalization',()=>{
 for(const musica of ['nigger','NIGGER','  Nigger  ','ｎｉｇｇｅｒ'])assert.equal(policy.permitir({musica}),false);
 for(const musica of ['Song','Other title',''])assert.equal(policy.permitir({musica}),true);
 assert.equal(policy.permitir({pontuacao:10}),true);
});
test('both individual and band rankings exclude the title without changing saved history',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shredder-ranking-visibility-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'accounts.json');
 const result=musica=>({instrumento:'guitarra',musica,pontuacao:100,modo:'freeplay'});
 const data={accounts:{ana:{username:'Ana',nickname:'Palco',moedas:123,resultadosPartidas:{hidden:result('nigger'),safe:result('Safe song')}}},bandRecords:{hidden:{musica:'nigger',banda:{nome:'Band'},pontuacao:100},safe:{musica:'Safe song',banda:{nome:'Band'},pontuacao:200}}};
 fs.writeFileSync(file,JSON.stringify(data));const before=fs.readFileSync(file,'utf8');
 const records=criarPersistenciaPartidas(file).ranking();assert.equal(records.length,2);assert.ok(records.every(policy.permitir));
 assert.ok(records.some(r=>r.jogadorId==='ana'));assert.ok(records.some(r=>r.jogadorId===null));assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('public names use saved nickname while canonical identity and roles stay unchanged',()=>{
 const accounts={jogador_abcdef123456:{username:'jogador_abcdef123456',nickname:'Minha Banda'}};
 const before=structuredClone(accounts);assert.equal(nomePublicoJogador('jogador_abcdef123456',accounts),'Minha Banda');
 assert.equal(nomePublicoJogador('jogador_000000000000',accounts),'Jogador');assert.equal(nomePublicoJogador('Legacy',accounts),'Legacy');assert.deepEqual(accounts,before);
});
test('server room summaries publish nicknames separately from canonical usernames',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const context=vm.createContext({nomePublicoJogador,accountStore:{accounts:{jogador_abcdef123456:{nickname:'No Palco'}}},salas:{test:{roomId:'test',criadorUsername:'jogador_abcdef123456',jogadores:[{username:'jogador_abcdef123456'}]}},MAX_JOGADORES_SALA:4});
 vm.runInContext(source.slice(source.indexOf('function resumoSalas()'),source.indexOf('function transmitirSalas()')),context);
 const r=context.resumoSalas()[0];assert.equal(r.criadorApelido,'No Palco');assert.equal(r.criadorUsername,'jogador_abcdef123456');assert.equal(r.jogadores[0],'jogador_abcdef123456');
});
