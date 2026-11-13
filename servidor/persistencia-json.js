const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// Chamadores devem manter leitura/validação/escrita síncronas em um único processo.
function gravarJsonAtomico(arquivo, dados) {
    const temporario = `${arquivo}.${randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temporario, JSON.stringify(dados, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        fs.renameSync(temporario, arquivo);
    } finally {
        if (fs.existsSync(temporario)) fs.unlinkSync(temporario);
    }
}

function backupPrivado(arquivo, original) {
    const diretorio = path.join(path.dirname(arquivo), '.backups');
    fs.mkdirSync(diretorio, { recursive: true, mode: 0o700 });
    const backup = path.join(diretorio, `accounts-${randomUUID()}.json`);
    fs.writeFileSync(backup, original, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return backup;
}

module.exports = { gravarJsonAtomico, backupPrivado };
