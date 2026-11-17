(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory;
    else factory(root, root.document, root.shredderAccount);
})(typeof window === 'undefined' ? globalThis : window, function (window, document, account) {
    const panel = document.querySelector('#feira-creditos');
    if (!panel || !account) return;
    const status = document.querySelector('#feira-credit-status');
    const list = document.querySelector('#feira-credit-list');
    const connect = document.querySelector('#feira-connect');
    const consent = document.querySelector('#feira-consent');
    const consentLabel = document.querySelector('#feira-consent-label');
    const balance = document.querySelector('#feira-balance');
    const refresh = document.querySelector('#feira-refresh');
    const labels = { pending: 'Aguardando envio', awaiting_login: 'Entre novamente com Google para receber', awaiting_feira: 'Conecte seu cadastro da Feira para receber', sending: 'Enviando à Feira', paid: 'Crédito confirmado pela Feira', rejected: 'Pedido recusado; procure o operador', unknown: 'Resultado pendente de revisão; não repita a solicitação' };
    let busy = false, current = null, loggedIn = false;
    async function update() {
        if (busy || !loggedIn) return;
        const token = account.token;
        busy = true; refresh.disabled = true;
        try {
            const response = await account.request('/api/feira/creditos');
            if (!loggedIn || account.token !== token) return;
            current = response;
            list.replaceChildren();
            connect.hidden = consentLabel.hidden = !current.enabled || current.mode !== 'secret' || current.linked;
            connect.disabled = !consent.checked;
            balance.hidden = !current.enabled;
            if (!current.enabled) status.textContent = 'Recompensas ainda não habilitadas no servidor. Seus resultados continuam sendo registrados.';
            else if (!current.entries.length) status.textContent = 'Derrote o boss na campanha e aguarde a confirmação do operador para receber sua parte.';
            else status.textContent = 'O total da música é dividido entre a banda: metade por participação e metade pelo desempenho.';
            for (const entry of [...current.entries].reverse().slice(0, 10)) {
                const row = document.createElement('li');
                row.textContent = `${entry.value ?? '—'} tijolinhos · ${entry.musica || 'Partida'} · ${labels[entry.status] || 'Procure o operador'}${entry.operation ? ` · operação ${entry.operation}` : ''}`;
                list.append(row);
            }
        } catch { if (loggedIn && account.token === token) status.textContent = 'Não foi possível consultar os créditos. Atualize em instantes.'; }
        finally { busy = false; refresh.disabled = false; }
    }
    consent.addEventListener('change', () => { connect.disabled = !consent.checked || busy; });
    connect.addEventListener('click', async () => {
        if (busy || !consent.checked || !current?.enabled) return;
        busy = true; connect.disabled = true;
        try {
            await account.request('/api/feira/vincular', { method: 'POST', body: { consent: true } });
            status.textContent = 'Cadastro conectado à Feira. Conferindo suas recompensas…';
        } catch (error) {
            const known = { FEIRA_LOGIN_REQUIRED: 'Saia e entre novamente com Google; depois conecte seu cadastro.', FEIRA_LINK_REJECTED: 'A Feira não autorizou a conexão. Confira seu cadastro e a configuração com o responsável.', FEIRA_ID_ALREADY_LINKED: 'Cadastro da Feira já vinculado a outro perfil. Procure o operador.', FEIRA_RATE_LIMIT: 'Aguarde alguns segundos antes de tentar novamente.' };
            status.textContent = known[error.code] || 'Não foi possível conectar à Feira. Nenhum crédito foi confirmado.';
            busy = false; connect.disabled = !consent.checked; return;
        }
        busy = false; await update();
    });
    balance.addEventListener('click', async () => {
        if (busy) return;
        const token = account.token;
        busy = true; balance.disabled = true;
        try { const result = await account.request('/api/feira/saldo'); if (loggedIn && account.token === token) status.textContent = `Saldo informado pela Feira: ${result.balance} tijolinhos.`; }
        catch { status.textContent = 'Saldo indisponível. Se necessário, saia e entre novamente com Google.'; }
        finally { busy = false; balance.disabled = false; }
    });
    refresh.addEventListener('click', update);
    account.onChange(state => { loggedIn = state.isLoggedIn; if (loggedIn) void update(); else { current = null; list.replaceChildren(); connect.hidden = balance.hidden = consentLabel.hidden = true; status.textContent = 'Entre para consultar seus tijolinhos.'; } });
    const timer = window.setInterval(() => { if (!document.hidden) void update(); }, 10000);
    window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
    return { update };
});
