const path = require('path');
const fs = require('fs');
const { criarPersistenciaPartidas } = require('./partidas');
const { contasDaRaiz, validarIdentidades } = require('./identidades');

// Nunca usa accounts.json como destino implícito. Sem --aplicar, só faz diagnóstico.
function executar(args) {
    if (args.length < 1 || args.length > 2 || args[0].startsWith('--') || (args[1] && args[1] !== '--aplicar')) {
        throw new Error('Uso: node migrate-identities.js /caminho/accounts.json [--aplicar]');
    }
    const arquivo = path.resolve(args[0]);
    if (args[1] === '--aplicar') {
        const salvo = criarPersistenciaPartidas(arquivo).migrarIdentidades({ autorizar: true });
        return { atualizadas: salvo.atualizadas, backup: salvo.backup };
    } else {
        const raiz = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
        validarIdentidades(raiz);
        const pendentes = Object.values(contasDaRaiz(raiz)).filter(c => !Object.hasOwn(c, 'accountId') || !Object.hasOwn(c, 'authProviders')).length;
        return { pendentes, alterado: false };
    }
}
if (require.main === module) {
    try { console.log(JSON.stringify(executar(process.argv.slice(2)))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { executar };
