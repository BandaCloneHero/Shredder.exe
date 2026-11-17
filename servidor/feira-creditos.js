const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { gravarJsonAtomico } = require('./persistencia-json');
const { calcularRecompensaBoss } = require('./recompensa-boss');
const regrasPublicas = require('./recompensas-campanha.json');
const URL_CREDIT = 'https://feira-de-jogos.dev.br/api/v2/credit';
const URL_LOGIN = 'https://feira-de-jogos.dev.br/api/v2/login';
const URL_BALANCE = 'https://feira-de-jogos.dev.br/api/v2/balance';
const URL_GAME_CREDIT = 'https://feira-de-jogos.dev.br/api/v2/gameCredit';
const PRODUCT = 87;
const chave = (...dados) => createHash('sha256').update(JSON.stringify(dados)).digest('hex');
const nome = value => String(value).trim().normalize('NFC').toLowerCase();
const falha = (code, message, status = 409) => Object.assign(new Error(message), { code, status });
function configuracaoCreditos(env = process.env) {
    const mode = env.SHREDDER_FEIRA_CREDIT_AUTH || 'secret';
    const url = env.SHREDDER_FEIRA_GAME_CREDIT_URL || URL_GAME_CREDIT;
    let reason = null;
    if (!['google', 'secret'].includes(mode)) reason = 'INVALID_CREDIT_MODE';
    else if (mode === 'secret' && (typeof env.SHREDDER_FEIRA_GAME_SECRET !== 'string' || !env.SHREDDER_FEIRA_GAME_SECRET.trim() || /\s/.test(env.SHREDDER_FEIRA_GAME_SECRET))) reason = 'GAME_SECRET_REQUIRED';
    else if (mode === 'secret' && ![URL_GAME_CREDIT, 'https://feira-de-jogos.dev.br/api/v2/adminCredit'].includes(url)) reason = 'INVALID_CREDIT_URL';
    else if (mode === 'google' && env.SHREDDER_FEIRA_CUSTOM_VALUES_CONFIRMED !== 'true') reason = 'CUSTOM_VALUES_NOT_CONFIRMED';
    return { enabled: env.SHREDDER_FEIRA_CREDITS_ENABLED === 'true' && !reason, product: PRODUCT, mode, reason, url: mode === 'google' ? URL_CREDIT : url };
}
function criarCreditosFeira({ arquivo, resolverConta, regras = regrasPublicas, env = process.env, fetch: request = globalThis.fetch, agora = Date.now, timeoutMs = 10000 } = {}) {
    const credenciais = new Map(), vinculosEmAndamento = new Set();
    let processando = false, reagendar = false;
    const config = () => configuracaoCreditos(env);
    function ler() {
        if (!fs.existsSync(arquivo)) return { version: 1, entries: {}, groups: {}, players: {} };
        const data = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
        if (data?.version !== 1 || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) throw Error('INVALID_CREDIT_LEDGER');
        for (const field of ['groups', 'players']) {
            data[field] ??= {};
            if (typeof data[field] !== 'object' || !data[field] || Array.isArray(data[field])) throw Error('INVALID_CREDIT_LEDGER');
        }
        return data;
    }
    const gravar = data => gravarJsonAtomico(arquivo, data);
    function atualizar(id, patch) {
        const data = ler();
        if (!data.entries[id]) throw Error('MISSING_CREDIT_ENTRY');
        Object.assign(data.entries[id], patch, { updatedAt: new Date(agora()).toISOString() });
        gravar(data);
    }
    function guardarCredencial({ identidade, token, expiresAt }) {
        if (!config().enabled || identidade?.provider !== 'google' || typeof identidade.sub !== 'string' || typeof token !== 'string' || !token || token.length > 16384 || !Number.isFinite(expiresAt) || expiresAt <= agora()) return;
        for (const [sub, value] of credenciais) if (value.expiresAt <= agora()) credenciais.delete(sub);
        if (credenciais.size >= 10000 && !credenciais.has(identidade.sub)) return;
        const previous = credenciais.get(identidade.sub); if (previous) clearTimeout(previous.timer);
        const entry = { token, expiresAt, receivedAt: agora() };
        entry.timer = setTimeout(() => { if (credenciais.get(identidade.sub) === entry) credenciais.delete(identidade.sub); }, Math.min(expiresAt - agora(), 2147483647));
        entry.timer.unref?.(); credenciais.set(identidade.sub, entry);
    }
    function provaDaConta(accountId, recente = false) {
        const conta = resolverConta({ accountId });
        const sub = conta?.authProviders?.google?.sub;
        const prova = sub && credenciais.get(sub);
        if (!prova || prova.expiresAt <= agora() || (recente && agora() - prova.receivedAt > 300000)) throw falha('FEIRA_LOGIN_REQUIRED', 'Saia e entre novamente com Google para conectar sua conta à Feira.', 401);
        return { conta, sub, prova };
    }
    async function vincular(accountId) {
        if (!config().enabled || config().mode !== 'secret') throw falha('FEIRA_DISABLED', 'Conexão com a Feira indisponível.', 503);
        const { sub, prova } = provaDaConta(accountId, true);
        const existing = ler().players[accountId];
        if (existing) {
            if (existing.googleSub !== sub) throw falha('FEIRA_IDENTITY_CHANGED', 'O vínculo Google mudou. Procure o operador.');
            return { linked: true, userId: existing.userId };
        }
        if (vinculosEmAndamento.has(accountId)) throw falha('FEIRA_LINK_PENDING', 'A conexão com a Feira já está sendo processada.');
        vinculosEmAndamento.add(accountId);
        try {
            let response, body;
            try {
                response = await request(URL_LOGIN, { method: 'POST', headers: { Authorization: `Bearer ${prova.token}` }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
                body = [200, 201].includes(response.status) ? await response.json() : null;
            } catch { throw falha('FEIRA_UNAVAILABLE', 'Não foi possível conectar à Feira. Nenhum crédito foi enviado.', 503); }
            if (![200, 201].includes(response.status) || !Number.isSafeInteger(body?.user) || body.user < 1) throw falha('FEIRA_LINK_REJECTED', 'A Feira não confirmou o cadastro. Confira a autorização do cliente Google com o responsável.', 403);
            // Never accept an ID/email supplied by the browser or change an existing binding.
            const current = resolverConta({ accountId });
            if (current?.authProviders?.google?.sub !== sub) throw falha('FEIRA_IDENTITY_CHANGED', 'Sua identidade mudou. Entre novamente.');
            const data = ler();
            if (Object.entries(data.players).some(([id, p]) => id !== accountId && p.userId === body.user)) throw falha('FEIRA_ID_ALREADY_LINKED', 'O cadastro da Feira já está ligado a outro perfil. Procure o operador.');
            data.players[accountId] = { userId: body.user, googleSub: sub, linkedAt: new Date(agora()).toISOString() };
            gravar(data);
            agendar();
            return { linked: true, userId: body.user };
        } finally { vinculosEmAndamento.delete(accountId); }
    }
    async function consultarSaldo(accountId) {
        if (!config().enabled) throw falha('FEIRA_DISABLED', 'Integração da Feira desativada.', 503);
        const { prova } = provaDaConta(accountId);
        try {
            const response = await request(URL_BALANCE, { headers: { Authorization: `Bearer ${prova.token}` }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
            if (response.status !== 200) throw Error('balance');
            const body = await response.json();
            if (!Number.isSafeInteger(body?.balance)) throw Error('balance');
            return { balance: body.balance };
        } catch { throw falha('FEIRA_BALANCE_UNAVAILABLE', 'Saldo indisponível. Confira seu cadastro e a autorização Google na Feira.', 503); }
    }
    function registrarConfirmados(resultados, { ticket } = {}) {
        if (!config().enabled) return { enabled: false, registered: 0, reason: config().reason };
        const items = resultados.filter(r => r.tipo !== 'banda');
        const skip = reason => ({ enabled: true, registered: 0, status: reason });
        if (!items.length || items.length > 4 || (ticket && ticket.jogadores.length !== items.length)) return skip('invalid_group');
        const pessoas = items.map(result => {
            const conta = resolverConta({ username: result.username });
            return { conta, salvo: conta?.resultadosPartidas?.[result.partidaId], result };
        });
        if (pessoas.some(p => !p.conta?.accountId || !p.conta.authProviders?.google || !p.salvo || p.salvo.modo !== 'historia' || p.salvo.bossDerrotado !== true || p.salvo.concluida !== true)) return skip('not_eligible');
        if (new Set(pessoas.map(p => p.conta.accountId)).size !== pessoas.length || new Set(items.map(r => r.partidaId)).size !== items.length) return skip('invalid_group');
        const first = pessoas[0].salvo;
        if (pessoas.some(p => p.salvo.fase !== first.fase || nome(p.salvo.musica) !== nome(first.musica))) return skip('invalid_group');
        const regra = regras.fases?.find(r => r.fase === first.fase && r.musicas?.some(m => nome(m) === nome(first.musica)));
        if (!regra) return skip('song_not_configured');
        const plan = calcularRecompensaBoss({ modo: 'historia', bossDerrotado: true, dificuldadeMusica: regra.dificuldade, jogadores: pessoas.map(p => ({ id: p.conta.accountId, precisao: p.salvo.precisao, concluida: true })) });
        if (!plan.total) return skip('no_performance');
        const groupId = chave('boss-reward-v2', items.map(r => r.partidaId).sort());
        const allocations = pessoas.map(p => ({ id: chave(p.conta.accountId, p.result.partidaId), accountId: p.conta.accountId, partidaId: p.result.partidaId, googleSub: p.conta.authProviders.google.sub, value: plan.pagamentos.find(v => v.id === p.conta.accountId).valor }));
        const data = ler();
        if (data.groups[groupId]) return { enabled: true, registered: 0, total: data.groups[groupId].total, status: 'already_registered' };
        if (allocations.some(a => data.entries[a.id])) throw Error('REWARD_GROUP_CONFLICT');
        data.groups[groupId] = { total: plan.total, fase: first.fase, musica: first.musica, dificuldade: regra.dificuldade, allocations, createdAt: new Date(agora()).toISOString() };
        for (const a of allocations) data.entries[a.id] = { ...a, ruleVersion: 2, groupId, product: PRODUCT, transport: config().mode, status: 'pending', createdAt: new Date(agora()).toISOString() };
        // One atomic write records the entire band and its immutable division before any send.
        gravar(data);
        return { enabled: true, registered: allocations.length, total: plan.total, status: 'registered' };
    }
    async function processarPendentes() {
        if (!config().enabled || processando) return;
        processando = true;
        try {
            for (const entry of Object.values(ler().entries)) {
                if (entry.status === 'sending') { atualizar(entry.id, { status: 'unknown', reason: 'INTERRUPTED_SEND' }); continue; }
                if (!['pending', 'awaiting_login', 'awaiting_feira'].includes(entry.status)) continue;
                const data = ler(), group = data.groups[entry.groupId];
                if (entry.ruleVersion !== 2 || !group || ![400, 600, 800].includes(group.total) || group.allocations.reduce((sum, a) => sum + a.value, 0) !== group.total || !group.allocations.some(a => a.id === entry.id && a.value === entry.value) || !Number.isSafeInteger(entry.value) || entry.value < 1 || entry.product !== PRODUCT || entry.transport !== config().mode) {
                    atualizar(entry.id, { status: 'unknown', reason: 'REWARD_RULE_REVIEW_REQUIRED' }); continue;
                }
                const conta = resolverConta({ accountId: entry.accountId });
                if (conta?.authProviders?.google?.sub !== entry.googleSub) { atualizar(entry.id, { status: 'unknown', reason: 'IDENTITY_CHANGED' }); continue; }
                let token, body;
                if (config().mode === 'google') {
                    const proof = credenciais.get(entry.googleSub);
                    if (!proof || proof.expiresAt <= agora()) { atualizar(entry.id, { status: 'awaiting_login' }); continue; }
                    token = proof.token; body = { product: PRODUCT, value: entry.value };
                } else {
                    const player = data.players[entry.accountId];
                    if (!player || player.googleSub !== entry.googleSub) { atualizar(entry.id, { status: 'awaiting_feira' }); continue; }
                    token = env.SHREDDER_FEIRA_GAME_SECRET; body = { userId: player.userId, price: entry.value };
                }
                atualizar(entry.id, { status: 'sending' });
                let response;
                try { response = await request(config().url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }); }
                catch { atualizar(entry.id, { status: 'unknown', reason: 'NETWORK_OUTCOME_UNKNOWN' }); continue; }
                if (response.status !== 201) {
                    const status = Number.isSafeInteger(response.status) ? response.status : 0;
                    atualizar(entry.id, { status: status >= 500 || status < 400 ? 'unknown' : 'rejected', httpStatus: status }); continue;
                }
                let result; try { result = await response.json(); } catch { result = null; }
                const operation = config().mode === 'google' ? result?.operation : result?.operationId ?? result?.operation;
                if (!Number.isSafeInteger(operation) || operation < 1 || (result?.operationId !== undefined && result?.operation !== undefined && result.operationId !== result.operation)) { atualizar(entry.id, { status: 'unknown', reason: 'INVALID_SUCCESS_RESPONSE' }); continue; }
                if (Object.values(ler().entries).some(other => other.id !== entry.id && other.status === 'paid' && other.operation === operation)) { atualizar(entry.id, { status: 'unknown', reason: 'DUPLICATE_OPERATION' }); continue; }
                atualizar(entry.id, { status: 'paid', operation, paidAt: new Date(agora()).toISOString() });
            }
        } finally { processando = false; if (reagendar) { reagendar = false; agendar(); } }
    }
    function agendar() {
        if (!config().enabled) return;
        if (processando) { reagendar = true; return; }
        void processarPendentes().catch(() => console.error('Falha ao registrar o estado dos créditos da Feira.'));
    }
    function consultar(accountId) {
        const conf = config();
        if (!conf.enabled) return { enabled: false, product: PRODUCT, mode: conf.mode, reason: conf.reason, entries: [] };
        const data = ler();
        return { enabled: true, product: PRODUCT, mode: conf.mode, linked: Boolean(data.players[accountId]), entries: Object.values(data.entries).filter(e => e.accountId === accountId).map(e => ({ partidaId: e.partidaId, status: e.status, value: e.value, musica: data.groups[e.groupId]?.musica, operation: e.operation, createdAt: e.createdAt, paidAt: e.paidAt, httpStatus: e.httpStatus })) };
    }
    return { guardarCredencial, registrarConfirmados, processarPendentes, agendar, consultar, vincular, consultarSaldo, configuracao: config };
}
module.exports = { criarCreditosFeira, configuracaoCreditos, PRODUCT, URL_CREDIT, URL_GAME_CREDIT, URL_LOGIN, URL_BALANCE };
