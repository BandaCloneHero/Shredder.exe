const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { executar } = require('../migrate-identities');
const { criarPersistenciaPartidas } = require('../partidas');
const { validarPreservacaoIdentidades } = require('../identidades');
const { validarNomeConta, lerOperadoresOficiais } = require('../operadores');
const { gravarJsonAtomico } = require('../persistencia-json');
const google = { projectId: 'shredder-test', uid: 'google-user-1' };

function fixture(t, legado = false) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shredder-identities-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'accounts.json');
    const accounts = { ana: { username: 'Ana', salt: 'salt', passwordHash: 'hash', currency: 90, moedas: 90, achievements: ['custom'], extra: { keep: true }, createdAt: '2020-01-01', updatedAt: '2020-01-02' }, bia: { username: 'Bia' } };
    fs.writeFileSync(file, JSON.stringify(legado ? { ...accounts, bandRecords: {}, fairAchievement: { keep: true } } : { accounts, bandRecords: {}, fairAchievement: { keep: true } }));
    const store = criarPersistenciaPartidas(file, { operadores: () => new Set(['chefe']) });
    return { dir, file, store, read: () => JSON.parse(fs.readFileSync(file, 'utf8')), raw: () => fs.readFileSync(file, 'utf8') };
}
const accounts = raiz => raiz.accounts || raiz;

test('construir persistência não migra nem cria backups; migração exige autorização', t => {
    const f = fixture(t), antes = f.raw();
    criarPersistenciaPartidas(f.file);
    assert.throws(() => f.store.migrarIdentidades(), e => e.status === 403);
    assert.equal(f.raw(), antes);
    assert.equal(fs.existsSync(path.join(f.dir, '.backups')), false);
});
for (const legado of [false, true]) test(`migração aditiva com backup exato, IDs únicos e idempotência (legado=${legado})`, t => {
    const f = fixture(t, legado), antes = f.raw(), original = f.read();
    const salvo = f.store.migrarIdentidades({ autorizar: true });
    assert.equal(fs.readFileSync(salvo.backup, 'utf8'), antes);
    assert.equal(fs.statSync(salvo.backup).mode & 0o777, 0o600);
    assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
    assert.equal(salvo.atualizadas, 2);
    const nova = f.read();
    const ids = ['ana', 'bia'].map(key => accounts(nova)[key].accountId);
    assert.equal(new Set(ids).size, 2);
    for (const key of ['ana', 'bia']) {
        const { accountId, authProviders, ...resto } = accounts(nova)[key];
        assert.match(accountId, /^[a-f0-9-]{36}$/);
        assert.deepEqual(authProviders, {});
        assert.deepEqual(resto, accounts(original)[key]);
    }
    assert.deepEqual(nova.bandRecords, original.bandRecords);
    assert.deepEqual(nova.fairAchievement, original.fairAchievement);
    const raw = f.raw();
    assert.equal(f.store.migrarIdentidades({ autorizar: true }).atualizadas, 0);
    assert.equal(f.raw(), raw);
});

test('erro de backup impede qualquer alteração; falha de rename preserva base e backup', t => {
    const f = fixture(t), antes = f.raw();
    fs.writeFileSync(path.join(f.dir, '.backups'), 'block');
    assert.throws(() => f.store.migrarIdentidades({ autorizar: true }));
    assert.equal(f.raw(), antes);
    fs.unlinkSync(path.join(f.dir, '.backups'));
    const rename = fs.renameSync;
    try {
        fs.renameSync = () => { throw new Error('disk'); };
        assert.throws(() => f.store.migrarIdentidades({ autorizar: true }), /disk/);
    } finally { fs.renameSync = rename; }
    assert.equal(f.raw(), antes);
    assert.equal(fs.readFileSync(path.join(f.dir, '.backups', fs.readdirSync(path.join(f.dir, '.backups'))[0]), 'utf8'), antes);
    assert.equal(fs.readdirSync(f.dir).some(n => n.endsWith('.tmp')), false);
});

test('vínculo persiste, é idempotente e localização resiste a reinício', t => {
    const f = fixture(t);
    f.store.migrarIdentidades({ autorizar: true });
    const id = f.read().accounts.ana.accountId, original = f.read().accounts.ana;
    assert.equal(f.store.localizarIdentidadeGoogle(google), null);
    assert.equal(f.store.vincularIdentidadeGoogle(id, google).duplicado, false);
    const depois = f.raw();
    assert.equal(f.store.vincularIdentidadeGoogle(id, google).duplicado, true);
    assert.equal(f.raw(), depois);
    const store = criarPersistenciaPartidas(f.file);
    assert.equal(store.localizarIdentidadeGoogle(google).account.accountId, id);
    assert.equal(store.localizarContaPorId(id).accountKey, 'ana');
    const { authProviders, ...resto } = f.read().accounts.ana;
    const { authProviders: _, ...antes } = original;
    assert.deepEqual(resto, antes);
    assert.equal(typeof authProviders.firebaseGoogle.linkedAt, 'string');
});

test('mesma identidade não vincula duas contas e conta não troca de Google', async t => {
    const f = fixture(t); f.store.migrarIdentidades({ autorizar: true });
    const { ana, bia } = f.read().accounts;
    const outra = criarPersistenciaPartidas(f.file);
    const resultados = await Promise.allSettled([
        Promise.resolve().then(() => f.store.vincularIdentidadeGoogle(ana.accountId, google)),
        Promise.resolve().then(() => outra.vincularIdentidadeGoogle(bia.accountId, google)),
    ]);
    assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(resultados.find(r => r.status === 'rejected').reason.status, 409);
    const antes = f.raw();
    assert.throws(() => f.store.vincularIdentidadeGoogle(ana.accountId, { ...google, uid: 'other' }), e => e.status === 409);
    assert.equal(f.raw(), antes);
});

test('identidade é par projeto/uid, não email, username ou userId da Feira', t => {
    const f = fixture(t); f.store.migrarIdentidades({ autorizar: true });
    const { ana, bia } = f.read().accounts;
    f.store.vincularIdentidadeGoogle(ana.accountId, google);
    f.store.vincularIdentidadeGoogle(bia.accountId, { ...google, projectId: 'another-project' });
    const antes = f.raw();
    for (const g of [{}, { ...google, uid: '' }, { ...google, uid: 'x'.repeat(129) }, { ...google, projectId: '../wrong' }, { ...google, email: 'a@b' }, { ...google, userId: 'feira' }]) {
        assert.throws(() => f.store.localizarIdentidadeGoogle(g), e => e.status === 400);
        assert.throws(() => f.store.vincularIdentidadeGoogle(ana.accountId, g), e => e.status === 400);
    }
    assert.equal(f.raw(), antes);
    assert.equal(f.raw().includes('externalIdentities'), false);
});

test('cadastro gera perfil e vínculo juntos; vínculo existente não cria segunda conta', async t => {
    const f = fixture(t);
    const ops = [f.store, criarPersistenciaPartidas(f.file)];
    const resultados = await Promise.all(ops.map((store, n) => Promise.resolve().then(() => store.criarConta({ username: `Nova${n}`, google }))));
    assert.equal(resultados[0].account.accountId, resultados[1].account.accountId);
    assert.equal(resultados[1].duplicado, true);
    assert.equal(Object.keys(f.read().accounts).length, 3);
    assert.equal(resultados[0].account.gamesPlayed, 0);
    assert.deepEqual(resultados[0].account.resultadosPartidas, {});
    assert.equal(resultados[0].account.passwordHash, undefined);
    const antes = f.raw();
    assert.throws(() => f.store.criarConta({ username: 'Ana', google: { ...google, uid: 'other' } }), e => e.status === 409);
    assert.equal(f.raw(), antes);
});

test('cadastro local continua com senha e perfil completo; não altera contas existentes', t => {
    const f = fixture(t), antes = f.read();
    const salvo = f.store.criarConta({ username: 'Nova', credenciais: { salt: 's', passwordHash: 'h' } });
    assert.equal(salvo.accountKey, 'nova');
    assert.match(salvo.account.accountId, /^[a-f0-9-]{36}$/);
    assert.deepEqual(salvo.account.authProviders, {});
    assert.equal(salvo.account.passwordHash, 'h');
    assert.deepEqual(f.read().accounts.ana, antes.accounts.ana);
    assert.throws(() => f.store.criarConta({ username: 'SemMetodo' }), e => e.status === 400);
});

for (const legado of [false, true]) test(`renomeação preserva ID, vínculo e histórico (legado=${legado})`, t => {
    const f = fixture(t, legado); f.store.migrarIdentidades({ autorizar: true });
    const id = accounts(f.read()).ana.accountId;
    f.store.vincularIdentidadeGoogle(id, google);
    f.store.salvar({ partidaId: 'match', operadorId: 'op', username: 'Ana', instrumento: 'guitarra', musica: 'Song', pontuacao: 100, maiorCombo: 1, precisao: 100, notasAcertadas: 1, notasErradas: 0, fullCombo: true, currency: 5 });
    const original = accounts(f.read()).ana, ranking = f.store.ranking();
    f.store.editarPerfilOperador('Ana', { username: 'AnaNova' }, f.store.lerPerfilOperador('Ana').revisao);
    const nova = accounts(f.read()).ananova;
    for (const key of ['accountId', 'authProviders', 'resultadosPartidas', 'currency', 'moedas', 'songRecords', 'achievements', 'instrumentStats', 'extra', 'createdAt']) {
        assert.deepEqual(nova[key], original[key], key);
    }
    assert.equal(accounts(f.read()).ana, undefined);
    assert.equal(f.store.localizarIdentidadeGoogle(google).accountKey, 'ananova');
    assert.deepEqual(f.store.ranking().map(r => r.pontuacao), ranking.map(r => r.pontuacao));
});

test('campos de identidade não são editáveis pelo painel nem expostos no perfil público', t => {
    const f = fixture(t); f.store.migrarIdentidades({ autorizar: true });
    const id = f.read().accounts.ana.accountId;
    f.store.vincularIdentidadeGoogle(id, google);
    const perfil = f.store.lerPerfilOperador('Ana'), antes = f.raw();
    for (const alteracoes of [{ accountId: randomUUID() }, { authProviders: {} }, { 'authProviders.firebaseGoogle': google }, { externalIdentities: { feira: { userId: 'forged' } } }]) {
        assert.throws(() => f.store.editarPerfilOperador('Ana', alteracoes, perfil.revisao), e => e.status === 400);
        assert.equal(f.raw(), antes);
    }
    assert.equal(JSON.stringify(perfil).includes(google.uid), false);
    assert.equal(JSON.stringify(perfil).includes(id), false);
});

test('configuração de operadores reserva nomes no cadastro e nas duas direções de renomeação', t => {
    const f = fixture(t);
    assert.throws(() => f.store.criarConta({ username: 'CHEFE', google }), e => e.status === 403);
    assert.throws(() => f.store.editarPerfilOperador('Ana', { username: 'chefe' }, f.store.lerPerfilOperador('Ana').revisao), e => e.status === 403);
    const raiz = f.read(); raiz.accounts.chefe = { username: 'Chefe' }; gravarJsonAtomico(f.file, raiz);
    assert.throws(() => f.store.editarPerfilOperador('Chefe', { username: 'Outro' }, f.store.lerPerfilOperador('Chefe').revisao), e => e.status === 403);
    const raw = f.raw();
    f.store.migrarIdentidades({ autorizar: true });
    assert.equal(f.read().accounts.chefe.username, JSON.parse(raw).accounts.chefe.username);
    assert.doesNotThrow(() => validarNomeConta('CHEFE', 'chefe', new Set(['chefe'])));
});

test('reserva de operadores também considera variável de ambiente', () => {
    const anterior = process.env.SHREDDER_OPERADORES_OFICIAIS;
    try {
        process.env.SHREDDER_OPERADORES_OFICIAIS = 'ExtraAdmin, OUTROADMIN';
        assert.ok(lerOperadoresOficiais().has('extraadmin'));
        assert.throws(() => validarNomeConta('extraadmin'), e => e.status === 403);
    } finally {
        if (anterior === undefined) delete process.env.SHREDDER_OPERADORES_OFICIAIS;
        else process.env.SHREDDER_OPERADORES_OFICIAIS = anterior;
    }
});

test('base corrompida ou IDs/vínculos duplicados não são corrigidos destrutivamente', t => {
    const f = fixture(t); f.store.migrarIdentidades({ autorizar: true });
    const original = f.read();
    const patches = [r => r.accounts.bia.accountId = r.accounts.ana.accountId,
        r => r.accounts.ana.accountId = 'invalid', r => r.accounts.ana.authProviders = null,
        r => { for (const c of Object.values(r.accounts)) c.authProviders.firebaseGoogle = { ...google, linkedAt: new Date().toISOString() }; }];
    for (const patch of patches) {
        const raiz = structuredClone(original); patch(raiz); fs.writeFileSync(f.file, JSON.stringify(raiz));
        const antes = f.raw();
        assert.throws(() => f.store.migrarIdentidades({ autorizar: true }));
        assert.throws(() => f.store.localizarIdentidadeGoogle(google));
        assert.equal(f.raw(), antes);
    }
});

test('outros escritores não podem apagar IDs nem transferir vínculos', t => {
    const f = fixture(t); f.store.migrarIdentidades({ autorizar: true });
    f.store.vincularIdentidadeGoogle(f.read().accounts.ana.accountId, google);
    const original = f.read();
    for (const alterar of [r => r.accounts.ana.accountId = randomUUID(), r => delete r.accounts.ana,
        r => delete r.accounts.ana.authProviders.firebaseGoogle,
        r => { r.accounts.bia.authProviders = r.accounts.ana.authProviders; r.accounts.ana.authProviders = {}; }]) {
        const proxima = structuredClone(original); alterar(proxima);
        assert.throws(() => validarPreservacaoIdentidades(original, proxima));
    }
});

test('falha de gravação não deixa vínculo parcial; retentativa permanece possível', t => {
    const f = fixture(t); f.store.migrarIdentidades({ autorizar: true });
    const id = f.read().accounts.ana.accountId, antes = f.raw(), rename = fs.renameSync;
    try {
        fs.renameSync = () => { throw new Error('disk'); };
        assert.throws(() => f.store.vincularIdentidadeGoogle(id, google), /disk/);
        assert.throws(() => f.store.criarConta({ username: 'Nova', google }), /disk/);
    } finally { fs.renameSync = rename; }
    assert.equal(f.raw(), antes);
    assert.equal(f.store.vincularIdentidadeGoogle(id, google).duplicado, false);
});

test('CLI só diagnostica por padrão e só aplica com caminho explícito e backup', t => {
    const f = fixture(t), antes = f.raw();
    assert.throws(() => executar([]), /Uso:/);
    assert.throws(() => executar([f.file, '--force']), /Uso:/);
    assert.deepEqual(executar([f.file]), { pendentes: 2, alterado: false });
    assert.equal(f.raw(), antes);
    const result = executar([f.file, '--aplicar']);
    assert.equal(result.atualizadas, 2);
    assert.equal(fs.readFileSync(result.backup, 'utf8'), antes);
});

test('cadastro inicial sem arquivo cria apenas a nova conta; nomes estruturais são rejeitados', t => {
    const f = fixture(t);
    fs.unlinkSync(f.file); // Exclusivamente a fixture temporária deste teste.
    const salvo = f.store.criarConta({ username: 'Primeira', credenciais: { salt: 's', passwordHash: 'h' } });
    assert.equal(salvo.accountKey, 'primeira');
    assert.deepEqual(Object.keys(f.read().accounts), ['primeira']);
    const antes = f.raw();
    for (const username of ['__proto__', 'constructor', 'prototype', 'accounts', 'bandRecords', 'fairAchievement']) {
        assert.throws(() => f.store.criarConta({ username, google }), e => e.status === 400);
        assert.equal(f.raw(), antes);
    }
});

test('IDs e vínculos existentes são preservados byte a byte nos campos durante a migração parcial', t => {
    const f = fixture(t), raiz = f.read();
    raiz.accounts.ana.accountId = randomUUID();
    raiz.accounts.ana.authProviders = { firebaseGoogle: { ...google, linkedAt: '2026-01-01T00:00:00Z' } };
    gravarJsonAtomico(f.file, raiz);
    const result = f.store.migrarIdentidades({ autorizar: true });
    assert.equal(result.atualizadas, 1);
    assert.deepEqual(f.read().accounts.ana, raiz.accounts.ana);
});
