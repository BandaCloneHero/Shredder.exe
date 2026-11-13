const DEFAULT_ORIGIN = 'https://shredder.feira-de-jogos.dev.br';

function criarPoliticaAutenticacao({ googleOnly = true, origemPublica = DEFAULT_ORIGIN } = {}) {
    let origem;
    try {
        const url = new URL(origemPublica);
        if (url.origin === origemPublica && ['https:', 'http:'].includes(url.protocol)) origem = url.origin;
    } catch { /* Invalid configuration fails closed for authentication writes. */ }
    return (req, res, next) => {
        const path = req.path.toLowerCase().replace(/\/+$/, '') || '/';
        if (req.method !== 'POST') return next();
        res.set('Cache-Control', 'no-store');
        if (googleOnly && ['/api/auth/login', '/api/auth/register', '/api/auth/google/link'].includes(path)) {
            return res.status(410).json({ok:false, code:'PASSWORD_AUTH_DISABLED', error:'Use Entrar com Google para acessar sua conta.'});
        }
        if (googleOnly && path === '/api/auth/google/register') {
            return res.status(410).json({ok:false, code:'PROFILE_CREATION_AUTOMATIC', error:'Seu perfil é preparado automaticamente ao entrar com Google.'});
        }
        const protectedPost = /^\/api\/auth\/google(?:\/(?:start|link|register))?$/.test(path) || path === '/api/perfil/apelido';
        if (!protectedPost) return next();
        if (!origem) return res.status(503).json({ok:false, code:'GOOGLE_AUTH_UNAVAILABLE', error:'Entrada indisponível no momento.'});
        // Production accepts the exact public origin, never Codespaces loopback rewrites.
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== origem)) {
            return res.status(403).json({ok:false, code:'INVALID_ORIGIN', error:'Origem da requisição não permitida.'});
        }
        if (!req.is('application/json')) return res.status(415).json({ok:false, code:'JSON_REQUIRED', error:'Envie a requisição em JSON.'});
        next();
    };
}

function registrarOpcoesAutenticacao(app, { googleOnly = true, env = process.env, codespaces = null } = {}) {
    app.get('/api/auth/options', (_req, res) => {
        res.set('Cache-Control', 'no-store');
        const enabled = require('./google-identity').configuracaoGoogle(env);
        // Public configuration signal only; does not load credentials or contact Google.
        return res.json({ok:true, googleOnly, providers:{google:{enabled}, password:!googleOnly}, ...(codespaces ? {developmentProxy:{origin:codespaces.origin, bootstrap:"/api/dev/codespaces"}} : {})});
    });
}
module.exports = { criarPoliticaAutenticacao, registrarOpcoesAutenticacao };
