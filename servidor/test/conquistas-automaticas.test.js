const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { criarPersistenciaPartidas, validarResultado } = require('../partidas');
const { CONQUISTAS } = require('../perfil-operador');

function fixture(t, flat = false) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shredder-achievements-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'accounts.json');
    const accounts = Object.fromEntries(['ana', 'bia', 'caio', 'duda'].map(username => [username, { username }]));
    fs.writeFileSync(file, JSON.stringify(flat ? accounts : { accounts }));
    return { file, store: criarPersistenciaPartidas(file), read: () => JSON.parse(fs.readFileSync(file)) };
}

function result(overrides = {}) {
    return { partidaId: randomUUID(), operadorId: 'unity', username: 'ana', instrumento: 'guitarra',
        musica: 'Song', pontuacao: 1000, precisao: 100, maiorCombo: 100, notasAcertadas: 100,
        notasErradas: 0, fullCombo: true, concluida: true, pausada: false, energiaFinal: 70,
        dificuldade: 'maxima', ...overrides };
}

const membros = () => ['guitarra', 'baixo', 'bateria', 'teclado'].map((instrumento, index) => ({
    nome: ['ana', 'bia', 'caio', 'duda'][index], instrumento, pontuacao: 1000, precisao: 96, concluida: true,
}));

test('todas as 29 conquistas podem ser obtidas sem concessão manual', t => {
    const { store, read } = fixture(t);
    for (const instrumento of ['guitarra', 'baixo', 'bateria', 'teclado']) {
        for (let fase = 1; fase <= 5; fase++) store.salvar(result({ instrumento, musica: `${instrumento}-${fase}`, fase, modo: 'historia' }));
    }
    store.salvar(result({ pontuacao: 2000, precisao: 99.5, maiorCombo: 50, fullCombo: false, notasErradas: 1, energiaFinal: 5 }));
    store.salvar(result({ precisao: 40, maiorCombo: 5, fullCombo: false, notasAcertadas: 10, notasErradas: 100 }));
    while (read().accounts.ana.gamesPlayed < 100) store.salvar(result({ precisao: 80, maiorCombo: 50, fullCombo: false, notasErradas: 2 }));
    for (let fase = 1; fase <= 5; fase++) store.favoritarFase('ana', fase, true);
    store.salvarPontuacaoBanda({ partidaId: 'band-one', banda: { id: 'band', nome: 'Banda' }, pontuacao: 4000, membros: membros() });
    assert.equal(store.encerrarFeira('2026-11-19T20:29:59Z').encerrada, false);
    store.encerrarFeira('2026-11-19T20:30:00Z');
    const conta = read().accounts.ana;
    assert.deepEqual(new Set(conta.achievements), new Set(CONQUISTAS.map(([id]) => id)));
    assert.equal(conta.achievementNotifications.length, 29);
    assert.equal(new Set(conta.achievementNotifications.map(item => item.conquistaId)).size, 29);
});

test('reenvios e favoritos repetidos não duplicam progresso ou notificações', t => {
    const { store, file, read } = fixture(t);
    const payload = result({ fase: 5, modo: 'historia' });
    store.salvar(payload);
    const count = read().accounts.ana.achievementNotifications.length;
    assert.equal(store.salvar(payload).duplicado, true);
    assert.equal(read().accounts.ana.gamesPlayed, 1);
    assert.equal(read().accounts.ana.achievementNotifications.length, count);
    for (let fase = 1; fase <= 5; fase++) store.favoritarFase('ana', fase, true);
    assert.deepEqual(store.favoritarFase('ana', 5, true).novasConquistas, []);
    store.favoritarFase('ana', 5, false);
    assert.ok(read().accounts.ana.achievements.includes('favorita_da_casa'));
    const before = fs.readFileSync(file, 'utf8');
    assert.throws(() => store.salvar({ ...payload, pausada: true }), /ID de partida/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('partidas não concluídas e fases fora da campanha não concedem conquistas de conclusão', t => {
    const { store, read } = fixture(t);
    for (let count = 0; count < 50; count++) store.salvar(result({ concluida: false, fase: 6 + count % 5, modo: 'historia', energiaFinal: 0 }));
    const ids = read().accounts.ana.achievements;
    assert.ok(ids.includes('maratonista'));
    for (const id of ['primeiros_acordes', 'lenda_viva', 'on_fire', 'cirurgico', 'sem_errar_o_compasso', 'virada_insana', 'dono_do_palco', 'especialista', 'perfeccionista']) assert.ok(!ids.includes(id), id);
    for (let fase = 6; fase <= 10; fase++) store.salvar(result({ fase, modo: 'historia' }));
    assert.ok(!read().accounts.ana.achievements.includes('dono_do_palco'));
    assert.throws(() => store.favoritarFase('ana', 6, true));
});

test('campos ausentes não inventam pausa, energia ou dificuldade; valores inválidos não gravam', t => {
    const { store, file, read } = fixture(t);
    const payload = result();
    delete payload.pausada; delete payload.energiaFinal; delete payload.dificuldade;
    store.salvar(payload);
    assert.ok(!read().accounts.ana.achievements.includes('sem_errar_o_compasso'));
    assert.ok(!read().accounts.ana.achievements.includes('virada_insana'));
    const before = fs.readFileSync(file, 'utf8');
    for (const fields of [{ pausada: 'false' }, { energiaFinal: -1 }, { energiaFinal: 101 }, { dificuldade: 'impossivel' }, { concluida: 1 }]) assert.throws(() => store.salvar(result(fields)));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    store.salvar(result({ energiaFinal: 0 }));
    assert.ok(read().accounts.ana.achievements.includes('virada_insana'));
});

test('banda exige quatro pessoas/instrumentos e todos acima de 95%; repetição é idempotente', t => {
    const { store, read } = fixture(t);
    const base = { partidaId: 'band-one', banda: { id: 'band', nome: 'Banda' }, pontuacao: 4000 };
    store.salvarPontuacaoBanda({ ...base, membros: membros().slice(0, 3) });
    assert.deepEqual(read().accounts.ana.achievements || [], []);
    store.salvarPontuacaoBanda({ ...base, partidaId: 'duplicate-person', membros: membros().map(item => ({ ...item, nome: 'ana' })) });
    assert.deepEqual(read().accounts.ana.achievements || [], []);
    const partial = membros(); partial[0].precisao = 95;
    store.salvarPontuacaoBanda({ ...base, partidaId: 'partial', membros: partial });
    for (const account of Object.values(read().accounts)) assert.deepEqual(account.achievements, ['banda_afinada']);
    const final = { ...base, partidaId: 'perfect', membros: membros() };
    store.salvarPontuacaoBanda(final);
    assert.deepEqual(store.salvarPontuacaoBanda(final).notificacoesPorJogador, []);
    for (const account of Object.values(read().accounts)) assert.deepEqual(account.achievements, ['banda_afinada', 'show_perfeito']);
});

test('encerramento persiste os vencedores e não premia novos líderes após o prazo ou reinicialização', t => {
    const { store, file, read } = fixture(t, true);
    store.salvar(result({ banda: null }));
    const closed = store.encerrarFeira('2026-11-19T20:30:00Z');
    assert.equal(closed.notificacoesPorJogador.length, 1);
    store.salvar(result({ username: 'bia', pontuacao: 10000, banda: null }));
    const restarted = criarPersistenciaPartidas(file);
    assert.deepEqual(restarted.encerrarFeira('2026-11-20').notificacoesPorJogador, []);
    assert.ok(read().ana.achievements.includes('estrela_da_feira'));
    assert.ok(!read().bia.achievements.includes('estrela_da_feira'));
    restarted.migrarContas();
    assert.ok(read().fairAchievement.lideres.length);
});

test('participação de quatro jogadores sem nome de banda concede conquistas sem inventar recordes', t => {
    const { store, read } = fixture(t);
    assert.equal(store.registrarParticipacaoBanda(membros()).notificacoesPorJogador.length, 4);
    assert.equal(read().bandRecords, undefined);
    assert.deepEqual(store.registrarParticipacaoBanda(membros()).notificacoesPorJogador, []);
    for (const conta of Object.values(read().accounts)) assert.deepEqual(conta.achievements, ['banda_afinada', 'show_perfeito']);
});

test('Estrela da Feira considera rankings de cada música/modo e os integrantes da banda vencedora', t => {
    const { store, read } = fixture(t);
    store.salvar(result({ musica: 'Song A', banda: null }));
    store.salvar(result({ username: 'bia', musica: 'Song B', pontuacao: 50, banda: null }));
    store.salvarPontuacaoBanda({ partidaId: 'band', banda: { id: 'band', nome: 'Banda' }, musica: 'Song C', modo: 'historia', pontuacao: 4000, membros: membros() });
    store.encerrarFeira('2026-11-19T20:30:00Z');
    for (const conta of Object.values(read().accounts)) assert.ok(conta.achievements.includes('estrela_da_feira'), conta.username);
    assert.ok(read().fairAchievement.lideres.some(item => item.musica === 'Song B' && item.username === 'bia'));
});

test('campos de conquista do Unity atravessam recebimento e confirmação do ticket', t => {
    const { store, read } = fixture(t);
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const routes = {}, handlers = {}, broadcasts = [];
    const context = vm.createContext({
        app: { post: (route, handler) => routes[route] = handler },
        socket: { on: (event, handler) => handlers[event] = handler },
        partidas: store, validarResultado, randomUUID, accountStore: {},
        isOfficialOperator: () => ({ ok: true }), finalizarConquistaDaFeira() {},
        normalizeUsername: value => value.toLowerCase(), console,
        io: { to: room => ({ emit: (event, data) => broadcasts.push({ room, event, data }) }) },
    });
    vm.runInContext(source.slice(source.indexOf('function publicarConquistasEmLote'), source.indexOf('function finalizarConquistaDaFeira')), context);
    vm.runInContext(source.slice(source.indexOf('const salas = {};'), source.indexOf('function criarEstruturaSala')), context);
    vm.runInContext(source.slice(source.indexOf('    socket.on("confirmar_resultados_ticket"'), source.indexOf('    socket.on("remover_ticket_sessao"')), context);
    context.ticket = { ticketId: 'ticket', roomId: 'ROOM', jogadores: [{ id: 'ana-id', nome: 'ana', instrumento: 'Guitarra' }], modo: { tipo: 'historia', fase: 1 } };
    vm.runInContext('ticketsSessaoPendentes.push(ticket)', context);
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    routes['/api/operador/resultados-executavel']({ ip: 'test', body: { musica: 'Song', resultados: [{
        perfilNome: 'Unity Player', instrumento: 'Guitarra', modoJogo: 'FiveFretGuitar',
        pontuacao: 1000, precisao: 100, maiorCombo: 100, notasAcertadas: 100, notasErradas: 0, fullCombo: true,
        pausada: false, energiaFinal: 5, dificuldade: 'maxima', concluida: true,
    }] } }, response);
    assert.equal(response.body.ok, true);
    assert.equal(read().accounts.ana.gamesPlayed, undefined);
    handlers.confirmar_resultados_ticket({ ticketId: 'ticket' }, result => assert.equal(result.ok, true));
    const conta = read().accounts.ana;
    assert.equal(conta.resultadosPartidas.unity_ticket_guitarra.dificuldade, 'maxima');
    assert.ok(conta.achievements.includes('sem_errar_o_compasso'));
    assert.ok(conta.achievements.includes('virada_insana'));
    assert.ok(broadcasts.some(item => item.room === 'conquistas:ana' && item.event === 'conquistaDesbloqueada'));
});
