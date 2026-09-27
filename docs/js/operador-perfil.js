(() => {
    const form = document.getElementById('profile-form');
    const username = document.getElementById('profile-username');
    const editor = document.getElementById('profile-editor');
    const status = document.getElementById('profile-status');
    const loadButton = document.getElementById('load-profile');
    const saveButton = document.getElementById('save-profile');
    const password = document.getElementById('profile-password');
    const inputs = new Map();
    let loaded = null;
    let busy = false;

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
        loaded = data;
        username.value = data.perfil.username;
        password.value = '';
        for (const [path, input] of inputs) input.value = data.perfil.campos[path];
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
        if (!Object.keys(alteracoes).length && !password.value) { message('success', 'Nenhuma alteração para salvar.'); return; }
        lock(true);
        saveButton.textContent = 'Salvando perfil...';
        message('pending', 'SALVANDO PERFIL E CONQUISTAS...');
        try {
            const data = await api('/api/operador/salvar-perfil', {
                method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ username: loaded.perfil.username, revisao: loaded.revisao, alteracoes, novaSenha: password.value || undefined }),
            });
            populate(data);
            message('success', 'SUCESSO // Perfil e conquistas atualizados. Nenhuma partida foi adicionada.');
        } catch (error) { message('error', `ERRO // ${error.message} Suas edições foram mantidas na tela.`); }
        finally { lock(false); saveButton.textContent = 'Salvar perfil e conquistas'; }
    });
})();
