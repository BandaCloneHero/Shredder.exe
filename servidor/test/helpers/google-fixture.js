const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { criarPersistenciaPartidas } = require('../../partidas');
const { gravarJsonAtomico } = require('../../persistencia-json');
const { validarPreservacaoIdentidades } = require('../../identidades');
const { validarNomeConta } = require('../../operadores');
const { validarNomePublico } = require('../../protecao-nomes');
const { registrarRotasGoogle } = require('../../google-auth-routes');

const source = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
const hash = (senha, salt) => crypto.scryptSync(senha, salt, 64).toString('hex');
const GOOGLE_TOKEN = 'google-token-test';
const identidade = { projectId: 'shredder-test', uid: 'validated-google-user' };
const plain = valor => JSON.parse(JSON.stringify(valor));

function fixture(t, { migrar = true, googleOnly = false, gerarUsername } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shredder-google-endpoints-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'accounts.json'), sessionsFile = path.join(dir, 'sessions.json');
    fs.writeFileSync(file, JSON.stringify({ accounts: {
        ana: { username: 'Ana', salt: 'ana-salt', passwordHash: hash('secret', 'ana-salt'), currency: 50, moedas: 50, achievements: ['old-achievement'], extra: { keep: true } },
        bia: { username: 'Bia', salt: 'bia-salt', passwordHash: hash('bia-secret', 'bia-salt') },
        davijohannbecker: { username: 'DAVIJOHANNBECKER', salt: 'admin-salt', passwordHash: hash('admin-secret', 'admin-salt') },
    }, bandRecords: {}, fairAchievement: { keep: true } }));
    const partidas = criarPersistenciaPartidas(file);
    if (migrar) partidas.migrarIdentidades({ autorizar: true });
    const routes = {};
    const app = {
        post: (route, handler) => { routes[`POST ${route}`] = handler; },
        get: (route, handler) => { routes[`GET ${route}`] = handler; },
    };
    const context = vm.createContext({
        fs, path, Buffer, __dirname: path.join(__dirname, '../..'), process, console: { error() {} },
        app, GOOGLE_ONLY: googleOnly, ACCOUNTS_FILE: file, SESSIONS_FILE: sessionsFile, partidas,
        gravarJsonAtomico, validarPreservacaoIdentidades, validarNomeConta, validarNomePublico,
        accountStore: {}, accountStoreOriginal: null, sessions: new Map(), SESSION_DURATION_MS: 7 * 24 * 60 * 60 * 1000,
        randomBytes: crypto.randomBytes, createHash: crypto.createHash, timingSafeEqual: crypto.timingSafeEqual,
        passwordHash: async (senha, salt) => hash(senha, salt),
    });
    vm.runInContext(source.slice(source.indexOf('function refreshAccounts()'), source.indexOf('\nloadAccounts();')), context);
    vm.runInContext(source.slice(source.indexOf('function sessionKey('), source.indexOf('function isOfficialOperator')), context);
    vm.runInContext(source.slice(source.indexOf('app.post("/api/auth/register"'), source.indexOf('app.get("/api/perfil/:username"')), context);
    vm.runInContext(source.slice(source.indexOf('app.get("/api/auth/session"'), source.indexOf('app.post("/api/fases/selecionar"')), context);
    vm.runInContext(source.slice(source.indexOf('function isOfficialOperator'), source.indexOf('app.post("/api/auth/register"')), context);
    context.refreshAccounts();
    const calls = [];
    const hooks = {
        agora: Date.now,
        verificar: async token => {
            if (token !== GOOGLE_TOKEN) throw Object.assign(new Error('Token recusado.'), { status: 401, code: 'INVALID_GOOGLE_TOKEN' });
            return { ...identidade };
        },
        passwordHash: (...args) => context.passwordHash(...args),
    };
    registrarRotasGoogle(app, {
        env:{SHREDDER_GOOGLE_AUTH_ENABLED:'true',GOOGLE_CLIENT_ID:'test-client.apps.googleusercontent.com'},
        googleOnly, ...(gerarUsername ? { gerarUsername } : {}),
        partidas,
        verificarIdTokenGoogle: (token, options) => { calls.push({ token, options }); return hooks.verificar(token, options); },
        getAuthenticatedSession: req => context.getAuthenticatedSession(req),
        refreshAccounts: () => context.refreshAccounts(),
        createSession: (...args) => context.createSession(...args),
        passwordHash: (...args) => hooks.passwordHash(...args),
        agora: () => hooks.agora(),
    });
    const call = async (route, { body, token, origin, contentType = 'application/json', ip = '127.0.0.1', headers = {}, autoAttempt = true } = {}) => {
        if (autoAttempt && route.startsWith('POST /api/auth/google') && route !== 'POST /api/auth/google/start' && body && typeof body === 'object' && !Array.isArray(body) && !Object.hasOwn(body,'loginId') && typeof body.idToken === 'string') {
            const attempt=await call('POST /api/auth/google/start',{body:{},origin,ip,headers,contentType,autoAttempt:false});
            if(attempt.code !== 200) return attempt;
            body={...body,loginId:attempt.data.loginId};
        }
        const request = {
            body, ip,
            headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}), ...headers },
            is: tipo => tipo === contentType,
        };
        const response = {
            code: 200, headers: {},
            status(code) { this.code = code; return this; },
            set(key, valor) { this.headers[key.toLowerCase()] = valor; return this; },
            json(data) { this.data = plain(data); return this; },
        };
        await routes[route](request, response);
        return response;
    };
    const read = () => JSON.parse(fs.readFileSync(file));
    return {
        file, sessionsFile, context, partidas, hooks, calls, call, read,
        raw: () => fs.readFileSync(file, 'utf8'),
        session: (key = 'ana') => { context.refreshAccounts(); return context.createSession(key); },
        bind: (key = 'ana', dados = identidade) => partidas.vincularIdentidadeGoogle(read().accounts[key].accountId, dados),
        authorized: token => context.isOfficialOperator({ headers: { authorization: `Bearer ${token}` } }).ok,
    };
}
module.exports = { fixture, GOOGLE_TOKEN, identidade, hash };
