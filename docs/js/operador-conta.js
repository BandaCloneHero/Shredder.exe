(() => {
    const username = document.getElementById('account-inspect-username');
    const loadButton = document.getElementById('account-inspect-load');
    const status = document.getElementById('account-inspect-status');
    const output = document.getElementById('account-inspect-data');

    function showStatus(state, text) {
        status.dataset.state = state;
        status.textContent = text;
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
            const token = localStorage.getItem('shredder.account.token.v1');
            const response = await fetch(`/api/operador/conta/${encodeURIComponent(name)}`, {
                headers: {
                    Accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });
            if (!(response.headers.get('content-type') || '').includes('application/json')) {
                throw new Error('A API retornou uma página. Abra este painel pelo servidor Node.js atualizado.');
            }
            const data = await response.json();
            if (!response.ok || !data?.ok) {
                if (response.status === 401) throw new Error('Entre em uma conta oficial para acessar o painel do operador.');
                if (response.status === 403) throw new Error('Esta conta não está autorizada como operador oficial.');
                throw new Error(data?.erro || 'Não foi possível carregar a conta.');
            }
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
    username.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loadAccount();
        }
    });
})();
