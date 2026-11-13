function nomePublicoJogador(username, accounts = {}) {
    const canonical = typeof username === 'string' ? username : '';
    const account = Object.hasOwn(accounts, canonical.toLowerCase()) ? accounts[canonical.toLowerCase()] : null;
    const nickname = typeof account?.nickname === 'string' ? account.nickname.trim() : '';
    if (nickname && !/^(?:jogador_[a-f0-9]{12}|OP-[a-z0-9]+)$/i.test(nickname)) return nickname;
    return canonical && !/^(?:jogador_[a-f0-9]{12}|OP-[a-z0-9]+)$/i.test(canonical) ? canonical : 'Jogador';
}
module.exports = { nomePublicoJogador };
