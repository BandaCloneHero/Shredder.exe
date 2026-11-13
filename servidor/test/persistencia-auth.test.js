const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { criarPersistenciaPartidas } = require('../partidas');
const { gravarJsonAtomico } = require('../persistencia-json');
const { validarPreservacaoIdentidades } = require('../identidades');
const { validarNomeConta } = require('../operadores');
const { validarNomePublico } = require('../protecao-nomes');
const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const hash = (senha, salt) => crypto.scryptSync(senha, salt, 64).toString('hex');

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shredder-auth-persistence-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'accounts.json'), sessionsFile = path.join(dir, 'sessions.json');
    fs.writeFileSync(file, JSON.stringify({ accounts: { ana: { username: 'Ana', salt: 's', passwordHash: hash('secret', 's'), currency: 10 } } }));
    const partidas = criarPersistenciaPartidas(file);
    const routes = {};
    const context = vm.createContext({
        fs, path, Buffer, GOOGLE_ONLY: false, __dirname: path.join(__dirname, '..'), process, console: { error() {} },
        app: { post: (route, fn) => routes[route] = fn, get: (route, fn) => routes[route] = fn },
        ACCOUNTS_FILE: file, SESSIONS_FILE: sessionsFile, partidas,
        gravarJsonAtomico, validarPreservacaoIdentidades, validarNomeConta, validarNomePublico,
        accountStore: {}, accountStoreOriginal: null, sessions: new Map(), SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
        randomBytes: crypto.randomBytes, createHash: crypto.createHash, timingSafeEqual: crypto.timingSafeEqual,
        passwordHash: async (senha, salt) => hash(senha, salt),
    });
    vm.runInContext(source.slice(source.indexOf('function refreshAccounts()'), source.indexOf('\nloadAccounts();')), context);
    vm.runInContext(source.slice(source.indexOf('function sessionKey('), source.indexOf('function isOfficialOperator')), context);
    vm.runInContext(source.slice(source.indexOf('app.post("/api/auth/register"'), source.indexOf('app.get("/api/perfil/:username"')), context);
    vm.runInContext(source.slice(source.indexOf('app.get("/api/auth/session"'), source.indexOf('app.post("/api/fases/selecionar"')), context);
    context.refreshAccounts();
    const call = async (route, body, token) => {
        const response = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
        await routes[route]({ body, headers: { authorization: token ? `Bearer ${token}` : '' } }, response);
        return response;
    };
    return { dir, file, sessionsFile, partidas, context, call, read: () => JSON.parse(fs.readFileSync(file)) };
}

test('cadastros concorrentes releem disco após scrypt sem perder perfis ou partidas', async t => {
    const f = fixture(t);
    const [a, b] = await Promise.all([
        f.call('/api/auth/register', { username: 'Nova', password: 'secret' }),
        f.call('/api/auth/register', { username: 'Outra', password: 'secret' }),
    ]);
    assert.equal(a.code, 201); assert.equal(b.code, 201);
    assert.equal(Object.keys(f.read().accounts).length, 3);
    assert.equal(f.read().accounts.ana.currency, 10);
    assert.ok(f.read().accounts.nova.accountId);
    const sessions = JSON.parse(fs.readFileSync(f.sessionsFile));
    assert.equal(Object.keys(sessions).length, 2);
    assert.equal(JSON.stringify(sessions).includes(a.data.token), false);
});

test('cadastros simultâneos com mesmo nome não sobrescrevem a primeira conta', async t => {
    const f = fixture(t);
    const responses = await Promise.all(['Nova', 'NOVA'].map(username => f.call('/api/auth/register', { username, password: 'secret' })));
    assert.deepEqual(responses.map(r => r.code), [201, 409]);
    assert.equal(Object.keys(f.read().accounts).length, 2);
    assert.equal(f.context.sessions.size, 1);
});

test('cadastro em nome oficial não emite sessão nem altera base', async t => {
    const f = fixture(t), antes = fs.readFileSync(f.file, 'utf8');
    const response = await f.call('/api/auth/register', { username: 'DAVIJOHANNBECKER', password: 'secret' });
    assert.equal(response.data.ok, false);
    assert.equal(f.context.sessions.size, 0);
    assert.equal(fs.readFileSync(f.file, 'utf8'), antes);
});

test('falha ao gravar cadastro não emite sucesso nem deixa conta em memória', async t => {
    const f = fixture(t), antes = fs.readFileSync(f.file, 'utf8'), rename = fs.renameSync;
    let response;
    try {
        fs.renameSync = () => { throw new Error('disk failure'); };
        response = await f.call('/api/auth/register', { username: 'Nova', password: 'secret' });
    } finally { fs.renameSync = rename; }
    assert.equal(response.code, 500);
    assert.equal(response.data.ok, false);
    assert.equal(f.context.sessions.size, 0);
    assert.equal(f.context.accountStore.accounts.nova, undefined);
    assert.equal(fs.readFileSync(f.file, 'utf8'), antes);
});

test('falha ao persistir sessão não deixa token válido em memória', t => {
    const f = fixture(t), rename = fs.renameSync;
    try {
        fs.renameSync = () => { throw new Error('disk failure'); };
        assert.throws(() => f.context.createSession('ana'), /disk failure/);
    } finally { fs.renameSync = rename; }
    assert.equal(f.context.sessions.size, 0);
    assert.equal(fs.existsSync(f.sessionsFile), false);
});

test('login antigo e restauração após reinício mantêm formato e autenticação', async t => {
    const f = fixture(t);
    const login = await f.call('/api/auth/login', { username: 'ANA', password: 'secret' });
    assert.equal(login.code, 200);
    assert.equal(login.data.username, 'Ana');
    f.context.sessions = new Map(); f.context.loadSessions();
    const session = await f.call('/api/auth/session', undefined, login.data.token);
    assert.equal(session.data.username, 'Ana');
    const logout = await f.call('/api/auth/logout', undefined, login.data.token);
    assert.equal(logout.data.ok, true);
    f.context.sessions = new Map(); f.context.loadSessions();
    assert.equal((await f.call('/api/auth/session', undefined, login.data.token)).code, 401);
});

test('sessões antigas sem accountId continuam válidas após migração/vínculo', async t => {
    const f = fixture(t);
    const token = f.context.createSession('ana');
    f.partidas.migrarIdentidades({ autorizar: true });
    f.partidas.vincularIdentidadeGoogle(f.read().accounts.ana.accountId, { projectId: 'shredder-test', uid: 'g1' });
    assert.equal((await f.call('/api/auth/session', undefined, token)).data.username, 'Ana');
});

test('conta sem senha retorna 401 e login por senha incorreta continua rejeitado', async t => {
    const f = fixture(t);
    f.partidas.criarConta({ username: 'GoogleOnly', google: { projectId: 'shredder-test', uid: 'g1' } });
    assert.equal((await f.call('/api/auth/login', { username: 'GoogleOnly', password: 'secret' })).code, 401);
    assert.equal((await f.call('/api/auth/login', { username: 'ana', password: 'wrong' })).code, 401);
    assert.equal(f.context.sessions.size, 0);
});

test('troca de senha durante scrypt não autentica usando a senha antiga', async t => {
    const f = fixture(t);
    f.context.passwordHash = async (senha, salt) => {
        const raiz = f.read(); raiz.accounts.ana.passwordHash = hash('changed', salt); gravarJsonAtomico(f.file, raiz);
        return hash(senha, salt);
    };
    assert.equal((await f.call('/api/auth/login', { username: 'ana', password: 'secret' })).code, 401);
    assert.equal(f.context.sessions.size, 0);
});

test('saveAccounts recusa cache antigo e restaura a versão mais recente', t => {
    const f = fixture(t);
    f.context.accountStore.accounts.ana.avatar = 'alterado';
    const raiz = f.read(); raiz.accounts.ana.currency = 999; gravarJsonAtomico(f.file, raiz);
    assert.throws(() => f.context.saveAccounts(), e => e.status === 409);
    assert.equal(f.read().accounts.ana.currency, 999);
    assert.equal(f.read().accounts.ana.avatar, undefined);
    assert.equal(f.context.accountStore.accounts.ana.currency, 999);
});

test('saveAccounts atômico preserva vínculos; falha de disco desfaz mutação do cache', t => {
    const f = fixture(t);
    f.partidas.migrarIdentidades({ autorizar: true });
    f.partidas.vincularIdentidadeGoogle(f.read().accounts.ana.accountId, { projectId: 'shredder-test', uid: 'g1' });
    f.context.refreshAccounts();
    const identidade = f.read().accounts.ana.authProviders;
    f.context.accountStore.accounts.ana.avatar = 'night-sentinel'; f.context.saveAccounts();
    assert.deepEqual(f.read().accounts.ana.authProviders, identidade);
    const antes = fs.readFileSync(f.file, 'utf8'), rename = fs.renameSync;
    f.context.accountStore.accounts.ana.currency = 900;
    try {
        fs.renameSync = () => { throw new Error('disk'); };
        assert.throws(() => f.context.saveAccounts(), /disk/);
    } finally { fs.renameSync = rename; }
    assert.equal(fs.readFileSync(f.file, 'utf8'), antes);
    assert.equal(f.context.accountStore.accounts.ana.currency, 10);
});

test('cache global atualizado após login não pode apagar vínculo gravado no disco', async t => {
    const f = fixture(t);
    f.partidas.migrarIdentidades({ autorizar: true });
    f.partidas.vincularIdentidadeGoogle(f.read().accounts.ana.accountId, { projectId: 'shredder-test', uid: 'g1' });
    const response = await f.call('/api/auth/login', { username: 'ana', password: 'secret' });
    assert.equal(response.code, 200);
    assert.equal(f.context.accountStore.accounts.ana.authProviders.firebaseGoogle.uid, 'g1');
});

test('leitura de sessões corrompidas falha sem continuar com autenticação parcial', t => {
    const f = fixture(t);
    fs.writeFileSync(f.sessionsFile, '{broken');
    assert.throws(() => f.context.loadSessions());
});

test('migração e vínculo não mudam autorização de operador oficial', t => {
    const f = fixture(t);
    const raiz = f.read(); raiz.accounts.davijohannbecker = { username: 'DAVIJOHANNBECKER' }; gravarJsonAtomico(f.file, raiz);
    vm.runInContext(source.slice(source.indexOf('function isOfficialOperator'), source.indexOf('app.post("/api/auth/register"')), f.context);
    const adminToken = f.context.createSession('davijohannbecker'), userToken = f.context.createSession('ana');
    const auth = token => f.context.isOfficialOperator({ headers: { authorization: `Bearer ${token}` } }).ok;
    assert.equal(auth(adminToken), true); assert.equal(auth(userToken), false);
    f.partidas.migrarIdentidades({ autorizar: true });
    f.partidas.vincularIdentidadeGoogle(f.read().accounts.davijohannbecker.accountId, { projectId: 'shredder-test', uid: 'admin-google' });
    assert.equal(auth(adminToken), true); assert.equal(auth(userToken), false);
});

test('troca de credenciais invalida sessões antigas mesmo se sessions.json não puder ser regravado', async t => {
    const f = fixture(t), antigo = f.context.createSession('ana');
    f.partidas.editarPerfilOperador('ana', {}, f.partidas.lerPerfilOperador('ana').revisao, { salt: 'new', passwordHash: hash('new-secret', 'new') });
    // Simula reinício com arquivo antigo de sessões: a geração gravada na conta prevalece.
    f.context.sessions = new Map(); f.context.loadSessions();
    assert.equal((await f.call('/api/auth/session', undefined, antigo)).code, 401);
    const login = await f.call('/api/auth/login', { username: 'ana', password: 'new-secret' });
    assert.equal(login.code, 200);
    assert.equal((await f.call('/api/auth/session', undefined, login.data.token)).code, 200);
    f.context.sessions = new Map(); f.context.loadSessions();
    assert.equal((await f.call('/api/auth/session', undefined, login.data.token)).code, 200);
});

test('cadastro não apaga uma partida recebida durante cálculo da senha', async t => {
    const f = fixture(t);
    f.context.passwordHash = async (senha, salt) => {
        f.partidas.salvar({ partidaId: 'during-register', operadorId: 'op', username: 'Ana', instrumento: 'guitarra', musica: 'Song', pontuacao: 100, maiorCombo: 1, precisao: 100, notasAcertadas: 1, notasErradas: 0, fullCombo: true });
        return hash(senha, salt);
    };
    const response = await f.call('/api/auth/register', { username: 'Nova', password: 'secret' });
    assert.equal(response.code, 201);
    assert.equal(f.read().accounts.ana.resultadosPartidas['during-register'].pontuacao, 100);
});
