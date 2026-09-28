const path = require('path');

const paginas = new Set(['/', '/index.html', '/lobby.html', '/perfil.html',
    '/ranking.html', '/instrumentos.html', '/modos.html', '/ticket.html',
    '/jogo.html', '/operador.html']);

// O documento externo permanece aberto; somente o conteúdo do iframe navega.
module.exports = function navegacaoPersistente(req, res, next) {
    if (req.method !== 'GET' || !paginas.has(req.path)) return next();
    res.vary('Sec-Fetch-Dest');
    res.set('Cache-Control', 'no-store');
    if (req.get('Sec-Fetch-Dest') === 'iframe' || req.query.__conteudo === '1') return next();
    return res.sendFile(path.join(__dirname, '../docs/site.html'));
};
