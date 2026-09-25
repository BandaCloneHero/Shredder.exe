/*
 * Lobby local do Shredder.exe.
 * Estas chaves hoje vivem apenas neste navegador. Em uma versão multiplayer real,
 * substitua as leituras/escritas por eventos WebSocket ou Firebase e trate o
 * servidor como fonte de verdade para lobby, instrumentos e progresso.
 */
const STORAGE = {
    player: "shredder_player",
    lobby: "shredder_lobby",
    roomId: "shredder_room_id",
    roomName: "shredder_room_name",
    mode: "shredder_modo",
    progress: "shredder_progresso",
};

const instruments = ["Guitarra", "Baixo", "Bateria", "Teclado"];
const currentPage = document.body.dataset.page;

function readJson(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch {
        return fallback;
    }
}

const PROFILE_INSTRUMENTS = [
    ["guitarra", "GUITARRA"],
    ["baixo", "BAIXO"],
    ["bateria", "BATERIA"],
    ["teclado", "TECLADO"],
];

// Adicione novos IDs e rótulos nesta lista quando o evento ganhar badges novas.
const PROFILE_ACHIEVEMENTS = [
    ["primeiros_acordes", "PRIMEIROS ACORDES", "◆"],
    ["on_fire", "ON FIRE", "◇"],
    ["cirurgico", "CIRÚRGICO", "✦"],
    ["perfeccionista", "PERFECCIONISTA", "◈"],
    ["lenda_viva", "LENDA VIVA", "★"],
    ["desafinador_profissional", "DESAFINADOR PROFISSIONAL", "⊗"],
];

function profileNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function profilePercent(value) {
    return `${profileNumber(value).toFixed(1)}%`;
}

function profileInstrumentMarkup(profile, instrumentId) {
    const stats = profile.instrumentStats?.[instrumentId] || {};
    return `
        <div class="profile-stat"><span>MAX SCORE</span><strong>${formatScore(profileNumber(stats.maxScore))}</strong></div>
        <div class="profile-stat"><span>MAX COMBO</span><strong>${formatScore(profileNumber(stats.maxCombo))}</strong></div>
        <div class="profile-stat"><span>MELHOR PRECISÃO</span><strong>${profilePercent(stats.bestAccuracy)}</strong></div>
        <div class="profile-stat"><span>MÚSICAS CONCLUÍDAS</span><strong>${formatScore(profileNumber(stats.songsCompleted))}</strong></div>
        <div class="profile-stat"><span>FULL COMBOS</span><strong>${formatScore(profileNumber(stats.fullCombos))}</strong></div>`;
}

function renderProfile(profile, isOwnProfile) {
    const hit = profileNumber(profile.lifetimeStats?.totalNotesHit);
    const misses = profileNumber(profile.lifetimeStats?.totalMisses);
    const totalNotes = hit + misses;
    const hitRatio = totalNotes ? (hit / totalNotes) * 100 : 0;
    const achievements = new Set(profile.achievements || []);
    const favorite = String(
        profile.favoriteInstrument || "nenhum",
    ).toLowerCase();

    document.querySelector("#profile-nickname").textContent = profile.nickname;
    document.querySelector("#profile-username").textContent =
        `// ${profile.username}`;
    document.querySelector("#profile-title").textContent =
        profile.tituloEquipado;
    document.querySelector("#profile-currency").textContent = formatScore(
        profileNumber(profile.moedas),
    );
    document.querySelector("#profile-games").textContent = formatScore(
        profileNumber(profile.gamesPlayed),
    );
    document.querySelector("#profile-hit").textContent = formatScore(hit);
    document.querySelector("#profile-misses").textContent = formatScore(misses);
    document.querySelector("#profile-hit-bar").style.width = `${hitRatio}%`;
    document.querySelector("#profile-hit-rate").textContent =
        profilePercent(hitRatio);
    document.querySelector("#profile-viewing").textContent = isOwnProfile
        ? "SEU PERFIL // DADOS SINCRONIZADOS"
        : `VISUALIZANDO: ${profile.username}`;
    document.querySelector("#profile-back").hidden = isOwnProfile;

    const tabs = document.querySelector("#profile-instrument-tabs");
    const panel = document.querySelector("#profile-instrument-panel");
    tabs.innerHTML = PROFILE_INSTRUMENTS.map(([id, label], index) => {
        const isFavorite = favorite === id;
        return `<button class="profile-tab${index === 0 ? " active" : ""}${isFavorite ? " is-favorite" : ""}" type="button" data-profile-instrument="${id}">${label}${isFavorite ? " <small>FAVORITO</small>" : ""}</button>`;
    }).join("");

    const selectInstrument = (instrumentId) => {
        const instrument = PROFILE_INSTRUMENTS.find(
            ([id]) => id === instrumentId,
        );
        if (!instrument) return;
        tabs.querySelectorAll(".profile-tab").forEach((tab) => {
            tab.classList.toggle(
                "active",
                tab.dataset.profileInstrument === instrumentId,
            );
        });
        panel.innerHTML = `<div class="profile-panel-kicker">${instrument[1]} // REGISTRO DE PERFORMANCE</div><div class="profile-stats-grid">${profileInstrumentMarkup(profile, instrumentId)}</div>`;
    };
    tabs.querySelectorAll(".profile-tab").forEach((tab) => {
        tab.addEventListener("click", () =>
            selectInstrument(tab.dataset.profileInstrument),
        );
    });
    selectInstrument(PROFILE_INSTRUMENTS[0][0]);

    const records = Array.isArray(profile.songRecords)
        ? profile.songRecords
        : [];
    document.querySelector("#profile-songs").innerHTML = records.length
        ? records
              .map(
                  (record) =>
                      `<div class="profile-song-row"><strong>${escapeHtml(record.musica || "SEM TÍTULO")}</strong><span>${formatScore(profileNumber(record.vezesJogada))}x</span><span>${formatScore(profileNumber(record.melhorPontuacao))}</span><span>${formatScore(profileNumber(record.melhorCombo))}</span><span>${profilePercent(record.melhorPrecisao)}</span></div>`,
              )
              .join("")
        : '<p class="profile-empty">NENHUMA FREQUÊNCIA REGISTRADA.</p>';

    document.querySelector("#profile-achievements").innerHTML =
        PROFILE_ACHIEVEMENTS.map(([id, label, icon]) => {
            const unlocked = achievements.has(id);
            return `<article class="profile-badge${unlocked ? " is-unlocked" : " is-locked"}"><b>${unlocked ? icon : "?"}</b><strong>${label}</strong><small>${unlocked ? "DESBLOQUEADA" : "BLOQUEADA // SINAL INSUFICIENTE"}</small></article>`;
        }).join("");
}

async function loadProfile(username, isOwnProfile) {
    const status = document.querySelector("#profile-status");
    const searchError = document.querySelector("#profile-search-error");
    status.textContent = "SINCRONIZANDO DADOS...";
    status.className = "profile-status is-loading";
    searchError.hidden = true;
    try {
        const response = await fetch(
            `/api/perfil/${encodeURIComponent(username)}`,
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.profile) {
            if (response.status === 404) {
                searchError.textContent = "JOGADOR NÃO EXISTE NA REDE.";
                searchError.hidden = false;
            }
            throw new Error(
                payload.error || "Não foi possível acessar este perfil.",
            );
        }
        renderProfile(payload.profile, isOwnProfile);
        status.textContent = "SINAL ONLINE // PERFIL ATUALIZADO";
        status.className = "profile-status is-online";
        return true;
    } catch (error) {
        status.textContent =
            error.message === "Operador não encontrado na rede."
                ? "CONSULTA ENCERRADA // NENHUM OPERADOR CORRESPONDE AO SINAL."
                : `SEM SINAL COM O SERVIDOR // ${error.message}`;
        status.className = "profile-status is-error";
        return false;
    }
}

function initializeProfile() {
    const searchForm = document.querySelector("#profile-search-form");
    const searchInput = document.querySelector("#profile-search");
    const requestedUsername = new URLSearchParams(window.location.search)
        .get("username")
        ?.trim();
    const sessionUsername =
        window.shredderAccount?.snapshot().user || getPlayer()?.nome;
    const username = requestedUsername || sessionUsername;

    searchForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const searchUsername = searchInput.value.trim();
        if (!searchUsername) return;

        const loaded = await loadProfile(
            searchUsername,
            String(sessionUsername || "").toLowerCase() ===
                searchUsername.toLowerCase(),
        );
        if (loaded) {
            window.history.pushState(
                {},
                "",
                `perfil.html?username=${encodeURIComponent(searchUsername)}`,
            );
        }
    });

    document
        .querySelector("#profile-back")
        .addEventListener("click", async () => {
            if (!sessionUsername) return;
            const loaded = await loadProfile(sessionUsername, true);
            if (loaded) {
                searchInput.value = "";
                window.history.pushState({}, "", "perfil.html");
            }
        });

    if (!username) {
        document.querySelector("#profile-status").textContent =
            "IDENTIDADE AUSENTE // RETORNE AO LOGIN.";
        return;
    }

    const ownUsername =
        String(sessionUsername || "").toLowerCase() === username.toLowerCase();
    searchInput.value = requestedUsername || "";
    loadProfile(username, ownUsername);
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function getPlayer() {
    return readJson(STORAGE.player, null);
}

function getLobby() {
    return readJson(STORAGE.lobby, []);
}

function setLobby(lobby) {
    writeJson(STORAGE.lobby, lobby);
}

function ensurePlayer() {
    const player = getPlayer();
    if (!player || !player.id || !player.nome) {
        window.location.href = `index.html${window.location.search}`;
        return null;
    }
    return player;
}

function makePlayerId() {
    return `OP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function upsertPlayer(player) {
    const lobby = getLobby().filter((item) => item.id !== player.id);
    lobby.push(player);
    setLobby(lobby);
}

function formatInstrument(instrument) {
    return instrument || "SEM LOADOUT";
}

function initializeLogin() {
    const idField = document.querySelector("#player-id");
    const playerNameInput = document.querySelector("#player-name");
    const loginForm = document.querySelector("#login-form");
    const error = document.querySelector("#login-error");
    const existing = getPlayer();

    idField.value = existing?.id || makePlayerId();
    playerNameInput.value = existing?.nome || "";

    if (!loginForm) return;
    loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const accountState = window.shredderAccount
            ? window.shredderAccount.snapshot()
            : { isLoggedIn: false };

        if (!accountState.isLoggedIn) {
            alert(
                "Acesso restrito: faça login ou crie uma conta para iniciar o uplink.",
            );
            window.shredderUI?.openModal();
            return;
        }

        playerNameInput.value = accountState.user;
        const finalPlayerName = playerNameInput.value.trim();
        const previous = getPlayer();
        const player = {
            id: idField.value.trim(),
            nome: finalPlayerName,
            instrumento: previous?.instrumento || null,
        };
        writeJson(STORAGE.player, player);
        upsertPlayer(player);
        localStorage.setItem("shredder_player_name", finalPlayerName);
        window.location.href = `lobby.html${window.location.search}`;
    });

    if (window.shredderAccount) {
        window.shredderAccount.onChange((state) => {
            if (state.isLoggedIn && playerNameInput) {
                playerNameInput.value = state.user;
                playerNameInput.readOnly = true;
                playerNameInput.style.opacity = "0.7";
            } else if (playerNameInput) {
                playerNameInput.readOnly = false;
                playerNameInput.style.opacity = "";
            }
        });
    }
}

function renderLobby(player) {
    const list = document.querySelector("#lobby-list");
    if (!list) return;
    const lobby = getLobby();
    list.innerHTML = lobby.length
        ? lobby
              .map(
                  (item) =>
                      `<div class="roster-row ${item.id === player.id ? "current" : ""}"><span>${item.nome}${item.id === player.id ? " / VOCÊ" : ""}</span><strong>${formatInstrument(item.instrumento)}</strong></div>`,
              )
              .join("")
        : '<div class="roster-row">Nenhum operador conectado.</div>';
}

window.kickPlayer = function (targetUsername, roomId) {
    if (
        confirm(
            `Tem certeza de que deseja expulsar o operador ${targetUsername}?`,
        )
    ) {
        if (window.socket) {
            window.socket.emit("kick_player", { roomId, targetUsername });
        }
    }
};

window.setupKickListener = function () {
    if (window.socket) {
        window.socket.off("player_kicked");
        window.socket.on("player_kicked", (data) => {
            alert(data.message || "Você foi expulso da sala pelo criador.");
            if (
                window.shredderAccount &&
                typeof window.shredderAccount.logout === "function"
            ) {
                window.shredderAccount.logout();
            }
            window.location.href = "index.html";
        });
    }
};

window.renderLobbyPlayers = function (roomData, currentUsername) {
    const container = document.querySelector(
        "#operadores-conectados, .operadores-conectados, .connected-players, #lobby-list",
    );
    if (!container) return;

    const players = roomData.players || roomData.operadores || [];
    const isHost = roomData.host === currentUsername;
    container.replaceChildren();

    players.forEach((player) => {
        const playerRow = document.createElement("div");
        playerRow.className = "player-row roster-row";
        const isMe = player === currentUsername;

        const playerName = document.createElement("span");
        playerName.textContent = `${player}${isMe ? " / VOCÊ" : ""}`;
        playerRow.appendChild(playerName);

        if (isHost && !isMe) {
            const kickButton = document.createElement("button");
            kickButton.type = "button";
            kickButton.className = "kick-player-button";
            kickButton.textContent = "EXPULSAR";
            kickButton.addEventListener("click", () => {
                window.kickPlayer(player, roomData.id);
            });
            playerRow.appendChild(kickButton);
        }

        container.appendChild(playerRow);
    });

    if (players.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "roster-row";
        emptyState.textContent = "Nenhum operador conectado.";
        container.appendChild(emptyState);
    }
};

function initializeInstruments() {
    const player = ensurePlayer();
    if (!player) return;
    if (!localStorage.getItem(STORAGE.roomId)) {
        window.location.href = "lobby.html";
        return;
    }
    document.querySelector("#top-player").textContent = player.nome;
    document.querySelector("#operator-name").textContent = player.nome;
}

function saveRoom(room) {
    localStorage.setItem(STORAGE.roomId, room.roomId);
    localStorage.setItem(STORAGE.roomName, room.roomName || "SALA SEM NOME");
}

function initializeRoomPresence(player) {
    const roomId = localStorage.getItem(STORAGE.roomId);
    const socket = window.socket;
    if (!roomId || !socket) {
        window.location.href = "lobby.html";
        return;
    }

    const enterCurrentRoom = () => {
        socket.emit("entrarSala", {
            roomId,
            username: player.nome,
            operadorId: player.id,
        });
    };

    socket.on("connect", enterCurrentRoom);
    if (socket.connected) enterCurrentRoom();

    socket.on("atualizar_estado", (roomState) => {
        window.shredderRoomState = roomState;
        const players = roomState.operadores || [];
        const roster = document.querySelector("#ticket-lobby");
        const count = document.querySelector("#ticket-count");
        if (!roster) return;

        if (count) count.textContent = players.length;
        roster.replaceChildren();
        players.forEach((username) => {
            const row = document.createElement("div");
            row.className = `roster-row${username === player.nome ? " current" : ""}`;
            const name = document.createElement("span");
            name.textContent = `${username}${username === player.nome ? " // VOCÊ" : ""}`;
            row.appendChild(name);
            roster.appendChild(row);
        });
    });

    socket.on("sala_emitiu_ticket", ({ modo } = {}) => {
        if (modo) writeJson(STORAGE.mode, modo);
        if (currentPage !== "ticket") window.location.href = "ticket.html";
    });
}

function initializeLobby() {
    // O lobby exige a identidade autenticada já criada no login; nenhuma identidade nova é gerada aqui.
    const player = ensurePlayer();
    const socket = window.socket;
    const roomList = document.querySelector("#room-list");
    const roomNameInput = document.querySelector("#room-name");
    const createForm = document.querySelector("#form-criar-sala");
    const status = document.querySelector("#lobby-status");
    const emptyState = document.querySelector("#lobby-empty");

    console.warn("[LOBBY] initializeLobby abortado:", {
        player,
        token: window.shredderAccount?.token,
        socket,
        roomList,
        createForm,
        roomNameInput,
    });

    if (
        !player ||
        !window.shredderAccount?.token ||
        !socket ||
        !roomList ||
        !createForm ||
        !roomNameInput
    )
        return;

    document.querySelector("#lobby-player").textContent = player.nome;
    const showError = (message) => {
        status.textContent = message;
        status.classList.add("is-error");
    };
    const clearError = () => {
        status.textContent = "SINAL ONLINE // SALAS EM TEMPO REAL";
        status.classList.remove("is-error");
    };
    const enterRoom = (room) => {
        socket.emit(
            "entrarSala",
            {
                roomId: room.roomId,
                username: player.nome,
                operadorId: player.id,
            },
            (response) => {
                if (!response?.ok) {
                    showError(
                        response?.erro || "Não foi possível entrar na sala.",
                    );
                    return;
                }
                saveRoom(response);
                window.location.href = "instrumentos.html";
            },
        );
    };
    const renderRooms = (rooms) => {
        const activeRooms = Array.isArray(rooms)
            ? rooms
            : Object.values(rooms || {});

        if (activeRooms.length === 0) {
            roomList.replaceChildren();
            emptyState.hidden = false;
            return;
        }

        emptyState.hidden = true;
        roomList.replaceChildren();

        activeRooms.forEach((room) => {
            const full = room.quantidadeJogadores >= room.limiteJogadores;
            const card = document.createElement("button");
            card.type = "button";
            card.className = `room-card${full ? " is-full" : ""}`;
            card.disabled = full;
            card.innerHTML = `<span class="room-card-kicker">${full ? "SALA CHEIA // BLOQUEADA" : "SALA DISPONÍVEL"}</span><strong></strong><small></small><b></b>`;
            card.querySelector("strong").textContent = room.roomName;
            card.querySelector("small").textContent =
                `CRIADOR // ${room.criadorUsername}`;
            card.querySelector("b").textContent =
                `${room.quantidadeJogadores}/${room.limiteJogadores} OPERADORES`;
            if (!full) card.addEventListener("click", () => enterRoom(room));
            roomList.appendChild(card);
        });
    };

    // O script e o listener só são registrados quando o formulário já existe no DOM.
    createForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const roomName = roomNameInput.value.trim();
        if (!roomName) {
            showError("IDENTIFIQUE A SALA ANTES DE TRANSMITIR.");
            roomNameInput.focus();
            return;
        }
        socket.emit(
            "criarSala",
            { roomName, username: player.nome, operadorId: player.id },
            (response) => {
                if (!response?.ok) {
                    showError(
                        response?.erro || "Não foi possível criar a sala.",
                    );
                    return;
                }
                saveRoom(response);
                window.location.href = "instrumentos.html";
            },
        );
    });

    let requestedRoomHandled = false;
    socket.on("salas_atualizadas", (rooms) => {
        clearError();
        const activeRooms = Array.isArray(rooms)
            ? rooms
            : Object.values(rooms || {});
        renderRooms(activeRooms);
        const requestedRoomId = new URLSearchParams(window.location.search).get(
            "roomId",
        );
        const requestedRoom = activeRooms.find(
            (room) => room.roomId === requestedRoomId,
        );
        if (
            !requestedRoomHandled &&
            requestedRoom &&
            requestedRoom.quantidadeJogadores < requestedRoom.limiteJogadores
        ) {
            requestedRoomHandled = true;
            enterRoom(requestedRoom);
        } else if (
            requestedRoom?.quantidadeJogadores >= requestedRoom.limiteJogadores
        ) {
            showError("SALA CHEIA // escolha outra frequência.");
        }
    });
    const pedirSalas = () => socket.emit("pedir_salas");
    socket.on("connect", pedirSalas);
    if (socket.connected) pedirSalas();
    socket.on("connect_error", () =>
        showError("SEM SINAL COM O SERVIDOR // tente novamente."),
    );
    socket.on("disconnect", () =>
        showError("SEM SINAL COM O SERVIDOR // conexão interrompida."),
    );
}

function getProgress() {
    const saved = readJson(STORAGE.progress, null);
    if (Array.isArray(saved) && saved.length === 5) return saved;
    const initial = [false, false, false, false, false];
    writeJson(STORAGE.progress, initial);
    return initial;
}

function initializeModes() {
    const player = ensurePlayer();
    if (
        !player ||
        !player.instrumento ||
        !localStorage.getItem(STORAGE.roomId)
    ) {
        window.location.href = "instrumentos.html";
        return;
    }
    initializeRoomPresence(player);
    document.querySelector("#mode-player").textContent = player.nome;
    document.querySelector("#mode-instrument").textContent = player.instrumento;
    const progress = getProgress();
    const unlocked = progress.reduce(
        (total, complete, index) =>
            complete || index === 0 || progress[index - 1] ? total + 1 : total,
        0,
    );
    document.querySelector("#progress-count").textContent =
        `${String(unlocked).padStart(2, "0")} / 05`;
    const stages = [
        "PULSO ZERO",
        "CIDADE DE VIDRO",
        "SINAL FANTASMA",
        "SOBRECARGA",
        "ÚLTIMA TRANSMISSÃO",
    ];
    const grid = document.querySelector("#stage-grid");
    grid.innerHTML = stages
        .map((stage, index) => {
            const isUnlocked = index === 0 || progress[index - 1];
            const isComplete = progress[index];
            return `<button type="button" class="stage-card ${isUnlocked ? "" : "locked"} ${isComplete ? "complete" : ""}" data-stage="${index + 1}" ${isUnlocked ? "" : "disabled"}><span class="stage-number">0${index + 1}</span><strong>${stage}</strong><small>${isComplete ? "FREQUÊNCIA CONCLUÍDA" : isUnlocked ? "SINAL DISPONÍVEL" : "BLOQUEADA // COMPLETE A ANTERIOR"}</small>${isComplete ? "<em>✓ EXCELÊNCIA REGISTRADA</em>" : ""}</button>`;
        })
        .join("");
    grid.querySelectorAll(".stage-card:not(.locked)").forEach((card) =>
        card.addEventListener("click", () =>
            chooseMode("historia", Number(card.dataset.stage)),
        ),
    );
    document
        .querySelector("#freeplay-card")
        .addEventListener("click", () => chooseMode("freeplay", null));
}

function chooseMode(tipo, fase) {
    const player = getPlayer();
    const roomId = localStorage.getItem(STORAGE.roomId);
    const roomState = window.shredderRoomState;
    if (!player || !roomId || !window.socket || roomState?.host !== player.id) {
        return;
    }

    const modo = { tipo, fase };
    writeJson(STORAGE.mode, modo);
    window.socket.emit(
        "owner_emitir_ticket",
        { roomId, operadorId: player.id, modo },
        (response) => {
            if (!response?.ok) {
                console.error(
                    "Não foi possível emitir o ticket:",
                    response?.erro,
                );
            }
        },
    );
}

function getFirebaseDatabase() {
    if (
        !window.firebase ||
        !window.SHREDDER_FIREBASE_CONFIG ||
        window.SHREDDER_FIREBASE_CONFIG.apiKey === "COLE_SUA_API_KEY_AQUI"
    ) {
        throw new Error("Firebase ainda não foi configurado.");
    }
    if (!firebase.apps.length)
        firebase.initializeApp(window.SHREDDER_FIREBASE_CONFIG);
    return firebase.firestore();
}

/** Persiste uma partida finalizada; o Phaser deve chamar isto no callback de fim de partida. */
async function enviarPontuacaoParaRanking(dados) {
    const player = getPlayer();
    const pontuacao = Number(dados?.pontuacao);
    if (
        !player?.id ||
        !player.nome ||
        !Number.isFinite(pontuacao) ||
        pontuacao < 0
    )
        throw new Error("Dados de pontuação inválidos.");
    const database = getFirebaseDatabase();
    const registro = {
        jogadorId: player.id,
        nome: player.nome,
        instrumento: dados.instrumento || player.instrumento || null,
        pontuacao,
        banda: dados.banda || null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    };
    // TODO: chamar esta função no Phaser quando a partida terminar de verdade.
    return database.collection("scores").add(registro);
}

function normalizeBand(banda) {
    if (!banda) return null;
    if (typeof banda === "string") return { id: banda, nome: banda };
    if (!banda.id && !banda.nome) return null;
    return { id: banda.id || banda.nome, nome: banda.nome || banda.id };
}

function aggregateRanking(records, tab) {
    const groups = new Map();
    records.forEach((record) => {
        const score = Number(record.pontuacao);
        if (!record.jogadorId || !record.nome || !Number.isFinite(score))
            return;
        const band = normalizeBand(record.banda);
        if (tab === "bandas") {
            if (!band) return;
            const current = groups.get(band.id) || {
                id: band.id,
                nome: band.nome,
                pontuacao: 0,
                instrumento: null,
            };
            current.pontuacao += score;
            groups.set(band.id, current);
            return;
        }
        if (record.instrumento !== tab) return;
        const current = groups.get(record.jogadorId);
        if (!current || score > current.pontuacao)
            groups.set(record.jogadorId, {
                id: record.jogadorId,
                nome: record.nome,
                instrumento: record.instrumento,
                pontuacao: score,
            });
    });
    return [...groups.values()].sort(
        (left, right) =>
            right.pontuacao - left.pontuacao ||
            left.nome.localeCompare(right.nome),
    );
}

function formatScore(score) {
    return new Intl.NumberFormat("pt-BR").format(score);
}

function escapeHtml(value) {
    return String(value).replace(
        /[&<>'"]/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "'": "&#039;",
                '"': "&quot;",
            })[character],
    );
}

function renderRankingTab(records, tab, player) {
    const list = document.querySelector("#ranking-list");
    const mine = document.querySelector("#my-ranking");
    const ranking = aggregateRanking(records, tab);
    const top = ranking.slice(0, 100);
    const playerId =
        tab === "bandas" ? normalizeBand(player?.banda)?.id : player?.id;
    const playerPosition = playerId
        ? ranking.findIndex((item) => item.id === playerId)
        : -1;
    list.innerHTML = top.length
        ? top
              .map(
                  (item, index) =>
                      `<div class="ranking-row ${item.id === playerId ? "current" : ""}"><b>${String(index + 1).padStart(2, "0")}</b><span>${escapeHtml(item.nome)}${tab === "bandas" ? "" : `<small>${escapeHtml(formatInstrument(item.instrumento))}</small>`}</span><strong>${formatScore(item.pontuacao)}</strong></div>`,
              )
              .join("")
        : '<p class="ranking-empty">NENHUM RESULTADO REAL REGISTRADO.</p>';
    if (playerPosition >= 10) {
        const item = ranking[playerPosition];
        mine.hidden = false;
        mine.innerHTML = `<span>SEU SINAL</span><strong>${playerPosition + 1}º — ${escapeHtml(item.nome)} — ${formatScore(item.pontuacao)}</strong>`;
    } else {
        mine.hidden = true;
        mine.innerHTML = "";
    }
}

async function initializeRanking() {
    const player = getPlayer();
    if (!player) {
        window.location.href = "index.html";
        return;
    }
    document.querySelector("#ranking-player").textContent = player.nome;
    const list = document.querySelector("#ranking-list");
    const status = document.querySelector("#ranking-status");
    const tabs = document.querySelectorAll("[data-ranking-tab]");
    let records = [];
    let dataAvailable = false;
    const selectTab = (tab) => {
        tabs.forEach((button) =>
            button.classList.toggle(
                "active",
                button.dataset.rankingTab === tab,
            ),
        );
        renderRankingTab(dataAvailable ? records : [], tab, player);
    };
    tabs.forEach((button) =>
        button.addEventListener("click", () =>
            selectTab(button.dataset.rankingTab),
        ),
    );
    selectTab("Guitarra");
    try {
        status.textContent = "SINCRONIZANDO DADOS...";
        const snapshot = await getFirebaseDatabase().collection("scores").get();
        records = snapshot.docs.map((document) => document.data());
        dataAvailable = true;
        status.textContent = `SINAL ONLINE // ${records.length} PARTIDA(S) FINALIZADA(S)`;
        selectTab(
            document.querySelector(".ranking-tab.active")?.dataset.rankingTab ||
                "Guitarra",
        );
    } catch (error) {
        status.textContent = `SEM SINAL COM O SERVIDOR // ${error.message}`;
        list.innerHTML =
            '<p class="ranking-empty">RANKING INDISPONÍVEL. NENHUM DADO FICTÍCIO SERÁ EXIBIDO.</p>';
        document.querySelector("#my-ranking").hidden = true;
    }
}

function initializeTicket() {
    const player = ensurePlayer();
    if (!player || !localStorage.getItem(STORAGE.roomId)) {
        window.location.href = "lobby.html";
        return;
    }
    initializeRoomPresence(player);
    const mode = readJson(STORAGE.mode, { tipo: "freeplay", fase: null });
    const lobby = getLobby();
    document.querySelector("#ticket-date").textContent =
        new Intl.DateTimeFormat("pt-BR").format(new Date());
    document.querySelector("#ticket-player").textContent = player.nome;
    document.querySelector("#ticket-id").textContent = player.id;
    document.querySelector("#ticket-instrument").textContent = formatInstrument(
        player.instrumento,
    );
    document.querySelector("#ticket-mode").textContent =
        mode.tipo === "historia" ? "MODO HISTÓRIA" : "FREEPLAY";
    document.querySelector("#ticket-stage").textContent =
        mode.tipo === "historia" ? `FASE ${mode.fase}` : "LIVRE";
    document.querySelector("#ticket-count").textContent = lobby.length;
    document.querySelector("#ticket-code").textContent = player.id
        .slice(-4)
        .toUpperCase();
    document.querySelector("#ticket-lobby").innerHTML = lobby
        .map(
            (item) =>
                `<div class="roster-row ${item.id === player.id ? "current" : ""}"><span><strong>${item.nome}</strong> ${item.id === player.id ? "// VOCÊ" : ""}</span><span>${formatInstrument(item.instrumento)} · ${item.id}</span></div>`,
        )
        .join("");
}

if (currentPage === "login") initializeLogin();
if (currentPage === "lobby") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeLobby, {
            once: true,
        });
    } else {
        initializeLobby();
    }
}
if (currentPage === "instrumentos") initializeInstruments();
if (currentPage === "modos") initializeModes();
if (currentPage === "ticket") initializeTicket();
if (currentPage === "ranking") initializeRanking();
if (currentPage === "perfil") initializeProfile();

// O jogo Phaser pode consumir as mesmas chaves ao abrir jogo.html. Ao concluir uma fase,
// marque progress[fase - 1] = true e persista com writeJson(STORAGE.progress, progress).

