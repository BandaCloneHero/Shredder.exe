/*
 * Lobby local do Shredder.exe.
 * Estas chaves hoje vivem apenas neste navegador. Em uma versão multiplayer real,
 * substitua as leituras/escritas por eventos WebSocket ou Firebase e trate o
 * servidor como fonte de verdade para lobby, instrumentos e progresso.
 */
const STORAGE = {
    player: 'shredder_player',
    lobby: 'shredder_lobby',
    mode: 'shredder_modo',
    progress: 'shredder_progresso'
};

const instruments = ['Guitarra', 'Baixo', 'Bateria', 'Teclado'];
const currentPage = document.body.dataset.page;

function readJson(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch {
        return fallback;
    }
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
        window.location.href = 'index.html';
        return null;
    }
    return player;
}

function makePlayerId() {
    return `OP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function upsertPlayer(player) {
    const lobby = getLobby().filter(item => item.id !== player.id);
    lobby.push(player);
    setLobby(lobby);
}

function formatInstrument(instrument) {
    return instrument || 'SEM LOADOUT';
}

function initializeLogin() {
    const idField = document.querySelector('#player-id');
    const nameField = document.querySelector('#player-name');
    const form = document.querySelector('#login-form');
    const error = document.querySelector('#login-error');
    const existing = getPlayer();

    idField.value = existing?.id || makePlayerId();
    nameField.value = existing?.nome || '';
    form.addEventListener('submit', event => {
        event.preventDefault();
        const id = idField.value.trim();
        const nome = nameField.value.trim();
        if (!nome) {
            error.textContent = 'NOME DE EXIBIÇÃO É OBRIGATÓRIO.';
            nameField.focus();
            return;
        }
        if (!id) {
            error.textContent = 'ID DE OPERADOR INVÁLIDO.';
            idField.focus();
            return;
        }
        const previous = getPlayer();
        const player = { id, nome, instrumento: previous?.instrumento || null };
        writeJson(STORAGE.player, player);
        upsertPlayer(player);
        window.location.href = 'instrumentos.html';
    });
}

function renderLobby(player) {
    const list = document.querySelector('#lobby-list');
    if (!list) return;
    const lobby = getLobby();
    list.innerHTML = lobby.length ? lobby.map(item => `<div class="roster-row ${item.id === player.id ? 'current' : ''}"><span>${item.nome}${item.id === player.id ? ' / VOCÊ' : ''}</span><strong>${formatInstrument(item.instrumento)}</strong></div>`).join('') : '<div class="roster-row">Nenhum operador conectado.</div>';
}

function initializeInstruments() {
    const player = ensurePlayer();
    if (!player) return;
    document.querySelector('#top-player').textContent = player.nome;
    document.querySelector('#operator-name').textContent = player.nome;
    document.querySelector('#lobby-url').textContent = window.location.href;
    const occupiedBy = Object.fromEntries(getLobby().filter(item => item.id !== player.id && item.instrumento).map(item => [item.instrumento, item]));
    const continueButton = document.querySelector('#continue-instrument');
    let selected = player.instrumento;

    document.querySelectorAll('.instrument-card').forEach(card => {
        const instrument = card.dataset.instrument;
        const status = card.querySelector('.instrument-status');
        const owner = occupiedBy[instrument];
        if (owner) {
            card.classList.add('occupied');
            card.disabled = true;
            status.textContent = `OCUPADO // ${owner.nome}`;
        } else if (instrument === selected) {
            card.classList.add('selected');
            status.textContent = 'SELECIONADO // VOCÊ';
        }
        card.addEventListener('click', () => {
            if (card.disabled) return;
            document.querySelectorAll('.instrument-card').forEach(item => {
                item.classList.remove('selected');
                if (!item.classList.contains('occupied')) item.querySelector('.instrument-status').textContent = 'DISPONÍVEL';
            });
            selected = instrument;
            card.classList.add('selected');
            status.textContent = 'SELECIONADO // VOCÊ';
            const updated = { ...player, instrumento: selected };
            writeJson(STORAGE.player, updated);
            upsertPlayer(updated);
            renderLobby(updated);
            continueButton.disabled = false;
        });
    });
    continueButton.disabled = !selected;
    continueButton.addEventListener('click', () => {
        if (selected) window.location.href = 'modos.html';
    });
    renderLobby(player);

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
    if (!player || !player.instrumento) {
        window.location.href = 'instrumentos.html';
        return;
    }
    document.querySelector('#mode-player').textContent = player.nome;
    document.querySelector('#mode-instrument').textContent = player.instrumento;
    const progress = getProgress();
    const unlocked = progress.reduce((total, complete, index) => complete || index === 0 || progress[index - 1] ? total + 1 : total, 0);
    document.querySelector('#progress-count').textContent = `${String(unlocked).padStart(2, '0')} / 05`;
    const stages = ['PULSO ZERO', 'CIDADE DE VIDRO', 'SINAL FANTASMA', 'SOBRECARGA', 'ÚLTIMA TRANSMISSÃO'];
    const grid = document.querySelector('#stage-grid');
    grid.innerHTML = stages.map((stage, index) => {
        const isUnlocked = index === 0 || progress[index - 1];
        const isComplete = progress[index];
        return `<button type="button" class="stage-card ${isUnlocked ? '' : 'locked'} ${isComplete ? 'complete' : ''}" data-stage="${index + 1}" ${isUnlocked ? '' : 'disabled'}><span class="stage-number">0${index + 1}</span><strong>${stage}</strong><small>${isComplete ? 'FREQUÊNCIA CONCLUÍDA' : isUnlocked ? 'SINAL DISPONÍVEL' : 'BLOQUEADA // COMPLETE A ANTERIOR'}</small>${isComplete ? '<em>✓ EXCELÊNCIA REGISTRADA</em>' : ''}</button>`;
    }).join('');
    grid.querySelectorAll('.stage-card:not(.locked)').forEach(card => card.addEventListener('click', () => chooseMode('historia', Number(card.dataset.stage))));
    document.querySelector('#freeplay-card').addEventListener('click', () => chooseMode('freeplay', null));
}

function chooseMode(tipo, fase) {
    writeJson(STORAGE.mode, { tipo, fase });
    window.location.href = 'ticket.html';
}

function getFirebaseDatabase() {
    if (!window.firebase || !window.SHREDDER_FIREBASE_CONFIG || window.SHREDDER_FIREBASE_CONFIG.apiKey === 'COLE_SUA_API_KEY_AQUI') {
        throw new Error('Firebase ainda não foi configurado.');
    }
    if (!firebase.apps.length) firebase.initializeApp(window.SHREDDER_FIREBASE_CONFIG);
    return firebase.firestore();
}

/** Persiste uma partida finalizada; o Phaser deve chamar isto no callback de fim de partida. */
async function enviarPontuacaoParaRanking(dados) {
    const player = getPlayer();
    const pontuacao = Number(dados?.pontuacao);
    if (!player?.id || !player.nome || !Number.isFinite(pontuacao) || pontuacao < 0) throw new Error('Dados de pontuação inválidos.');
    const database = getFirebaseDatabase();
    const registro = { jogadorId: player.id, nome: player.nome, instrumento: dados.instrumento || player.instrumento || null, pontuacao, banda: dados.banda || null, timestamp: firebase.firestore.FieldValue.serverTimestamp() };
    // TODO: chamar esta função no Phaser quando a partida terminar de verdade.
    return database.collection('scores').add(registro);
}

function normalizeBand(banda) {
    if (!banda) return null;
    if (typeof banda === 'string') return { id: banda, nome: banda };
    if (!banda.id && !banda.nome) return null;
    return { id: banda.id || banda.nome, nome: banda.nome || banda.id };
}

function aggregateRanking(records, tab) {
    const groups = new Map();
    records.forEach(record => {
        const score = Number(record.pontuacao);
        if (!record.jogadorId || !record.nome || !Number.isFinite(score)) return;
        const band = normalizeBand(record.banda);
        if (tab === 'bandas') {
            if (!band) return;
            const current = groups.get(band.id) || { id: band.id, nome: band.nome, pontuacao: 0, instrumento: null };
            current.pontuacao += score;
            groups.set(band.id, current);
            return;
        }
        if (record.instrumento !== tab) return;
        const current = groups.get(record.jogadorId);
        if (!current || score > current.pontuacao) groups.set(record.jogadorId, { id: record.jogadorId, nome: record.nome, instrumento: record.instrumento, pontuacao: score });
    });
    return [...groups.values()].sort((left, right) => right.pontuacao - left.pontuacao || left.nome.localeCompare(right.nome));
}

function formatScore(score) { return new Intl.NumberFormat('pt-BR').format(score); }

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
}

function renderRankingTab(records, tab, player) {
    const list = document.querySelector('#ranking-list');
    const mine = document.querySelector('#my-ranking');
    const ranking = aggregateRanking(records, tab);
    const top = ranking.slice(0, 100);
    const playerId = tab === 'bandas' ? normalizeBand(player?.banda)?.id : player?.id;
    const playerPosition = playerId ? ranking.findIndex(item => item.id === playerId) : -1;
    list.innerHTML = top.length ? top.map((item, index) => `<div class="ranking-row ${item.id === playerId ? 'current' : ''}"><b>${String(index + 1).padStart(2, '0')}</b><span>${escapeHtml(item.nome)}${tab === 'bandas' ? '' : `<small>${escapeHtml(formatInstrument(item.instrumento))}</small>`}</span><strong>${formatScore(item.pontuacao)}</strong></div>`).join('') : '<p class="ranking-empty">NENHUM RESULTADO REAL REGISTRADO.</p>';
    if (playerPosition >= 10) {
        const item = ranking[playerPosition];
        mine.hidden = false;
        mine.innerHTML = `<span>SEU SINAL</span><strong>${playerPosition + 1}º — ${escapeHtml(item.nome)} — ${formatScore(item.pontuacao)}</strong>`;
    } else {
        mine.hidden = true;
        mine.innerHTML = '';
    }
}

async function initializeRanking() {
    const player = getPlayer();
    if (!player) { window.location.href = 'index.html'; return; }
    document.querySelector('#ranking-player').textContent = player.nome;
    const list = document.querySelector('#ranking-list');
    const status = document.querySelector('#ranking-status');
    const tabs = document.querySelectorAll('[data-ranking-tab]');
    let records = [];
    let dataAvailable = false;
    const selectTab = tab => {
        tabs.forEach(button => button.classList.toggle('active', button.dataset.rankingTab === tab));
        renderRankingTab(dataAvailable ? records : [], tab, player);
    };
    tabs.forEach(button => button.addEventListener('click', () => selectTab(button.dataset.rankingTab)));
    selectTab('Guitarra');
    try {
        status.textContent = 'SINCRONIZANDO DADOS...';
        const snapshot = await getFirebaseDatabase().collection('scores').get();
        records = snapshot.docs.map(document => document.data());
        dataAvailable = true;
        status.textContent = `SINAL ONLINE // ${records.length} PARTIDA(S) FINALIZADA(S)`;
        selectTab(document.querySelector('.ranking-tab.active')?.dataset.rankingTab || 'Guitarra');
    } catch (error) {
        status.textContent = `SEM SINAL COM O SERVIDOR // ${error.message}`;
        list.innerHTML = '<p class="ranking-empty">RANKING INDISPONÍVEL. NENHUM DADO FICTÍCIO SERÁ EXIBIDO.</p>';
        document.querySelector('#my-ranking').hidden = true;
    }
}

function initializeTicket() {
    const player = ensurePlayer();
    if (!player) return;
    const mode = readJson(STORAGE.mode, { tipo: 'freeplay', fase: null });
    const lobby = getLobby();
    document.querySelector('#ticket-date').textContent = new Intl.DateTimeFormat('pt-BR').format(new Date());
    document.querySelector('#ticket-player').textContent = player.nome;
    document.querySelector('#ticket-id').textContent = player.id;
    document.querySelector('#ticket-instrument').textContent = formatInstrument(player.instrumento);
    document.querySelector('#ticket-mode').textContent = mode.tipo === 'historia' ? 'MODO HISTÓRIA' : 'FREEPLAY';
    document.querySelector('#ticket-stage').textContent = mode.tipo === 'historia' ? `FASE ${mode.fase}` : 'LIVRE';
    document.querySelector('#ticket-count').textContent = lobby.length;
    document.querySelector('#ticket-code').textContent = player.id.slice(-4).toUpperCase();
    document.querySelector('#ticket-lobby').innerHTML = lobby.map(item => `<div class="roster-row ${item.id === player.id ? 'current' : ''}"><span><strong>${item.nome}</strong> ${item.id === player.id ? '// VOCÊ' : ''}</span><span>${formatInstrument(item.instrumento)} · ${item.id}</span></div>`).join('');
}

if (currentPage === 'login') initializeLogin();
if (currentPage === 'instrumentos') initializeInstruments();
if (currentPage === 'modos') initializeModes();
if (currentPage === 'ticket') initializeTicket();
if (currentPage === 'ranking') initializeRanking();

// O jogo Phaser pode consumir as mesmas chaves ao abrir jogo.html. Ao concluir uma fase,
// marque progress[fase - 1] = true e persista com writeJson(STORAGE.progress, progress).
