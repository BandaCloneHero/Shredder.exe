const { createHash } = require('crypto');

const CONQUISTAS = [
    ['primeiros_acordes', 'Primeiros acordes'], ['on_fire', 'On Fire'],
    ['cirurgico', 'Cirúrgico'], ['perfeccionista', 'Perfeccionista'],
    ['lenda_viva', 'Lenda viva'], ['desafinador_profissional', 'Desafinador profissional'],
];
const INSTRUMENTOS = ['guitarra', 'baixo', 'bateria', 'teclado'];
const CAMPOS = {
    username: { tipo: 'username' },
    nickname: { tipo: 'texto', max: 40 },
    avatar: { tipo: 'avatar', max: 2048 },
    currentTitle: { tipo: 'texto', max: 80 },
    currency: { tipo: 'inteiro' }, gamesPlayed: { tipo: 'inteiro' },
    'lifetimeStats.totalNotesHit': { tipo: 'inteiro' },
    'lifetimeStats.totalMisses': { tipo: 'inteiro' },
    'instrumentStats.favoriteInstrument': { tipo: 'instrumento' },
};
for (const instrumento of INSTRUMENTOS) {
    for (const campo of ['maxScore', 'maxCombo', 'bestAccuracy', 'songsCompleted', 'fullCombos']) {
        CAMPOS[`instrumentStats.${instrumento}.${campo}`] = { tipo: campo === 'bestAccuracy' ? 'percentual' : 'inteiro' };
    }
}

function erroPerfil(mensagem, status = 400) {
    const erro = new Error(mensagem);
    erro.status = status;
    return erro;
}
function revisaoPerfil(conta) {
    return createHash('sha256').update(JSON.stringify(conta)).digest('hex');
}
function lerCampo(conta, caminho) {
    return caminho.split('.').reduce((valor, chave) => valor?.[chave], conta);
}
function definirCampo(conta, caminho, valor) {
    const chaves = caminho.split('.');
    const chave = chaves.pop();
    const alvo = chaves.reduce((objeto, parte) => objeto[parte], conta);
    alvo[chave] = valor;
}
function perfilPublico(conta) {
    const campos = {};
    for (const caminho of Object.keys(CAMPOS)) campos[caminho] = lerCampo(conta, caminho);
    // A rota pública de perfil lê estes aliases quando presentes.
    campos.currency = conta.moedas ?? conta.currency;
    campos.currentTitle = conta.tituloEquipado ?? conta.currentTitle;
    campos['instrumentStats.favoriteInstrument'] = conta.favoriteInstrument ?? conta.instrumentStats.favoriteInstrument;
    return {
        username: conta.username, campos, achievements: conta.achievements,
        createdAt: conta.createdAt, updatedAt: conta.updatedAt,
        totalRegistros: Object.keys(conta.resultadosPartidas).length,
        totalMusicas: Object.keys(conta.songRecords).length,
    };
}
function aplicarAjustesPerfil(conta, alteracoes) {
    if (!alteracoes || typeof alteracoes !== 'object' || Array.isArray(alteracoes)) throw erroPerfil('Alterações de perfil inválidas.');
    const permitidas = new Set([...Object.keys(CAMPOS), 'achievements']);
    for (const [campo, valor] of Object.entries(alteracoes)) {
        if (!permitidas.has(campo)) throw erroPerfil(`Campo não editável: ${campo}.`);
        if (campo === 'achievements') {
            const ids = new Set([...CONQUISTAS.map(([id]) => id), ...conta.achievements]);
            if (!Array.isArray(valor) || valor.some(id => typeof id !== 'string' || !ids.has(id))) throw erroPerfil('Lista de conquistas inválida.');
            conta.achievements = [...new Set(valor)];
            continue;
        }
        const regra = CAMPOS[campo];
        if (regra.tipo === 'username') {
            if (typeof valor !== 'string' || !/^[a-zA-Z0-9_]{3,24}$/.test(valor) || ['__proto__', 'constructor', 'prototype'].includes(valor.toLowerCase())) throw erroPerfil('Username deve ter de 3 a 24 letras, números ou sublinhados.');
        } else if (regra.tipo === 'texto' || regra.tipo === 'avatar') {
            if (typeof valor !== 'string' || valor.length > regra.max) throw erroPerfil(`Texto inválido: ${campo}.`);
            // Aceita URL web ou caminho relativo; nunca código executável.
            if (regra.tipo === 'avatar' && valor && (/^[a-z][a-z\d+.-]*:/i.test(valor) && !/^https?:\/\//i.test(valor))) throw erroPerfil('Avatar deve ser um endereço HTTP(S) ou caminho de imagem.');
        } else if (regra.tipo === 'instrumento') {
            if (!['nenhum', ...INSTRUMENTOS].includes(valor)) throw erroPerfil('Instrumento favorito inválido.');
        } else if (regra.tipo === 'percentual') {
            if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 100) throw erroPerfil(`Precisão inválida: ${campo}.`);
        } else if (!Number.isSafeInteger(valor) || valor < 0) throw erroPerfil(`Número inválido: ${campo}.`);
        definirCampo(conta, campo, valor);
        if (campo === 'currency' && Object.hasOwn(conta, 'moedas')) conta.moedas = valor;
        if (campo === 'currentTitle' && Object.hasOwn(conta, 'tituloEquipado')) conta.tituloEquipado = valor;
        if (campo === 'instrumentStats.favoriteInstrument' && Object.hasOwn(conta, 'favoriteInstrument')) conta.favoriteInstrument = valor;
    }
}
module.exports = { CONQUISTAS, perfilPublico, revisaoPerfil, aplicarAjustesPerfil, erroPerfil };
