const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "accounts.json");
const args = process.argv.slice(2);

// Lista oficial de todas as conquistas válidas do evento
const CONQUISAS_VALIDAS = [
    "primeiros_acordes",
    "on_fire",
    "imparavel",
    "cirurgico",
    "perfeccionista",
    "viciado",
    "headliner",
    "sem_medo",
    "lenda_viva",
    "tornado_de_notas",
    "polivalente",
    "ecletico",
    "desafinador_profissional",
    "quase_la",
];

if (args.length < 2) {
    console.log("❌ Faltam argumentos!");
    console.log("Uso correto:");
    console.log("node add-badge.js <ID_DO_USUARIO> <ID_DA_CONQUISTA>");
    console.log("Exemplo: node add-badge.js 123456 desafinador_profissional");
    console.log("\nConquistas válidas disponíveis:");
    console.log(CONQUISAS_VALIDAS.join(", "));
    process.exit(1);
}

const [username, badgeId] = args;

// 1. Valida se a conquista existe na lista oficial
if (!CONQUISAS_VALIDAS.includes(badgeId)) {
    console.log(
        `❌ Erro: A conquista '${badgeId}' não existe nas regras da feira!`,
    );
    console.log(`💡 Conquistas válidas: ${CONQUISAS_VALIDAS.join(", ")}`);
    process.exit(1);
}

if (!fs.existsSync(filePath)) {
    console.log("❌ Erro: O arquivo 'accounts.json' não foi encontrado!");
    process.exit(1);
}

const rootData = JSON.parse(fs.readFileSync(filePath, "utf8"));
const accounts = rootData.accounts || rootData;

if (!accounts[username]) {
    console.log(`❌ Erro: Usuário '${username}' não existe no sistema!`);
    process.exit(1);
}

const user = accounts[username];

if (!user.achievements) {
    user.achievements = [];
}

// 2. Verifica se o usuário já tem a conquista
if (user.achievements.includes(badgeId)) {
    console.log(
        `⚠️ O usuário '${username}' já possui a conquista '${badgeId}'!`,
    );
    process.exit(0);
}

// Adiciona a conquista
user.achievements.push(badgeId);
user.updatedAt = new Date().toISOString();

// Salva de volta no JSON
fs.writeFileSync(filePath, JSON.stringify(rootData, null, 2), "utf8");

console.log(
    `🏆 Sucesso! Conquista válida '${badgeId}' concedida ao usuário '${username}'!`,
);
