const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarPersistenciaPartidas } = require('../partidas');
function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shredder-stats-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'accounts.json');
    fs.writeFileSync(file, JSON.stringify({ accounts: { ana: { username: 'Ana', salt: 'unchanged', passwordHash: 'unchanged' }, bia: { username: 'Bia' } } }));
    return { file, store: criarPersistenciaPartidas(file), read: () => JSON.parse(fs.readFileSync(file)) };
}
const result = (overrides = {}) => ({ partidaId: 'one', operadorId: 'op1', username: 'Ana', instrumento: 'Guitarra', pontuacao: 1000, precisao: 100, maiorCombo: 10, fullCombo: true, notasAcertadas: 10, notasErradas: 0, musica: 'Song', banda: { id: 'band', nome: 'Band' }, ...overrides });
test('persiste perfil, recordes, conquistas e ranking após reinicializar', t => {
    const { store, file, read } = fixture(t);
    store.salvar(result());
    const account = read().accounts.ana;
    assert.equal(account.gamesPlayed, 1);
    assert.equal(account.lifetimeStats.totalNotesHit, 10);
    assert.deepEqual(account.instrumentStats.guitarra, { maxScore: 1000, maxCombo: 10, bestAccuracy: 100, fullCombos: 1, songsCompleted: 1 });
    assert.deepEqual(account.achievements, ['primeiros_acordes', 'on_fire', 'cirurgico', 'rei_do_ranking']);
    assert.equal(account.passwordHash, 'unchanged');
    assert.equal(criarPersistenciaPartidas(file).ranking()[0].pontuacao, 1000);
});
test('reenvio idempotente, conflito e recordes sem regressão', t => {
    const { store, read } = fixture(t);
    store.salvar(result());
    assert.equal(store.salvar(result()).duplicado, true);
    assert.throws(() => store.salvar(result({ pontuacao: 1200 })));
    store.salvar(result({ partidaId: 'two', pontuacao: 500, precisao: 80, maiorCombo: 5, fullCombo: false, notasErradas: 2 }));
    const account = read().accounts.ana;
    assert.equal(account.gamesPlayed, 2);
    assert.equal(account.songRecords.Song.plays, 2);
    assert.equal(account.instrumentStats.guitarra.maxScore, 1000);
    assert.equal(account.instrumentStats.guitarra.songsCompleted, 1);
    assert.equal(account.instrumentStats.guitarra.fullCombos, 1);
});
test('partida em fase persiste seleção, favoritos, histórico e próximo desbloqueio', t => {
    const { store, read } = fixture(t);
    const dados = result({ fase: 3, favorita: true });
    store.salvar(dados);
    const fases = read().accounts.ana.fases;
    assert.deepEqual(fases.desbloqueadas, [1, 2, 3, 4]);
    assert.deepEqual(fases.favoritas, [3]);
    assert.equal(fases.selecionada, 3);
    assert.equal(fases.historicoSelecionadas.length, 1);
    assert.equal(fases.historicoSelecionadas[0].fase, 3);
    assert.equal(read().accounts.ana.resultadosPartidas.one.fase, 3);
    assert.equal(store.salvar(dados).duplicado, true);
    assert.equal(read().accounts.ana.fases.historicoSelecionadas.length, 1);
});
test('seleção de fase persiste antes da partida sem alterar estatísticas', t => {
    const { store, read } = fixture(t);
    store.selecionarFase('Ana', 2);
    const account = read().accounts.ana;
    assert.equal(account.gamesPlayed, 0);
    assert.deepEqual(account.fases.desbloqueadas, [1, 2]);
    assert.equal(account.fases.selecionada, 2);
    assert.equal(account.fases.historicoSelecionadas.length, 1);
});
test('migração completa fases anteriores de um progresso legado esparso', t => {
    const { store, file, read } = fixture(t);
    const root = read();
    root.accounts.ana.fases = { desbloqueadas: [1, 4], favoritas: [4], selecionada: 4, historicoSelecionadas: [] };
    fs.writeFileSync(file, JSON.stringify(root));
    store.migrarContas();
    assert.deepEqual(read().accounts.ana.fases.desbloqueadas, [1, 2, 3, 4]);
});
test('payload inválido não altera disco', t => {
    const { store, file } = fixture(t); const before = fs.readFileSync(file, 'utf8');
    for (const overrides of [{ pontuacao: -1 }, { precisao: 101 }, { notasErradas: 1 }, { maiorCombo: 20 }, { instrumento: 'voz' }, { username: 'ausente' }, { pontuacao: '100' }]) assert.throws(() => store.salvar(result(overrides)));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('duas instâncias releem disco e preservam partidas consecutivas', async t => {
    const { store, file, read } = fixture(t); const other = criarPersistenciaPartidas(file);
    await Promise.all([Promise.resolve().then(() => store.salvar(result())), Promise.resolve().then(() => other.salvar(result({ partidaId: 'two', username: 'Bia' })))]);
    assert.equal(read().accounts.ana.gamesPlayed, 1); assert.equal(read().accounts.bia.gamesPlayed, 1);
    assert.equal(store.ranking().length, 2);
});
test('falha no rename preserva arquivo original', t => {
    const { store, file } = fixture(t); const before = fs.readFileSync(file, 'utf8'); const rename = fs.renameSync;
    try { fs.renameSync = () => { throw new Error('disk failure'); }; assert.throws(() => store.salvar(result())); }
    finally { fs.renameSync = rename; }
    assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('recordes anteriores e músicas distintas por instrumento são preservados', t => {
    const { store, file, read } = fixture(t);
    const root = read();
    root.accounts.ana.instrumentStats = { guitarra: { maxScore: 5000, maxCombo: 50, bestAccuracy: 99, songsCompleted: 2, fullCombos: 1 } };
    root.accounts.ana.achievements = ['lenda_viva'];
    fs.writeFileSync(file, JSON.stringify(root));
    assert.equal(store.ranking()[0].pontuacao, 5000);
    store.salvar(result());
    store.salvar(result({ partidaId: 'bass', instrumento: 'Baixo' }));
    store.salvar(result({ partidaId: 'new-song', musica: 'Another song' }));
    const account = read().accounts.ana;
    assert.equal(account.instrumentStats.guitarra.maxScore, 5000);
    assert.equal(account.instrumentStats.guitarra.songsCompleted, 4);
    assert.equal(account.instrumentStats.baixo.songsCompleted, 1);
    assert.ok(account.achievements.includes('lenda_viva'));
    assert.equal(store.ranking().filter(r => r.banda).length, 3);
});

test('conta parcial recebe todos os padrões e histórico detalhado na nova partida', t => {
    const { store, read } = fixture(t);
    const startedAt = Date.now();
    store.salvar(result());
    const account = read().accounts.ana;
    for (const key of ['username', 'salt', 'passwordHash', 'nickname', 'avatar', 'currency', 'gamesPlayed', 'currentTitle', 'lifetimeStats', 'instrumentStats', 'songRecords', 'achievements', 'fases', 'createdAt', 'updatedAt', 'resultadosPartidas']) {
        assert.ok(Object.hasOwn(account, key), `Campo ausente: ${key}`);
    }
    assert.equal(account.nickname, 'Ana');
    assert.equal(account.avatar, '');
    assert.equal(account.currency, 0);
    assert.equal(account.currentTitle, 'Novato do Rock');
    assert.equal(account.instrumentStats.favoriteInstrument, 'nenhum');
    assert.deepEqual(account.fases, { desbloqueadas: [1], favoritas: [], selecionada: null, historicoSelecionadas: [] });
    for (const instrument of ['baixo', 'bateria', 'teclado']) {
        assert.deepEqual(account.instrumentStats[instrument], { maxScore: 0, maxCombo: 0, bestAccuracy: 0, songsCompleted: 0, fullCombos: 0 });
    }
    assert.ok(Date.parse(account.createdAt) >= startedAt);
    assert.equal(account.createdAt, account.updatedAt);
    assert.deepEqual(account.resultadosPartidas.one, { ...result(), instrumento: 'guitarra' });
});

test('novas partidas preservam cosméticos, credenciais, campos extras e histórico anterior', t => {
    const { store, file, read } = fixture(t);
    const root = read();
    Object.assign(root.accounts.ana, {
        nickname: 'Rainha do Rock', avatar: '/avatar.png', currency: 123,
        currentTitle: 'Lenda', createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z', achievements: ['lenda_viva', 'cirurgico'],
        customPreferences: { color: 'magenta' },
        instrumentStats: { favoriteInstrument: 'bateria', baixo: { maxScore: 9999, custom: true } },
        lifetimeStats: { customCounter: 7 },
    });
    fs.writeFileSync(file, JSON.stringify(root));
    const original = read().accounts.ana;
    store.salvar(result());
    const first = read().accounts.ana;
    store.salvar(result({ partidaId: 'two', fullCombo: false, notasErradas: 1 }));
    const account = read().accounts.ana;
    for (const key of ['username', 'salt', 'passwordHash', 'nickname', 'avatar', 'currency', 'currentTitle', 'createdAt', 'customPreferences']) {
        assert.deepEqual(account[key], original[key], `Campo alterado: ${key}`);
    }
    assert.equal(account.instrumentStats.favoriteInstrument, 'bateria');
    assert.equal(account.instrumentStats.baixo.maxScore, 9999);
    assert.equal(account.instrumentStats.baixo.custom, true);
    assert.equal(account.instrumentStats.baixo.songsCompleted, 0);
    assert.equal(account.lifetimeStats.customCounter, 7);
    assert.deepEqual(account.achievements, ['lenda_viva', 'cirurgico', 'primeiros_acordes', 'on_fire', 'rei_do_ranking', 'quase_la']);
    assert.equal(account.gamesPlayed, 2);
    assert.notEqual(account.updatedAt, original.updatedAt);
    assert.deepEqual(account.resultadosPartidas.one, first.resultadosPartidas.one);
    assert.deepEqual(account.resultadosPartidas.two, { ...result({ partidaId: 'two', fullCombo: false, notasErradas: 1 }), instrumento: 'guitarra' });
    const beforeRetry = fs.readFileSync(file, 'utf8');
    store.salvar(result());
    assert.equal(fs.readFileSync(file, 'utf8'), beforeRetry);
});

test('inicialização preserva valores vazios e não compartilha objetos entre contas', () => {
    const { inicializarPerfil } = require('../partidas');
    const first = inicializarPerfil({ username: 'Ana', nickname: '', avatar: '', currency: 0, currentTitle: '', lifetimeStats: null, instrumentStats: { guitarra: null }, songRecords: null, achievements: null, resultadosPartidas: null });
    const second = inicializarPerfil({ username: 'Bia' });
    assert.equal(first.nickname, '');
    assert.equal(first.currentTitle, '');
    assert.equal(first.currency, 0);
    first.instrumentStats.guitarra.maxScore = 100;
    first.achievements.push('on_fire');
    first.resultadosPartidas.test = {};
    assert.equal(second.instrumentStats.guitarra.maxScore, 0);
    assert.deepEqual(second.achievements, []);
    assert.deepEqual(second.resultadosPartidas, {});
});

test('estrutura inválida é rejeitada sem apagar dados persistidos', t => {
    const { store, file, read } = fixture(t);
    const root = read();
    root.accounts.ana.achievements = { legacy: 'on_fire' };
    fs.writeFileSync(file, JSON.stringify(root));
    const before = fs.readFileSync(file, 'utf8');
    assert.throws(() => store.salvar(result()), /Estrutura de perfil inválida/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('cadastro utiliza perfil completo, incluindo resultadosPartidas vazio', async () => {
    const vm = require('vm');
    const { inicializarPerfil } = require('../partidas');
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    let register, saves = 0;
    const accountStore = { accounts: {} };
    const ctx = vm.createContext({
        app: { post: (_, fn) => register = fn }, accountStore, inicializarPerfil,
        validCredentials: () => true, normalizeUsername: value => value.toLowerCase(),
        randomBytes: () => ({ toString: () => 'generated-salt' }),
        passwordHash: async () => 'generated-hash', saveAccounts: () => saves++,
        createSession: () => 'session-token',
    });
    vm.runInContext(source.slice(source.indexOf('app.post("/api/auth/register"'), source.indexOf('app.post("/api/auth/login"')), ctx);
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await register({ body: { username: 'Ana', password: 'test-password' } }, response);
    assert.equal(response.code, 201);
    assert.equal(saves, 1);
    // O handler roda em outro contexto VM; compare a representação persistida em JSON.
    const account = JSON.parse(JSON.stringify(accountStore.accounts.ana));
    assert.deepEqual(account, inicializarPerfil({ username: 'Ana', salt: 'generated-salt', passwordHash: 'generated-hash' }, 'Ana', account.createdAt));
    assert.deepEqual(account.resultadosPartidas, {});
    assert.equal(account.nickname, 'Ana');
});

test('migração completa todas as contas antigas, mantém valores e é idempotente', t => {
    const { store, file, read } = fixture(t);
    const original = fs.readFileSync(file, 'utf8');
    const migration = store.migrarContas();
    assert.equal(migration.atualizadas, 2);
    assert.equal(fs.readFileSync(migration.backup, 'utf8'), original);
    for (const account of Object.values(read().accounts)) {
        assert.equal(account.gamesPlayed, 0);
        assert.equal(account.currency, 0);
        assert.deepEqual(account.resultadosPartidas, {});
        assert.equal(Object.keys(account.instrumentStats).length, 5);
    }
    assert.equal(read().accounts.ana.passwordHash, 'unchanged');
    const saved = fs.readFileSync(file, 'utf8');
    assert.equal(store.migrarContas().atualizadas, 0);
    assert.equal(store.migrarContas().backup, null);
    assert.equal(fs.readFileSync(file, 'utf8'), saved);
    assert.equal(fs.readdirSync(path.dirname(migration.backup)).length, 1);
});

test('migração preserva partidas, cosméticos e timestamps existentes no formato raiz', t => {
    const { store, file, read } = fixture(t);
    store.salvar(result());
    const accounts = read().accounts;
    Object.assign(accounts.ana, { avatar: 'foto.png', currency: 77, nickname: 'Nome personalizado', currentTitle: 'Lenda' });
    fs.writeFileSync(file, JSON.stringify(accounts));
    const before = read().ana;
    store.migrarContas();
    assert.equal(read().accounts, undefined);
    assert.deepEqual(read().ana, before);
    assert.equal(read().bia.gamesPlayed, 0);
});

test('migração inválida não grava alterações parciais', t => {
    const { store, file, read } = fixture(t);
    const root = read(); root.accounts.bia.achievements = 'invalid';
    fs.writeFileSync(file, JSON.stringify(root));
    const before = fs.readFileSync(file, 'utf8');
    assert.throws(() => store.migrarContas(), /Estrutura de perfil inválida/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('carregamento do servidor dispara migração e usa o store atualizado', t => {
    const vm = require('vm');
    const { store, file, read } = fixture(t);
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const ctx = vm.createContext({ fs, ACCOUNTS_FILE: file, partidas: store, console: { log() {}, error() {} }, accountStore: { accounts: {} } });
    vm.runInContext(source.slice(source.indexOf('function loadAccounts()'), source.indexOf('function saveAccounts()')) + '\nloadAccounts();', ctx);
    assert.equal(read().accounts.bia.nickname, 'Bia');
    assert.equal(vm.runInContext('accountStore.accounts.bia.instrumentStats.teclado.maxScore', ctx), 0);
});

test('ganho de moedas não duplica em reenvio e estatísticas dos quatro instrumentos acumulam', t => {
    const { store, read } = fixture(t);
    for (const instrumento of ['guitarra', 'baixo', 'bateria', 'teclado']) {
        const dados = result({ partidaId: instrumento, instrumento, currency: 10, nickname: 'Ana Rock', currentTitle: 'Estrela' });
        store.salvar(dados);
        assert.equal(store.salvar(dados).duplicado, true);
    }
    const account = read().accounts.ana;
    assert.equal(account.currency, 40);
    assert.equal(account.gamesPlayed, 4);
    assert.equal(account.lifetimeStats.totalNotesHit, 40);
    assert.equal(account.lifetimeStats.totalMisses, 0);
    for (const instrumento of ['guitarra', 'baixo', 'bateria', 'teclado']) {
        assert.deepEqual(account.instrumentStats[instrumento], { maxScore: 1000, maxCombo: 10, bestAccuracy: 100, songsCompleted: 1, fullCombos: 1 });
        assert.equal(account.resultadosPartidas[instrumento].currency, 10);
    }
    assert.equal(account.songRecords.Song.instrumento, 'teclado');
    assert.equal(account.songRecords.Song.bestScore, 1000);
});

test('falha na gravação não altera moedas ou cosméticos; campos legados acompanham ajuste', t => {
    const { store, file, read } = fixture(t);
    const root = read(); Object.assign(root.accounts.ana, { currency: 5, moedas: 50, tituloEquipado: 'Antigo' });
    fs.writeFileSync(file, JSON.stringify(root));
    const before = fs.readFileSync(file, 'utf8');
    const rename = fs.renameSync;
    try {
        fs.renameSync = () => { throw new Error('disk'); };
        assert.throws(() => store.salvar(result({ currency: 20, currentTitle: 'Novo', nickname: 'Novo nome' })));
    } finally { fs.renameSync = rename; }
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    store.salvar(result({ currency: 20, currentTitle: 'Novo', nickname: 'Novo nome' }));
    assert.equal(read().accounts.ana.currency, 70);
    assert.equal(read().accounts.ana.moedas, 70);
    assert.equal(read().accounts.ana.tituloEquipado, 'Novo');
});
