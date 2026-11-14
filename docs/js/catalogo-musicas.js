(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-policy'));
    else root.ShredderSongCatalog = factory(root.ShredderMusicPolicy);
})(typeof window === 'undefined' ? globalThis : window, function (policy) {
    const instrumentImages = { guitarra: 'Guitarra.png', baixo: 'Baixo.png', bateria: 'Bateria.png', teclado: 'Teclado.png' };
    function mount({ document, fetch, isOwner, select }) {
        const grid = document.querySelector('#music-grid');
        const status = document.querySelector('#music-status');
        const search = document.querySelector('#music-search');
        const filter = document.querySelector('#music-instrument');
        const count = document.querySelector('#music-count');
        const room = document.querySelector('#music-room');
        const retry = document.querySelector('#music-retry');
        let songs = [], state = null, loading = false, pending = false, error = false;
        const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        function text(tag, value, className) {
            const element = document.createElement(tag);
            element.textContent = value;
            if (className) element.className = className;
            return element;
        }
        function render() {
            grid.replaceChildren();
            const people = state?.participantes || [];
            const owner = isOwner(state);
            room.textContent = state ? `${people.length} jogador${people.length === 1 ? '' : 'es'} na banda${owner ? '' : ' · O dono da sala escolhe a música'}` : 'Reconectando à sala…';
            const query = normalize(search.value.trim());
            const visible = songs.filter(song => normalize(`${song.nome} ${song.artista} ${song.album}`).includes(query) && (!filter.value || song.instrumentos.includes(filter.value)));
            count.textContent = `${visible.length} de ${songs.length} músicas`;
            for (const song of visible) {
                const evaluation = policy.avaliarMusica(song, people);
                const locked = !evaluation.permitida;
                const card = document.createElement('article');
                card.className = `music-card${locked ? ' locked' : ''}`;
                // Accept only the catalog's local cover endpoint, never arbitrary image URLs.
                if (typeof song.capaUrl === 'string' && /^\/api\/musicas\/[a-f0-9]{24}\/capa$/.test(song.capaUrl)) {
                    const cover = document.createElement('img');
                    cover.className = 'music-cover';
                    cover.src = song.capaUrl;
                    cover.alt = '';
                    cover.setAttribute('aria-hidden', 'true');
                    cover.loading = 'lazy';
                    cover.decoding = 'async';
                    cover.addEventListener('error', () => cover.remove());
                    card.append(cover);
                }
                card.append(text('p', song.artista, 'eyebrow'), text('h2', song.nome));
                const detail = [song.album];
                if (song.duracaoMs) { const seconds = Math.floor(song.duracaoMs / 1000); detail.push(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`); }
                card.append(text('p', detail.filter(Boolean).join(' · '), 'music-detail'));
                const badges = document.createElement('div');
                badges.className = 'music-instruments';
                badges.setAttribute('aria-label', 'Instrumentos disponíveis');
                for (const id of song.instrumentos) {
                    if (!Object.hasOwn(instrumentImages, id)) continue;
                    const badge = document.createElement('span');
                    badge.className = 'music-instrument';
                    badge.title = policy.nomes[id];
                    const icon = document.createElement('img');
                    icon.src = `images/${instrumentImages[id]}`;
                    icon.alt = policy.nomes[id];
                    icon.width = icon.height = 34;
                    icon.decoding = 'async';
                    icon.addEventListener('error', () => { icon.remove(); badge.textContent = policy.nomes[id]; });
                    badge.append(icon);
                    badges.append(badge);
                }
                if (!song.instrumentos.length) badges.append(text('span', 'Sem instrumentos jogáveis'));
                card.append(badges);
                card.append(text('p', state?.ticketPendente ? 'A sala já tem um ticket aguardando confirmação.' : evaluation.motivo, 'music-availability'));
                const button = text('button', locked ? 'Indisponível para a banda' : pending ? 'Preparando…' : 'Escolher música');
                button.type = 'button';
                button.disabled = locked || !owner || pending || Boolean(state?.ticketPendente);
                button.setAttribute('aria-label', `${button.textContent}: ${song.nome} — ${song.artista}`);
                button.addEventListener('click', async () => {
                    if (pending || !isOwner(state) || state?.ticketPendente || !policy.avaliarMusica(song, state?.participantes).permitida) return;
                    pending = true;
                    status.textContent = 'Preparando o ticket…';
                    render();
                    try {
                        const ok = await select(song);
                        if (!ok && status.textContent === 'Preparando o ticket…') status.textContent = 'Não foi possível escolher a música. Tente novamente.';
                    } catch { status.textContent = 'Não foi possível escolher a música. Tente novamente.'; }
                    finally { pending = false; render(); }
                });
                card.append(button);
                grid.append(card);
            }
            if (!visible.length && !loading && !error) grid.append(text('p', songs.length ? 'Nenhuma música com esses filtros.' : 'Nenhuma música jogável encontrada na pasta musicas.', 'music-empty'));
        }
        async function load() {
            if (loading) return;
            loading = true; error = false; retry.hidden = true;
            status.textContent = 'Carregando as músicas…';
            try {
                const response = await fetch('/api/musicas', { headers: { Accept: 'application/json' }, cache: 'no-store' });
                const data = await response.json();
                if (!response.ok || !Array.isArray(data.musicas)) throw new Error('catalog');
                songs = data.musicas;
                status.textContent = data.indisponiveis ? `${data.indisponiveis} arquivo(s) de música não puderam ser lidos.` : '';
            } catch {
                error = true;
                status.textContent = 'Não foi possível carregar as músicas. Tente novamente.';
                retry.hidden = false;
            } finally { loading = false; render(); }
        }
        search.addEventListener('input', render);
        filter.addEventListener('change', render);
        retry.addEventListener('click', load);
        render();
        const ready = load();
        return { ready, atualizarSala(value) { state = value; render(); } };
    }
    return { mount };
});
