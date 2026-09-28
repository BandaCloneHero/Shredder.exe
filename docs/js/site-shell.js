(() => {
    // Salvaguarda para navegadores que não enviam Sec-Fetch-Dest no iframe.
    if (window.parent !== window && window.parent.shredderSite) {
        const contentUrl = new URL(location.href);
        contentUrl.searchParams.set('__conteudo', '1');
        location.replace(contentUrl.href);
        return;
    }

    const frame = document.getElementById('site-content');
    const socket = io({ autoConnect: false });
    let identity = null;
    const pendingConfirmations = new Set();

    function acknowledge(id) {
        pendingConfirmations.add(id);
        if (!socket.connected || !identity) return;
        const token = identity.token;
        socket.timeout(3000).emit('confirmarConquistasExibidas', { ids: [id] }, (error, result) => {
            if (identity?.token === token && !error && result?.ok) pendingConfirmations.delete(id);
        });
    }

    function navigate(destination) {
        const url = new URL(destination, location.href);
        if (url.origin !== location.origin) return;
        // O histórico de navegação pertence ao iframe e é compartilhado com a aba.
        frame.contentWindow.location.assign(url.href);
    }

    const notifications = createAchievementNotifications({ confirm: acknowledge, open: navigate });
    window.exibirConquistasDesbloqueadas = notifications.enqueue;

    function subscribe() {
        if (!identity || !socket.connected) return;
        socket.emit('inscreverConquistas', { token: identity.token }, result => {
            if (result?.ok) for (const id of pendingConfirmations) acknowledge(id);
        });
    }

    window.shredderSite = {
        navigate,
        setAccount(state) {
            // Cada tela restaura a sessão assincronamente. Esse estado intermediário
            // não representa um logout e não pode apagar uma notificação em curso.
            if (!state?.isLoggedIn && state?.token) return;
            const next = state?.isLoggedIn ? { token: state.token, user: state.user } : null;
            if (next?.token === identity?.token && next?.user === identity?.user) return;
            socket.disconnect();
            notifications.reset();
            pendingConfirmations.clear();
            identity = next;
            if (identity) socket.connect();
        },
        syncPage() {
            const content = frame.contentWindow;
            const url = new URL(content.location.href);
            if (url.origin !== location.origin) return;
            url.searchParams.delete('__conteudo');
            history.replaceState(null, '', url.pathname + url.search + url.hash);
            document.title = content.document.title;
        },
    };

    socket.on('connect', subscribe);
    socket.on('conquistaDesbloqueada', ({ notificacoes, ids, pendentesAoEntrar = false } = {}) => {
        if (identity) notifications.enqueue(notificacoes || ids, { pendentesAoEntrar });
    });
    // Logout em outra aba também encerra as notificações da conta anterior.
    window.addEventListener('storage', event => {
        if (event.key === 'shredder.account.token.v1' && event.newValue !== identity?.token) {
            window.shredderSite.setAccount(null);
        }
    });
    frame.addEventListener('load', () => {
        try { window.shredderSite.syncPage(); } catch { /* navegação externa */ }
    });
    const initial = new URL(location.href);
    if (initial.pathname === '/site.html') initial.pathname = '/index.html';
    initial.searchParams.set('__conteudo', '1');
    frame.src = initial.href;
})();
