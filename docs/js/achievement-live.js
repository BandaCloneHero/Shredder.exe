/* Mantém cada aba autenticada inscrita nas conquistas da própria conta.
   O servidor não guarda avisos: se não houver socket conectado, não há popup
   pendente para mostrar depois. */
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
    socket.on('conquistaDesbloqueada', ({ ids } = {}) => {
        globalThis.exibirConquistasDesbloqueadas?.(ids);
    });
    account.onChange(inscrever);
    if (socket.connected) inscrever();
})();
