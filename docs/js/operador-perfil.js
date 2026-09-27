(() => {
    const form = document.getElementById('profile-form');
    const username = document.getElementById('profile-username');
    const editor = document.getElementById('profile-editor');
    const status = document.getElementById('profile-status');
    const loadButton = document.getElementById('load-profile');
    const saveButton = document.getElementById('save-profile');
    const password = document.getElementById('profile-password');
    const unlockedPhases = document.getElementById('profile-unlocked-phases');
    const favoritePhases = document.getElementById('profile-favorite-phases');
    const selectedPhase = document.getElementById('profile-selected-phase');
    const phaseHistory = document.getElementById('profile-phase-history');
    const inputs = new Map();
    let loaded = null;
    let busy = false;

    function exibirConquistasEntregues(ids, catalogo) {
        if (!Array.isArray(ids) || !ids.length) return;
        if (typeof globalThis.exibirConquistasDesbloqueadas === 'function') {
            globalThis.exibirConquistasDesbloqueadas(ids);
            return;
        }
        // Reserva para o painel continuar exibindo a entrega mesmo quando o
        // cache do navegador ainda não tiver carregado o app.js mais novo.
        const labels = new Map(catalogo || []);
        ids.forEach((id, index) => {
            const notice = document.createElement('aside');
            notice.className = 'achievement-toast rarity-legendary';
            notice.setAttribute('role', 'status');
            notice.innerHTML = `<div class="achievement-toast-icon">★</div><div><span>CONQUISTA ENTREGUE</span><strong>${labels.get(id) || id}</strong><small>CONCEDIDA PELO OPERADOR</small></div>`;
            document.body.append(notice);
            window.setTimeout(() => notice.classList.add('is-visible'), 5000 + index * 8150);
            window.setTimeout(() => notice.classList.add('is-leaving'), 11050 + index * 8150);
            window.setTimeout(() => notice.remove(), 13150 + index * 8150);
        });
    }

    function message(state, text) {
        status.dataset.state = state;
        status.textContent = text;
    }
    function field(container, path, label, type = 'number', options) {
        const wrapper = document.createElement('div');
        wrapper.className = 'operator-field';
        const caption = document.createElement('label');
        const input = document.createElement(options ? 'select' : 'input');
        input.id = `edit-${path.replaceAll('.', '-')}`;
        caption.htmlFor = input.id;
        caption.textContent = label;
        if (options) {
            for (const [value, text] of options) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = text;
                input.appendChild(option);
            }
        } else {
            input.type = type;
            if (type === 'number') {
                input.min = '0'; input.max = String(Number.MAX_SAFE_INTEGER);
                input.step = '1'; input.required = true;
                if (path.endsWith('bestAccuracy')) { input.max = '100'; input.step = 'any'; }
            } else {
                input.maxLength = path === 'avatar' ? 2048 : path === 'currentTitle' ? 80 : path === 'username' ? 24 : 40;
                if (path === 'username') { input.required = true; input.pattern = '[a-zA-Z0-9_]{3,24}'; }
            }
        }
        inputs.set(path, input);
        wrapper.append(caption, input);
        container.appendChild(wrapper);
    }
    const instruments = [['guitarra', 'Guitarra'], ['baixo', 'Baixo'], ['bateria', 'Bateria'], ['teclado', 'Teclado']];
    function formatPhases(phases) {
        return phases.join(', ');
    }
    function readPhases(input, label) {
        const text = input.value.trim();
        if (!text) return [];
        if (!/^\d+(\s*,\s*\d+)*$/.test(text)) throw new Error(`${label} deve conter números separados por vírgula.`);
        const phases = [...new Set(text.split(',').map(value => Number(value.trim())))].sort((a, b) => a - b);
        if (phases.some(phase => !Number.isSafeInteger(phase) || phase < 1 || phase > 100000)) {
            throw new Error(`${label} deve conter fases de 1 a 100000.`);
        }
        return phases;
    }
    const main = document.getElementById('profile-main-fields');
    field(main, 'username', 'Username (login da conta)', 'text');
    field(main, 'nickname', 'Apelido visível', 'text');
    field(main, 'currentTitle', 'Título atual', 'text');
    field(main, 'avatar', 'Avatar (URL ou caminho da imagem)', 'text');
    field(main, 'currency', 'Saldo total de moedas');
    field(main, 'instrumentStats.favoriteInstrument', 'Instrumento favorito', 'text', [['nenhum', 'Nenhum'], ...instruments]);
    const totals = document.getElementById('profile-total-fields');
    field(totals, 'gamesPlayed', 'Partidas jogadas');
    field(totals, 'lifetimeStats.totalNotesHit', 'Total de notas acertadas');
    field(totals, 'lifetimeStats.totalMisses', 'Total de notas erradas');
    for (const [id, name] of instruments) {
        const details = document.createElement('details'); details.className = 'profile-instrument';
        const summary = document.createElement('summary'); summary.textContent = name;
        const grid = document.createElement('div'); grid.className = 'operator-grid';
        details.append(summary, grid);
        document.getElementById('profile-instruments').appendChild(details);
        for (const [key, label] of [['maxScore', 'Maior pontuação'], ['maxCombo', 'Maior combo'], ['bestAccuracy', 'Melhor precisão (%)'], ['songsCompleted', 'Músicas concluídas'], ['fullCombos', 'Full combos']]) {
            field(grid, `instrumentStats.${id}.${key}`, label);
        }
    }
    function populate(data) {
        // Aceita payloads de contas legadas ou servidores ainda sem a
        // propriedade fases, usando o mesmo padrão criado na migração.
        const fases = data.perfil.fases || {};
        fases.desbloqueadas = Array.isArray(fases.desbloqueadas) ? fases.desbloqueadas : [1];
        fases.favoritas = Array.isArray(fases.favoritas) ? fases.favoritas : [];
        fases.selecionada = Number.isSafeInteger(fases.selecionada) ? fases.selecionada : null;
        fases.historicoSelecionadas = Array.isArray(fases.historicoSelecionadas) ? fases.historicoSelecionadas : [];
        data.perfil.fases = fases;
        loaded = data;
        username.value = data.perfil.username;
        password.value = '';
        for (const [path, input] of inputs) input.value = data.perfil.campos[path];
        unlockedPhases.value = formatPhases(data.perfil.fases.desbloqueadas);
        favoritePhases.value = formatPhases(data.perfil.fases.favoritas);
        selectedPhase.value = data.perfil.fases.selecionada ?? '';
        const history = data.perfil.fases.historicoSelecionadas;
        phaseHistory.textContent = history.length
            ? `Histórico recente: ${history.slice(-5).reverse().map(item => `fase ${item.fase} (${new Date(item.selecionadaEm).toLocaleString('pt-BR')})`).join(' · ')}`
            : 'Nenhuma fase selecionada ainda.';
        const achievements = document.getElementById('profile-achievements');
        achievements.replaceChildren();
        const labels = new Map(data.conquistas);
        for (const id of data.perfil.achievements) if (!labels.has(id)) labels.set(id, id);
        for (const [id, label] of labels) {
            const option = document.createElement('label'); option.className = 'achievement-option';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = id;
            checkbox.checked = data.perfil.achievements.includes(id);
            const text = document.createElement('span'); text.textContent = label;
            option.append(checkbox, text); achievements.appendChild(option);
        }
        document.getElementById('profile-metadata').textContent = `Conta: ${data.perfil.username} · Criada em: ${data.perfil.createdAt} · Atualizada em: ${data.perfil.updatedAt} · ${data.perfil.totalRegistros} registros de partidas`;
        editor.hidden = false;
    }
    function lock(value) {
        busy = value;
        username.disabled = value;
        loadButton.disabled = value;
        editor.disabled = value || !loaded;
        form.setAttribute('aria-busy', String(value));
    }
    async function api(url, options) {
        const response = await fetch(url, options);
        if (!(response.headers.get('content-type') || '').includes('application/json')) {
            throw new Error('A API retornou uma página. Abra /operador.html pelo servidor Node.js atualizado (porta padrão 3000).');
        }
        let data;
        try { data = await response.json(); } catch { throw new Error('Resposta inválida do servidor.'); }
        if (!response.ok || !data?.ok) throw new Error(data?.erro || 'Não foi possível concluir a operação.');
        return data;
    }
    username.addEventListener('input', () => {
        loaded = null;
        editor.disabled = true;
        editor.hidden = true;
        message('pending', 'Carregue a conta antes de editar.');
    });
    loadButton.addEventListener('click', async () => {
        if (busy) return;
        const name = username.value.trim();
        if (!name) { message('error', 'Informe o username da conta.'); username.focus(); return; }
        lock(true);
        message('pending', 'CARREGANDO PERFIL...');
        try {
            populate(await api(`/api/operador/perfil/${encodeURIComponent(name)}`));
            message('success', 'Perfil carregado. Ajuste os campos e marque ou desmarque as conquistas.');
        } catch (error) { message('error', `ERRO // ${error.message}`); }
        finally { lock(false); }
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !loaded || !form.reportValidity()) return;
        const alteracoes = {};
        for (const [path, input] of inputs) {
            const value = input.type === 'number' ? input.valueAsNumber : input.value;
            if (value !== loaded.perfil.campos[path]) alteracoes[path] = value;
        }
        const selected = [...document.querySelectorAll('#profile-achievements input:checked')].map(input => input.value);
        const previous = loaded.perfil.achievements;
        if (selected.length !== previous.length || selected.some(id => !previous.includes(id))) alteracoes.achievements = selected;
        try {
            const fases = {
                desbloqueadas: readPhases(unlockedPhases, 'Fases desbloqueadas'),
                favoritas: readPhases(favoritePhases, 'Fases favoritas'),
                selecionada: selectedPhase.value === '' ? null : selectedPhase.valueAsNumber,
            };
            const current = loaded.perfil.fases;
            if (JSON.stringify(fases) !== JSON.stringify({
                desbloqueadas: current.desbloqueadas,
                favoritas: current.favoritas,
                selecionada: current.selecionada,
            })) alteracoes.fases = fases;
        } catch (error) {
            message('error', `ERRO // ${error.message}`);
            return;
        }
        if (!Object.keys(alteracoes).length && !password.value) { message('success', 'Nenhuma alteração para salvar.'); return; }
        lock(true);
        saveButton.textContent = 'Salvando perfil...';
        message('pending', 'SALVANDO PERFIL E CONQUISTAS...');
        try {
            const data = await api('/api/operador/salvar-perfil', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ username: loaded.perfil.username, revisao: loaded.revisao, alteracoes, novaSenha: password.value || undefined }),
            });
            exibirConquistasEntregues(data.novasConquistas, data.conquistas);
            populate(data);
            message('success', 'SUCESSO // Perfil e conquistas atualizados. Nenhuma partida foi adicionada.');
        } catch (error) { message('error', `ERRO // ${error.message} Suas edições foram mantidas na tela.`); }
        finally { lock(false); saveButton.textContent = 'Salvar perfil e conquistas'; }
    });
})();
