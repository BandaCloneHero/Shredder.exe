const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { fixture, GOOGLE_TOKEN, identidade, hash } = require('./helpers/google-fixture');
const { criarGoogleIdentity } = require('../google-identity');
const { gravarJsonAtomico } = require('../persistencia-json');
const LOGIN = 'POST /api/auth/google', REGISTER = 'POST /api/auth/google/register';
const LINK = 'POST /api/auth/google/link', PROVIDERS = 'GET /api/auth/providers';
const body = { idToken: GOOGLE_TOKEN };

function login(f, options = {}) { return f.call(LOGIN, { body, ...options }); }
function link(f, token, options = {}) { return f.call(LINK, { token, body: { ...body, password: 'secret' }, ...options }); }

test('Google sem vínculo informa primeiro acesso sem criar conta nem sessão', async t => {
    const f = fixture(t), antes = f.raw();
    const r = await login(f);
    assert.equal(r.code, 200);
    assert.deepEqual(r.data, { ok: true, needsRegistration: true });
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(f.raw(), antes);
    assert.equal(f.context.sessions.size, 0);
});

test('login Google vinculado usa perfil original e token local, sem expor UID/credenciais', async t => {
    const f = fixture(t); f.bind();
    const antes = f.raw(), r = await login(f);
    assert.equal(r.code, 200);
    assert.equal(r.data.username, 'Ana');
    assert.match(r.data.token, /^[a-f0-9]{64}$/);
    assert.notEqual(r.data.token, GOOGLE_TOKEN);
    assert.deepEqual(Object.keys(r.data).sort(), ['ok', 'token', 'username']);
    assert.equal(f.raw(), antes);
    assert.equal((await f.call('GET /api/auth/session', { token: r.data.token })).code, 200);
    assert.equal((await f.call('GET /api/auth/session', { token: GOOGLE_TOKEN })).code, 401);
    assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(f.sessionsFile))).includes(GOOGLE_TOKEN), false);
    assert.equal(f.authorized(r.data.token), false);
});

test('cadastro Google exige ação explícita e cria perfil completo sem senha inventada', async t => {
    const f = fixture(t), original = f.read();
    const r = await f.call(REGISTER, { body: { ...body, username: 'Nova' } });
    assert.equal(r.code, 201);
    assert.equal(r.data.username, 'Nova');
    const nova = f.read().accounts.nova;
    assert.ok(nova.accountId);
    assert.deepEqual(nova.authProviders.firebaseGoogle.projectId, identidade.projectId);
    assert.equal(nova.authProviders.firebaseGoogle.uid, identidade.uid);
    assert.equal(nova.passwordHash, undefined);
    assert.deepEqual(nova.resultadosPartidas, {});
    assert.equal(nova.currency, 0);
    assert.deepEqual(f.read().accounts.ana, original.accounts.ana);
    assert.match(f.calls[0].options.nonce, /^[a-f0-9]{64}$/);
    assert.equal(f.authorized(r.data.token), false);
});

test('cadastros concorrentes e reenvios de mesmo Google recuperam conta única', async t => {
    const f = fixture(t);
    const results = await Promise.all(['Nova', 'Outra'].map(username => f.call(REGISTER, { body: { ...body, username } })));
    assert.deepEqual(results.map(r => r.code), [201, 200]);
    assert.equal(results[0].data.username, results[1].data.username);
    assert.equal(Object.keys(f.read().accounts).length, 4);
    const antes = f.raw();
    const retry = await f.call(REGISTER, { body: { ...body, username: 'Ana' } });
    assert.equal(retry.code, 200);
    assert.equal(retry.data.username, 'Nova');
    assert.equal(f.raw(), antes);
});

test('cadastro não vincula por nome igual e não reserva nome oficial para perfil novo', async t => {
    const f = fixture(t), antes = f.raw();
    assert.equal((await f.call(REGISTER, { body: { ...body, username: 'Ana' } })).code, 409);
    assert.equal((await f.call(REGISTER, { body: { ...body, username: 'ALPARENGA' } })).code, 403);
    assert.equal(f.raw(), antes);
    assert.equal(f.context.sessions.size, 0);
});

test('UID, email, papel, conta alvo e permissões do navegador são rejeitados', async t => {
    const f = fixture(t), antes = f.raw();
    for (const extras of [{ uid: 'admin' }, { email: 'admin@example.test' }, { role: 'operator' }, { accountId: 'other-account' }, { permissions: ['admin'] }]) {
        assert.equal((await f.call(LOGIN, { body: { ...body, ...extras } })).code, 400);
        assert.equal((await f.call(REGISTER, { body: { ...body, username: 'Nova', ...extras } })).code, 400);
        assert.equal((await link(f, f.session(), { body: { ...body, password: 'secret', ...extras } })).code, 400);
    }
    assert.equal(f.calls.length, 0);
    assert.equal(f.raw(), antes);
});

test('vínculo exige sessão local; token Firebase em Authorization não é sessão', async t => {
    const f = fixture(t), antes = f.raw();
    assert.equal((await link(f)).code, 401);
    assert.equal((await link(f, GOOGLE_TOKEN)).code, 401);
    assert.equal(f.calls.length, 0);
    assert.equal(f.raw(), antes);
});

test('vínculo exige confirmação atual da senha mesmo com sessão válida', async t => {
    const f = fixture(t), token = f.session(), antes = f.raw();
    assert.equal((await link(f, token, { body })).code, 400);
    assert.equal((await link(f, token, { body: { ...body, password: 'wrong' } })).code, 401);
    assert.equal(f.calls.length, 0);
    assert.equal(f.raw(), antes);
});

test('vínculo preserva dados, exige Google recente e rotaciona apenas sessão apresentada', async t => {
    const f = fixture(t), token = f.session(), outraSessao = f.session(), antes = f.read().accounts.ana;
    const r = await link(f, token);
    assert.equal(r.code, 200);
    assert.equal(r.data.linked, true);
    assert.notEqual(r.data.token, token);
    const depois = f.read().accounts.ana;
    const { authProviders: _, ...oldData } = antes;
    const { authProviders, ...newData } = depois;
    assert.deepEqual(newData, oldData);
    assert.equal(authProviders.firebaseGoogle.uid, identidade.uid);
    assert.match(f.calls[0].options.nonce, /^[a-f0-9]{64}$/);
    assert.equal((await f.call('GET /api/auth/session', { token })).code, 401);
    assert.equal((await f.call('GET /api/auth/session', { token: r.data.token })).code, 200);
    assert.equal((await f.call('GET /api/auth/session', { token: outraSessao })).code, 200);
});

test('conta sem accountId pede migração explícita sem alterar base ou fazer migração automática', async t => {
    const f = fixture(t, { migrar: false }), token = f.session(), antes = f.raw();
    const r = await link(f, token);
    assert.equal(r.code, 409);
    assert.equal(r.data.code, 'IDENTITY_MIGRATION_REQUIRED');
    assert.equal(f.raw(), antes);
    assert.equal(f.calls.length, 0);
});

test('conta apenas Google não pode fornecer senha fictícia para trocar de vínculo', async t => {
    const f = fixture(t);
    const novo = await f.call(REGISTER, { body: { ...body, username: 'Nova' } });
    const antes = f.raw(), r = await link(f, novo.data.token);
    assert.equal(r.code, 403);
    assert.equal(r.data.code, 'LOCAL_PASSWORD_REQUIRED');
    assert.equal(f.raw(), antes);
});

test('vínculo já pertencente a outra conta não pode ser transferido', async t => {
    const f = fixture(t); f.bind('bia');
    const token = f.session(), antes = f.raw();
    const r = await link(f, token);
    assert.equal(r.code, 409);
    assert.equal(f.raw(), antes);
    assert.equal((await f.call('GET /api/auth/session', { token })).code, 200);
});

test('conta vinculada não substitui Google e reenvio do mesmo vínculo é idempotente', async t => {
    const f = fixture(t); f.bind();
    const token = f.session(), antes = f.raw();
    f.hooks.verificar = async () => ({ ...identidade, uid: 'different-google' });
    assert.equal((await link(f, token)).code, 409);
    assert.equal(f.raw(), antes);
    f.hooks.verificar = async () => ({ ...identidade });
    const r = await link(f, token);
    assert.equal(r.code, 200);
    assert.equal(f.raw(), antes);
});

test('logout durante validação Firebase impede vínculo e emissão de sessão', async t => {
    const f = fixture(t), token = f.session(), antes = f.raw();
    f.hooks.verificar = async () => {
        await f.call('POST /api/auth/logout', { token });
        return { ...identidade };
    };
    assert.equal((await link(f, token)).code, 401);
    assert.equal(f.raw(), antes);
    assert.equal(f.context.sessions.size, 0);
});

test('senha alterada durante validação invalida vínculo antes da gravação', async t => {
    const f = fixture(t), token = f.session();
    f.hooks.verificar = async () => {
        f.partidas.editarPerfilOperador('ana', {}, f.partidas.lerPerfilOperador('ana').revisao, { salt: 'new-salt', passwordHash: hash('new-secret', 'new-salt') });
        return { ...identidade };
    };
    assert.equal((await link(f, token)).code, 401);
    assert.equal(f.read().accounts.ana.authProviders.firebaseGoogle, undefined);
});

test('mudança de credenciais sem geração e expiração da sessão também impedem vínculo', async t => {
    const f = fixture(t), token = f.session();
    f.hooks.verificar = async () => {
        const raiz = f.read(); raiz.accounts.ana.passwordHash = hash('other', 'ana-salt'); gravarJsonAtomico(f.file, raiz);
        return { ...identidade };
    };
    assert.equal((await link(f, token)).code, 409);
    assert.equal(f.read().accounts.ana.authProviders.firebaseGoogle, undefined);
    const g = fixture(t), token2 = g.session();
    g.hooks.verificar = async () => {
        g.context.sessions.get(g.context.sessionKey(token2)).expiresAt = 0;
        return { ...identidade };
    };
    assert.equal((await link(g, token2)).code, 401);
    assert.equal(g.read().accounts.ana.authProviders.firebaseGoogle, undefined);
});

test('corrida de vínculo é verificada novamente no armazenamento após awaits', async t => {
    const f = fixture(t), token = f.session();
    f.hooks.verificar = async () => { f.bind('bia'); return { ...identidade }; };
    assert.equal((await link(f, token)).code, 409);
    assert.equal(f.read().accounts.ana.authProviders.firebaseGoogle, undefined);
    assert.equal(f.read().accounts.bia.authProviders.firebaseGoogle.uid, identidade.uid);
});

test('providers é privado ao titular e não expõe UID, email, hash ou dados de outro perfil', async t => {
    const f = fixture(t); f.partidas.vincularIdentidadeGoogle(f.read().accounts.bia.accountId, {provider:'google',sub:'direct-subject'});
    assert.equal((await f.call(PROVIDERS)).code, 401);
    assert.equal((await f.call(PROVIDERS, { token: GOOGLE_TOKEN })).code, 401);
    const r = await f.call(PROVIDERS, { token: f.session(), headers: { username: 'bia' } });
    assert.deepEqual(r.data, { ok: true, providers: { password: true, google: { linked: false } }, requiresIdentityMigration: false });
    assert.equal(r.headers['cache-control'], 'no-store');
    const bia = await f.call(PROVIDERS, { token: f.session('bia') });
    assert.equal(bia.data.providers.google.linked, true);
    assert.equal(JSON.stringify(bia.data).includes(identidade.uid), false);
    const legado = fixture(t, { migrar: false });
    assert.equal((await legado.call(PROVIDERS, { token: legado.session() })).data.requiresIdentityMigration, true);
});

test('origem externa, conteúdo não JSON e payloads inválidos falham antes da validação Google', async t => {
    const f = fixture(t);
    assert.equal((await login(f, { origin: 'https://evil.example' })).code, 403);
    assert.equal((await login(f, { headers: { 'sec-fetch-site': 'cross-site' } })).code, 403);
    assert.equal((await login(f, { contentType: 'text/plain' })).code, 415);
    for (const payload of [undefined, [], null, {}, { idToken: 1 }, { idToken: '' }, { idToken: 'x'.repeat(16385) }]) {
        assert.equal((await login(f, { body: payload })).code, 400);
    }
    assert.equal(f.calls.length, 0);
    assert.equal((await login(f, { origin: 'https://shredder.feira-de-jogos.dev.br' })).code, 200);
});

test('limites por IP e por conta protegem validação e confirmação de senha', async t => {
    const f = fixture(t);
    for (let i = 0; i < 30; i++) assert.equal((await login(f)).code, 200);
    const limitado = await login(f);
    assert.equal(limitado.code, 429);
    assert.equal(limitado.headers['retry-after'], '60');
    assert.equal(f.calls.length, 30);
    f.hooks.agora = () => Date.now() + 61000;
    assert.equal((await login(f)).code, 200);
    const g = fixture(t), token = g.session();
    for (let i = 0; i < 5; i++) assert.equal((await link(g, token, { ip: `ip-${i}`, body: { ...body, password: 'wrong' } })).code, 401);
    assert.equal((await link(g, token, { ip: 'another-ip' })).code, 429);
});

test('Google desativado mantém login tradicional e consulta local de provedores', async t => {
    const f = fixture(t);
    f.hooks.verificar = criarGoogleIdentity({ env: {} }).verificarIdTokenGoogle;
    assert.equal((await login(f)).code, 503);
    const tradicional = await f.call('POST /api/auth/login', { body: { username: 'Ana', password: 'secret' } });
    assert.equal(tradicional.code, 200);
    assert.equal((await f.call(PROVIDERS, { token: tradicional.data.token })).code, 200);
});

test('erros não expõem tokens, senha nem detalhes privados de persistência', async t => {
    const f = fixture(t);
    f.hooks.verificar = async () => { throw new Error(`private ${GOOGLE_TOKEN} secret-password credentials.json`); };
    const r = await login(f);
    assert.equal(r.code, 500);
    assert.equal(JSON.stringify(r.data).includes(GOOGLE_TOKEN), false);
    assert.equal(JSON.stringify(r.data).includes('credentials.json'), false);
    assert.equal(f.context.sessions.size, 0);
});

test('falha de disco não cria cadastro parcial nem confirma vínculo não persistido', async t => {
    const f = fixture(t), token = f.session(), antes = f.raw(), rename = fs.renameSync;
    try {
        fs.renameSync = () => { throw new Error(`disk ${GOOGLE_TOKEN}`); };
        assert.equal((await f.call(REGISTER, { body: { ...body, username: 'Nova' } })).code, 500);
        assert.equal((await link(f, token)).code, 500);
    } finally { fs.renameSync = rename; }
    assert.equal(f.raw(), antes);
    assert.equal(f.context.sessions.size, 1);
});

test('falha de sessão após vínculo mantém original válido e permite retentativa segura', async t => {
    const f = fixture(t), token = f.session(), rename = fs.renameSync;
    try {
        fs.renameSync = (from, to) => {
            if (to === f.sessionsFile) throw new Error('session disk failure');
            return rename(from, to);
        };
        assert.equal((await link(f, token)).code, 500);
    } finally { fs.renameSync = rename; }
    assert.equal(f.read().accounts.ana.authProviders.firebaseGoogle.uid, identidade.uid);
    assert.equal((await f.call('GET /api/auth/session', { token })).code, 200);
    const antes = f.raw(), retry = await link(f, token);
    assert.equal(retry.code, 200);
    assert.equal(f.raw(), antes);
});

test('Google não retira permissão de operador existente nem promove usuário comum', async t => {
    const f = fixture(t), adminToken = f.session('davijohannbecker');
    const linked = await link(f, adminToken, { body: { ...body, password: 'admin-secret' } });
    assert.equal(linked.code, 200);
    assert.equal(f.authorized(linked.data.token), true);
    const signed = await login(f);
    assert.equal(signed.data.username, 'DAVIJOHANNBECKER');
    assert.equal(f.authorized(signed.data.token), true);
    assert.equal(f.authorized(f.session('ana')), false);
    assert.equal(f.read().accounts.ana.authProviders.firebaseGoogle, undefined);
});

test('login Google depois de renomeação usa username atual e preserva conta única', async t => {
    const f = fixture(t); f.bind();
    const id = f.read().accounts.ana.accountId;
    f.partidas.editarPerfilOperador('Ana', { username: 'AnaNova' }, f.partidas.lerPerfilOperador('Ana').revisao);
    const r = await login(f);
    assert.equal(r.code, 200);
    assert.equal(r.data.username, 'AnaNova');
    assert.equal(f.read().accounts.ananova.accountId, id);
    assert.equal(Object.keys(f.read().accounts).length, 3);
});

test('tratamento global de erro não registra nem devolve trechos de senha ou token do parser', async () => {
    const vm = require('vm');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    let handler;
    const logs = [];
    vm.runInNewContext(source.slice(source.indexOf('app.use((error, _req, res, _next) => {'), source.indexOf('const PORT =')), {
        app: { use: fn => { handler = fn; } }, console: { error: (...args) => logs.push(args) },
    });
    const response = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
    handler({ status: 400, message: `JSON parse error ${GOOGLE_TOKEN} secret-password` }, {}, response, () => {});
    assert.equal(response.code, 400);
    assert.equal(JSON.stringify(logs).includes(GOOGLE_TOKEN), false);
    assert.equal(JSON.stringify(logs).includes('secret-password'), false);
    assert.equal(JSON.stringify(response.data).includes(GOOGLE_TOKEN), false);
});
