/* Mantém cada aba autenticada inscrita nas conquistas da própria conta. */
(() => {
    const account = globalThis.shredderAccount;
    if (!account || typeof globalThis.io !== 'function') return;

    const socket = globalThis.shredderAchievementSocket || globalThis.socket || globalThis.io();
    globalThis.shredderAchievementSocket = socket;

    const inscrever = (state = account.snapshot()) => {
        if (!state?.isLoggedIn || !state.token) return;
        socket.emit('inscreverConquistas', { token: state.token });
    };

    socket.on('connect', () => inscrever());
    socket.on('conquistaDesbloqueada', ({ notificacoes, ids, pendentesAoEntrar = false } = {}) => {
        globalThis.exibirConquistasDesbloqueadas?.(notificacoes || ids, { pendentesAoEntrar });
    });
    account.onChange(inscrever);
    if (socket.connected) inscrever();
})();
