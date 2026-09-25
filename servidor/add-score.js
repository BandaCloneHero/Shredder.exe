const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "accounts.json");

const args = process.argv.slice(2);

if (args.length < 8) {
    console.log("❌ Faltam argumentos!");
    console.log("Uso correto:");
    console.log(
        "node add-score.js <usuario_ou_id> <instrumento> <musica_id> <pontuacao> <combo> <precisao> <notas_acertadas> <notas_erradas> <full_combo>",
    );
    console.log(
        "Exemplo: node add-score.js 123456 guitarra B.G.d.N. 128450 186 96.2 450 12 true",
    );
    process.exit(1);
}

const [
    username,
    instrument,
    songId,
    scoreStr,
    comboStr,
    accuracyStr,
    notesHitStr,
    missesStr,
    isFcStr,
] = args;

const score = Number(scoreStr);
const combo = Number(comboStr);
const accuracy = Number(accuracyStr);
const notesHit = Number(notesHitStr);
const misses = Number(missesStr);
const isFullCombo = isFcStr.toLowerCase() === "true";

if (!fs.existsSync(filePath)) {
    console.log(
        "❌ Erro: O arquivo 'accounts.json' não foi encontrado na pasta!",
    );
    process.exit(1);
}

const rootData = JSON.parse(fs.readFileSync(filePath, "utf8"));

// Suporta tanto o formato com "accounts" quanto direto
const accounts = rootData.accounts || rootData;

if (!accounts[username]) {
    console.log(`❌ Erro: Usuário '${username}' não existe no sistema!`);
    process.exit(1);
}

const user = accounts[username];

// 1. Atualizar dados gerais
user.gamesPlayed = (user.gamesPlayed || 0) + 1;
user.lifetimeStats.totalNotesHit += notesHit;
user.lifetimeStats.totalMisses += misses;
user.updatedAt = new Date().toISOString();

// 2. Garantir estrutura do instrumento
if (!user.instrumentStats) {
    user.instrumentStats = {
        guitarra: {
            maxScore: 0,
            maxCombo: 0,
            bestAccuracy: 0,
            songsCompleted: 0,
            fullCombos: 0,
        },
        baixo: {
            maxScore: 0,
            maxCombo: 0,
            bestAccuracy: 0,
            songsCompleted: 0,
            fullCombos: 0,
        },
        bateria: {
            maxScore: 0,
            maxCombo: 0,
            bestAccuracy: 0,
            songsCompleted: 0,
            fullCombos: 0,
        },
        teclado: {
            maxScore: 0,
            maxCombo: 0,
            bestAccuracy: 0,
            songsCompleted: 0,
            fullCombos: 0,
        },
        favoriteInstrument: instrument,
    };
}

const instData = user.instrumentStats[instrument] || {
    maxScore: 0,
    maxCombo: 0,
    bestAccuracy: 0,
    songsCompleted: 0,
    fullCombos: 0,
};

instData.maxScore = Math.max(instData.maxScore, score);
instData.maxCombo = Math.max(instData.maxCombo, combo);
instData.bestAccuracy = Math.max(instData.bestAccuracy, accuracy);
instData.songsCompleted += 1;
if (isFullCombo) {
    instData.fullCombos += 1;
}
user.instrumentStats[instrument] = instData;
user.instrumentStats.favoriteInstrument = instrument;

// 3. Atualizar recordes da música específica
if (!user.songRecords) {
    user.songRecords = {};
}

const currentSong = user.songRecords[songId] || {
    plays: 0,
    bestScore: 0,
    bestCombo: 0,
    bestAccuracy: 0,
};
currentSong.plays += 1;
currentSong.bestScore = Math.max(currentSong.bestScore, score);
currentSong.bestCombo = Math.max(currentSong.bestCombo, combo);
currentSong.bestAccuracy = Math.max(currentSong.bestAccuracy, accuracy);

user.songRecords[songId] = currentSong;

// 4. Verificação Automática de Conquistas (Achievements)
if (!user.achievements) user.achievements = [];

function unlockAchievement(id) {
    if (!user.achievements.includes(id)) {
        user.achievements.push(id);
        console.log(`🏆 Conquista desbloqueada: ${id}!`);
    }
}

if (user.gamesPlayed >= 1) unlockAchievement("primeiros_acordes");
if (combo >= 100) unlockAchievement("on_fire");
if (combo >= 250) unlockAchievement("imparavel");
if (accuracy >= 95.0) unlockAchievement("cirurgico");
if (isFullCombo) unlockAchievement("perfeccionista");
if (accuracy === 100.0 && misses === 0) unlockAchievement("lenda_viva");
if (misses >= 500) unlockAchievement("desafinador_profissional");
if (combo === 99) unlockAchievement("quase_la");

// Salvar de volta mantendo a estrutura original
fs.writeFileSync(filePath, JSON.stringify(rootData, null, 2), "utf8");

console.log(
    `✅ Sucesso! Partida de ${username} registrada na música '${songId}' (${instrument}).`,
);

