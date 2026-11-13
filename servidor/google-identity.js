// Google ID Tokens are verified against public Google certificates. No ADC or private key.
const publicConfig = require('./google-config.json');
const obterClientIdGoogle = (env = process.env) => Object.hasOwn(env, 'GOOGLE_CLIENT_ID') ? env.GOOGLE_CLIENT_ID : publicConfig.clientId;
const CLIENT_ID = /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/;
const erro = (status, code, message) => Object.assign(new Error(message), {status, code});
function configuracaoGoogle(env = process.env) {
    const clientId = obterClientIdGoogle(env);
    return env.SHREDDER_GOOGLE_AUTH_ENABLED === 'true' && typeof clientId === 'string' && CLIENT_ID.test(clientId);
}
function criarGoogleIdentity({env = process.env, carregarCliente = () => {
    const {OAuth2Client} = require('google-auth-library');
    return new OAuth2Client({clientId:obterClientIdGoogle(env), transporterOptions:{timeout:10000}});
}, agora = Date.now, timeoutMs = 10000, aoValidar} = {}) {
    let client;
    async function verificarIdTokenGoogle(idToken, {nonce} = {}) {
        if (!configuracaoGoogle(env)) throw erro(503,'GOOGLE_AUTH_UNAVAILABLE','Entrada Google indisponível.');
        if (typeof idToken !== 'string' || !idToken.length || idToken.length > 16384 || /\s/.test(idToken) ||
            typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) throw erro(401,'INVALID_GOOGLE_TOKEN','Autenticação Google inválida.');
        let timer;
        try {
            client ??= carregarCliente();
            const ticket = await Promise.race([
                client.verifyIdToken({idToken, audience:obterClientIdGoogle(env)}),
                new Promise((_,reject) => { timer=setTimeout(()=>reject(erro(503,'GOOGLE_AUTH_UNAVAILABLE','Entrada Google indisponível.')),timeoutMs); }),
            ]);
            const p = ticket.getPayload(), now=Math.floor(agora()/1000);
            if (!p || p.aud !== obterClientIdGoogle(env) || !['accounts.google.com','https://accounts.google.com'].includes(p.iss) ||
                typeof p.sub !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.sub) || p.nonce !== nonce ||
                !Number.isSafeInteger(p.exp) || p.exp<=now || !Number.isSafeInteger(p.iat) || p.iat>now+30 || p.iat<now-300 || p.exp<=p.iat ||
                (p.azp !== undefined && p.azp !== obterClientIdGoogle(env))) throw erro(401,'INVALID_GOOGLE_TOKEN','Autenticação Google inválida.');
            const identidade = {provider:'google',sub:p.sub};
            if (typeof aoValidar === 'function') {
                try { aoValidar({identidade, token:idToken, expiresAt:p.exp*1000}); } catch { /* Credit preparation never breaks login. */ }
            }
            return identidade;
        } catch (error) {
            // Never publish raw errors, token strings or personal claims.
            if (error?.code === 'GOOGLE_AUTH_UNAVAILABLE' || ['EAI_AGAIN','ENOTFOUND','ETIMEDOUT','ECONNRESET','ECONNREFUSED'].includes(error?.code) || error?.response?.status >= 500) throw erro(503,'GOOGLE_AUTH_UNAVAILABLE','Entrada Google indisponível.');
            throw erro(401,'INVALID_GOOGLE_TOKEN','Autenticação Google inválida ou expirada.');
        } finally { clearTimeout(timer); }
    }
    return {verificarIdTokenGoogle};
}
module.exports={obterClientIdGoogle,configuracaoGoogle,criarGoogleIdentity,...criarGoogleIdentity()};
