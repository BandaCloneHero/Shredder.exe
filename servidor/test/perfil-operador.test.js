const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { criarPersistenciaPartidas } = require('../partidas');

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shredder-profile-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'accounts.json');
    fs.writeFileSync(file, JSON.stringify({ accounts: { ana: { username: 'Ana', salt: 'original-salt', passwordHash: 'original-hash', achievements: ['on_fire', 'custom_badge'], currency: 100, gamesPlayed: 2, createdAt: '2020-01-01T00:00:00Z', extra: 'preservar' }, bia: { username: 'Bia' } } }));
    const store = criarPersistenciaPartidas(file);
    store.migrarContas();
    return { store, file, read: () => JSON.parse(fs.readFileSync(file)).accounts };
}

test('leitura não expõe credenciais e preserva conquistas fora do catálogo', t => {
    const { store } = fixture(t);
    const result = store.lerPerfilOperador('ANA');
    assert.equal(result.perfil.username, 'Ana');
    assert.deepEqual(result.perfil.achievements, ['on_fire', 'custom_badge']);
    assert.equal(result.conquistas.length, 29);
    assert.equal(JSON.stringify(result).includes('original-hash'), false);
    assert.equal(JSON.stringify(result).includes('original-salt'), false);
});

test('edição concede e remove conquistas sem criar partida e preserva outros campos', t => {
    const { store, read } = fixture(t);
    const { revisao } = store.lerPerfilOperador('Ana');
    store.editarPerfilOperador('Ana', { achievements: ['custom_badge', 'cirurgico'], avatar: '/foto.png', currency: 25, 'instrumentStats.guitarra.maxScore': 456, 'instrumentStats.favoriteInstrument': 'baixo' }, revisao);
    const account = read().ana;
    assert.deepEqual(account.achievements, ['custom_badge', 'cirurgico']);
    assert.equal(account.currency, 25);
    assert.equal(account.avatar, '/foto.png');
    assert.equal(account.gamesPlayed, 2);
    assert.equal(account.salt, 'original-salt');
    assert.equal(account.passwordHash, 'original-hash');
    assert.equal(account.createdAt, '2020-01-01T00:00:00Z');
    assert.equal(account.extra, 'preservar');
    assert.deepEqual(account.resultadosPartidas, {});
    assert.equal(account.instrumentStats.guitarra.maxScore, 456);
});

test('operador consulta e corrige desbloqueios e favoritos sem apagar o histórico de fases', t => {
    const { store, read } = fixture(t);
    store.salvar({ partidaId: 'match', operadorId: 'op', username: 'Ana', instrumento: 'guitarra', musica: 'Song', pontuacao: 1000, precisao: 100, maiorCombo: 10, notasAcertadas: 10, notasErradas: 0, fullCombo: true, fase: 2, favorita: true });
    const perfil = store.lerPerfilOperador('Ana');
    assert.deepEqual(perfil.perfil.fases.desbloqueadas, [1, 2, 3]);
    assert.equal(perfil.perfil.totalFasesDesbloqueadas, 3);
    store.editarPerfilOperador('Ana', {
        fases: { desbloqueadas: [1, 2, 3, 5], favoritas: [3, 5], selecionada: 5 },
    }, perfil.revisao);
    const fases = read().ana.fases;
    assert.deepEqual(fases.desbloqueadas, [1, 2, 3, 4, 5]);
    assert.deepEqual(fases.favoritas, [3, 5]);
    assert.equal(fases.selecionada, 5);
    assert.equal(fases.historicoSelecionadas.length, 1);
});

test('revisão antiga não sobrescreve uma edição concorrente', t => {
    const { store, file } = fixture(t);
    const { revisao } = store.lerPerfilOperador('Ana');
    store.editarPerfilOperador('Ana', { achievements: ['lenda_viva'] }, revisao);
    const saved = fs.readFileSync(file, 'utf8');
    assert.throws(() => store.editarPerfilOperador('Ana', { achievements: [] }, revisao), error => error.status === 409);
    assert.equal(fs.readFileSync(file, 'utf8'), saved);
});

test('validação rejeita campos protegidos, conquistas desconhecidas e valores inválidos sem gravar', t => {
    const { store, file } = fixture(t);
    const { revisao } = store.lerPerfilOperador('Ana');
    const saved = fs.readFileSync(file, 'utf8');
    for (const changes of [{ salt: 'hack' }, { passwordHash: 'hack' }, { currency: -1 }, { achievements: ['inventada'] }, { achievements: 'on_fire' }, { 'instrumentStats.guitarra.bestAccuracy': 101 }, { avatar: 'javascript:alert(1)' }, { username: 'bad name' }, { fases: { desbloqueadas: [1], favoritas: [2], selecionada: null } }]) {
        assert.throws(() => store.editarPerfilOperador('Ana', changes, revisao), error => error.status === 400);
        assert.equal(fs.readFileSync(file, 'utf8'), saved);
    }
});

test('username pode mudar sem perder perfil e não pode substituir outra conta', t => {
    const { store, read } = fixture(t);
    const original = read().ana;
    const { revisao } = store.lerPerfilOperador('Ana');
    assert.throws(() => store.editarPerfilOperador('Ana', { username: 'BIA' }, revisao), error => error.status === 409);
    const result = store.editarPerfilOperador('Ana', { username: 'AnaNova' }, revisao);
    assert.equal(result.encerrarSessoes, 'ana');
    assert.equal(read().ana, undefined);
    assert.equal(read().ananova.username, 'AnaNova');
    assert.equal(read().ananova.passwordHash, original.passwordHash);
    assert.deepEqual(read().ananova.achievements, original.achievements);
    assert.equal(store.lerPerfilOperador('AnaNova').perfil.username, 'AnaNova');
});

test('rota troca senha com scrypt, encerra sessões da conta e nunca devolve hash', async t => {
    const { store, read } = fixture(t);
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    let handler, sessionsSaved = false, broadcast = false;
    const sessions = new Map([['ana-token', { accountKey: 'ana' }], ['bia-token', { accountKey: 'bia' }]]);
    const ctx = vm.createContext({
        app: { get() {}, post: (_, fn) => handler = fn }, partidas: store,
        randomBytes: crypto.randomBytes,
        passwordHash: async (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex'),
        accountStore: {}, sessions, saveSessions: () => sessionsSaved = true,
        io: { emit: () => broadcast = true },
    });
    vm.runInContext(source.slice(source.indexOf('app.get("/api/operador/perfil/'), source.indexOf('app.post("/api/operador/salvar-pontuacao"')), ctx);
    const response = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ body: { username: 'Ana', alteracoes: {}, revisao: store.lerPerfilOperador('Ana').revisao, novaSenha: 'senha-nova' } }, response);
    assert.equal(response.data.ok, true);
    const account = read().ana;
    assert.notEqual(account.salt, 'original-salt');
    assert.equal(account.passwordHash, crypto.scryptSync('senha-nova', account.salt, 64).toString('hex'));
    assert.equal(JSON.stringify(response.data).includes(account.passwordHash), false);
    assert.equal(sessions.has('ana-token'), false);
    assert.equal(sessions.has('bia-token'), true);
    assert.equal(sessionsSaved, true);
    assert.equal(broadcast, true);
});

test('corrigir recorde individual não reescreve os resultados históricos da banda', t => {
    const { store, read } = fixture(t);
    store.salvar({ partidaId: 'match', operadorId: 'op', username: 'Ana', instrumento: 'guitarra', musica: 'Song', pontuacao: 1000, precisao: 100, maiorCombo: 10, notasAcertadas: 10, notasErradas: 0, fullCombo: true, banda: { id: 'band', nome: 'Band' } });
    store.editarPerfilOperador('Ana', { 'instrumentStats.guitarra.maxScore': 500 }, store.lerPerfilOperador('Ana').revisao);
    const record = store.ranking().find(r => r.banda);
    assert.equal(record.pontuacaoIndividual, 500);
    assert.equal(record.pontuacao, 1000);
    assert.equal(read().ana.resultadosPartidas.match.pontuacao, 1000);
});
