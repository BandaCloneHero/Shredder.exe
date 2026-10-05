const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { validarAvatarWebP, salvarArquivoAvatar } = require('../avatar-personalizado');
const { criarPersistenciaPartidas } = require('../partidas');
const image = fs.readFileSync(path.join(__dirname, '../../docs/images/avatars/beat-runner.webp'));

test('avatar usa miniatura WebP e rejeita tipos, tamanho, animação e dimensões inválidas', () => {
    assert.deepEqual(validarAvatarWebP(image), { width: 256, height: 256 });
    assert.throws(() => validarAvatarWebP(Buffer.from('<svg></svg>')));
    assert.throws(() => validarAvatarWebP(Buffer.alloc(129 * 1024)));
    assert.throws(() => validarAvatarWebP(image.subarray(0, image.length - 1)));
    const huge = Buffer.from(image);
    const vp8 = huge.indexOf(Buffer.from('VP8 '));
    huge.writeUInt16LE(4096, vp8 + 8 + 6);
    assert.throws(() => validarAvatarWebP(huge));
    const animated = Buffer.from(image);
    animated.write('ANIM', 12, 'ascii');
    assert.throws(() => validarAvatarWebP(animated));
});

test('salva imagem com nome gerado pelo servidor e atualiza somente o avatar da conta', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shredder-avatar-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'accounts.json');
    fs.writeFileSync(file, JSON.stringify({ accounts: { ana: { username: 'ana', currency: 10, achievements: ['on_fire'] }, bia: { username: 'bia' } } }));
    const avatar = salvarArquivoAvatar(image, path.join(directory, 'custom'));
    assert.match(avatar, /^custom\/[a-f0-9-]{36}$/);
    assert.deepEqual(fs.readFileSync(path.join(directory, avatar + '.webp')), image);
    const store = criarPersistenciaPartidas(file);
    store.salvarAvatarPersonalizado('ana', avatar);
    const saved = JSON.parse(fs.readFileSync(file));
    assert.equal(saved.accounts.ana.avatar, avatar);
    assert.equal(saved.accounts.ana.customAvatar, avatar);
    assert.equal(saved.accounts.ana.currency, 10);
    assert.deepEqual(saved.accounts.ana.achievements, ['on_fire']);
    assert.deepEqual(saved.accounts.bia, { username: 'bia' });
    assert.throws(() => store.salvarAvatarPersonalizado('ana', '../../image'));
});

test('endpoint exige operador oficial antes de processar o arquivo e ignora contas enviadas pelo cliente', () => {
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    let handlers, parsed = 0, saved;
    const context = vm.createContext({
        app: { post: (_route, ...middleware) => handlers = middleware },
        express: { raw: () => (_req, _res, next) => { parsed++; next(); } },
        session: null, getAuthenticatedSession: () => context.session,
        fs: { readFileSync: () => '["ana"]' }, path, __dirname,
        process: { env: {} }, normalizeUsername: value => String(value).toLowerCase(),
        salvarArquivoAvatar: () => 'custom/12345678-1234-1234-1234-123456789012',
        partidas: { salvarAvatarPersonalizado: (username, avatar) => { saved = username; return { raiz: { accounts: {} }, avatar, customAvatar: avatar }; } },
        accountStore: {},
    });
    vm.runInContext(source.slice(source.indexOf('function isOfficialOperator'), source.indexOf('app.post("/api/auth/register"')), context);
    vm.runInContext(source.slice(source.indexOf('app.post("/api/operador/avatar"'), source.indexOf('app.get("/api/loja/catalogo"')), context);
    function upload() {
        const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        let next = 0;
        const run = () => handlers[next++]?.({ body: { username: 'bia' } }, response, run);
        run();
        return response;
    }
    assert.equal(upload().code, 401);
    assert.equal(parsed, 0);
    context.session = { accountKey: 'bia', account: { username: 'bia' } };
    assert.equal(upload().code, 403);
    assert.equal(parsed, 0);
    context.session = { accountKey: 'ana', account: { username: 'ana' } };
    assert.equal(upload().code, 201);
    assert.equal(parsed, 1);
    assert.equal(saved, 'ana');
});

test('URL de avatar personalizado só aceita o identificador interno do arquivo', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../docs/js/account-ui.js'), 'utf8');
    const context = vm.createContext({});
    vm.runInContext(source.slice(0, source.indexOf('class ShredderAccountUI')), context);
    assert.equal(context.shredderAvatarUrl('custom/12345678-1234-1234-1234-123456789012'), 'images/avatars/custom/12345678-1234-1234-1234-123456789012.webp');
    for (const value of ['../custom/file', 'https://example.com/a', 'custom/../../file', 'javascript:alert(1)']) assert.equal(context.shredderAvatarUrl(value), '');
});
