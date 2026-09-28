(() => {
    const username = document.getElementById('account-inspect-username');
    const loadButton = document.getElementById('account-inspect-load');
    const directoryButton = document.getElementById('account-directory-load');
    const directoryStatus = document.getElementById('account-directory-status');
    const directory = document.getElementById('account-directory');
    const status = document.getElementById('account-inspect-status');
    const output = document.getElementById('account-inspect-data');
    let accounts = [];

    function showStatus(state, text) {
        status.dataset.state = state;
        status.textContent = text;
    }

    async function api(url) {
        const token = localStorage.getItem('shredder.account.token.v1');
        const response = await fetch(url, {
            headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!(response.headers.get('content-type') || '').includes('application/json')) {
            throw new Error('A API retornou uma página. Abra este painel pelo servidor Node.js atualizado.');
        }
        const data = await response.json();
        if (!response.ok || !data?.ok) {
            if (response.status === 401) throw new Error('Entre em uma conta oficial para acessar o painel do operador.');
            if (response.status === 403) throw new Error('Esta conta não está autorizada como operador oficial.');
            throw new Error(data?.erro || 'Não foi possível concluir a consulta.');
        }
        return data;
    }

    function renderDirectory() {
        const filter = username.value.trim().toLocaleLowerCase('pt-BR');
        const matches = accounts.filter(account => `${account.username} ${account.nickname}`.toLocaleLowerCase('pt-BR').includes(filter));
        directory.replaceChildren();
        for (const account of matches) {
            const button = document.createElement('button');
            button.type = 'button';
            const name = document.createElement('span');
            name.textContent = account.username;
            button.appendChild(name);
            if (account.nickname) {
                const nickname = document.createElement('small');
                nickname.textContent = account.nickname;
                button.appendChild(nickname);
            }
            button.addEventListener('click', () => {
                username.value = account.username;
                loadAccount();
            });
            directory.appendChild(button);
        }
        directoryStatus.textContent = accounts.length
            ? `${matches.length} de ${accounts.length} contas do servidor${filter ? ' correspondem à busca' : ''}.`
            : 'Nenhuma conta carregada. Clique em “Listar contas do servidor”.';
    }

    async function loadAccount() {
        const name = username.value.trim();
        if (!name) {
            output.hidden = true;
            showStatus('error', 'Informe o username da conta.');
            username.focus();
            return;
        }

        loadButton.disabled = true;
        output.hidden = true;
        showStatus('pending', 'CARREGANDO DADOS DA CONTA...');
        try {
            const data = await api(`/api/operador/conta/${encodeURIComponent(name)}`);
            output.textContent = JSON.stringify(data.conta, null, 2);
            output.hidden = false;
            showStatus('success', `Dados atuais de ${data.conta.username || name}.`);
        } catch (error) {
            showStatus('error', `ERRO // ${error.message}`);
        } finally {
            loadButton.disabled = false;
        }
    }

    loadButton.addEventListener('click', loadAccount);
    directoryButton.addEventListener('click', async () => {
        directoryButton.disabled = true;
        directoryStatus.textContent = 'Consultando contas no servidor...';
        try {
            const data = await api('/api/operador/contas');
            accounts = data.contas;
            renderDirectory();
        } catch (error) {
            directoryStatus.textContent = `ERRO // ${error.message}`;
        } finally {
            directoryButton.disabled = false;
        }
    });
    username.addEventListener('input', renderDirectory);
    username.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loadAccount();
        }
    });
})();
