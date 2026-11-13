const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.parent = null; this.events = {}; this.attributes = {}; this._text = ''; }
    set textContent(text) { for (const child of this.children) child.parent = null; this.children = []; this._text = String(text); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
    set innerHTML(_) { throw new Error('Server data must not be rendered as HTML'); }
    append(...items) { for (const item of items) { item.remove(); item.parent = this; this.children.push(item); } }
    prepend(item) { item.remove(); item.parent = this; this.children.unshift(item); }
    replaceChildren(...items) { this.textContent = ''; this.append(...items); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.events[name] = callback; }
    get childElementCount() { return this.children.length; }
    all(tag) { return this.children.flatMap(child => [...(child.tagName === tag ? [child] : []), ...child.all(tag)]); }
}
function panel() {
    const nodes = Object.fromEntries(['incoming-results-status', 'incoming-ticket-list', 'incoming-match-list', 'clear-recent-results'].map(id => [id, new Element()]));
    const handlers = {}, calls = [];
    const socket = { connected: true, on(name, callback) { handlers[name] = callback; }, timeout() { return this; }, emit(name, data, callback) { calls.push({ name, data, callback }); } };
    const context = vm.createContext({ document: { getElementById: id => nodes[id], createElement: tag => new Element(tag) }, window: { socket, confirm: () => true },
        localStorage: { getItem: () => 'operator-token' }, Intl });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../docs/js/achievement-catalog.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../docs/js/operador-resultados-ao-vivo.js'), 'utf8'), context);
    return { nodes, handlers, calls,
        respond(name, result) { const call = calls.findLast(call => call.name === name); assert.ok(call, name); call.callback(null, result); } };
}
const result = (overrides = {}) => ({ partidaId: 'unity_ticket_guitarra', perfil: { nome: 'Ana', instrumento: 'guitarra', modoJogo: 'FiveFretGuitar' },
    musica: 'Música teste', pontuacao: 1000, precisao: 98, maiorCombo: 99, fullCombo: false,
    novasConquistas: ['primeiros_acordes', 'banda_afinada'], ...overrides });

test('painel exibe nome, imagem, raridade e requisito das conquistas por jogador', () => {
    const p = panel(); p.respond('monitorar_resultados_salas', { ok: true, tickets: [], resultados: [result()] });
    const list = p.nodes['incoming-match-list'];
    assert.equal(list.childElementCount, 1);
    assert.match(list.textContent, /Ana · GUITARRA/);
    assert.match(list.textContent, /combo 99/);
    assert.match(list.textContent, /PRIMEIROS ACORDES/);
    assert.match(list.textContent, /BANDA AFINADA/);
    assert.match(list.textContent, /Conclua sua primeira partida/);
    assert.equal(list.all('img').length, 2);
    for (const image of list.all('img')) {
        assert.equal(image.loading, 'lazy');
        assert.ok(fs.existsSync(path.join(__dirname, '../../docs', image.src.split('?')[0])));
    }
});

test('cada jogador tem somente seus desbloqueios e vazio não é tratado como erro', () => {
    const p = panel(); p.respond('monitorar_resultados_salas', { ok: true, tickets: [], resultados: [result(), result({ partidaId: 'bia', perfil: { nome: 'Bia', instrumento: 'baixo' }, novasConquistas: [] })] });
    const cards = p.nodes['incoming-match-list'].children;
    const ana = cards.find(card => card.textContent.includes('Ana'));
    const bia = cards.find(card => card.textContent.includes('Bia'));
    assert.equal(ana.all('img').length, 2);
    assert.equal(bia.all('img').length, 0);
    assert.match(bia.textContent, /Nenhuma conquista nova nesta partida/);
    assert.doesNotMatch(bia.textContent, /PRIMEIROS ACORDES/);
});

test('confirmação remove ticket pendente e mantém resultado e conquistas visíveis', () => {
    const p = panel();
    p.respond('monitorar_resultados_salas', { ok: true, tickets: [{ ticketId: 'ticket', jogadores: [{ nome: 'Ana', instrumento: 'guitarra' }], resultadosExecutavel: [{ pontuacao: 1000, precisao: 98, maiorCombo: 99, perfil: { instrumento: 'guitarra' } }] }], resultados: [] });
    assert.equal(p.nodes['incoming-match-list'].childElementCount, 0);
    assert.equal(p.nodes['incoming-ticket-list'].all('img').length, 0);
    p.nodes['incoming-ticket-list'].all('button')[0].events.click();
    p.respond('confirmar_resultados_ticket', { ok: true, resultados: [result()] });
    assert.equal(p.nodes['incoming-ticket-list'].childElementCount, 0);
    assert.equal(p.nodes['incoming-match-list'].childElementCount, 1);
    assert.match(p.nodes['incoming-match-list'].textContent, /PRIMEIROS ACORDES/);
    p.handlers.resultado_individual_recebido(result());
    p.respond('monitorar_resultados_salas', { ok: true, tickets: [], resultados: [result()] });
    assert.equal(p.nodes['incoming-match-list'].childElementCount, 1);
});

test('reconexão e recarregamento recuperam o mesmo resumo recebido do servidor', () => {
    const p = panel(); p.respond('monitorar_resultados_salas', { ok: true, tickets: [], resultados: [result()] });
    p.handlers.connect(); p.respond('monitorar_resultados_salas', { ok: true, tickets: [], resultados: [result()] });
    assert.equal(p.nodes['incoming-match-list'].childElementCount, 1);
    const reloaded = panel(); reloaded.respond('monitorar_resultados_salas', { ok: true, tickets: [], resultados: [result()] });
    assert.match(reloaded.nodes['incoming-match-list'].textContent, /BANDA AFINADA/);
});

test('IDs repetidos, desconhecidos e nomes com HTML não criam badges falsos ou markup', () => {
    const p = panel(); p.respond('monitorar_resultados_salas', { ok: true, tickets: [], resultados: [result({ perfil: { nome: '<script>alert(1)</script>', instrumento: 'baixo' }, novasConquistas: ['primeiros_acordes', 'primeiros_acordes', '../invalido', '<img onerror=alert(1)>'] })] });
    const list = p.nodes['incoming-match-list'];
    assert.match(list.textContent, /<script>alert\(1\)<\/script>/);
    assert.equal(list.all('script').length, 0);
    assert.equal(list.all('img').length, 1);
    assert.equal(list.all('img')[0].src, 'assets/achievements/primeiros_acordes.webp?v=1');
});

test('resposta antiga sem campo de conquistas não inventa ausência de desbloqueios', () => {
    const p = panel(); const old = result(); delete old.novasConquistas;
    p.respond('monitorar_resultados_salas', { ok: true, tickets: [], resultados: [old] });
    assert.match(p.nodes['incoming-match-list'].textContent, /não informa os desbloqueios/);
    assert.doesNotMatch(p.nodes['incoming-match-list'].textContent, /Nenhuma conquista nova/);
});

test('limpar resultados permite receber o próximo resumo sem ressuscitar os antigos', () => {
    const p = panel(); p.respond('monitorar_resultados_salas', { ok: true, tickets: [], resultados: [result()] });
    p.nodes['clear-recent-results'].events.click();
    p.respond('limpar_resultados_recentes', { ok: true });
    assert.equal(p.nodes['incoming-match-list'].childElementCount, 0);
    p.handlers.resultado_individual_recebido(result());
    assert.equal(p.nodes['incoming-match-list'].childElementCount, 1);
});
