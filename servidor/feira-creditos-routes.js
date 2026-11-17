const regras = require('./recompensas-campanha.json');
const { TETOS } = require('./recompensa-boss');
function registrarRotasFeira(app, { feiraCreditos, getAuthenticatedSession, agora = Date.now }) {
    const limites = new Map();
    const proteger = handler => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const session = getAuthenticatedSession(req);
        if (!session?.account?.accountId) return res.status(401).json({ ok: false, code: 'LOCAL_SESSION_REQUIRED', error: 'Entre no Shredder para continuar.' });
        const id = session.account.accountId;
        const key = `${id}:${req.method}:${req.path}`;
        if ((limites.get(key) || 0) > agora()) return res.status(429).json({ ok: false, code: 'FEIRA_RATE_LIMIT', error: 'Aguarde alguns segundos antes de tentar novamente.' });
        for (const [k, expiry] of limites) if (expiry <= agora()) limites.delete(k);
        if (limites.size >= 10000) return res.status(503).json({ ok: false, code: 'FEIRA_UNAVAILABLE', error: 'Tente novamente em instantes.' });
        limites.set(key, agora() + 5000);
        try { return await handler(req, res, id); }
        catch (error) {
            const allowed = new Set(['FEIRA_LOGIN_REQUIRED','FEIRA_DISABLED','FEIRA_IDENTITY_CHANGED','FEIRA_LINK_PENDING','FEIRA_UNAVAILABLE','FEIRA_LINK_REJECTED','FEIRA_ID_ALREADY_LINKED','FEIRA_BALANCE_UNAVAILABLE']);
            return res.status(allowed.has(error?.code) ? error.status : 503).json({ ok: false, code: allowed.has(error?.code) ? error.code : 'FEIRA_UNAVAILABLE', error: allowed.has(error?.code) ? error.message : 'A Feira está indisponível. Tente novamente mais tarde.' });
        }
    };
    app.get('/api/feira/recompensas', (_req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ ok: true, fases: regras.fases.map(f => ({ fase: f.fase, dificuldade: f.dificuldade, total: TETOS[f.dificuldade], musicas: f.musicas })) });
    });
    app.post('/api/feira/vincular', proteger(async (req, res, id) => {
        if (req.body?.consent !== true || Object.keys(req.body).some(k => k !== 'consent')) return res.status(400).json({ ok: false, code: 'FEIRA_CONSENT_REQUIRED', error: 'Confirme a conexão do seu cadastro à Feira.' });
        return res.json({ ok: true, ...await feiraCreditos.vincular(id) });
    }));
    app.get('/api/feira/saldo', proteger(async (_req, res, id) => res.json({ ok: true, ...await feiraCreditos.consultarSaldo(id) })));
}
module.exports = { registrarRotasFeira };
