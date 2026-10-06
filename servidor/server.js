const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const { scrypt, randomBytes, randomUUID, timingSafeEqual, createHash } = require("crypto");
const { promisify } = require("util");
const { criarPersistenciaPartidas, validarResultado, inicializarPerfil, ENCERRAMENTO_FEIRA, FASES_CAMPANHA } = require("./partidas");
const { catalogoLoja, itensPorId } = require("./catalogo-loja");
const { salvarArquivoAvatar } = require("./avatar-personalizado");
const { validarNomePublico } = require("./protecao-nomes");
const { progressoConquistas } = require("./progresso-conquistas");

const scryptAsync = promisify(scrypt);
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(require('./site-navigation'));
app.use(express.static(path.join(__dirname, "../docs"), {
    setHeaders(res, filePath) {
        if (filePath.endsWith(".webp")) res.setHeader("Cache-Control", "public, max-age=604800");
    },
}));

const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
const SESSIONS_FILE = path.join(__dirname, "sessions.json");
const partidas = criarPersistenciaPartidas(ACCOUNTS_FILE, {
    encerramentoFeira: process.env.FEIRA_ENCERRA_EM || ENCERRAMENTO_FEIRA,
});
let accountStore = { accounts: {} };
let sessions = new Map();
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const PROFILE_AVATAR_IDS = new Set(["night-sentinel", "astral-oracle", "fox-wanderer", "dune-explorer", "deep-diver", "crystal-golem", "forest-spirit", "nocturne", "alien-roamer", "neon-android", "starfarer", "void-knight", "frost-mage", "sun-guardian", "shadow-scout", "brass-automaton", "mothling", "neon-familiar", "rune-guardian", "aurora-entity", "pulse-vanguard", "neon-reaper", "beat-runner", "soundcrow"]);

function loadAccounts() {
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            const migracao = partidas.migrarContas();
            accountStore = migracao.raiz.accounts ? migracao.raiz : { accounts: migracao.raiz };
            console.log(`> Arquivo de contas: ${ACCOUNTS_FILE}`);
            console.log(`> Perfis completados: ${migracao.atualizadas}`);
            if (migracao.backup) console.log(`> Backup das contas: ${migracao.backup}`);
        }
    } catch (error) {
        console.error("> Erro ao carregar accounts.json:", error);
        // Não iniciar com store vazio se a leitura/migração falhar.
        throw error;
    }
}

function saveAccounts() {
    try {
        fs.writeFileSync(
            ACCOUNTS_FILE,
            JSON.stringify(accountStore, null, 2),
            "utf8",
        );
    } catch (error) {
        console.error("> Erro ao salvar accounts.json:", error);
    }
}

function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
            const now = Date.now();
            for (const [tokenHash, session] of Object.entries(data)) {
                if (session.expiresAt > now) sessions.set(tokenHash, session);
            }
        }
    } catch (error) {
        console.error("> Erro ao carregar sessions.json:", error);
    }
}

function saveSessions() {
    try {
        fs.writeFileSync(
            SESSIONS_FILE,
            JSON.stringify(Object.fromEntries(sessions.entries()), null, 2),
            "utf8",
        );
    } catch (error) {
        console.error("> Erro ao salvar sessions.json:", error);
    }
}

loadAccounts();
loadSessions();

function publicarConquistasEmLote(salvo) {
    for (const jogador of salvo.notificacoesPorJogador || []) {
        io.to(`conquistas:${normalizeUsername(jogador.username)}`).emit("conquistaDesbloqueada", {
            notificacoes: jogador.notificacoesConquistas,
        });
    }
}

function finalizarConquistaDaFeira() {
    const salvo = partidas.encerrarFeira();
    if (salvo.raiz) accountStore = salvo.raiz.accounts ? salvo.raiz : { accounts: salvo.raiz };
    publicarConquistasEmLote(salvo);
}

// Congela os vencedores antes de aceitar resultados posteriores ao encerramento.
app.use((_req, res, next) => {
    try { finalizarConquistaDaFeira(); next(); }
    catch (error) { console.error("> Falha ao encerrar a feira:", error); res.status(503).json({ ok: false, error: "Falha ao registrar o encerramento da feira." }); }
});

async function passwordHash(password, salt) {
    const buffer = await scryptAsync(password, salt, 64);
    return buffer.toString("hex");
}

function sessionKey(token) {
    return createHash("sha256").update(String(token)).digest("hex");
}

function normalizeUsername(username) {
    return String(username || "")
        .trim()
        .toLowerCase();
}

function validCredentials(username, password) {
    return (
        typeof username === "string" &&
        username.length >= 3 &&
        username.length <= 24 &&
        /^[a-zA-Z0-9_]+$/.test(username) &&
        typeof password === "string" &&
        password.length >= 6
    );
}

function createSession(accountKey) {
    const token = randomBytes(32).toString("hex");
    sessions.set(sessionKey(token), {
        accountKey,
        expiresAt: Date.now() + SESSION_DURATION_MS,
    });
    saveSessions();
    return token;
}

function getAuthenticatedSession(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

    const token = authHeader.substring(7);
    const key = sessionKey(token);
    const session = sessions.get(key);
    if (!session || session.expiresAt < Date.now()) {
        if (session) {
            sessions.delete(key);
            saveSessions();
        }
        return null;
    }

    const account = accountStore.accounts[session.accountKey];
    if (!account) return null;
    return { token, accountKey: session.accountKey, account };
}

function isOfficialOperator(req) {
    const authenticated = getAuthenticatedSession(req);
    if (!authenticated) return { ok: false, status: 401, error: "Entre em uma conta oficial para acessar o painel." };
    let configuredAccounts = [];
    try {
        configuredAccounts = JSON.parse(fs.readFileSync(path.join(__dirname, "operadores-oficiais.json"), "utf8"));
    } catch { /* ausência/erro de configuração mantém o painel fechado */ }
    if (!Array.isArray(configuredAccounts)) configuredAccounts = [];
    const environmentAccounts = String(process.env.SHREDDER_OPERADORES_OFICIAIS || "")
        .split(",").map(normalizeUsername).filter(Boolean);
    const officialAccounts = new Set(
        [...configuredAccounts, ...environmentAccounts]
            .filter(username => typeof username === "string")
            .map(normalizeUsername)
            .filter(Boolean),
    );
    const authenticatedNames = [authenticated.accountKey, normalizeUsername(authenticated.account.username)];
    if (!authenticatedNames.some(username => officialAccounts.has(username))) {
        return { ok: false, status: 403, error: "Esta conta não tem autorização para usar o painel do operador." };
    }
    return { ok: true, account: authenticated.account };
}

function exigirOperadorOficial(req, res) {
    const authorization = isOfficialOperator(req);
    if (!authorization.ok) res.status(authorization.status).json({ ok: false, erro: authorization.error });
    return authorization.ok;
}

app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;
    const cleanUsername = String(username || "").trim();
    if (!validCredentials(cleanUsername, password)) {
        return res.status(400).json({
            ok: false,
            error: "Usuário: 3–24 letras/números. Senha: mínimo de 6 caracteres.",
        });
    }

    try {
        validarNomePublico(cleanUsername, "Nome de conta");
    } catch (error) {
        return res.status(400).json({ ok: false, error: error.message, code: error.code });
    }
    const key = normalizeUsername(cleanUsername);
    if (accountStore.accounts[key]) {
        return res
            .status(409)
            .json({ ok: false, error: "Esse usuário já existe." });
    }

    const salt = randomBytes(16).toString("hex");
    const hash = await passwordHash(password, salt);
    accountStore.accounts[key] = inicializarPerfil({
        username: cleanUsername,
        salt,
        passwordHash: hash,
    });
    saveAccounts();
    const token = createSession(key);
    return res.status(201).json({ ok: true, token, username: cleanUsername });
});

app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    const key = normalizeUsername(username);

    // LÊ O ARQUIVO DO DISCO NA HORA (Garante que se você resetou via script, ele pega a alteração)
    let accountStore;
    try {
        const rawData = fs.readFileSync(
            path.join(__dirname, "accounts.json"),
            "utf8",
        );
        accountStore = JSON.parse(rawData);
    } catch (err) {
        return res
            .status(500)
            .json({ ok: false, error: "Erro ao ler banco de dados." });
    }

    const accounts = accountStore.accounts || accountStore;
    const account = accounts[key];

    if (!account || typeof password !== "string") {
        return res
            .status(401)
            .json({ ok: false, error: "Usuário ou senha inválidos." });
    }

    const candidate = Buffer.from(
        await passwordHash(password, account.salt),
        "hex",
    );
    const expected = Buffer.from(account.passwordHash, "hex");
    if (
        candidate.length !== expected.length ||
        !timingSafeEqual(candidate, expected)
    ) {
        return res
            .status(401)
            .json({ ok: false, error: "Usuário ou senha inválidos." });
    }

    const token = createSession(key);
    return res.json({ ok: true, token, username: account.username });
});

app.get("/api/perfil/:username", (req, res) => {
    // O perfil é lido diretamente do disco para refletir partidas e badges recentes.
    let rootData;
    try {
        rootData = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
    } catch (error) {
        return res
            .status(500)
            .json({ ok: false, error: "Erro ao ler banco de dados." });
    }

    const accounts = rootData.accounts || rootData;
    const account = accounts[normalizeUsername(req.params.username)];
    if (!account) {
        return res.status(404).json({
            ok: false,
            error: "Operador não encontrado na rede.",
        });
    }

    const emptyInstrumentStats = () => ({
        maxScore: 0,
        maxCombo: 0,
        bestAccuracy: 0,
        songsCompleted: 0,
        fullCombos: 0,
    });
    const storedInstrumentStats = account.instrumentStats || {};
    const instrumentStats = {};
    for (const instrument of ["guitarra", "baixo", "bateria", "teclado"]) {
        instrumentStats[instrument] = {
            ...emptyInstrumentStats(),
            ...(storedInstrumentStats[instrument] || {}),
        };
    }

    const storedSongRecords = account.songRecords || {};
    const songRecords = Array.isArray(storedSongRecords)
        ? storedSongRecords
        : Object.entries(storedSongRecords).map(([musica, record]) => ({
              musica,
              vezesJogada: record.plays || 0,
              melhorPontuacao: record.bestScore || 0,
              melhorCombo: record.bestCombo || 0,
              melhorPrecisao: record.bestAccuracy || 0,
          }));

    return res.json({
        ok: true,
        profile: {
            username:
                account.username || normalizeUsername(req.params.username),
            nickname: account.nickname || account.username || "OPERADOR",
            avatar: account.avatar || "",
            customAvatar: account.customAvatar || "",
            customAvatarUnlocked: account.cosmetics?.owned?.includes("custom-avatar-upload") || false,
            tituloEquipado:
                account.tituloEquipado ||
                account.currentTitle ||
                "Novato do Rock",
            moedas: account.moedas ?? account.currency ?? 0,
            cosmetics: account.cosmetics || { owned: [], equipped: {} },
            gamesPlayed: account.gamesPlayed || 0,
            lifetimeStats: {
                totalNotesHit: account.lifetimeStats?.totalNotesHit || 0,
                totalMisses: account.lifetimeStats?.totalMisses || 0,
            },
            instrumentStats,
            favoriteInstrument:
                account.favoriteInstrument ||
                storedInstrumentStats.favoriteInstrument ||
                "nenhum",
            songRecords,
            achievements: Array.isArray(account.achievements)
                ? account.achievements
                : [],
            achievementProgress: progressoConquistas(account),
            fases: account.fases || {
                desbloqueadas: [1],
                favoritas: [],
                selecionada: null,
                historicoSelecionadas: [],
            },
        },
    });
});

app.post("/api/perfil/avatar", (req, res) => {
    const session = getAuthenticatedSession(req);
    if (!session) return res.status(401).json({ ok: false, error: "Entre na sua conta para alterar a foto de perfil." });
    const avatar = req.body?.avatar;
    const customAvatarPermitido = typeof avatar === "string" && /^custom\/[a-f0-9-]{36}$/.test(avatar) &&
        avatar === session.account.customAvatar && (session.account.cosmetics?.owned?.includes("custom-avatar-upload") || isOfficialOperator(req).ok);
    if (typeof avatar !== "string" || (avatar !== "" && !PROFILE_AVATAR_IDS.has(avatar) && !customAvatarPermitido)) {
        return res.status(400).json({ ok: false, error: "Avatar inválido. Escolha uma das imagens disponíveis." });
    }
    session.account.avatar = avatar;
    session.account.updatedAt = new Date().toISOString();
    saveAccounts();
    return res.json({ ok: true, avatar });
});

function salvarFotoPerfil(req, res) {
    try {
        const session = getAuthenticatedSession(req);
        const avatar = salvarArquivoAvatar(req.body, path.join(__dirname, "../docs/images/avatars/custom"));
        const salvo = partidas.salvarAvatarPersonalizado(session.accountKey, avatar);
        accountStore = salvo.raiz.accounts ? salvo.raiz : { accounts: salvo.raiz };
        return res.status(201).json({ ok: true, avatar: salvo.avatar, customAvatar: salvo.customAvatar });
    } catch (error) {
        return res.status(error.status || 500).json({ ok: false, error: error.status ? error.message : "Não foi possível salvar o avatar." });
    }
}

app.post("/api/operador/avatar", (req, res, next) => {
    if (exigirOperadorOficial(req, res)) next();
}, express.raw({ type: "image/webp", limit: "128kb" }), salvarFotoPerfil);

app.post("/api/perfil/avatar-imagem", (req, res, next) => {
    const session = getAuthenticatedSession(req);
    if (!session) return res.status(401).json({ ok: false, error: "Entre na sua conta para enviar uma foto." });
    if (!session.account.cosmetics?.owned?.includes("custom-avatar-upload") && !isOfficialOperator(req).ok) {
        return res.status(403).json({ ok: false, error: "Compre Foto Própria na loja do perfil para enviar sua imagem." });
    }
    next();
}, express.raw({ type: "image/webp", limit: "128kb" }), salvarFotoPerfil);

app.get("/api/loja/catalogo", (_req, res) => {
    return res.json({ ok: true, items: catalogoLoja });
});

app.post("/api/loja/:action", (req, res) => {
    const session = getAuthenticatedSession(req);
    if (!session) return res.status(401).json({ ok: false, error: "Entre na sua conta para acessar a loja." });
    const action = ({ comprar: "comprar", buy: "comprar", equipar: "equipar", equip: "equipar", retirar: "retirar", unequip: "retirar", desequipar: "retirar" })[req.params.action];
    const item = itensPorId[req.body?.itemId];
    if (!action) return res.status(400).json({ ok: false, error: "Ação da loja inválida. Atualize o perfil e tente novamente." });
    if (!item) return res.status(400).json({ ok: false, error: `Acessório não reconhecido: ${String(req.body?.itemId || "vazio")}. Atualize o perfil para carregar o catálogo atual.` });
    const account = session.account;
    account.cosmetics ??= { owned: [], equipped: {} };
    account.cosmetics.owned ??= [];
    account.cosmetics.equipped ??= {};
    const itemId = req.body.itemId;
    let starterCreditsGranted = false;
    if (action === "comprar") {
        if (account.cosmetics.owned.includes(itemId)) return res.status(409).json({ ok: false, error: "Você já possui este acessório." });
        let currency = Number(account.currency ?? account.moedas ?? 0);
        if (!Number.isSafeInteger(currency) || currency < 0) return res.status(400).json({ ok: false, error: "Saldo de moedas inválido." });
        if (currency < item.price && !account.cosmetics.starterCreditsGranted) {
            currency += 500;
            account.cosmetics.starterCreditsGranted = true;
            starterCreditsGranted = true;
        }
        if (currency < item.price) return res.status(400).json({ ok: false, error: "Moedas insuficientes para este acessório." });
        account.currency = currency - item.price;
        account.moedas = account.currency;
        account.cosmetics.owned.push(itemId);
        account.cosmetics.starterCreditsGranted ||= starterCreditsGranted;
    } else if (item.unlock) {
        return res.status(400).json({ ok: false, error: "Este desbloqueio é permanente. Envie sua imagem em Escolher foto de perfil." });
    } else if (action === "equipar") {
        if (!account.cosmetics.owned.includes(itemId)) return res.status(403).json({ ok: false, error: "Compre este acessório antes de equipá-lo." });
        if (item.slot === "título" && account.cosmetics.equipped[item.slot] !== itemId) {
            account.cosmetics.previousTitle ??= account.currentTitle || "Novato do Rock";
        }
        account.cosmetics.equipped[item.slot] = itemId;
        if (item.slot === "título") account.currentTitle = item.name;
    } else {
        if (account.cosmetics.equipped[item.slot] !== itemId) return res.status(409).json({ ok: false, error: "Este item não está equipado nesse espaço." });
        delete account.cosmetics.equipped[item.slot];
        if (item.slot === "título") {
            account.currentTitle = account.cosmetics.previousTitle || "Novato do Rock";
            delete account.cosmetics.previousTitle;
        }
    }
    account.updatedAt = new Date().toISOString();
    saveAccounts();
    return res.json({ ok: true, currency: account.currency ?? account.moedas ?? 0, cosmetics: account.cosmetics, currentTitle: account.currentTitle, starterCreditsGranted });
});

app.get("/api/auth/session", (req, res) => {
    const session = getAuthenticatedSession(req);
    if (!session) {
        return res
            .status(401)
            .json({ ok: false, error: "Sessão expirada ou inválida." });
    }
    return res.json({ ok: true, username: session.account.username });
});

app.post("/api/auth/logout", (req, res) => {
    const session = getAuthenticatedSession(req);
    if (session) {
        sessions.delete(sessionKey(session.token));
        saveSessions();
    }
    return res.json({ ok: true });
});

app.post("/api/fases/selecionar", (req, res) => {
    const session = getAuthenticatedSession(req);
    if (!session) return res.status(401).json({ ok: false, error: "Sessão expirada ou inválida." });
    try {
        const salvo = partidas.selecionarFase(session.accountKey, req.body?.fase);
        accountStore = salvo.raiz.accounts ? salvo.raiz : { accounts: salvo.raiz };
        if (salvo.novasConquistas?.length) io.to(`conquistas:${session.accountKey}`).emit("conquistaDesbloqueada", { notificacoes: salvo.notificacoesConquistas });
        return res.json({ ok: true, fases: salvo.fases, novasConquistas: salvo.novasConquistas });
    } catch (error) {
        return res.status(error.status || 500).json({
            ok: false,
            error: error.status ? error.message : "Falha ao registrar a fase.",
        });
    }
});

app.post("/api/fases/favoritar", (req, res) => {
    const session = getAuthenticatedSession(req);
    if (!session) return res.status(401).json({ ok: false, error: "Sessão expirada ou inválida." });
    try {
        const salvo = partidas.favoritarFase(session.accountKey, req.body?.fase, req.body?.favorita);
        accountStore = salvo.raiz.accounts ? salvo.raiz : { accounts: salvo.raiz };
        if (salvo.novasConquistas?.length) io.to(`conquistas:${session.accountKey}`).emit("conquistaDesbloqueada", { notificacoes: salvo.notificacoesConquistas });
        return res.json({ ok: true, fases: salvo.fases, novasConquistas: salvo.novasConquistas });
    } catch (error) {
        return res.status(error.status || 500).json({ ok: false, error: error.status ? error.message : "Falha ao favoritar a fase." });
    }
});

app.get("/api/operador/perfil/:username", (req, res) => {
    if (!exigirOperadorOficial(req, res)) return;
    try {
        return res.json({ ok: true, ...partidas.lerPerfilOperador(req.params.username) });
    } catch (error) {
        return res.status(error.status || 500).json({ ok: false, erro: error.status ? error.message : "Falha ao carregar o perfil." });
    }
});

app.get("/api/operador/conta/:username", (req, res) => {
    if (!exigirOperadorOficial(req, res)) return;
    try {
        const rootData = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
        const accounts = rootData.accounts || rootData;
        const account = accounts[normalizeUsername(req.params.username)];
        if (!account) {
            return res.status(404).json({ ok: false, erro: "Conta não encontrada." });
        }

        // Exibe os dados atuais da conta, mas nunca as credenciais armazenadas.
        const { salt, passwordHash, ...dadosConta } = account;
        return res.json({ ok: true, conta: dadosConta });
    } catch (error) {
        console.error("> Erro ao consultar conta no operador:", error);
        return res.status(500).json({ ok: false, erro: "Falha ao carregar os dados da conta." });
    }
});

app.get("/api/operador/contas", (req, res) => {
    if (!exigirOperadorOficial(req, res)) return;
    try {
        const rootData = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
        const accounts = rootData.accounts || rootData;
        const lista = Object.entries(accounts)
            .filter(([key, account]) => account && typeof account === "object" && key !== "bandRecords")
            .map(([key, account]) => ({
                username: account.username || key,
                nickname: account.nickname || "",
                createdAt: account.createdAt || null,
                updatedAt: account.updatedAt || null,
            }))
            .sort((left, right) => left.username.localeCompare(right.username, "pt-BR", { sensitivity: "base" }));
        return res.json({ ok: true, contas: lista });
    } catch (error) {
        console.error("> Erro ao listar contas no operador:", error);
        return res.status(500).json({ ok: false, erro: "Falha ao listar as contas do servidor." });
    }
});

app.get("/api/operador/acesso", (req, res) => {
    if (!exigirOperadorOficial(req, res)) return;
    return res.json({ ok: true });
});

app.post("/api/operador/salvar-perfil", async (req, res) => {
    if (!exigirOperadorOficial(req, res)) return;
    try {
        const { username, alteracoes, revisao, novaSenha } = req.body || {};
        let credenciais;
        if (novaSenha !== undefined && novaSenha !== '') {
            if (typeof novaSenha !== 'string' || novaSenha.length < 6 || novaSenha.length > 256) {
                return res.status(400).json({ ok: false, erro: "A nova senha deve ter de 6 a 256 caracteres." });
            }
            const salt = randomBytes(16).toString("hex");
            credenciais = { salt, passwordHash: await passwordHash(novaSenha, salt) };
        }
        // O método relê o disco e verifica a revisão após o await do scrypt.
        const salvo = partidas.editarPerfilOperador(username, alteracoes, revisao, credenciais);
        accountStore = salvo.raiz.accounts ? salvo.raiz : { accounts: salvo.raiz };
        if (salvo.encerrarSessoes) {
            for (const [token, session] of sessions) {
                if (session.accountKey === salvo.encerrarSessoes) sessions.delete(token);
            }
            saveSessions();
        }
        io.emit("rankingAtualizado", { records: salvo.records });
        if (salvo.novasConquistas?.length) {
            io.to?.(`conquistas:${normalizeUsername(salvo.perfil.username)}`).emit("conquistaDesbloqueada", {
                notificacoes: salvo.notificacoesConquistas,
            });
        }
        return res.json({
            ok: true,
            perfil: salvo.perfil,
            revisao: salvo.revisao,
            conquistas: salvo.conquistas,
            novasConquistas: salvo.novasConquistas || [],
        });
    } catch (error) {
        return res.status(error.status || 500).json({ ok: false, erro: error.status ? error.message : "Falha ao salvar o perfil. Os campos foram preservados." });
    }
});

app.post("/api/operador/salvar-pontuacao", (req, res) => {
    if (!exigirOperadorOficial(req, res)) return;
    const dados = req.body || {};
    let resultado;
    try {
        resultado = validarResultado({
            partidaId: `evt_${randomUUID()}`,
            operadorId: "admin-web-panel",
            username: dados.username,
            instrumento: dados.instrumento,
            modo: dados.modo,
            musica: dados.musica,
            pontuacao: dados.pontuacao,
            maiorCombo: dados.comboMaximo ?? dados.maiorCombo,
            precisao: dados.precisao,
            notasAcertadas: dados.notasAcertadas,
            notasErradas: dados.notasErradas,
            fullCombo: dados.fullCombo,
            nickname: dados.nickname,
            currentTitle: dados.currentTitle,
            currency: dados.currency,
            fase: dados.fase,
            favorita: dados.favorita,
            pausada: dados.pausada,
            energiaFinal: dados.energiaFinal,
            dificuldade: dados.dificuldade,
            concluida: dados.concluida,
        });
    } catch (error) {
        return res.status(400).json({ ok: false, erro: error.message });
    }

    try {
        const salvo = partidas.salvar(resultado);
        accountStore = salvo.raiz.accounts ? salvo.raiz : { accounts: salvo.raiz };
        // O ranking existente espera { records }, tanto na carga inicial como ao vivo.
        io.emit("rankingAtualizado", { records: salvo.records });
        if (salvo.novasConquistas?.length) {
            io.to?.(`conquistas:${normalizeUsername(resultado.username)}`).emit("conquistaDesbloqueada", {
                notificacoes: salvo.notificacoesConquistas,
            });
        }
        return res.status(201).json({
            ok: true,
            partidaId: resultado.partidaId,
            mensagem: "Resultado salvo. Perfil e ranking atualizados.",
            novasConquistas: salvo.novasConquistas || [],
        });
    } catch (error) {
        if (error.message === "Conta não encontrada.") {
            return res.status(404).json({ ok: false, erro: error.message });
        }
        if (error.status) return res.status(error.status).json({ ok: false, erro: error.message });
        console.error("> Falha ao salvar resultado do painel:", error);
        return res.status(500).json({
            ok: false,
            erro: "Falha ao salvar o resultado. Os campos foram preservados para nova tentativa.",
        });
    }
});

app.post("/api/operador/salvar-pontuacao-banda", (req, res) => {
    if (!exigirOperadorOficial(req, res)) return;
    const dados = req.body || {};
    const nome = typeof dados.nome === "string" ? dados.nome.trim() : dados.nome;
    const idInformado = typeof dados.id === "string" ? dados.id.trim() : dados.id;
    const idGerado = typeof nome === "string"
        ? nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100)
        : undefined;
    try {
        const salvo = partidas.salvarPontuacaoBanda({
            partidaId: "band_" + randomUUID(),
            banda: { id: idInformado || idGerado, nome },
            musica: dados.musica,
            modo: dados.modo,
            pontuacao: dados.pontuacao,
            membros: dados.membros,
        });
        accountStore = salvo.raiz.accounts ? salvo.raiz : { accounts: salvo.raiz };
        io.emit("rankingAtualizado", { records: salvo.records });
        publicarConquistasEmLote(salvo);
        return res.status(201).json({ ok: true, mensagem: "Pontuação da banda salva." });
    } catch (error) {
        return res.status(error.status || 500).json({
            ok: false,
            erro: error.status ? error.message : "Falha ao salvar a pontuação da banda.",
        });
    }
});

const salas = {};
const resultadosExecutavelRecentes = [];
const ticketsSessaoPendentes = [];
const ultimoEnvioExecutavelPorIp = new Map();
const lotesExecutavelRecebidos = new Map();
let proximaOrdemTicket = 0;
const MAX_JOGADORES_SALA = 4;
const ROOM_RECONNECT_GRACE_MS = 15000;

function ticketsNaFila() {
    return [...ticketsSessaoPendentes]
        .sort((a, b) => (a.ordemFila || Date.parse(a.emitidoEm)) - (b.ordemFila || Date.parse(b.emitidoEm)));
}

function validarFaseDosJogadores(jogadores, fase) {
    if (!FASES_CAMPANHA.includes(fase)) throw new Error("Fase da campanha inválida.");
    const raiz = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
    const contas = raiz.accounts || raiz;
    for (const jogador of jogadores) {
        const nome = jogador.nome || jogador.username;
        const key = normalizeUsername(nome);
        const conta = Object.hasOwn(contas, key) && contas[key];
        if (!conta) throw new Error("Um jogador da sala não tem conta cadastrada.");
        const fases = inicializarPerfil(conta, key).fases;
        if (!fases.desbloqueadas.includes(fase)) throw new Error(`A fase ${fase} está bloqueada para ${nome}. Derrotem o boss da fase anterior primeiro.`);
    }
}

function normalizarInstrumentoExecutavel(valor) {
    const chave = String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const aliases = {
        guitarra: "guitarra", fivefretguitar: "guitarra", guitar: "guitarra",
        baixo: "baixo", fivefretbass: "baixo", bass: "baixo",
        bateria: "bateria", drums: "bateria", drum: "bateria",
        teclado: "teclado", prokeys: "teclado", keys: "teclado",
    };
    return aliases[chave] || null;
}

// O executável envia resultados que são vinculados ao ticket FIFO mais antigo
// ainda sem lote. O operador confirma o vínculo antes de qualquer gravação.
app.post("/api/operador/resultados-executavel", (req, res) => {
    const ip = req.ip || "desconhecido";
    const ultimoEnvio = ultimoEnvioExecutavelPorIp.get(ip) || 0;
    if (Date.now() - ultimoEnvio < 2000) {
        return res.status(429).json({ ok: false, erro: "Aguarde antes de enviar outro resultado." });
    }
    const dados = req.body || {};
    if (typeof dados.musica !== "string" || !dados.musica.trim() || dados.musica.length > 200 ||
        !Array.isArray(dados.resultados) || dados.resultados.length > MAX_JOGADORES_SALA ||
        (dados.pontuacaoBanda !== undefined && (!Number.isSafeInteger(dados.pontuacaoBanda) || dados.pontuacaoBanda < 0 || dados.pontuacaoBanda > 4e9)) ||
        (dados.bossDerrotado !== undefined && typeof dados.bossDerrotado !== "boolean")) {
        return res.status(400).json({ ok: false, erro: "Dados de resultado inválidos." });
    }
    const loteId = typeof dados.loteId === "string" && /^[a-f0-9-]{16,64}$/i.test(dados.loteId) ? dados.loteId : null;
    if (loteId && lotesExecutavelRecebidos.has(loteId)) {
        const ticketId = lotesExecutavelRecebidos.get(loteId);
        return res.json({ ok: true, duplicado: true, recebidos: dados.resultados.length, ticketId });
    }

    const recebidos = [];
    for (const item of dados.resultados) {
        if (!item || typeof item.perfilNome !== "string" || !item.perfilNome.trim() || item.perfilNome.length > 80 ||
            typeof item.instrumento !== "string" || item.instrumento.length > 40 ||
            typeof item.modoJogo !== "string" || item.modoJogo.length > 60 ||
            !Number.isSafeInteger(item.pontuacao) || item.pontuacao < 0 || item.pontuacao > 1e9 ||
            typeof item.precisao !== "number" || !Number.isFinite(item.precisao) || item.precisao < 0 || item.precisao > 100 ||
            !Number.isSafeInteger(item.maiorCombo) || item.maiorCombo < 0 || item.maiorCombo > 1e6 ||
            !Number.isSafeInteger(item.notasAcertadas) || item.notasAcertadas < 0 || item.notasAcertadas > 1e6 ||
            !Number.isSafeInteger(item.notasErradas) || item.notasErradas < 0 || item.notasErradas > 1e6 ||
            typeof item.fullCombo !== "boolean" || item.maiorCombo > item.notasAcertadas ||
            (item.fullCombo && (item.notasErradas !== 0 || item.notasAcertadas === 0 || item.maiorCombo !== item.notasAcertadas))) {
            return res.status(400).json({ ok: false, erro: "Pontuação de perfil inválida." });
        }
        recebidos.push({
            partidaId: `unity_${randomUUID()}`,
            recebidoEm: new Date().toISOString(),
            perfil: { nome: item.perfilNome.trim(), instrumento: item.instrumento, modoJogo: item.modoJogo },
            instrumentoNormalizado: normalizarInstrumentoExecutavel(item.instrumento),
            musica: dados.musica.trim(),
            pontuacao: item.pontuacao,
            precisao: item.precisao,
            maiorCombo: item.maiorCombo,
            notasAcertadas: item.notasAcertadas,
            notasErradas: item.notasErradas,
            fullCombo: item.fullCombo,
            ...(dados.bossDerrotado === undefined ? {} : { bossDerrotado: dados.bossDerrotado }),
            ...(item.pausada === undefined ? {} : { pausada: item.pausada }),
            ...(item.energiaFinal === undefined ? {} : { energiaFinal: item.energiaFinal }),
            ...(item.dificuldade === undefined ? {} : { dificuldade: item.dificuldade }),
            ...(item.concluida === undefined ? {} : { concluida: item.concluida }),
        });
        if (!normalizarInstrumentoExecutavel(item.instrumento)) {
            return res.status(400).json({ ok: false, erro: `Instrumento não reconhecido no resultado: ${item.instrumento}.` });
        }
        try {
            validarResultado({
                ...recebidos[recebidos.length - 1], operadorId: "unity", username: "unity",
                instrumento: normalizarInstrumentoExecutavel(item.instrumento),
            });
        } catch (error) { return res.status(400).json({ ok: false, erro: error.message }); }
    }
    const ticket = ticketsNaFila().find((item) => !item.resultadosExecutavel);
    if (!ticket) {
        return res.status(409).json({ ok: false, erro: "Nenhum ticket aguardando resultados. Os resultados não foram registrados; emita um ticket antes da próxima música." });
    }
    const jogadores = (ticket.jogadores || []).filter((jogador) => normalizarInstrumentoExecutavel(jogador.instrumento));
    const instrumentosTicket = jogadores.map((jogador) => normalizarInstrumentoExecutavel(jogador.instrumento));
    const instrumentosResultado = recebidos.map((resultado) => resultado.instrumentoNormalizado);
    if (jogadores.length !== recebidos.length || instrumentosTicket.length !== instrumentosResultado.length ||
        new Set(instrumentosTicket).size !== instrumentosTicket.length ||
        new Set(instrumentosResultado).size !== instrumentosResultado.length ||
        instrumentosTicket.some((instrumento) => !instrumentosResultado.includes(instrumento))) {
        return res.status(409).json({ ok: false, erro: "Os instrumentos dos resultados não correspondem aos jogadores do ticket mais antigo. Confira a fila antes de continuar." });
    }
    ticket.resultadosExecutavel = recebidos.map(({ instrumentoNormalizado, ...resultado }) => ({ ...resultado, instrumentoNormalizado }));
    ticket.musica = dados.musica.trim();
    ticket.pontuacaoBanda = dados.pontuacaoBanda;
    ticket.bossDerrotado = dados.bossDerrotado;
    ticket.estado = "aguardando_confirmacao";
    if (loteId) {
        lotesExecutavelRecebidos.set(loteId, ticket.ticketId);
        if (lotesExecutavelRecebidos.size > 500) lotesExecutavelRecebidos.delete(lotesExecutavelRecebidos.keys().next().value);
    }
    ultimoEnvioExecutavelPorIp.set(ip, Date.now());
    io.to("operador-resultados-global").emit("revisao_ticket_recebida", ticket);
    return res.json({ ok: true, recebidos: recebidos.length, ticketId: ticket.ticketId });
});

function criarEstruturaSala(roomId, roomName, banda, criadorUsername, donoId, socketDonoId) {
    return {
        roomId,
        roomName,
        banda,
        criadorUsername,
        donoId,
        socketDonoId,
        etapa: "lobby",
        mapa: null,
        criadoEm: new Date().toISOString(),
        jogadores: [],
        host: null,
        instrumentos: {
            guitarra: null,
            baixo: null,
            bateria: null,
            teclado: null,
        },
        operadores: {},
        disconnectTimers: new Map(),
        resultadosRecentes: [],
        ticketsPendentes: [],
        ultimoTicket: null,
        campanha: null,
    };
}

function resumoSalas() {
    return Object.values(salas).map((sala) => ({
        roomId: sala.roomId,
        roomName: sala.roomName,
        banda: sala.banda,
        criadorUsername: sala.criadorUsername,
        criadoEm: sala.criadoEm,
        jogadores: sala.jogadores.map((jogador) => jogador.username),
        quantidadeJogadores: sala.jogadores.length,
        limiteJogadores: MAX_JOGADORES_SALA,
    }));
}

function transmitirSalas() {
    io.emit("salas_atualizadas", resumoSalas());
}

function enviarEstadoSala(salaId) {
    const sala = salas[salaId];
    if (!sala) return;
    io.to(salaId).emit("atualizar_estado", {
        host: sala.host,
        donoId: sala.donoId,
        socketDonoId: sala.socketDonoId,
        instrumentos: sala.instrumentos,
        campanha: sala.campanha,
        ticketPendente: Boolean(sala.ticketsPendentes?.length),
        operadores: Object.values(sala.operadores).map(
            (operador) => operador.nome,
        ),
    });
}

function criarSala() {
    const salaId = Math.random().toString(36).substring(2, 8).toUpperCase();
    return salaId;
}

function removerJogadorDaSala(socket) {
    const { salaId, operadorId } = socket.data;
    const sala = salas[salaId];
    if (!sala || sala.operadores[operadorId]?.socketId !== socket.id) return;

    const disconnectTimer = sala.disconnectTimers.get(operadorId);
    if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        sala.disconnectTimers.delete(operadorId);
    }

    if (sala.socketDonoId === socket.id) sala.socketDonoId = null;
    delete sala.operadores[operadorId];
    sala.jogadores = sala.jogadores.filter(
        (jogador) => jogador.id !== operadorId,
    );
    for (const instrumento of Object.keys(sala.instrumentos)) {
        if (sala.instrumentos[instrumento] === operadorId)
            sala.instrumentos[instrumento] = null;
    }

    if (sala.host === operadorId)
        sala.host = Object.keys(sala.operadores)[0] || null;
    if (sala.jogadores.length === 0) {
        for (const timer of sala.disconnectTimers.values()) clearTimeout(timer);
        delete salas[salaId];
        console.log(`> Sala ${salaId} foi excluída por estar vazia (0/${MAX_JOGADORES_SALA}).`);
    } else {
        enviarEstadoSala(salaId);
    }
    transmitirSalas();
}

io.on("connection", (socket) => {
    socket.on("inscreverConquistas", ({ token } = {}, callback) => {
        const session = sessions.get(sessionKey(token));
        if (!session) {
            if (typeof callback === "function") callback({ ok: false });
            return;
        }
        socket.join(`conquistas:${session.accountKey}`);
        socket.data.accountKey = session.accountKey;
        socket.emit("conquistaDesbloqueada", {
            notificacoes: partidas.conquistasPendentes(session.accountKey),
            pendentesAoEntrar: true,
        });
        if (typeof callback === "function") callback({ ok: true });
    });

    socket.on("confirmarConquistasExibidas", ({ ids } = {}, callback) => {
        const accountKey = socket.data.accountKey;
        if (!accountKey || !Array.isArray(ids)) {
            if (typeof callback === "function") callback({ ok: false });
            return;
        }
        try {
            partidas.confirmarConquistasExibidas(accountKey, ids);
            if (typeof callback === "function") callback({ ok: true });
        } catch {
            if (typeof callback === "function") callback({ ok: false });
        }
    });

    socket.on("entrarRanking", (_dados, callback) => {
        try {
            const records = partidas.ranking();
            socket.join("ranking");
            if (typeof callback === "function") callback({ ok: true, records });
        } catch (error) {
            console.error("> Falha ao carregar ranking:", error);
            if (typeof callback === "function") callback({ ok: false, erro: "Falha ao carregar ranking." });
        }
    });

    socket.on("partidaFinalizada", (resultado, callback) => {
        try {
            finalizarConquistaDaFeira();
            // Identidade leve existente: username/operadorId informados pelo cliente.
            // Isto não constitui validação antitrapaça nem altera a autenticação.
            const resultadoValidado = validarResultado(resultado);
            const salvo = partidas.salvar(resultadoValidado);
            // Mantém compatibilidade com os consumidores antigos do store em memória.
            accountStore = salvo.raiz.accounts ? salvo.raiz : { accounts: salvo.raiz };
            io.to("ranking").emit("rankingAtualizado", { records: salvo.records });
            const roomId = typeof resultado.roomId === "string" ? resultado.roomId.trim().toUpperCase() : "";
            const sala = salas[roomId];
            const jogador = sala?.jogadores.find((item) =>
                item.id === resultado.operadorId || normalizeUsername(item.username) === normalizeUsername(resultado.username),
            );
            if (sala && jogador) {
                const registro = {
                    partidaId: resultadoValidado.partidaId,
                    recebidoEm: new Date().toISOString(),
                    perfil: {
                        id: jogador.id,
                        nome: jogador.username,
                        instrumento: Object.entries(sala.instrumentos).find(([, operadorId]) => operadorId === jogador.id)?.[0] || resultadoValidado.instrumento,
                    },
                    musica: resultadoValidado.musica,
                    pontuacao: resultadoValidado.pontuacao,
                    precisao: resultadoValidado.precisao,
                    maiorCombo: resultadoValidado.maiorCombo,
                    notasAcertadas: resultadoValidado.notasAcertadas,
                    notasErradas: resultadoValidado.notasErradas,
                    fullCombo: resultadoValidado.fullCombo,
                };
                sala.resultadosRecentes = sala.resultadosRecentes.filter((item) => item.partidaId !== registro.partidaId);
                sala.resultadosRecentes.push(registro);
                sala.resultadosRecentes = sala.resultadosRecentes.slice(-20);
                io.to(`operador-resultados:${roomId}`).emit("resultado_individual_recebido", registro);
            }
            if (salvo.novasConquistas?.length) {
                io.to(`conquistas:${normalizeUsername(resultado.username)}`).emit("conquistaDesbloqueada", {
                    notificacoes: salvo.notificacoesConquistas,
                });
            }
            if (typeof callback === "function") callback({
                ok: true,
                partidaId: resultado.partidaId,
                novasConquistas: salvo.novasConquistas || [],
            });
        } catch (error) {
            console.error("> Falha ao sincronizar resultado:", error);
            if (typeof callback === "function") callback({ ok: false, erro: error.code ? "Falha ao gravar resultado em disco." : error.message });
        }
    });

    socket.on("monitorar_resultados_salas", ({ token } = {}, callback) => {
        const authorization = isOfficialOperator({
            headers: { authorization: typeof token === "string" ? `Bearer ${token}` : "" },
        });
        if (!authorization.ok) {
            if (typeof callback === "function") callback({ ok: false, erro: authorization.error });
            return;
        }
        for (const id of socket.data.salasMonitoradas || []) socket.leave(`operador-resultados:${id}`);
        const ids = Object.keys(salas);
        for (const id of ids) socket.join(`operador-resultados:${id}`);
        socket.join("operador-resultados-global");
        socket.data.salasMonitoradas = ids;
        if (typeof callback === "function") callback({
            ok: true,
            salas: resumoSalas(),
            tickets: ticketsNaFila(),
            resultados: [...ids.flatMap((id) => salas[id].resultadosRecentes), ...resultadosExecutavelRecentes],
        });
    });

    socket.on("confirmar_resultados_ticket", ({ token, ticketId } = {}, callback) => {
        const authorization = isOfficialOperator({
            headers: { authorization: typeof token === "string" ? `Bearer ${token}` : "" },
        });
        if (!authorization.ok) {
            if (typeof callback === "function") callback({ ok: false, erro: authorization.error });
            return;
        }
        const fila = ticketsNaFila();
        const ticket = fila[0];
        if (!ticket || ticket.ticketId !== ticketId) {
            if (typeof callback === "function") callback({ ok: false, erro: "A fila mudou. Confirme primeiro o ticket mais antigo." });
            return;
        }
        if (!Array.isArray(ticket.resultadosExecutavel) || ticket.estado !== "aguardando_confirmacao") {
            if (typeof callback === "function") callback({ ok: false, erro: "Este ticket ainda não recebeu resultados para confirmar." });
            return;
        }

        const resultadosSalvos = [];
        try {
            finalizarConquistaDaFeira();
            if (ticket.modo?.tipo === "historia") validarFaseDosJogadores(ticket.jogadores, ticket.modo.fase);
            const bossVitoriaConfirmada = ticket.bossDerrotado === true && ticket.resultadosExecutavel.every(item => item.concluida !== false);
            for (const item of ticket.resultadosExecutavel) {
                const jogador = ticket.jogadores.find((pessoa) => normalizarInstrumentoExecutavel(pessoa.instrumento) === item.instrumentoNormalizado);
                if (!jogador || !jogador.nome || !jogador.id) throw new Error("Não foi possível identificar a conta do jogador pelo ticket.");
                const resultado = validarResultado({
                    partidaId: `unity_${ticket.ticketId}_${item.instrumentoNormalizado}`,
                    operadorId: String(jogador.id),
                    username: jogador.nome,
                    instrumento: item.instrumentoNormalizado,
                    banda: ticket.banda || undefined,
                    modo: ticket.modo?.tipo === "historia" ? "historia" : "freeplay",
                    musica: ticket.musica,
                    pontuacao: item.pontuacao,
                    precisao: item.precisao,
                    maiorCombo: item.maiorCombo,
                    notasAcertadas: item.notasAcertadas,
                    notasErradas: item.notasErradas,
                    fullCombo: item.fullCombo,
                    pausada: item.pausada,
                    energiaFinal: item.energiaFinal,
                    dificuldade: item.dificuldade,
                    concluida: item.concluida,
                    bossDerrotado: ticket.bossDerrotado === undefined ? undefined : bossVitoriaConfirmada,
                    ...(ticket.modo?.tipo === "historia" && Number.isSafeInteger(ticket.modo.fase) && ticket.modo.fase > 0 ? { fase: ticket.modo.fase } : {}),
                });
                const salvo = partidas.salvar(resultado, { origemExecutavel: true });
                accountStore = salvo.raiz.accounts ? salvo.raiz : { accounts: salvo.raiz };
                io.to("ranking").emit("rankingAtualizado", { records: salvo.records });
                if (salvo.novasConquistas?.length) {
                    io.to(`conquistas:${normalizeUsername(resultado.username)}`).emit("conquistaDesbloqueada", {
                        notificacoes: salvo.notificacoesConquistas,
                    });
                }
                resultadosSalvos.push({ username: resultado.username, instrumento: resultado.instrumento, partidaId: resultado.partidaId });
            }
            if (ticket.banda) {
                const membros = ticket.resultadosExecutavel.map((item) => {
                    const jogador = ticket.jogadores.find((pessoa) => normalizarInstrumentoExecutavel(pessoa.instrumento) === item.instrumentoNormalizado);
                    return {
                        nome: jogador.nome, instrumento: item.instrumentoNormalizado, pontuacao: item.pontuacao,
                        ...(item.precisao === undefined ? {} : { precisao: item.precisao }),
                        ...(item.concluida === undefined ? {} : { concluida: item.concluida }),
                    };
                });
                const pontuacaoBanda = Number.isSafeInteger(ticket.pontuacaoBanda)
                    ? ticket.pontuacaoBanda
                    : membros.reduce((total, membro) => total + membro.pontuacao, 0);
                const salvoBanda = partidas.salvarPontuacaoBanda({
                    partidaId: `band_${ticket.ticketId}`,
                    banda: ticket.banda,
                    musica: ticket.musica,
                    modo: ticket.modo?.tipo === "historia" ? "historia" : "freeplay",
                    pontuacao: pontuacaoBanda,
                    membros,
                });
                accountStore = salvoBanda.raiz.accounts ? salvoBanda.raiz : { accounts: salvoBanda.raiz };
                publicarConquistasEmLote(salvoBanda);
                io.to("ranking").emit("rankingAtualizado", { records: salvoBanda.records });
                resultadosSalvos.push({ nome: ticket.banda.nome, pontuacao: pontuacaoBanda, tipo: "banda" });
            } else if (ticket.resultadosExecutavel.length === 4) {
                const salvoBanda = partidas.registrarParticipacaoBanda(ticket.resultadosExecutavel.map(item => ({
                    nome: ticket.jogadores.find(jogador => normalizarInstrumentoExecutavel(jogador.instrumento) === item.instrumentoNormalizado).nome,
                    instrumento: item.instrumentoNormalizado,
                    pontuacao: item.pontuacao,
                    precisao: item.precisao,
                    ...(item.concluida === undefined ? {} : { concluida: item.concluida }),
                })));
                accountStore = salvoBanda.raiz.accounts ? salvoBanda.raiz : { accounts: salvoBanda.raiz };
                publicarConquistasEmLote(salvoBanda);
            }
        } catch (error) {
            console.error("> Falha ao confirmar resultados do ticket:", error);
            if (typeof callback === "function") callback({ ok: false, erro: error.message || "Falha ao salvar resultados." });
            return;
        }

        const filaIndex = ticketsSessaoPendentes.findIndex((item) => item.ticketId === ticket.ticketId);
        if (filaIndex !== -1) ticketsSessaoPendentes.splice(filaIndex, 1);
        const sala = salas[ticket.roomId];
        if (sala) {
            sala.ticketsPendentes = sala.ticketsPendentes.filter((item) => item.ticketId !== ticket.ticketId);
            if (sala.ultimoTicket?.ticketId === ticket.ticketId) sala.ultimoTicket = null;
            io.to(`operador-resultados:${ticket.roomId}`).emit("ticket_sessao_removido", { ticketId: ticket.ticketId });
            if (ticket.modo?.tipo === "historia") {
                const venceu = ticket.bossDerrotado === true && ticket.resultadosExecutavel.every(item => item.concluida !== false);
                sala.campanha = {
                    fase: ticket.modo.fase,
                    bossDerrotado: ticket.bossDerrotado ?? null,
                    venceu,
                    proximaFase: venceu && ticket.modo.fase < FASES_CAMPANHA.length ? ticket.modo.fase + 1 : ticket.modo.fase,
                    campanhaConcluida: venceu && ticket.modo.fase === FASES_CAMPANHA.length,
                };
                io.to(ticket.roomId).emit("resultado_boss_confirmado", sala.campanha);
            }
            enviarEstadoSala(ticket.roomId);
        }
        io.to("operador-resultados-global").emit("ticket_sessao_removido", { ticketId: ticket.ticketId });
        if (typeof callback === "function") callback({ ok: true, resultados: resultadosSalvos });
    });

    socket.on("remover_ticket_sessao", ({ token, ticketId } = {}, callback) => {
        const authorization = isOfficialOperator({
            headers: { authorization: typeof token === "string" ? `Bearer ${token}` : "" },
        });
        if (!authorization.ok) {
            if (typeof callback === "function") callback({ ok: false, erro: authorization.error });
            return;
        }
        const index = ticketsSessaoPendentes.findIndex((ticket) => ticket.ticketId === ticketId);
        if (index !== -1) {
            const ticket = ticketsSessaoPendentes[index];
            if (ticketsNaFila()[0]?.ticketId !== ticketId || ticket.resultadosExecutavel) {
                if (typeof callback === "function") callback({ ok: false, erro: "Só é possível remover o primeiro ticket da fila, antes de receber resultados." });
                return;
            }
            ticketsSessaoPendentes.splice(index, 1);
            const sala = salas[ticket.roomId];
            if (sala) {
                sala.ticketsPendentes = sala.ticketsPendentes.filter((item) => item.ticketId !== ticketId);
                if (sala.ultimoTicket?.ticketId === ticketId) {
                    sala.ultimoTicket = sala.ticketsPendentes[sala.ticketsPendentes.length - 1] || null;
                }
                io.to(`operador-resultados:${sala.roomId}`).emit("ticket_sessao_removido", { ticketId });
            }
        }
        io.to("operador-resultados-global").emit("ticket_sessao_removido", { ticketId });
        if (typeof callback === "function") callback({ ok: true });
    });

    socket.on("limpar_resultados_recentes", ({ token } = {}, callback) => {
        const authorization = isOfficialOperator({
            headers: { authorization: typeof token === "string" ? `Bearer ${token}` : "" },
        });
        if (!authorization.ok) {
            if (typeof callback === "function") callback({ ok: false, erro: authorization.error });
            return;
        }
        resultadosExecutavelRecentes.length = 0;
        for (const sala of Object.values(salas)) {
            sala.resultadosRecentes = [];
            io.to(`operador-resultados:${sala.roomId}`).emit("resultados_recentes_limpos");
        }
        io.to("operador-resultados-global").emit("resultados_recentes_limpos");
        if (typeof callback === "function") callback({ ok: true });
    });

    console.log(`> Cliente conectado: ${socket.id}`);
    socket.emit("salas_atualizadas", resumoSalas());

    socket.on("pedir_salas", () => {
        socket.emit("salas_atualizadas", resumoSalas());
    });

    socket.on(
        "criarSala",
        ({ roomName, bandName, username, operadorId } = {}, callback) => {
            const nomeSala = String(roomName || "").trim();
            const nomeBanda = String(bandName || "").trim();
            const nomeUsuario = String(username || "").trim();
            const id = String(operadorId || nomeUsuario).trim();
            if (!nomeSala || nomeSala.length > 40 || nomeBanda.length > 40 || !nomeUsuario || !id) {
                if (typeof callback === "function")
                    callback({
                        ok: false,
                        erro: "Nome da sala, banda ou identidade inválida.",
                    });
                return;
            }

            try {
                validarNomePublico(nomeUsuario, "Nome de jogador");
                validarNomePublico(nomeSala, "Nome da sala");
                validarNomePublico(nomeBanda, "Nome da banda");
            } catch (error) {
                if (typeof callback === "function") callback({ ok: false, erro: error.message });
                else socket.emit("erro", error.message);
                return;
            }
            const roomId = criarSala();
            const bandId = nomeBanda.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
                .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
            const banda = nomeBanda ? { id: bandId || randomUUID(), nome: nomeBanda } : null;
            salas[roomId] = criarEstruturaSala(roomId, nomeSala, banda, nomeUsuario, id, socket.id);
            entrarNaSala(socket, roomId, id, nomeUsuario, callback);
        },
    );

    socket.on(
        "entrarSala",
        ({ roomId, username, operadorId } = {}, callback) => {
            const id = String(operadorId || username || "").trim();
            const nomeUsuario = String(username || id).trim();
            if (!roomId || !id || !salas[roomId]) {
                if (typeof callback === "function")
                    callback({ ok: false, erro: "Sala não encontrada." });
                return;
            }
            try {
                validarNomePublico(nomeUsuario, "Nome de jogador");
            } catch (error) {
                if (typeof callback === "function") callback({ ok: false, erro: error.message });
                else socket.emit("erro", error.message);
                return;
            }
            entrarNaSala(socket, roomId, id, nomeUsuario, callback);
        },
    );

    socket.on("mudar-etapa", ({ salaId, novaEtapa } = {}) => {
        const sala = salas[salaId];
        if (!sala || sala.donoId !== socket.data.operadorId || sala.socketDonoId !== socket.id || socket.data.salaId !== salaId) {
            socket.emit("erro", "Apenas o dono da sala pode avançar as etapas!");
            return;
        }

        sala.etapa = novaEtapa;
        io.to(salaId).emit("etapa-atualizada", novaEtapa);
    });

    socket.on("mudar-mapa", ({ salaId, novoMapa } = {}) => {
        const sala = salas[salaId];
        if (!sala || sala.donoId !== socket.data.operadorId || sala.socketDonoId !== socket.id || socket.data.salaId !== salaId) {
            socket.emit("erro", "Apenas o dono da sala pode mudar o mapa!");
            return;
        }

        sala.mapa = novoMapa;
        io.to(salaId).emit("mapa-atualizado", novoMapa);
    });

    socket.on("owner_avancar_fase", ({ roomId } = {}, callback) => {
        const sala = salas[roomId];
        if (!sala || sala.donoId !== socket.data.operadorId || sala.socketDonoId !== socket.id || socket.data.salaId !== roomId) {
            socket.emit("erro", "Apenas o dono da sala pode avançar as etapas!");
            if (typeof callback === "function") {
                callback({
                    ok: false,
                    erro: "Apenas o proprietário pode avançar a sala.",
                });
            }
            return;
        }

        if ((sala.ultimoTicket?.modo?.tipo === "historia" || sala.campanha) && !sala.campanha?.venceu) {
            const erro = "A próxima fase depende da vitória contra o boss confirmada pelo executável.";
            if (typeof callback === "function") callback({ ok: false, erro });
            else socket.emit("erro", erro);
            return;
        }
        io.to(roomId).emit("sala_avancou_fase", { roomId });
        if (typeof callback === "function") callback({ ok: true });
    });

    socket.on(
        "owner_emitir_ticket",
        ({ roomId, modo } = {}, callback) => {
            const sala = salas[roomId];
            if (!sala || sala.donoId !== socket.data.operadorId || sala.socketDonoId !== socket.id || socket.data.salaId !== roomId) {
                socket.emit("erro", "Apenas o dono da sala pode emitir o ticket!");
                if (typeof callback === "function") {
                    callback({
                        ok: false,
                        erro: "Apenas o proprietário pode emitir o ticket.",
                    });
                }
                return;
            }

            // Compatibilidade com salas criadas antes da fila de tickets existir.
            if (!Array.isArray(sala.ticketsPendentes)) sala.ticketsPendentes = [];

            try {
                if (sala.ticketsPendentes.length) throw new Error("Esta sala já tem um ticket aguardando resultado ou confirmação.");
                if (!modo || !["historia", "freeplay"].includes(modo.tipo)) throw new Error("Modo de jogo inválido.");
                if (modo.tipo === "historia") validarFaseDosJogadores(sala.jogadores, modo.fase);
            } catch (error) {
                if (typeof callback === "function") callback({ ok: false, erro: error.message });
                else socket.emit("erro", error.message);
                return;
            }
            sala.campanha = null;

            io.to(roomId).emit("sala_emitiu_ticket", { roomId, modo });
            const ticket = {
                ticketId: randomUUID(),
                ordemFila: ++proximaOrdemTicket,
                roomId,
                roomName: sala.roomName,
                banda: sala.banda,
                modo: modo || { tipo: "freeplay", fase: null },
                emitidoEm: new Date().toISOString(),
                jogadores: sala.jogadores.map((jogador) => ({
                    id: jogador.id,
                    nome: jogador.username,
                    instrumento: Object.entries(sala.instrumentos).find(([, operadorId]) => operadorId === jogador.id)?.[0] || "sem instrumento",
                })),
            };
            ticketsSessaoPendentes.push(ticket);
            sala.ticketsPendentes.push(ticket);
            sala.ultimoTicket = ticket;
            enviarEstadoSala(roomId);
            io.to("operador-resultados-global").emit("ticket_sessao_recebido", ticket);
            if (typeof callback === "function") callback({ ok: true });
        },
    );

    function entrarNaSala(cliente, salaId, operadorId, operadorNome, callback) {
        try {
            validarNomePublico(operadorNome, "Nome de jogador");
        } catch (error) {
            if (typeof callback === "function") callback({ ok: false, erro: error.message });
            else cliente.emit("erro", error.message);
            return;
        }
        const sala = salas[salaId];
        const jogadorExistente = sala.jogadores.find(
            (jogador) => jogador.id === operadorId,
        );
        if (!jogadorExistente && sala.jogadores.length >= MAX_JOGADORES_SALA) {
            if (typeof callback === "function")
                callback({
                    ok: false,
                    erro: "SALA CHEIA // limite de 4 jogadores.",
                });
            return;
        }

        if (cliente.data.salaId && cliente.data.salaId !== salaId)
            removerJogadorDaSala(cliente);
        const disconnectTimer = sala.disconnectTimers.get(operadorId);
        if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            sala.disconnectTimers.delete(operadorId);
        }
        cliente.join(salaId);
        cliente.data.salaId = salaId;
        cliente.data.operadorId = operadorId;
        cliente.data.operadorNome = operadorNome;
        cliente.username = operadorNome;
        if (sala.donoId === operadorId) sala.socketDonoId = cliente.id;
        if (jogadorExistente) jogadorExistente.socketId = cliente.id;
        if (!sala.host) sala.host = operadorId;
        sala.operadores[operadorId] = {
            socketId: cliente.id,
            nome: operadorNome,
        };
        if (!jogadorExistente)
            sala.jogadores.push({
                id: operadorId,
                username: operadorNome,
                socketId: cliente.id,
            });
        if (typeof callback === "function")
            callback({
                ok: true,
                roomId: sala.roomId,
                roomName: sala.roomName,
                banda: sala.banda,
            });
        transmitirSalas();
        enviarEstadoSala(salaId);
    }

    socket.on("entrar_sala", ({ salaId, operadorId, operadorNome } = {}) => {
        const id = operadorId || operadorNome;
        if (!id || !salas[salaId]) return;
        entrarNaSala(socket, salaId, id, operadorNome || id);
    });

    socket.on("kick_player", ({ roomId, targetUsername } = {}) => {
        const sala = salas[roomId];
        if (!sala || sala.host !== socket.username || !targetUsername) return;

        const targetEntry = Object.entries(sala.operadores).find(
            ([id, operador]) =>
                id === targetUsername || operador.nome === targetUsername,
        );
        if (!targetEntry || targetEntry[0] === socket.username) return;

        const [targetId] = targetEntry;
        delete sala.operadores[targetId];
        sala.jogadores = sala.jogadores.filter(
            (jogador) => jogador.id !== targetId,
        );
        for (const instrumento of Object.keys(sala.instrumentos)) {
            if (sala.instrumentos[instrumento] === targetId)
                sala.instrumentos[instrumento] = null;
        }

        io.to(roomId).emit("room_updated", sala);

        const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
        if (socketsInRoom) {
            for (const socketId of socketsInRoom) {
                const targetSocket = io.sockets.sockets.get(socketId);
                if (targetSocket && targetSocket.username === targetUsername) {
                    targetSocket.leave(roomId);
                    targetSocket.data.salaId = null;
                    targetSocket.emit("player_kicked", {
                        username: targetUsername,
                        message: "Você foi expulso da sala pelo criador.",
                    });
                    break;
                }
            }
        }

        enviarEstadoSala(roomId);
        transmitirSalas();
    });

    socket.on(
        "escolher_instrumento",
        ({ salaId, instrumento, operadorId, operadorNome } = {}) => {
            const sala = salas[salaId];
            const id = operadorId || operadorNome;
            if (!sala || !id || !Object.hasOwn(sala.instrumentos, instrumento))
                return;

            if (sala.instrumentos[instrumento] === id) {
                sala.instrumentos[instrumento] = null;
            } else {
                for (const inst of Object.keys(sala.instrumentos)) {
                    if (sala.instrumentos[inst] === id)
                        sala.instrumentos[inst] = null;
                }
                if (!sala.instrumentos[instrumento])
                    sala.instrumentos[instrumento] = id;
            }
            enviarEstadoSala(salaId);
        },
    );

    socket.on("disconnect", () => {
        console.log(`> Cliente desconectado: ${socket.id}`);
        const { salaId, operadorId } = socket.data;
        const sala = salas[salaId];
        if (!sala || sala.operadores[operadorId]?.socketId !== socket.id) return;

        const previousTimer = sala.disconnectTimers.get(operadorId);
        if (previousTimer) clearTimeout(previousTimer);
        const timer = setTimeout(() => {
            sala.disconnectTimers.delete(operadorId);
            // A página seguinte tem uma janela para reconectar com a mesma identidade.
            if (salas[salaId] === sala && sala.operadores[operadorId]?.socketId === socket.id) {
                removerJogadorDaSala(socket);
            }
        }, ROOM_RECONNECT_GRACE_MS);
        sala.disconnectTimers.set(operadorId, timer);
    });
});

const PORT = Number(process.env.PORT) || 3000;
const timerEncerramentoFeira = setInterval(() => {
    try { finalizarConquistaDaFeira(); }
    catch (error) { console.error("> Falha ao premiar a feira:", error); }
}, 10000);
timerEncerramentoFeira.unref();
finalizarConquistaDaFeira();
server.listen(PORT, () => {
    console.log(`> Servidor rodando na porta ${PORT}`);
});
