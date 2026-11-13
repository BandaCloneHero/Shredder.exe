const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { criarPersistenciaPartidas, validarResultado, inicializarPerfil, FASES_CAMPANHA } = require('../partidas');
const { CONQUISTAS } = require('../perfil-operador');

const instruments = ['guitarra', 'baixo', 'bateria', 'teclado'];
const names = ['ana', 'bia', 'caio', 'duda'];
function fixture(t, accounts = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-result-awards-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'accounts.json');
    fs.writeFileSync(file, JSON.stringify({ accounts: Object.fromEntries(names.map(name => [name, { username: name, ...accounts[name] }])) }));
    const store = criarPersistenciaPartidas(file);
    const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
    const routes = {}, handlers = {}, broadcasts = [], authorization = { ok: true };
    const context = vm.createContext({
        app: { post: (name, callback) => routes[name] = callback },
        socket: { on: (name, callback) => handlers[name] = callback },
        partidas: store, validarResultado, inicializarPerfil, FASES_CAMPANHA, fs, ACCOUNTS_FILE: file,
        randomUUID, accountStore: read(), normalizeUsername: value => value.trim().toLowerCase(),
        isOfficialOperator: () => authorization, finalizarConquistaDaFeira() {}, console: { error() {} },
        io: { to: room => ({ emit: (event, data) => broadcasts.push({ room, event, data }) }) },
    });
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    vm.runInContext(source.slice(source.indexOf('function publicarConquistasEmLote'), source.indexOf('function finalizarConquistaDaFeira')), context);
    vm.runInContext(source.slice(source.indexOf('const salas = {};'), source.indexOf('function criarEstruturaSala')), context);
    vm.runInContext(source.slice(source.indexOf('    socket.on("confirmar_resultados_ticket"'), source.indexOf('    socket.on("remover_ticket_sessao"')), context);
    const plain = value => JSON.parse(JSON.stringify(value));
    function receive(count = 1, options = {}) {
        const ticket = { ticketId: randomUUID(), roomId: 'ROOM', jogadores: names.slice(0, count).map((name, i) => ({ id: name + '-id', nome: name, instrumento: instruments[i] })), modo: options.mode || { tipo: 'freeplay' }, ...(options.band ? { banda: { id: 'band', nome: 'Banda' } } : {}) };
        context.ticket = ticket;
        vm.runInContext('ticketsSessaoPendentes.push(ticket)', context);
        const response = { status(code) { this.code = code; return this; }, json(data) { this.body = plain(data); return this; } };
        routes['/api/operador/resultados-executavel']({ ip: randomUUID(), body: { loteId: randomUUID(), musica: 'Música de teste', ...options.batch, resultados: instruments.slice(0, count).map((instrumento, i) => ({
            perfilNome: 'Perfil Unity diferente ' + i, instrumento, modoJogo: 'FiveFretGuitar', pontuacao: 1000,
            precisao: 98, maiorCombo: 99, notasAcertadas: 120, notasErradas: 2, fullCombo: false,
            pausada: true, energiaFinal: 50, dificuldade: 'maxima', concluida: true,
        })) } }, response);
        assert.equal(response.body.ok, true);
        return ticket;
    }
    function confirm(ticket) { let result; handlers.confirmar_resultados_ticket({ ticketId: ticket.ticketId }, value => result = plain(value)); return result; }
    return { store, read, receive, confirm, authorization, broadcasts,
        recent: () => plain(vm.runInContext('resultadosExecutavelRecentes', context)) };
}

test('conquistas aparecem no resultado confirmado do jogador da conta, sem grant antes da confirmação', t => {
    const f = fixture(t); const ticket = f.receive();
    assert.equal(f.read().accounts.ana.gamesPlayed, undefined);
    assert.deepEqual(f.recent(), []);
    const response = f.confirm(ticket);
    assert.equal(response.ok, true);
    const result = response.resultados[0];
    assert.equal(result.perfil.nome, 'ana');
    assert.equal(result.maiorCombo, 99);
    assert.ok(result.novasConquistas.includes('primeiros_acordes'));
    assert.deepEqual(new Set(result.novasConquistas), new Set(f.read().accounts.ana.achievements));
    assert.ok(!result.novasConquistas.includes('combo_99'));
    assert.equal(f.recent().length, 1);
    assert.deepEqual(f.recent()[0].novasConquistas, result.novasConquistas);
    assert.ok(f.broadcasts.some(item => item.room === 'operador-resultados-global' && item.event === 'resultado_individual_recebido' && item.data.perfil.nome === 'ana'));
});

test('conquistas já possuídas não são anunciadas de novo em outra música', t => {
    const f = fixture(t, { ana: { achievements: CONQUISTAS.map(([id]) => id) } });
    const result = f.confirm(f.receive()).resultados[0];
    assert.deepEqual(result.novasConquistas, []);
    assert.equal(f.read().accounts.ana.gamesPlayed, 1);
});

for (const band of [false, true]) test(`quatro jogadores recebem seus desbloqueios individuais e de banda (banda nomeada=${band})`, t => {
    const f = fixture(t, { bia: { achievements: CONQUISTAS.map(([id]) => id) } });
    const response = f.confirm(f.receive(4, { band }));
    assert.equal(response.ok, true);
    const players = response.resultados.filter(result => result.tipo !== 'banda');
    assert.equal(players.length, 4);
    for (const player of players) {
        const actual = f.read().accounts[player.username];
        assert.equal(actual.gamesPlayed, 1);
        assert.equal(new Set(player.novasConquistas).size, player.novasConquistas.length);
        if (player.username === 'bia') assert.deepEqual(player.novasConquistas, []);
        else for (const id of ['primeiros_acordes', 'banda_afinada', 'show_perfeito']) assert.ok(player.novasConquistas.includes(id), `${player.username}: ${id}`);
    }
    assert.equal(f.recent().length, 4);
});

test('falha parcial e nova confirmação preservam os desbloqueios sem duplicar partidas ou notificações', t => {
    const f = fixture(t); const ticket = f.receive(2);
    const save = f.store.salvar; let fail = true;
    f.store.salvar = (...args) => { if (args[0].username === 'bia' && fail) throw new Error('disk'); return save(...args); };
    assert.equal(f.confirm(ticket).ok, false);
    assert.equal(f.read().accounts.ana.gamesPlayed, 1);
    const notifications = f.read().accounts.ana.achievementNotifications.length;
    assert.deepEqual(f.recent(), []);
    fail = false;
    const response = f.confirm(ticket);
    assert.equal(response.ok, true);
    assert.ok(response.resultados.find(item => item.username === 'ana').novasConquistas.includes('primeiros_acordes'));
    assert.equal(f.read().accounts.ana.gamesPlayed, 1);
    assert.equal(f.read().accounts.ana.achievementNotifications.length, notifications);
    assert.equal(f.recent().length, 2);
    assert.equal(f.confirm(ticket).ok, false);
    assert.equal(f.recent().length, 2);
});

test('não autoriza operador inválido nem expõe resultado como confirmado antes de salvar', t => {
    const f = fixture(t); const ticket = f.receive(); f.authorization.ok = false;
    assert.equal(f.confirm(ticket).ok, false);
    assert.equal(f.read().accounts.ana.gamesPlayed, undefined);
    assert.deepEqual(f.recent(), []);
});

test('campanha segue usando a vitória real do boss antes de liberar conquistas de fase', t => {
    const f = fixture(t); const response = f.confirm(f.receive(1, { mode: { tipo: 'historia', fase: 1 }, batch: { bossDerrotado: true } }));
    assert.equal(response.ok, true);
    assert.ok(f.read().accounts.ana.fases.desbloqueadas.includes(2));
    assert.ok(response.resultados[0].novasConquistas.includes('primeiros_acordes'));
});
