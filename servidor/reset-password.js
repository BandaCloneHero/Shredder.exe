const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

function resetPassword() {
  const args = process.argv.slice(2);
  const usernameInput = args[0];
  const newPassword = args[1];

  if (!usernameInput || !newPassword) {
    console.error('❌ Uso incorreto! Exemplo: node reset-password.js davitest123 123456');
    process.exit(1);
  }

  if (!fs.existsSync(ACCOUNTS_FILE)) {
    console.error(`❌ Arquivo accounts.json não encontrado em: ${ACCOUNTS_FILE}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
  const db = JSON.parse(rawData);
  const accounts = db.accounts || db;

  const key = usernameInput.trim().toLowerCase();
  const accountKey = Object.keys(accounts).find(k => k.toLowerCase() === key);

  if (!accountKey || !accounts[accountKey]) {
    console.error(`❌ Usuário "${usernameInput}" não encontrado!`);
    process.exit(1);
  }

  const account = accounts[accountKey];
  const salt = crypto.randomBytes(16).toString('hex');

  crypto.scrypt(newPassword, salt, 64, (err, derivedKey) => {
    if (err) {
      console.error('❌ Erro ao gerar o hash da senha:', err);
      process.exit(1);
    }

    account.salt = salt;
    account.passwordHash = derivedKey.toString('hex');

    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(db, null, 2), 'utf8');
    console.log(`✅ Senha do usuário "${account.username || accountKey}" atualizada com sucesso para "${newPassword}"!`);
  });
}

resetPassword();