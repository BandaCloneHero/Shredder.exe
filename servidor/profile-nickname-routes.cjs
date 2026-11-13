const registrarApelido = (app, { partidas, getAuthenticatedSession, refreshAccounts, publicar = () => {} }) => {
    app.post('/api/perfil/apelido', (req, res) => {
        res.set('Cache-Control', 'no-store');
        const session = getAuthenticatedSession(req);
        if (!session) return res.status(401).json({ok:false, code:'LOCAL_SESSION_REQUIRED', error:'Entre para alterar seu apelido.'});
        const body = req.body;
        if (!req.is('application/json') || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'nickname')) {
            return res.status(400).json({ok:false, code:'INVALID_NICKNAME', error:'Informe somente o apelido.'});
        }
        try {
            const saved = partidas.alterarApelido(session.account.accountId, body.nickname);
            refreshAccounts();
            try { publicar(saved.records); } catch { /* Persisted state remains authoritative. */ }
            return res.json({ok:true, nickname:saved.nickname, needsNickname:false});
        } catch (error) {
            const status = [400,403,404,409].includes(error?.status) ? error.status : 500;
            return res.status(status).json({ok:false, code:status===409?'NICKNAME_ALREADY_SET':status===500?'PROFILE_SAVE_FAILED':'INVALID_NICKNAME', error:status===500?'Não foi possível salvar o apelido.':'Escolha um apelido válido para uso público.'});
        }
    });
};
module.exports = { registrarApelido };
