const fs = require('fs');
const path = require('path');
const { randomBytes, scrypt } = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(scrypt);
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

async function passwordHash(password, salt) {
  const buffer = await scryptAsync(password, salt, 64);
  return buffer.toString('hex');
}

async function main() {
  const [, , username, passwordArgument] = process.argv;
  const password = passwordArgument || process.env.NEW_PASSWORD;
  const accountKey = normalizeUsername(username);

  if (!accountKey || !password) {
    console.error('Uso: node reset-password.js <usuário> <nova-senha>');
    console.error('Alternativa: NEW_PASSWORD="nova-senha" node reset-password.js <usuário>');
    process.exitCode = 1;
    return;
  }

  if (password.length < 6) {
    console.error('A nova senha deve ter pelo menos 6 caracteres.');
    process.exitCode = 1;
    return;
  }

  let accountStore;
  try {
    accountStore = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  } catch (error) {
    console.error('Não foi possível carregar accounts.json.');
    process.exitCode = 1;
    return;
  }

  const account = accountStore.accounts?.[accountKey];
  if (!account) {
    console.error(`A conta "${accountKey}" não foi encontrada.`);
    process.exitCode = 1;
    return;
  }

  const salt = randomBytes(16).toString('hex');
  account.salt = salt;
  account.passwordHash = await passwordHash(password, salt);
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accountStore, null, 2), 'utf8');
  console.log(`Senha redefinida com sucesso para "${account.username}".`);
}

main().catch(() => {
  console.error('Não foi possível redefinir a senha.');
  process.exitCode = 1;
});
