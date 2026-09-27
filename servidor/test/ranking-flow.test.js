const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const app = fs.readFileSync(path.join(__dirname, '../../docs/app.js'), 'utf8');

test('ranking usa mesma renderização na carga inicial, broadcast e reconexão', () => {
    const nodes = Object.fromEntries(['#ranking-player', '#ranking-list', '#ranking-status', '#my-ranking'].map(id => [id, { textContent: '', innerHTML: '', hidden: false }]));
    const tabs = ['Guitarra', 'Baixo', 'Bateria', 'Teclado', 'bandas'].map(tab => ({ dataset: { rankingTab: tab }, active: false, addEventListener(_, fn) { this.click = fn; }, classList: { toggle(_, enabled) { tabs.find(t => t.dataset.rankingTab === tab).active = enabled; } } }));
    const handlers = {}; let subscriptions = 0;
    const records = Array.from({ length: 101 }, (_, i) => ({ jogadorId: i === 100 ? 'ana' : `op${i}`, nome: i === 100 ? 'Ana' : `Player${i}`, instrumento: 'Guitarra', pontuacao: 1000 - i }));
    const socket = { connected: true, on: (e, fn) => handlers[e] = fn, timeout() { return this; }, emit(e, _, callback) { assert.equal(e, 'entrarRanking'); subscriptions++; callback(null, { ok: true, records }); } };
    const ctx = vm.createContext({ window: { socket }, getPlayer: () => ({ id: 'random-browser-id', nome: 'Ana' }), document: { querySelector: id => id === '.ranking-tab.active' ? tabs.find(t => t.active) : nodes[id], querySelectorAll: () => tabs }, Intl, Map, formatInstrument: s => s });
    vm.runInContext(app.slice(app.indexOf('function normalizeBand'), app.indexOf('function initializeTicket')), ctx);
    vm.runInContext('function getGameSocket() { return window.socket; } initializeRanking();', ctx);
    assert.match(nodes['#my-ranking'].innerHTML, /101º/);
    handlers.rankingAtualizado({ records: [{ jogadorId: 'ana', nome: 'Ana', instrumento: 'Guitarra', pontuacao: 2000 }] });
    assert.equal(nodes['#my-ranking'].hidden, true);
    assert.match(nodes['#ranking-list'].innerHTML, /Ana/);
    tabs[1].click();
    handlers.rankingAtualizado({ records: [{ jogadorId: 'ana', nome: 'Ana', instrumento: 'Baixo', pontuacao: 3000 }] });
    assert.equal(tabs[1].active, true); assert.match(nodes['#ranking-list'].innerHTML, /Ana/);
    handlers.disconnect(); handlers.connect(); assert.equal(subscriptions, 2);
});

test('resultado permanece local na falha e é removido somente após confirmação; socket reutilizado', async () => {
    const storage = {}; let callback, connections = 0;
    const socket = { timeout() { return this; }, emit(_, __, cb) { callback = cb; } };
    const ctx = vm.createContext({ window: { socket }, io: () => { connections++; return socket; }, getPlayer: () => ({ id: 'op', nome: 'Ana', instrumento: 'Guitarra' }), readJson: (k, fallback) => storage[k] ? JSON.parse(storage[k]) : fallback, writeJson: (k, v) => storage[k] = JSON.stringify(v), crypto: { randomUUID: () => 'fixed' }, Map, Promise, Error });
    vm.runInContext(app.slice(app.indexOf('function getGameSocket'), app.indexOf('function aggregateRanking')), ctx);
    const failed = vm.runInContext('enviarPontuacaoParaRanking({ partidaId: "match", pontuacao: 100 })', ctx);
    callback(new Error('timeout'));
    await assert.rejects(failed);
    assert.ok(JSON.parse(storage.shredder_resultados_pendentes).match);
    const success = vm.runInContext('enviarPontuacaoParaRanking({ partidaId: "match", pontuacao: 100 })', ctx);
    callback(null, { ok: true }); await success;
    assert.deepEqual(JSON.parse(storage.shredder_resultados_pendentes), {});
    assert.equal(connections, 0);
});

test('servidor publica somente após persistir e responde erro sem broadcast', () => {
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const handlers = {}, order = [];
    let failure = false;
    const socket = { on: (e, f) => handlers[e] = f, join: name => order.push(name) };
    const ctx = vm.createContext({ socket, accountStore: {}, console: { error() {} }, partidas: { ranking: () => [], salvar: () => { if (failure) throw new Error('disk'); order.push('saved'); return { raiz: { accounts: {} }, records: [] }; } }, io: { to: room => ({ emit: event => order.push(`${room}:${event}`) }) } });
    vm.runInContext(source.slice(source.indexOf('    socket.on("entrarRanking"'), source.indexOf('    console.log(`> Cliente conectado')), ctx);
    handlers.entrarRanking({}, r => assert.equal(r.ok, true));
    handlers.partidaFinalizada({ partidaId: 'one' }, r => { assert.equal(r.ok, true); order.push('ack'); });
    assert.deepEqual(order, ['ranking', 'saved', 'ranking:rankingAtualizado', 'ack']);
    failure = true;
    handlers.partidaFinalizada({}, r => assert.equal(r.ok, false));
    assert.equal(order.length, 4);
});

test('ranking individual usa o recorde corrigido e bandas mantêm a pontuação da partida', () => {
    const ctx = vm.createContext({ Map });
    vm.runInContext(app.slice(app.indexOf('function normalizeBand'), app.indexOf('function formatScore')), ctx);
    ctx.records = [{ jogadorId: 'ana', nome: 'Ana', instrumento: 'Guitarra', pontuacao: 1000, pontuacaoIndividual: 500, banda: { id: 'band', nome: 'Band' } }];
    assert.equal(vm.runInContext('aggregateRanking(records, "Guitarra")[0].pontuacao', ctx), 500);
    assert.equal(vm.runInContext('aggregateRanking(records, "bandas")[0].pontuacao', ctx), 1000);
});
