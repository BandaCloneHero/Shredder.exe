const politica = require('./politica-nomes.json');

const semelhantes = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y',
    'і': 'i', 'ј': 'j', 'ѕ': 's', 'α': 'a', 'ο': 'o', 'ι': 'i',
};
const substituicoes = { '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i' };

function normalizar(valor) {
    return valor.normalize('NFKD').toLowerCase().replace(/[\p{M}\p{Cf}]/gu, '')
        .replace(/[аеорсхуіјѕαοι]/gu, letra => semelhantes[letra])
        .replace(/[0-9@$!|]/g, letra => substituicoes[letra]);
}
function compactar(valor) {
    return normalizar(valor).replace(/[^a-z]/g, '').replace(/([a-z])\1+/g, '$1');
}
const palavras = new Set(politica.palavras.map(compactar));
const trechos = politica.trechos.map(compactar);

function nomeOfensivo(valor) {
    if (typeof valor !== 'string') return false; // Os limites/tipos pertencem à validação do campo.
    // Os números podem representar letras ou somente um sufixo de jogador.
    for (const versao of [valor, valor.replace(/[0-9]/g, '')]) {
        const normalizado = normalizar(versao);
        const compacto = compactar(versao);
        const semEnfeite = compacto.replace(/^x+|x+$/g, '');
        if (palavras.has(compacto) || palavras.has(semEnfeite) || trechos.some(trecho => compacto.includes(trecho))) return true;
        const tokens = normalizado.match(/[a-z]+/g) || [];
        if (tokens.some(token => palavras.has(compactar(token)))) return true;
        // Detecta palavras separadas letra por letra, mesmo após um prefixo.
        for (let inicio = 0; inicio < tokens.length; inicio++) {
            let junto = '';
            for (let fim = inicio; fim < tokens.length; fim++) {
                junto += tokens[fim];
                if (palavras.has(compactar(junto))) return true;
            }
        }
        // Frases bloqueadas também são encontradas dentro de apelidos maiores.
        for (const palavra of politica.palavras) {
            if (/\s/.test(palavra) && compacto.includes(compactar(palavra))) return true;
        }
    }
    return false;
}

function validarNomePublico(valor, campo = 'Nome') {
    if (typeof valor !== 'string') {
        const erro = new Error(`${campo} inválido.`);
        erro.status = 400;
        throw erro;
    }
    if (typeof valor === 'string' && valor.length > 200) {
        const erro = new Error(`${campo} muito longo.`);
        erro.status = 400;
        throw erro;
    }
    if (!nomeOfensivo(valor)) return;
    const erro = new Error(`${campo} não permitido. Escolha um nome sem ofensas, preconceito ou linguagem vulgar.`);
    erro.status = 400;
    erro.code = 'NOME_NAO_PERMITIDO';
    throw erro;
}

module.exports = { nomeOfensivo, validarNomePublico };
