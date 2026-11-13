const fs = require('fs');
const { randomUUID } = require('crypto');
const { gravarJsonAtomico, backupPrivado } = require('./persistencia-json');
const { validarNomeConta } = require('./operadores');
const { validarNomePublico } = require('./protecao-nomes');

const objeto = valor => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const uuid = valor => typeof valor === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(valor);
function erro(mensagem, status = 409) { return Object.assign(new Error(mensagem), { status }); }
function contasDaRaiz(raiz) {
    if (!objeto(raiz)) throw erro('Base de contas inválida.');
    if (Object.hasOwn(raiz, 'accounts')) {
        if (!objeto(raiz.accounts)) throw erro('Base de contas inválida.');
        return raiz.accounts;
    }
    return Object.fromEntries(Object.entries(raiz).filter(([key]) => !['bandRecords', 'fairAchievement'].includes(key)));
}
function identidadeGoogle(dados) {
    if (objeto(dados) && dados.provider === 'google') {
        if (Object.keys(dados).some(key => !['provider', 'sub'].includes(key)) ||
            typeof dados.sub !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(dados.sub)) {
            throw erro('Identidade Google inválida.', 400);
        }
        return { provider: 'google', sub: dados.sub };
    }
    // Read compatibility for existing Firebase bindings; never converted by email.

    if (!objeto(dados) || Object.keys(dados).some(key => !['projectId', 'uid'].includes(key)) ||
        typeof dados.projectId !== 'string' || !/^[a-z][a-z0-9-]{4,62}[a-z0-9]$/.test(dados.projectId) ||
        typeof dados.uid !== 'string' || !dados.uid.length || dados.uid.length > 128 || /[\x00-\x1f\x7f]/.test(dados.uid)) {
        throw erro('Identidade Google inválida.', 400);
    }
    return { projectId: dados.projectId, uid: dados.uid };
}
const campoGoogle = dados => dados.provider === 'google' ? 'google' : 'firebaseGoogle';
const chaveGoogle = dados => dados.provider === 'google' ? JSON.stringify(['google', dados.sub]) : JSON.stringify([dados.projectId, dados.uid]);

function validarIdentidades(raiz) {
    const ids = new Set(), google = new Set();
    for (const conta of Object.values(contasDaRaiz(raiz))) {
        if (!objeto(conta)) throw erro('Conta inválida.');
        if (Object.hasOwn(conta, 'accountId')) {
            if (!uuid(conta.accountId) || ids.has(conta.accountId)) throw erro('accountId inválido ou duplicado.');
            ids.add(conta.accountId);
        }
        if (!Object.hasOwn(conta, 'authProviders')) continue;
        if (!objeto(conta.authProviders)) throw erro('Estrutura authProviders inválida.');
        for (const provider of ['firebaseGoogle', 'google']) {
            if (!Object.hasOwn(conta.authProviders, provider)) continue;
            const vinculo = conta.authProviders[provider];
            const fields = provider === 'google' ? ['provider', 'sub', 'linkedAt'] : ['projectId', 'uid', 'linkedAt'];
            if (!objeto(vinculo) || Object.keys(vinculo).some(key => !fields.includes(key))) throw erro('Vínculo Google inválido.');
            const dados = provider === 'google' ? { provider: vinculo.provider, sub: vinculo.sub } : { projectId: vinculo.projectId, uid: vinculo.uid };
            const identidade = identidadeGoogle(dados);
            if (campoGoogle(identidade) !== provider || !uuid(conta.accountId) || typeof vinculo.linkedAt !== 'string' || !Number.isFinite(Date.parse(vinculo.linkedAt))) throw erro('Vínculo Google sem conta ou data válida.');
            const key = chaveGoogle(identidade);
            if (google.has(key)) throw erro('Identidade Google vinculada a mais de uma conta.');
            google.add(key);
        }
    }
}

// Bloqueia perda/troca de IDs e transferência/remoção de vínculos por outros escritores.
function validarPreservacaoIdentidades(anterior, nova) {
    validarIdentidades(anterior);
    validarIdentidades(nova);
    const antes = contasDaRaiz(anterior), depois = contasDaRaiz(nova);
    const porId = new Map(Object.values(depois).filter(c => c.accountId).map(c => [c.accountId, c]));
    for (const [key, conta] of Object.entries(antes)) {
        if (!conta.accountId) continue;
        const atual = porId.get(conta.accountId);
        if (!atual || (Object.hasOwn(depois, key) && depois[key].accountId !== conta.accountId)) {
            throw erro('accountId é imutável e a conta não pode ser removida.');
        }
        for (const provider of ['firebaseGoogle', 'google']) {
            if (conta.authProviders?.[provider] && JSON.stringify(conta.authProviders[provider]) !== JSON.stringify(atual.authProviders?.[provider])) {
                throw erro('Vínculo Google existente não pode ser alterado.');
            }
        }
    }
}

function criarPersistenciaIdentidades(arquivo, { inicializarPerfil, operadores = undefined } = {}) {
    const ler = () => { const raiz = JSON.parse(fs.readFileSync(arquivo, 'utf8')); validarIdentidades(raiz); return raiz; };
    const publicar = (anterior, raiz) => {
        validarPreservacaoIdentidades(anterior, raiz);
        gravarJsonAtomico(arquivo, raiz);
    };
    const localizar = (raiz, accountId) => {
        if (!uuid(accountId)) throw erro('accountId inválido.', 400);
        const entrada = Object.entries(contasDaRaiz(raiz)).find(([, c]) => c.accountId === accountId);
        return entrada ? { accountKey: entrada[0], account: entrada[1] } : null;
    };
    const porGoogle = (raiz, identidade) => {
        const entrada = Object.entries(contasDaRaiz(raiz)).find(([, c]) => {
            const g = c.authProviders?.[campoGoogle(identidade)];
            return g && chaveGoogle(g) === chaveGoogle(identidade);
        });
        return entrada ? { accountKey: entrada[0], account: entrada[1] } : null;
    };
    return {
        lerContas: ler,
        possuiVinculosFirebasePendentes() { return Object.values(contasDaRaiz(ler())).some(c => c.authProviders?.firebaseGoogle && !c.authProviders?.google); },
        localizarContaPorId(accountId) { return localizar(ler(), accountId); },
        localizarIdentidadeGoogle(dados) { const identidade = identidadeGoogle(dados); return porGoogle(ler(), identidade); },
        // Operação interna: o chamador deve comprovar identidade e autorização antes.
        vincularIdentidadeGoogle(accountId, dados) {
            const identidade = identidadeGoogle(dados), raiz = ler(), anterior = structuredClone(raiz);
            const alvo = localizar(raiz, accountId);
            if (!alvo) throw erro('Conta não encontrada. Migre as identidades antes de vincular.', 404);
            const existente = porGoogle(raiz, identidade);
            if (existente && existente.account.accountId !== accountId) throw erro('Identidade Google já vinculada a outra conta.');
            if (existente) return { raiz, ...alvo, duplicado: true };
            if (alvo.account.authProviders?.[campoGoogle(identidade)]) throw erro('Conta já vinculada a outra identidade Google.');
            alvo.account.authProviders ??= {};
            alvo.account.authProviders[campoGoogle(identidade)] = { ...identidade, linkedAt: new Date().toISOString() };
            publicar(anterior, raiz);
            return { raiz, ...alvo, duplicado: false };
        },
        // Não há rota Google nesta etapa. Identidade nunca é extraída de payload HTTP aqui.
        criarConta({ username, credenciais, google } = {}) {
            if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,24}$/.test(username) ||
                ['__proto__', 'constructor', 'prototype', 'bandrecords', 'fairachievement', 'accounts'].includes(username.toLowerCase())) {
                throw erro('Username inválido.', 400);
            }
            validarNomePublico(username, 'Nome de conta');
            validarNomeConta(username, null, operadores?.());
            const identidade = google === undefined ? null : identidadeGoogle(google);
            if (credenciais !== undefined && (!objeto(credenciais) || Object.keys(credenciais).some(k => !['salt', 'passwordHash'].includes(k)) ||
                typeof credenciais.salt !== 'string' || !credenciais.salt || typeof credenciais.passwordHash !== 'string' || !credenciais.passwordHash)) {
                throw erro('Credenciais locais inválidas.', 400);
            }
            if (!identidade && !credenciais) throw erro('Informe um método de autenticação.', 400);
            const raiz = fs.existsSync(arquivo) ? ler() : { accounts: {} }, anterior = structuredClone(raiz), contas = contasDaRaiz(raiz);
            // Vínculo existente tem precedência sobre escolha de outro nome: nunca cria perfil adicional.
            const existente = identidade && porGoogle(raiz, identidade);
            if (existente) return { raiz, ...existente, duplicado: true };
            const key = username.toLowerCase();
            if (Object.hasOwn(contas, key)) throw erro('Esse usuário já existe.');
            const account = inicializarPerfil({ username, ...(credenciais || {}), accountId: randomUUID(), authProviders: {} });
            if (identidade) account.authProviders[campoGoogle(identidade)] = { ...identidade, linkedAt: new Date().toISOString() };
            // O formato legado usa a própria raiz, não a cópia filtrada de contasDaRaiz.
            Object.defineProperty(raiz.accounts || raiz, key, { value: account, enumerable: true, configurable: true, writable: true });
            publicar(anterior, raiz);
            return { raiz, accountKey: key, account, duplicado: false };
        },
        migrarIdentidades({ autorizar = false } = {}) {
            if (autorizar !== true) throw erro('Migração exige autorização explícita e backup.', 403);
            const original = fs.readFileSync(arquivo, 'utf8'), raiz = JSON.parse(original), anterior = structuredClone(raiz);
            validarIdentidades(raiz);
            let atualizadas = 0;
            for (const conta of Object.values(contasDaRaiz(raiz))) {
                let mudou = false;
                if (!Object.hasOwn(conta, 'accountId')) { conta.accountId = randomUUID(); mudou = true; }
                if (!Object.hasOwn(conta, 'authProviders')) { conta.authProviders = {}; mudou = true; }
                if (mudou) atualizadas++;
            }
            validarPreservacaoIdentidades(anterior, raiz);
            if (!atualizadas) return { raiz, atualizadas: 0, backup: null };
            const backup = backupPrivado(arquivo, original);
            publicar(anterior, raiz);
            return { raiz, atualizadas, backup };
        },
    };
}
module.exports = { criarPersistenciaIdentidades, contasDaRaiz, validarIdentidades, validarPreservacaoIdentidades };
