const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawnSync } = require('child_process');

const identityFile = process.env.SHREDDER_SSH_IDENTITY || '/home/codespace/.ssh/servidor';
const destination = path.join(__dirname, 'accounts-servidor.json');

if (!fs.existsSync(identityFile)) {
    console.error(`Chave SSH não encontrada: ${identityFile}`);
    console.error('Defina SHREDDER_SSH_IDENTITY com o caminho da chave neste Codespace.');
    process.exit(1);
}

const result = spawnSync('ssh', [
    '-i', identityFile,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    'davi.b2007@shredder.feira-de-jogos.dev.br',
    'cat /var/www/html/servidor/accounts.json',
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

if (result.error || result.status !== 0) {
    console.error('Não foi possível baixar as contas do servidor.');
    if (result.stderr?.trim()) console.error(result.stderr.trim());
    process.exit(1);
}

let database;
try {
    database = JSON.parse(result.stdout);
} catch {
    console.error('O arquivo recebido do servidor não contém JSON válido; a cópia local foi preservada.');
    process.exit(1);
}

const accounts = database?.accounts || database;
if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) {
    console.error('Formato de contas inesperado; a cópia local foi preservada.');
    process.exit(1);
}
const accountCount = Object.entries(accounts).filter(([key, value]) =>
    key !== 'bandRecords' && value && typeof value === 'object' && !Array.isArray(value),
).length;
if (!accountCount) {
    console.error('O servidor retornou zero contas; a cópia local foi preservada.');
    process.exit(1);
}

const temporary = `${destination}.${randomUUID()}.tmp`;
try {
    fs.writeFileSync(temporary, JSON.stringify(database, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, destination);
} finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}

console.log(`Cópia atualizada: ${destination}`);
console.log(`Contas recebidas do servidor: ${accountCount}`);
console.log('A base local de desenvolvimento não foi alterada.');
