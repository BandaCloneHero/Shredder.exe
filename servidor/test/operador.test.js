const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { randomUUID } = require('crypto');
const { criarPersistenciaPartidas, validarResultado } = require('../partidas');

function setup(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shredder-operator-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'accounts.json');
    fs.writeFileSync(file, JSON.stringify({ accounts: { ana: { username: 'Ana' } } }));
    const partidas = criarPersistenciaPartidas(file);
    const broadcasts = [];
    const handlers = {};
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const ctx = vm.createContext({ app: { post: (route, fn) => { handlers[route] = fn; } }, partidas, validarResultado, randomUUID, accountStore: {}, io: { emit: (event, data) => broadcasts.push({ event, data }) }, console: { error() {} } });
    vm.runInContext(source.slice(source.indexOf('app.post("/api/operador/salvar-pontuacao"'), source.indexOf('const salas = {};')), ctx);
    function request(route, body) {
        const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
        handlers[route]({ body }, response);
        return response;
    }
    return {
        post: body => request('/api/operador/salvar-pontuacao', body),
        postBand: body => request('/api/operador/salvar-pontuacao-banda', body),
        broadcasts, file, partidas, read: () => JSON.parse(fs.readFileSync(file)),
    };
}
const payload = { username: 'Ana', instrumento: 'guitarra', musica: 'Song', pontuacao: 1500, comboMaximo: 10, precisao: 100, notasAcertadas: 10, notasErradas: 0, fullCombo: true };

test('painel salva, gera ID no servidor e publica no formato esperado pelo ranking', t => {
    const { post, broadcasts, read } = setup(t);
    const response = post({ ...payload, partidaId: 'forged', operadorId: 'forged' });
    assert.equal(response.statusCode, 201);
    assert.match(response.body.partidaId, /^evt_/);
    const account = read().accounts.ana;
    const result = account.resultadosPartidas[response.body.partidaId];
    assert.equal(result.operadorId, 'admin-web-panel');
    assert.equal(result.maiorCombo, 10);
    assert.equal(account.gamesPlayed, 1);
    assert.equal(broadcasts[0].event, 'rankingAtualizado');
    assert.equal(broadcasts[0].data.records[0].pontuacao, 1500);
    const second = post(payload);
    assert.notEqual(second.body.partidaId, response.body.partidaId);
});

test('painel salva pontuação de banda sem criar partida ou recorde individual', t => {
    const { post, postBand, read, broadcasts } = setup(t);
    const individual = post({ ...payload, bandaNome: 'Ignorada', bandaId: 'ignorada' });
    assert.equal(individual.statusCode, 201);
    assert.equal(read().accounts.ana.resultadosPartidas[individual.body.partidaId].banda, null);
    const membros = [
        { nome: 'Ana', instrumento: 'guitarra', pontuacao: 1000000 },
        { nome: 'Bia', instrumento: 'bateria', pontuacao: 1200000 },
    ];
    const response = postBand({ nome: 'Os Shredders', id: 'os-shredders', pontuacao: 4000000, membros });
    assert.equal(response.statusCode, 201);
    const bandRecord = Object.values(read().bandRecords)[0];
    assert.deepEqual(bandRecord.banda, { id: 'os-shredders', nome: 'Os Shredders' });
    assert.equal(bandRecord.pontuacao, 4000000);
    assert.deepEqual(bandRecord.membros, membros);
    assert.equal(read().accounts.ana.gamesPlayed, 1);
    assert.ok(broadcasts.at(-1).data.records.some(record => record.banda?.id === 'os-shredders' && record.instrumento === null));
    const automaticId = postBand({ nome: 'Banda São João', pontuacao: 50 });
    assert.equal(automaticId.statusCode, 201);
    assert.equal(Object.values(read().bandRecords).some(record => record.banda.id === 'banda-sao-joao'), true);
    assert.equal(postBand({ id: 'sem-nome', pontuacao: 50 }).statusCode, 400);
});

test('painel rejeita valores inválidos e conta desconhecida sem gravar ou publicar', t => {
    const { post, broadcasts, file } = setup(t);
    const before = fs.readFileSync(file, 'utf8');
    for (const patch of [{ pontuacao: -1 }, { comboMaximo: 11 }, { precisao: 101 }, { fullCombo: 'true' }, { notasErradas: 1 }, { instrumento: 'voz' }, { pontuacao: '1500' }]) {
        assert.equal(post({ ...payload, ...patch }).statusCode, 400);
    }
    assert.equal(post(undefined).statusCode, 400);
    assert.equal(post({ ...payload, username: 'nobody' }).statusCode, 404);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(broadcasts.length, 0);
});

test('falha de persistência retorna JSON de erro e não publica sucesso', t => {
    const { post, partidas, broadcasts } = setup(t);
    partidas.salvar = () => { throw new Error('disk failure'); };
    const response = post(payload);
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.ok, false);
    assert.equal(broadcasts.length, 0);
});

test('formulário envia números, mantém campos na falha e limpa somente no sucesso', async () => {
    const html = fs.readFileSync(path.join(__dirname, '../../docs/operador.html'), 'utf8');
    const fieldsByName = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, { value: String(value), valueAsNumber: typeof value === 'number' ? value : NaN, checked: value === true }]));
    fieldsByName.nickname = { value: 'Apelido novo' };
    fieldsByName.currentTitle = { value: 'Lenda' };
    fieldsByName.currency = { value: '25', valueAsNumber: 25 };
    fieldsByName.fase = { value: '', valueAsNumber: NaN };
    fieldsByName.favorita = { checked: false };
    fieldsByName.bandaNome = { value: '' };
    fieldsByName.bandaId = { value: '' };
    let submit, resets = 0, focused = false, succeed = false, requests = 0, htmlResponse = false;
    const nodes = {
        'operator-form': { elements: { namedItem: name => fieldsByName[name] }, reportValidity: () => true, addEventListener: (_, fn) => submit = fn, setAttribute() {}, removeAttribute() {}, reset: () => resets++ },
        'operator-fields': {}, 'operator-status': { dataset: {} }, 'save-result': {}, username: { focus: () => focused = true },
    };
    const ctx = vm.createContext({ document: { getElementById: id => nodes[id] }, fetch: async (_, options) => {
        requests++;
        assert.equal(JSON.parse(options.body).comboMaximo, 10);
        assert.equal(JSON.parse(options.body).fullCombo, true);
        assert.equal(JSON.parse(options.body).nickname, 'Apelido novo');
        assert.equal(JSON.parse(options.body).currentTitle, 'Lenda');
        assert.equal(JSON.parse(options.body).currency, 25);
        return {
            ok: succeed,
            status: htmlResponse ? 404 : succeed ? 201 : 500,
            headers: { get: () => htmlResponse ? 'text/html; charset=utf-8' : 'application/json' },
            json: async () => {
                assert.equal(htmlResponse, false, 'Não deve tentar interpretar HTML como JSON');
                return { ok: succeed, erro: 'Falha simulada.' };
            },
        };
    } });
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
    vm.runInContext(script, ctx);
    await submit({ preventDefault() {} });
    assert.equal(resets, 0);
    assert.equal(nodes['operator-status'].dataset.state, 'error');
    assert.equal(nodes['operator-fields'].disabled, false);
    htmlResponse = true;
    await submit({ preventDefault() {} });
    assert.equal(resets, 0);
    assert.equal(nodes['operator-status'].dataset.state, 'error');
    assert.match(nodes['operator-status'].textContent, /HTTP 404/);
    assert.match(nodes['operator-status'].textContent, /servidor Node.js/);
    assert.equal(nodes['operator-fields'].disabled, false);
    htmlResponse = false;
    succeed = true;
    await submit({ preventDefault() {} });
    assert.equal(resets, 1);
    assert.equal(focused, true);
    assert.equal(nodes['operator-status'].dataset.state, 'success');
    fieldsByName.comboMaximo.valueAsNumber = 11;
    await submit({ preventDefault() {} });
    assert.equal(requests, 3);
});

test('painel aplica perfil e ganho de moedas, guarda detalhes e preserva os recordes', t => {
    const { post, read, file } = setup(t);
    const root = read();
    Object.assign(root.accounts.ana, { currency: 100, avatar: 'foto.png', achievements: ['lenda_viva'] });
    fs.writeFileSync(file, JSON.stringify(root));
    const first = post({ ...payload, nickname: '  Ana Rock  ', currentTitle: 'Estrela', currency: 25 });
    assert.equal(first.statusCode, 201);
    let account = read().accounts.ana;
    assert.equal(account.currency, 125);
    assert.equal(account.nickname, 'Ana Rock');
    assert.equal(account.currentTitle, 'Estrela');
    assert.equal(account.avatar, 'foto.png');
    assert.ok(account.achievements.includes('lenda_viva'));
    assert.equal(account.resultadosPartidas[first.body.partidaId].currency, 25);
    const second = post({ ...payload, pontuacao: 500, precisao: 80, comboMaximo: undefined, maiorCombo: 4, notasAcertadas: 8, notasErradas: 2, fullCombo: false, nickname: '', currentTitle: '  ', currency: 0 });
    assert.equal(second.statusCode, 201);
    account = read().accounts.ana;
    assert.equal(account.currency, 125);
    assert.equal(account.nickname, 'Ana Rock');
    assert.equal(account.currentTitle, 'Estrela');
    assert.equal(account.lifetimeStats.totalNotesHit, 18);
    assert.equal(account.lifetimeStats.totalMisses, 2);
    assert.equal(account.instrumentStats.guitarra.maxScore, 1500);
    assert.equal(account.instrumentStats.guitarra.songsCompleted, 1);
    assert.equal(account.instrumentStats.guitarra.fullCombos, 1);
    const latest = account.resultadosPartidas[second.body.partidaId];
    for (const key of ['partidaId', 'pontuacao', 'precisao', 'maiorCombo', 'notasAcertadas', 'notasErradas', 'fullCombo', 'instrumento', 'musica']) {
        assert.equal(account.songRecords.Song[key], latest[key], key);
    }
    assert.equal(account.songRecords.Song.bestScore, 1500);
    assert.equal(account.songRecords.Song.plays, 2);
    assert.equal(account.songRecords.Song.updatedAt, account.updatedAt);
});

test('campos opcionais inválidos não alteram perfil, estatísticas nem ranking', t => {
    const { post, broadcasts, file } = setup(t);
    const original = fs.readFileSync(file, 'utf8');
    for (const patch of [{ currency: -1 }, { currency: 1.5 }, { currency: '25' }, { currency: null }, { currency: 1000000001 }, { nickname: 23 }, { nickname: 'a'.repeat(41) }, { currentTitle: null }, { currentTitle: 'a'.repeat(81) }]) {
        assert.equal(post({ ...payload, ...patch }).statusCode, 400);
    }
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.equal(broadcasts.length, 0);
});
