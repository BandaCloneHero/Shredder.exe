require('./helpers/offline-network.cjs');
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {randomUUID}=require('node:crypto');
const {criarPersistenciaPartidas,validarResultado}=require('../partidas');
const {criarCreditosFeira,URL_LOGIN,URL_GAME_CREDIT,URL_BALANCE}=require('../feira-creditos');
const names=['ana','bia','caio','duda'],instruments=['guitarra','baixo','bateria','teclado'];
function setup(t,{precisoes=[100,60,40,10],mode='google',fase=1,musica='Fake band song',request, usarRegrasOficiais=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shredder-band-rewards-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const accountsFile=path.join(dir,'accounts.json'),ledger=path.join(dir,'ledger.json');
 fs.writeFileSync(accountsFile,JSON.stringify({accounts:Object.fromEntries(names.slice(0,precisoes.length).map((name,i)=>[name,{username:name,accountId:randomUUID(),authProviders:{google:{provider:'google',sub:'sub-'+name,linkedAt:new Date().toISOString()}},fases:{desbloqueadas:[1,2,3]}}]))}));
 const partidas=criarPersistenciaPartidas(accountsFile),results=[],calls=[];
 for(let i=0;i<precisoes.length;i++){
  const r=validarResultado({partidaId:'unity_test_'+instruments[i],operadorId:'OP-'+i,username:names[i],instrumento:instruments[i],modo:'historia',fase,musica,pontuacao:100,precisao:precisoes[i],maiorCombo:1,notasAcertadas:Math.floor(precisoes[i]),notasErradas:100-Math.floor(precisoes[i]),fullCombo:false,concluida:true,bossDerrotado:true});
  partidas.salvar(r,{origemExecutavel:true});results.push({username:r.username,partidaId:r.partidaId});
 }
 const env={SHREDDER_FEIRA_CREDITS_ENABLED:'true',SHREDDER_FEIRA_CREDIT_AUTH:mode,SHREDDER_FEIRA_CUSTOM_VALUES_CONFIRMED:'true',SHREDDER_FEIRA_GAME_SECRET:'synthetic-game-secret'};
 const contas=()=>JSON.parse(fs.readFileSync(accountsFile,'utf8')).accounts;
 const service=criarCreditosFeira({arquivo:ledger,env,...(!usarRegrasOficiais && {regras:{fases:[{fase:1,dificuldade:'facil',musicas:['Fake band song']},{fase:2,dificuldade:'media',musicas:['Fake band song']},{fase:3,dificuldade:'dificil',musicas:['Fake band song']}]} }),resolverConta:({username,accountId})=>username?contas()[username]:Object.values(contas()).find(a=>a.accountId===accountId),fetch:async(url,options)=>{calls.push({url,options});if(request)return request(url,options);if(url===URL_LOGIN){const who=names.indexOf(options.headers.Authorization.slice('Bearer proof-'.length));return{status:200,json:async()=>({user:101+who,operator:true})};}if(url===URL_BALANCE)return{status:200,json:async()=>({balance:1234})};return{status:201,json:async()=>mode==='google'?{operation:1000+calls.length}:{operationId:1000+calls.length}};}});
 for(const name of names.slice(0,precisoes.length))service.guardarCredencial({identidade:{provider:'google',sub:'sub-'+name},token:'proof-'+name,expiresAt:Date.now()+60000});
 return{service,results,calls,env,ledger,accountsFile,contas,ticket:{jogadores:results.map(r=>({nome:r.username}))},read:()=>JSON.parse(fs.readFileSync(ledger,'utf8'))};
}
test('real persisted results produce the approved 145/107/88/60 split and one immutable group',async t=>{
 const f=setup(t);const queued=f.service.registrarConfirmados(f.results,{ticket:f.ticket});assert.equal(queued.total,400);assert.equal(queued.registered,4);assert.equal(f.calls.length,0);
 await f.service.processarPendentes();assert.equal(f.calls.length,4);assert.deepEqual(f.calls.map(c=>JSON.parse(c.options.body).value),[145,107,88,60]);
 assert.equal(Object.keys(f.read().groups).length,1);assert.equal(Object.values(f.read().entries).reduce((s,e)=>s+e.value,0),400);
 assert.equal(f.service.registrarConfirmados([...f.results].reverse(),{ticket:f.ticket}).registered,0);await f.service.processarPendentes();assert.equal(f.calls.length,4);
});
for (const [fase, pasta, total] of [
    [1, 'Campanha/Kairós', 400],
    [2, 'Campanha/Neon em Ruínas', 600],
    [3, 'Campanha/Colapso do Núcleo', 800],
]) {
    test(`a vitória na música oficial da fase ${fase} envia ${total} tijolinhos ao vencedor solo`, async t => {
        const ini = fs.readFileSync(path.join(__dirname, '../../musicas/musicas_autorais', pasta, 'song.ini'), 'utf8');
        const musica = /^name\s*=\s*(.+)$/mi.exec(ini)[1].trim();
        const f = setup(t, { precisoes: [75], fase, musica, usarRegrasOficiais: true });
        assert.equal(f.service.registrarConfirmados(f.results, { ticket: f.ticket }).total, total);
        await f.service.processarPendentes();
        assert.equal(f.calls.length, 1);
        assert.equal(JSON.parse(f.calls[0].options.body).value, total);
    });
}
test('a faixa de teste e a música na fase trocada ficam fora das recompensas oficiais', async t => {
    for (const musica of ['Teste de creditos - Shredder', 'Colapso do Núcleo']) {
        const f = setup(t, { precisoes: [75], fase: 1, musica, usarRegrasOficiais: true });
        assert.equal(f.service.registrarConfirmados(f.results, { ticket: f.ticket }).status, 'song_not_configured');
        await f.service.processarPendentes();
        assert.equal(f.calls.length, 0);
    }
});
test('equal four-player accuracy yields 100 each on easy',async t=>{
 const f=setup(t,{precisoes:[100,100,100,100]});f.service.registrarConfirmados(f.results);await f.service.processarPendentes();assert.deepEqual(f.calls.map(c=>JSON.parse(c.options.body).value),[100,100,100,100]);
});
test('partial band, repeated player, unconfigured song and incomplete saved result never queue',t=>{
 const f=setup(t);assert.equal(f.service.registrarConfirmados(f.results.slice(0,3),{ticket:f.ticket}).registered,0);
 assert.equal(f.service.registrarConfirmados([f.results[0],f.results[0]]).registered,0);
 const g=setup(t,{musica:'Not configured'});assert.equal(g.service.registrarConfirmados(g.results).status,'song_not_configured');
 const accounts=f.contas();accounts.ana.resultadosPartidas[f.results[0].partidaId].concluida=false;fs.writeFileSync(f.accountsFile,JSON.stringify({accounts}));assert.equal(f.service.registrarConfirmados(f.results).registered,0);assert.equal(f.calls.length,0);
});
test('secret mode resolves Feira ID from Google-authenticated login, then sends userId/price only',async t=>{
 const f=setup(t,{precisoes:[100],mode:'secret'});const id=f.contas().ana.accountId;
 f.service.registrarConfirmados(f.results);await f.service.processarPendentes();assert.equal(Object.values(f.read().entries)[0].status,'awaiting_feira');assert.equal(f.calls.length,0);
 const linked=await f.service.vincular(id);assert.equal(linked.userId,101);assert.equal(f.calls[0].url,URL_LOGIN);assert.equal(f.calls[0].options.headers.Authorization,'Bearer proof-ana');
 await new Promise(setImmediate);await f.service.processarPendentes();const credit=f.calls.find(c=>c.url===URL_GAME_CREDIT);assert.ok(credit);assert.deepEqual(JSON.parse(credit.options.body),{userId:101,price:400});assert.equal(credit.options.headers.Authorization,'Bearer synthetic-game-secret');
 assert.equal(Object.values(f.read().entries)[0].status,'paid');assert.equal(f.contas().ana.operator,undefined);
 const persisted=fs.readFileSync(f.ledger,'utf8');assert.equal(persisted.includes('proof-ana'),false);assert.equal(persisted.includes('synthetic-game-secret'),false);
});
test('a Feira userId cannot be rebound to a second local account',async t=>{
 const f=setup(t,{mode:'secret',request:async()=>({status:200,json:async()=>({user:101})})});await f.service.vincular(f.contas().ana.accountId);
 await assert.rejects(f.service.vincular(f.contas().bia.accountId),e=>e.code==='FEIRA_ID_ALREADY_LINKED');
});
test('balance queries use only the authenticated account proof and do not make a credit',async t=>{
 const f=setup(t,{precisoes:[100]});assert.deepEqual(await f.service.consultarSaldo(f.contas().ana.accountId),{balance:1234});assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,URL_BALANCE);assert.equal(fs.existsSync(f.ledger),false);
});
test('legacy fixed-amount pending jobs are quarantined instead of paying under old rules',async t=>{
 const f=setup(t,{precisoes:[100]});fs.writeFileSync(f.ledger,JSON.stringify({version:1,entries:{legacy:{id:'legacy',status:'pending',value:3000,accountId:f.contas().ana.accountId}}}));await f.service.processarPendentes();assert.equal(f.calls.length,0);assert.equal(f.read().entries.legacy.status,'unknown');
});
test('changing the transport never automatically retries a pending reward via another endpoint',async t=>{
 const f=setup(t,{precisoes:[100]});f.service.registrarConfirmados(f.results);f.env.SHREDDER_FEIRA_CREDIT_AUTH='secret';await f.service.processarPendentes();assert.equal(f.calls.length,0);assert.equal(Object.values(f.read().entries)[0].status,'unknown');
});
