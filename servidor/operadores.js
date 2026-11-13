const fs = require('fs');
const path = require('path');

const normalizar = valor => String(valor || '').trim().toLowerCase();

function lerOperadoresOficiais() {
    // Configuração inválida bloqueia cadastro/renomeação; não libera nomes reservados.
    const configurados = JSON.parse(fs.readFileSync(path.join(__dirname, 'operadores-oficiais.json'), 'utf8'));
    if (!Array.isArray(configurados) || configurados.some(nome => typeof nome !== 'string')) {
        throw new Error('Configuração de operadores oficiais inválida.');
    }
    return new Set([...configurados, ...String(process.env.SHREDDER_OPERADORES_OFICIAIS || '').split(',')]
        .map(normalizar).filter(Boolean));
}

function validarNomeConta(username, anterior, oficiais = lerOperadoresOficiais()) {
    const destino = normalizar(username);
    const origem = anterior == null ? null : normalizar(anterior);
    if (destino === origem) return; // Correção de caixa não transfere autoridade.
    if (oficiais.has(destino) || (origem && oficiais.has(origem))) {
        const erro = new Error('Nome reservado de operador oficial. Alteração exige procedimento administrativo.');
        erro.status = 403;
        throw erro;
    }
}

module.exports = { lerOperadoresOficiais, validarNomeConta };
