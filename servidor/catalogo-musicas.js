const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { avaliarMusica } = require('../docs/js/music-policy');
const ORDEM = ['guitarra', 'baixo', 'bateria', 'teclado'];
const CAPAS = ['album.png', 'album.jpg', 'album.jpeg', 'album.webp', 'cover.png', 'cover.jpg', 'cover.jpeg', 'cover.webp'];

function normalizarNomeMusica(nome) {
    return String(nome).replace(/<[^>]*>/g, '').trim().normalize('NFC').toLowerCase();
}

function lerIni(texto) {
    const dados = {};
    for (const linha of texto.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const match = /^\s*([a-z_]+)\s*=\s*(.*?)\s*$/i.exec(linha);
        if (match) dados[match[1].toLowerCase()] = match[2].replace(/^"(.*)"$/, '$1').replace(/<[^>]*>/g, '').slice(0, 200);
    }
    return dados;
}

// Read actual charted notes, never infer instruments from audio stems or difficulty tags.
function instrumentosMidi(buffer) {
    let pos = 0;
    function need(end) { if (end > buffer.length) throw new Error('MIDI incompleto.'); }
    need(14);
    if (buffer.toString('ascii', 0, 4) !== 'MThd') throw new Error('MIDI inválido.');
    const headerSize = buffer.readUInt32BE(4);
    if (headerSize < 6) throw new Error('Cabeçalho MIDI inválido.');
    const tracks = buffer.readUInt16BE(10);
    pos = 8 + headerSize;
    const encontrados = new Set();
    for (let track = 0; track < tracks; track++) {
        need(pos + 8);
        if (buffer.toString('ascii', pos, pos + 4) !== 'MTrk') throw new Error('Trilha MIDI inválida.');
        const end = pos + 8 + buffer.readUInt32BE(pos + 4);
        need(end); pos += 8;
        let running = 0, nome = '';
        const notas = new Set();
        const read = () => { if (pos >= end) throw new Error('Evento MIDI incompleto.'); return buffer[pos++]; };
        function vlq() {
            let value = 0;
            for (let i = 0; i < 4; i++) { const b = read(); value = value * 128 + (b & 127); if (b < 128) return value; }
            throw new Error('Duração MIDI inválida.');
        }
        while (pos < end) {
            vlq();
            let status = read();
            if (status < 128) { pos--; status = running; if (!status) throw new Error('Running status inválido.'); }
            if (status === 255) {
                const tipo = read(), size = vlq();
                if (pos + size > end) throw new Error('Metadado MIDI incompleto.');
                if (tipo === 3) nome = buffer.toString('utf8', pos, pos + size).replace(/\0/g, '').trim().toUpperCase();
                pos += size; running = 0;
            } else if (status === 240 || status === 247) {
                const size = vlq(); if (pos + size > end) throw new Error('SysEx MIDI incompleto.');
                pos += size; running = 0;
            } else if (status >= 128 && status < 240) {
                running = status;
                const a = read();
                const b = (status & 240) === 192 || (status & 240) === 208 ? 0 : read();
                if (a > 127 || b > 127) throw new Error('Dados MIDI inválidos.');
                if ((status & 240) === 144 && b > 0) notas.add(a);
            } else throw new Error('Status MIDI inválido.');
        }
        const instrumento = { 'PART GUITAR': 'guitarra', 'PART BASS': 'baixo', 'PART DRUMS': 'bateria', 'PART KEYS': 'teclado' }[nome];
        if (instrumento && [...notas].some(n => [60, 72, 84, 96].some(base => n >= base - (instrumento === 'guitarra' || instrumento === 'baixo' ? 1 : 0) && n <= base + (instrumento === 'bateria' ? 5 : 4)))) encontrados.add(instrumento);
        if (/^PART REAL_KEYS_[EMHX]$/.test(nome) && [...notas].some(n => n >= 48 && n <= 72)) encontrados.add('teclado');
    }
    return ORDEM.filter(id => encontrados.has(id));
}

function instrumentosChart(texto) {
    const encontrados = new Set();
    const nomes = { Single: 'guitarra', DoubleBass: 'baixo', Drums: 'bateria', Keyboard: 'teclado' };
    for (const section of texto.matchAll(/\[(Easy|Medium|Hard|Expert)(Single|DoubleBass|Drums|Keyboard)\]\s*\{([^}]*)\}/g)) {
        const max = section[2] === 'Drums' ? 5 : 7;
        if ([...section[3].matchAll(/^\s*\d+\s*=\s*N\s+(\d+)\s+\d+/gm)].some(match => Number(match[1]) <= max)) encontrados.add(nomes[section[2]]);
    }
    return ORDEM.filter(id => encontrados.has(id));
}

function criarCatalogoMusicas({ raiz = path.join(__dirname, '../musicas'), ttl = 60000 } = {}) {
    let cache = null, atualizado = 0, capas = new Map();
    function carregar() {
        if (cache && Date.now() - atualizado < ttl) return cache;
        const musicas = [], ignoradas = [], novasCapas = new Map();
        function visitar(dir) {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            const nomes = new Map(files.filter(f => f.isFile()).map(f => [f.name.toLowerCase(), f.name]));
            const chart = nomes.get('notes.mid') || nomes.get('notes.midi') || nomes.get('notes.chart');
            if (chart) {
                const relative = path.relative(raiz, dir).split(path.sep).join('/');
                const id = createHash('sha256').update(relative).digest('hex').slice(0, 24);
                try {
                    const ini = nomes.get('song.ini');
                    const meta = ini ? lerIni(fs.readFileSync(path.join(dir, ini), 'utf8')) : {};
                    const audio = [...nomes.keys()].some(f => /\.(ogg|mp3|opus|wav|flac)$/i.test(f));
                    const content = fs.readFileSync(path.join(dir, chart));
                    const instrumentos = /\.chart$/i.test(chart) ? instrumentosChart(content.toString('utf8')) : instrumentosMidi(content);
                    const length = Number(meta.song_length);
                    const capa = CAPAS.map(nome => nomes.get(nome)).find(Boolean);
                    if (capa) novasCapas.set(id, path.join(dir, capa));
                    musicas.push({ id, capaUrl: capa ? `/api/musicas/${id}/capa` : null, nome: meta.name || path.basename(dir), artista: meta.artist || 'Artista desconhecido', album: meta.album || '',
                        charter: meta.charter || '', instrumentos: audio ? instrumentos : [],
                        duracaoMs: Number.isSafeInteger(length) && length > 0 ? length : null });
                } catch { ignoradas.push(id); }
            }
            // Symlinks are never traversed; neither charts nor audio are exposed as static files.
            for (const entry of files) if (entry.isDirectory() && !entry.name.startsWith('.')) visitar(path.join(dir, entry.name));
        }
        visitar(raiz);
        musicas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.artista.localeCompare(b.artista, 'pt-BR') || a.id.localeCompare(b.id));
        capas = novasCapas;
        cache = { musicas, indisponiveis: ignoradas.length }; atualizado = Date.now();
        return cache;
    }
    return {
        listar: carregar,
        localizarCapa(id) {
            if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) return null;
            carregar();
            const file = capas.get(id);
            if (!file) return null;
            try {
                // Recheck the real path in case a cached directory was replaced by a symlink.
                if (!fs.lstatSync(file).isFile()) return null;
                const real = fs.realpathSync(file);
                const relative = path.relative(fs.realpathSync(raiz), real);
                if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
                return fs.statSync(real).isFile() ? real : null;
            } catch { return null; }
        },
        selecionar(musicaId, sala) {
            if (typeof musicaId !== 'string' || !/^[a-f0-9]{24}$/.test(musicaId)) throw new Error('Escolha uma música do catálogo.');
            let dados;
            try { dados = carregar(); }
            catch { throw new Error('Catálogo indisponível. Atualize a página e tente novamente.'); }
            const musica = dados.musicas.find(item => item.id === musicaId);
            if (!musica) throw new Error('Esta música não está mais disponível. Atualize o catálogo.');
            const participantes = sala.jogadores.map(jogador => ({ instrumento: Object.entries(sala.instrumentos).find(([, id]) => id === jogador.id)?.[0] || null }));
            const avaliacao = avaliarMusica(musica, participantes);
            if (!avaliacao.permitida) throw new Error(avaliacao.motivo);
            return { id: musica.id, nome: musica.nome, artista: musica.artista, instrumentos: [...musica.instrumentos] };
        },
    };
}
function registrarRotaCapas(app, catalogo) {
    app.get('/api/musicas/:id/capa', (req, res) => {
        res.set('X-Content-Type-Options', 'nosniff');
        let arquivo;
        try { arquivo = catalogo.localizarCapa(req.params.id); }
        catch { return res.status(503).end(); }
        if (!arquivo) return res.status(404).end();
        return res.sendFile(arquivo, { maxAge: 300000 }, error => {
            if (error && !res.headersSent) res.status(404).end();
        });
    });
}
module.exports = { criarCatalogoMusicas, instrumentosMidi, instrumentosChart, lerIni, normalizarNomeMusica, registrarRotaCapas };
