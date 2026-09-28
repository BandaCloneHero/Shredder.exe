const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const { scrypt, randomBytes, randomUUID, timingSafeEqual, createHash } = require("crypto");
const { promisify } = require("util");
const { criarPersistenciaPartidas, validarResultado, inicializarPerfil } = require("./partidas");

const scryptAsync = promisify(scrypt);
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(require('./site-navigation'));
app.use(express.static(path.join(__dirname, "../docs")));

const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
const SESSIONS_FILE = path.join(__dirname, "sessions.json");
const partidas = criarPersistenciaPartidas(ACCOUNTS_FILE);
let accountStore = { accounts: {} };
let sessions = new Map();
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

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
            tituloEquipado:
                account.tituloEquipado ||
                account.currentTitle ||
                "Novato do Rock",
            moedas: account.moedas ?? account.currency ?? 0,
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
            fases: account.fases || {
                desbloqueadas: [1],
                favoritas: [],
                selecionada: null,
                historicoSelecionadas: [],
            },
        },
    });
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
        return res.json({ ok: true, fases: salvo.fases });
    } catch (error) {
        return res.status(error.status || 500).json({
            ok: false,
            error: error.status ? error.message : "Falha ao registrar a fase.",
        });
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
            pontuacao: dados.pontuacao,
            membros: dados.membros,
        });
        accountStore = salvo.raiz.accounts ? salvo.raiz : { accounts: salvo.raiz };
        io.emit("rankingAtualizado", { records: salvo.records });
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
const ultimoEnvioExecutavelPorIp = new Map();
const MAX_JOGADORES_SALA = 4;
const ROOM_RECONNECT_GRACE_MS = 15000;

// Resultados enviados diretamente pelo executável Unity. São mantidos apenas
// em memória para aparecerem no painel, sem alterar ranking ou contas.
app.post("/api/operador/resultados-executavel", (req, res) => {
    const ip = req.ip || "desconhecido";
    const ultimoEnvio = ultimoEnvioExecutavelPorIp.get(ip) || 0;
    if (Date.now() - ultimoEnvio < 2000) {
        return res.status(429).json({ ok: false, erro: "Aguarde antes de enviar outro resultado." });
    }
    const dados = req.body || {};
    if (typeof dados.musica !== "string" || !dados.musica.trim() || dados.musica.length > 200 ||
        !Array.isArray(dados.resultados) || dados.resultados.length > MAX_JOGADORES_SALA) {
        return res.status(400).json({ ok: false, erro: "Dados de resultado inválidos." });
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
            typeof item.fullCombo !== "boolean") {
            return res.status(400).json({ ok: false, erro: "Pontuação de perfil inválida." });
        }
        recebidos.push({
            partidaId: `unity_${randomUUID()}`,
            recebidoEm: new Date().toISOString(),
            perfil: { nome: item.perfilNome.trim(), instrumento: item.instrumento, modoJogo: item.modoJogo },
            musica: dados.musica.trim(),
            pontuacao: item.pontuacao,
            precisao: item.precisao,
            maiorCombo: item.maiorCombo,
            notasAcertadas: item.notasAcertadas,
            notasErradas: item.notasErradas,
            fullCombo: item.fullCombo,
        });
    }
    for (const resultado of recebidos) {
        resultadosExecutavelRecentes.push(resultado);
        io.to("operador-resultados-global").emit("resultado_individual_recebido", resultado);
    }
    ultimoEnvioExecutavelPorIp.set(ip, Date.now());
    if (resultadosExecutavelRecentes.length > 40) resultadosExecutavelRecentes.splice(0, resultadosExecutavelRecentes.length - 40);
    return res.json({ ok: true, recebidos: recebidos.length });
});

function criarEstruturaSala(roomId, roomName, criadorUsername, donoId, socketDonoId) {
    return {
        roomId,
        roomName,
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
        ticketsPendentes: [],
        resultadosRecentes: [],
    };
}

function resumoSalas() {
    return Object.values(salas).map((sala) => ({
        roomId: sala.roomId,
        roomName: sala.roomName,
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
            tickets: ids.flatMap((id) => salas[id].ticketsPendentes),
            resultados: [...ids.flatMap((id) => salas[id].resultadosRecentes), ...resultadosExecutavelRecentes],
        });
    });

    socket.on("remover_ticket_sessao", ({ token, ticketId } = {}, callback) => {
        const authorization = isOfficialOperator({
            headers: { authorization: typeof token === "string" ? `Bearer ${token}` : "" },
        });
        if (!authorization.ok) {
            if (typeof callback === "function") callback({ ok: false, erro: authorization.error });
            return;
        }
        for (const sala of Object.values(salas)) {
            const index = sala.ticketsPendentes.findIndex((ticket) => ticket.ticketId === ticketId);
            if (index === -1) continue;
            sala.ticketsPendentes.splice(index, 1);
            if (sala.ultimoTicket?.ticketId === ticketId) {
                sala.ultimoTicket = sala.ticketsPendentes[sala.ticketsPendentes.length - 1] || null;
            }
            io.to(`operador-resultados:${sala.roomId}`).emit("ticket_sessao_removido", { ticketId });
            if (typeof callback === "function") callback({ ok: true });
            return;
        }
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
        ({ roomName, username, operadorId } = {}, callback) => {
            const nomeSala = String(roomName || "").trim();
            const nomeUsuario = String(username || "").trim();
            const id = String(operadorId || nomeUsuario).trim();
            if (!nomeSala || nomeSala.length > 40 || !nomeUsuario || !id) {
                if (typeof callback === "function")
                    callback({
                        ok: false,
                        erro: "Nome da sala ou identidade inválida.",
                    });
                return;
            }

            const roomId = criarSala();
            salas[roomId] = criarEstruturaSala(roomId, nomeSala, nomeUsuario, id, socket.id);
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

            io.to(roomId).emit("sala_emitiu_ticket", { roomId, modo });
            const ticket = {
                ticketId: randomUUID(),
                roomId,
                roomName: sala.roomName,
                modo: modo || { tipo: "freeplay", fase: null },
                emitidoEm: new Date().toISOString(),
                jogadores: sala.jogadores.map((jogador) => ({
                    id: jogador.id,
                    nome: jogador.username,
                    instrumento: Object.entries(sala.instrumentos).find(([, operadorId]) => operadorId === jogador.id)?.[0] || "sem instrumento",
                })),
            };
            sala.ultimoTicket = ticket;
            sala.ticketsPendentes.push(ticket);
            io.to(`operador-resultados:${roomId}`).emit("ticket_sessao_recebido", ticket);
            if (typeof callback === "function") callback({ ok: true });
        },
    );

    function entrarNaSala(cliente, salaId, operadorId, operadorNome, callback) {
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
server.listen(PORT, () => {
    console.log(`> Servidor rodando na porta ${PORT}`);
});
