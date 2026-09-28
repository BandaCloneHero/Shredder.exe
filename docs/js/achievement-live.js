/* As páginas entregam a sessão à estrutura fixa que apresenta as conquistas. */
(() => {
    const account = globalThis.shredderAccount;
    if (!account) return;

    let site;
    try { if (parent !== window) site = parent.shredderSite; } catch { /* iframe externo */ }
    if (site) {
        const url = new URL(location.href);
        url.searchParams.delete('__conteudo');
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
        for (const method of ['pushState', 'replaceState']) {
            const original = history[method].bind(history);
            history[method] = (...args) => {
                const result = original(...args);
                site.syncPage();
                return result;
            };
        }
        for (const event of ['pageshow', 'popstate', 'hashchange']) {
            window.addEventListener(event, () => site.syncPage());
        }
        account.onChange(state => site.setAccount(state));
        window.exibirConquistasDesbloqueadas = (...args) => parent.exibirConquistasDesbloqueadas(...args);
        site.syncPage();
        return;
    }

    // Permite a consulta direta do conteúdo, sem a estrutura externa.
    if (typeof globalThis.io !== 'function') return;

    const socket = globalThis.io({ autoConnect: false });
    globalThis.shredderAchievementSocket = socket;
    const notifications = createAchievementNotifications({
        confirm: id => socket.emit('confirmarConquistasExibidas', { ids: [id] }),
        open: destination => location.assign(destination),
    });
    globalThis.exibirConquistasDesbloqueadas = notifications.enqueue;

    const inscrever = (state = account.snapshot()) => {
        if (!state?.isLoggedIn || !state.token) return;
        socket.emit('inscreverConquistas', { token: state.token });
    };

    socket.on('connect', () => inscrever());
    socket.on('conquistaDesbloqueada', ({ notificacoes, ids, pendentesAoEntrar = false } = {}) => {
        if (!account.snapshot().isLoggedIn) return;
        globalThis.exibirConquistasDesbloqueadas?.(notificacoes || ids, { pendentesAoEntrar });
    });
    let activeToken = null;
    account.onChange(state => {
        if (!state.isLoggedIn && state.token) return;
        const token = state.isLoggedIn ? state.token : null;
        if (token === activeToken) return;
        activeToken = token;
        socket.disconnect();
        notifications.reset();
        if (token) socket.connect();
    });
})();
