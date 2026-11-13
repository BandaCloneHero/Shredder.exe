const { timingSafeEqual, randomBytes } = require('crypto');

const erro = (status, code, message) => Object.assign(new Error(message), { status, code });
const naoAutenticado = () => erro(401, 'LOCAL_SESSION_REQUIRED', 'Entre na sua conta Shredder para continuar.');

function registrarRotasGoogle(app, {
    partidas, verificarIdTokenGoogle, getAuthenticatedSession, refreshAccounts, createSession, passwordHash,
    origemPublica = process.env.SHREDDER_PUBLIC_ORIGIN || 'https://shredder.feira-de-jogos.dev.br',
    agora = Date.now,
    googleOnly = process.env.SHREDDER_GOOGLE_ONLY === 'true',
    env = process.env,
    gerarUsername = () => `jogador_${randomBytes(6).toString('hex')}`,
}) {
    // Configuração inválida não impede o login tradicional de iniciar.
    let origem;
    try {
        const url = new URL(origemPublica);
        if (url.origin === origemPublica && ['https:', 'http:'].includes(url.protocol)) origem = url.origin;
    } catch { /* rotas Google falham fechadas */ }
    const limites = new Map();
    const tentativas = new Map();
    function limitar(chave, maximo) {
        const now = agora();
        if (limites.size >= 10000) {
            for (const [key, valor] of limites) if (valor.ate <= now) limites.delete(key);
            if (!limites.has(chave) && limites.size >= 10000) throw erro(429, 'RATE_LIMITED', 'Aguarde antes de tentar novamente.');
        }
        let limite = limites.get(chave);
        if (!limite || limite.ate <= now) {
            limite = { ate: now + 60000, total: 0 }; limites.set(chave, limite);
        }
        if (++limite.total > maximo) throw erro(429, 'RATE_LIMITED', 'Aguarde antes de tentar novamente.');
    }
    function validarRequisicao(req, permitidas, inicio = false) {
        if (!origem) throw erro(503, 'GOOGLE_AUTH_UNAVAILABLE', 'Login Google indisponível.');
        if ((req.headers.origin && req.headers.origin !== origem) || req.headers['sec-fetch-site'] === 'cross-site') {
            throw erro(403, 'INVALID_ORIGIN', 'Origem da requisição não permitida.');
        }
        if (!req.is('application/json')) throw erro(415, 'JSON_REQUIRED', 'Envie a requisição em JSON.');
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            Object.keys(body).some(key => ![...permitidas, ...(inicio ? [] : ['loginId'])].includes(key)) ||
            (!inicio && (typeof body.loginId !== 'string' || !/^[a-f0-9]{64}$/.test(body.loginId) ||
            typeof body.idToken !== 'string' || !body.idToken.length || body.idToken.length > 16384))) {
            throw erro(400, 'INVALID_REQUEST', 'Dados de autenticação inválidos.');
        }
        limitar(`${inicio ? 'start:' : ''}ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`, 30);
        return body;
    }
    const proteger = handler => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try { return await handler(req, res); }
        catch (error) {
            if (error?.code === 'RATE_LIMITED') res.set('Retry-After', '60');
            const conhecidos = new Set([
                'LOCAL_SESSION_REQUIRED', 'GOOGLE_AUTH_UNAVAILABLE', 'INVALID_GOOGLE_TOKEN', 'GOOGLE_ATTEMPT_EXPIRED', 'GOOGLE_TRANSITION_REQUIRED', 'GOOGLE_REAUTH_REQUIRED',
                'RATE_LIMITED', 'INVALID_ORIGIN', 'JSON_REQUIRED', 'INVALID_REQUEST', 'LOCAL_PASSWORD_REQUIRED',
                'INVALID_LOCAL_PASSWORD', 'IDENTITY_MIGRATION_REQUIRED', 'ACCOUNT_CHANGED',
            ]);
            // Erros de negócio da persistência têm apenas status 400/403/404/409 e mensagens locais.
            const persistencia = !error?.code && [400, 403, 404, 409].includes(error?.status);
            const publico = conhecidos.has(error?.code) || persistencia;
            return res.status(publico ? error.status : 500).json({
                ok: false,
                code: publico ? (error.code || 'IDENTITY_CONFLICT') : 'AUTH_PERSISTENCE_FAILED',
                error: publico ? error.message : 'Não foi possível concluir a autenticação. Tente novamente.',
            });
        }
    };
    function emitirSessao(alvo, substituirToken) {
        refreshAccounts();
        const token = createSession(alvo.accountKey, { substituirToken });
        return { ok: true, token, username: alvo.account.username, ...(googleOnly ? { nickname: alvo.account.nickname || alvo.account.username, needsNickname: !alvo.account.nicknameChosenAt } : {}) };
    }

    app.post('/api/auth/google/start', proteger(async (req, res) => {
        validarRequisicao(req, [], true);
        if (!require('./google-identity').configuracaoGoogle(env)) throw erro(503, 'GOOGLE_AUTH_UNAVAILABLE', 'Entrada Google indisponível.');
        for (const [key, value] of tentativas) if (value.expiresAt <= agora()) tentativas.delete(key);
        if (tentativas.size >= 10000) throw erro(429, 'RATE_LIMITED', 'Aguarde antes de tentar novamente.');
        const loginId = randomBytes(32).toString('hex'), nonce = randomBytes(32).toString('hex');
        tentativas.set(loginId, { nonce, expiresAt: agora() + 300000 });
        return res.json({ok:true, clientId:require('./google-identity').obterClientIdGoogle(env), loginId, nonce});
    }));
    async function verificarTentativa(body) {
        const attempt = tentativas.get(body.loginId);
        tentativas.delete(body.loginId); // Consume before verification, including failed tokens.
        if (!attempt || attempt.expiresAt <= agora()) throw erro(401, 'GOOGLE_ATTEMPT_EXPIRED', 'Prepare novamente a entrada com Google.');
        return verificarIdTokenGoogle(body.idToken, {nonce:attempt.nonce});
    }

    app.post('/api/auth/google', proteger(async (req, res) => {
        const body = validarRequisicao(req, ['idToken']);
        const identidade = await verificarTentativa(body);
        let alvo = partidas.localizarIdentidadeGoogle(identidade);
        let criado = false;
        if (!alvo && googleOnly) {
            if (identidade.provider === 'google' && partidas.possuiVinculosFirebasePendentes()) {
                throw erro(409, 'GOOGLE_TRANSITION_REQUIRED', 'Há perfis antigos aguardando transição. Nenhuma segunda conta foi criada.');
            }
            // Only a backend-verified identity can create a profile. No email/name
            // matching and no permissions supplied by the browser are accepted.
            for (let tentativa = 0; tentativa < 5 && !alvo; tentativa++) {
                try {
                    alvo = partidas.criarConta({ username: gerarUsername(), google: identidade });
                    criado = !alvo.duplicado;
                } catch (error) {
                    if (error?.status !== 409) throw error;
                    // A concurrent request may already have registered this UID.
                    alvo = partidas.localizarIdentidadeGoogle(identidade);
                }
            }
            if (!alvo) throw erro(503, 'GOOGLE_AUTH_UNAVAILABLE', 'Não foi possível preparar seu perfil. Tente novamente mais tarde.');
        }
        if (!alvo) return res.json({ ok: true, needsRegistration: true });
        return res.status(criado ? 201 : 200).json(emitirSessao(alvo));
    }));

    app.post('/api/auth/google/register', proteger(async (req, res) => {
        const body = validarRequisicao(req, ['idToken', 'username']);
        const {username} = body;
        if (typeof username !== 'string' || username.length > 24 || !username.trim()) {
            throw erro(400, 'INVALID_REQUEST', 'Informe um username local válido.');
        }
        const identidade = await verificarTentativa(body);
        // Reenvio não cria perfil, nem tenta renomear/mesclar uma conta já vinculada.
        const existente = partidas.localizarIdentidadeGoogle(identidade);
        const salvo = existente || partidas.criarConta({ username: username.trim(), google: identidade });
        return res.status(existente || salvo.duplicado ? 200 : 201).json(emitirSessao(salvo));
    }));

    app.post('/api/auth/google/link', proteger(async (req, res) => {
        const body = validarRequisicao(req, ['idToken', 'password']);
        const {password} = body;
        const sessao = getAuthenticatedSession(req);
        if (!sessao) throw naoAutenticado();
        const conta = sessao.account;
        if (!conta.accountId) throw erro(409, 'IDENTITY_MIGRATION_REQUIRED', 'Esta conta precisa da migração de identidades autorizada antes de vincular Google.');
        limitar(`link:${conta.accountId}`, 5);
        if (typeof conta.salt !== 'string' || typeof conta.passwordHash !== 'string' || !/^[a-f0-9]{128}$/i.test(conta.passwordHash)) {
            throw erro(403, 'LOCAL_PASSWORD_REQUIRED', 'É necessário comprovar a senha local desta conta para vincular Google.');
        }
        if (typeof password !== 'string' || !password.length || password.length > 256) {
            throw erro(400, 'INVALID_REQUEST', 'Informe a senha atual da conta.');
        }
        // A senha é confirmada nesta operação, não inferida de um login antigo.
        const candidate = Buffer.from(await passwordHash(password, conta.salt), 'hex');
        const expected = Buffer.from(conta.passwordHash, 'hex');
        if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
            throw erro(401, 'INVALID_LOCAL_PASSWORD', 'Senha atual inválida.');
        }
        const identidade = await verificarTentativa(body);
        // Logout, expiração, troca de senha/username e mudanças de identidade durante
        // os awaits precisam ser observados antes de qualquer gravação.
        const atual = getAuthenticatedSession(req);
        if (!atual) throw naoAutenticado();
        if (atual.account.accountId !== conta.accountId || atual.accountKey !== sessao.accountKey ||
            atual.account.salt !== conta.salt || atual.account.passwordHash !== conta.passwordHash ||
            atual.account.sessionGeneration !== conta.sessionGeneration) {
            throw erro(409, 'ACCOUNT_CHANGED', 'A conta mudou. Entre novamente antes de vincular Google.');
        }
        const salvo = partidas.vincularIdentidadeGoogle(atual.account.accountId, identidade);
        return res.json({ ...emitirSessao(salvo, atual.token), linked: true });
    }));

    app.get('/api/auth/providers', proteger(async (req, res) => {
        const sessao = getAuthenticatedSession(req);
        if (!sessao) throw naoAutenticado();
        const conta = sessao.account;
        return res.json({
            ok: true,
            providers: {
                password: typeof conta.salt === 'string' && typeof conta.passwordHash === 'string',
                google: { linked: Boolean(conta.authProviders?.google) },
            },
            requiresIdentityMigration: !conta.accountId,
        });
    }));
}
module.exports = { registrarRotasGoogle };
