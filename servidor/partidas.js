const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { CONQUISTAS, perfilPublico, revisaoPerfil, aplicarAjustesPerfil, erroPerfil } = require('./perfil-operador');
const INSTRUMENTOS = ['guitarra', 'baixo', 'bateria', 'teclado'];

// Compartilhado pelo cadastro e pelo salvamento de partidas de contas antigas.
// Completa apenas campos ausentes/nulos; não recria a conta nem suas credenciais.
function inicializarPerfil(conta, username = conta.username, timestamp = new Date().toISOString()) {
    const objeto = (alvo, chave) => {
        alvo[chave] ??= {};
        if (typeof alvo[chave] !== 'object' || Array.isArray(alvo[chave])) {
            throw new Error(`Estrutura de perfil inválida: ${chave}.`);
        }
        return alvo[chave];
    };
    conta.username ??= username;
    conta.nickname ??= conta.username;
    conta.avatar ??= '';
    conta.currency ??= 0;
    conta.gamesPlayed ??= 0;
    conta.currentTitle ??= 'Novato do Rock';
    conta.createdAt ??= timestamp;
    conta.updatedAt ??= timestamp;

    const lifetimeStats = objeto(conta, 'lifetimeStats');
    lifetimeStats.totalNotesHit ??= 0;
    lifetimeStats.totalMisses ??= 0;
    const instrumentStats = objeto(conta, 'instrumentStats');
    for (const instrumento of INSTRUMENTOS) {
        const stats = objeto(instrumentStats, instrumento);
        for (const campo of ['maxScore', 'maxCombo', 'bestAccuracy', 'songsCompleted', 'fullCombos']) {
            stats[campo] ??= 0;
        }
    }
    instrumentStats.favoriteInstrument ??= 'nenhum';
    // Listas antigas de músicas são convertidas por salvar(), preservando os registros.
    if (!Array.isArray(conta.songRecords)) objeto(conta, 'songRecords');
    objeto(conta, 'resultadosPartidas');
    conta.achievements ??= [];
    if (!Array.isArray(conta.achievements)) {
        throw new Error('Estrutura de perfil inválida: achievements.');
    }
    return conta;
}

function validarResultado(dados) {
    if (!dados || typeof dados !== 'object') throw new Error('Resultado inválido.');
    const texto = (valor, max) => typeof valor === 'string' && valor.trim().length > 0 && valor.length <= max;
    for (const [campo, limite] of Object.entries({ partidaId: 100, operadorId: 100, username: 24, musica: 200 })) {
        if (!texto(dados[campo], limite)) throw new Error(`Campo inválido: ${campo}.`);
    }
    const instrumento = typeof dados.instrumento === 'string' ? dados.instrumento.toLowerCase() : '';
    if (!INSTRUMENTOS.includes(instrumento)) throw new Error('Instrumento inválido.');
    // Limites de transporte plausíveis; ajustar ao catálogo real de músicas/pontuação.
    for (const [campo, max] of Object.entries({ pontuacao: 1e9, maiorCombo: 1e6, notasAcertadas: 1e6, notasErradas: 1e6 })) {
        if (!Number.isSafeInteger(dados[campo]) || dados[campo] < 0 || dados[campo] > max) throw new Error(`Campo inválido: ${campo}.`);
    }
    if (typeof dados.precisao !== 'number' || !Number.isFinite(dados.precisao) || dados.precisao < 0 || dados.precisao > 100) throw new Error('Precisão inválida (0–100).');
    if (typeof dados.fullCombo !== 'boolean' || dados.maiorCombo > dados.notasAcertadas || (dados.fullCombo && (dados.notasErradas !== 0 || dados.notasAcertadas === 0 || dados.maiorCombo !== dados.notasAcertadas))) throw new Error('Combo inconsistente.');
    let banda = null;
    if (dados.banda != null) {
        if (!texto(dados.banda.id, 100) || !texto(dados.banda.nome, 100)) throw new Error('Banda inválida.');
        banda = { id: dados.banda.id, nome: dados.banda.nome };
    }
    const perfil = {};
    for (const [campo, limite] of Object.entries({ nickname: 40, currentTitle: 80 })) {
        if (dados[campo] === undefined) continue;
        if (typeof dados[campo] !== 'string' || dados[campo].length > limite) {
            throw new Error(`Campo inválido: ${campo}.`);
        }
        // Campo opcional vazio não apaga o valor já cadastrado.
        if (dados[campo].trim()) perfil[campo] = dados[campo].trim();
    }
    if (dados.currency !== undefined) {
        if (!Number.isSafeInteger(dados.currency) || dados.currency < 0 || dados.currency > 1e9) {
            throw new Error('Moedas da sessão inválidas (inteiro de 0 a 1000000000).');
        }
        perfil.currency = dados.currency;
    }
    return { ...Object.fromEntries(['partidaId', 'operadorId', 'username', 'pontuacao', 'precisao', 'maiorCombo', 'fullCombo', 'notasAcertadas', 'notasErradas', 'musica'].map(k => [k, dados[k]])), instrumento, banda, ...perfil };
}

// TODO(produto): formalizar os critérios dos cinco IDs abaixo antes de ativá-los.
// on_fire segue o exemplo solicitado: full combo nesta partida.
const CRITERIOS_ACHIEVEMENTS = {
    primeiros_acordes: null,
    on_fire: (_conta, resultado) => resultado.fullCombo,
    cirurgico: null,
    perfeccionista: null,
    lenda_viva: null,
    desafinador_profissional: null,
};

function criarPersistenciaPartidas(arquivo) {
    const ler = () => JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const contas = raiz => raiz.accounts || raiz;
    const gravar = raiz => {
        const temporario = `${arquivo}.${randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporario, JSON.stringify(raiz, null, 2), { encoding: 'utf8', mode: 0o600 });
            fs.renameSync(temporario, arquivo);
        } finally {
            if (fs.existsSync(temporario)) fs.unlinkSync(temporario);
        }
    };
    const registros = raiz => Object.entries(contas(raiz)).flatMap(([username, conta]) => {
        const identidade = { jogadorId: username.toLowerCase(), nome: conta.username || username };
        const partidas = Object.values(conta.resultadosPartidas || {}).map(r => ({
            ...identidade,
            instrumento: r.instrumento[0].toUpperCase() + r.instrumento.slice(1),
            pontuacao: r.pontuacao, banda: r.banda,
            // Correções manuais de maxScore refletem no ranking individual;
            // bandas continuam somando as pontuações registradas nas partidas.
            pontuacaoIndividual: conta.instrumentStats?.[r.instrumento]?.maxScore ?? r.pontuacao,
        }));
        // Recordes locais anteriores à integração continuam aparecendo no ranking.
        // Sem histórico de banda não inventamos uma associação para esses recordes.
        for (const instrumento of INSTRUMENTOS) {
            const score = conta.instrumentStats?.[instrumento]?.maxScore;
            if (score > 0 && !partidas.some(r => r.instrumento.toLowerCase() === instrumento && r.pontuacao >= score)) {
                partidas.push({ ...identidade, instrumento, pontuacao: score, banda: null });
            }
        }
        return partidas;
    });
    return {
        lerPerfilOperador(username) {
            const raiz = ler();
            const key = String(username || '').trim().toLowerCase();
            if (!Object.hasOwn(contas(raiz), key)) throw erroPerfil('Conta não encontrada.', 404);
            const conta = contas(raiz)[key];
            const revisao = revisaoPerfil(conta);
            inicializarPerfil(conta, key);
            return { perfil: perfilPublico(conta), revisao, conquistas: CONQUISTAS };
        },
        editarPerfilOperador(username, alteracoes, revisao, credenciais) {
            const raiz = ler();
            const key = String(username || '').trim().toLowerCase();
            if (!Object.hasOwn(contas(raiz), key)) throw erroPerfil('Conta não encontrada.', 404);
            const conta = contas(raiz)[key];
            // Evita apagar uma partida/conquista salva depois que o formulário foi aberto.
            if (typeof revisao !== 'string' || revisao !== revisaoPerfil(conta)) {
                throw erroPerfil('O perfil mudou desde a leitura. Carregue novamente antes de salvar.', 409);
            }
            inicializarPerfil(conta, key);
            aplicarAjustesPerfil(conta, alteracoes);
            const novaKey = conta.username.toLowerCase();
            if (novaKey !== key && Object.hasOwn(contas(raiz), novaKey)) throw erroPerfil('Esse username já existe.', 409);
            if (credenciais) {
                // Recebido apenas do código do servidor, após scrypt; nunca do payload HTTP.
                conta.salt = credenciais.salt;
                conta.passwordHash = credenciais.passwordHash;
            }
            if (novaKey !== key) {
                Object.defineProperty(contas(raiz), novaKey, { value: conta, enumerable: true, configurable: true, writable: true });
                delete contas(raiz)[key];
            }
            conta.updatedAt = new Date().toISOString();
            gravar(raiz);
            return { raiz, records: registros(raiz), perfil: perfilPublico(conta), revisao: revisaoPerfil(conta), conquistas: CONQUISTAS, encerrarSessoes: credenciais || Object.hasOwn(alteracoes, 'username') ? key : null };
        },
        migrarContas() {
            const original = fs.readFileSync(arquivo, 'utf8');
            const raiz = JSON.parse(original);
            let atualizadas = 0;
            const timestamp = new Date().toISOString();
            // Apenas adiciona padrões ausentes. Não contabiliza partidas ou muda
            // updatedAt já existente. Toda a migração é validada antes de gravar.
            for (const [username, conta] of Object.entries(contas(raiz))) {
                if (!conta || typeof conta !== 'object' || Array.isArray(conta)) {
                    throw new Error('Conta inválida durante migração de perfis.');
                }
                const antes = JSON.stringify(conta);
                inicializarPerfil(conta, username, timestamp);
                if (JSON.stringify(conta) !== antes) atualizadas++;
            }
            let backup = null;
            if (atualizadas > 0) {
                const diretorio = path.join(path.dirname(arquivo), '.backups');
                fs.mkdirSync(diretorio, { recursive: true, mode: 0o700 });
                backup = path.join(diretorio, `accounts-${randomUUID()}.json`);
                fs.writeFileSync(backup, original, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
                gravar(raiz);
            }
            return { raiz, atualizadas, backup };
        },
        ranking: () => registros(ler()),
        salvar(payload) {
            const resultado = validarResultado(payload);
            // Região crítica síncrona, sem await: no único processo Node, duas partidas
            // não intercalam leitura/alteração/escrita. Vários workers exigiriam lock externo.
            // Releitura a cada operação; rename no mesmo diretório publica o JSON inteiro.
            const raiz = ler();
            const key = resultado.username.trim().toLowerCase();
            const conta = Object.hasOwn(contas(raiz), key) && contas(raiz)[key];
            if (!conta) throw new Error('Conta não encontrada.');
            const resultados = conta.resultadosPartidas || {};
            if (Object.hasOwn(resultados, resultado.partidaId)) {
                if (JSON.stringify(resultados[resultado.partidaId]) !== JSON.stringify(resultado)) throw new Error('ID de partida já usado com outro resultado.');
                return { raiz, records: registros(raiz), duplicado: true };
            }
            const timestamp = new Date().toISOString();
            inicializarPerfil(conta, resultado.username.trim(), timestamp);
            if (resultado.nickname !== undefined) conta.nickname = resultado.nickname;
            if (resultado.currentTitle !== undefined) {
                conta.currentTitle = resultado.currentTitle;
                if (Object.hasOwn(conta, 'tituloEquipado')) conta.tituloEquipado = resultado.currentTitle;
            }
            // currency no resultado representa ganho desta sessão, não o saldo total.
            // A checagem de partidaId acima impede crédito duplicado em reenvios.
            if (resultado.currency !== undefined) {
                const saldo = conta.moedas ?? conta.currency;
                if (!Number.isSafeInteger(saldo) || saldo < 0 || !Number.isSafeInteger(saldo + resultado.currency)) {
                    throw new Error('Saldo de moedas inválido ou acima do limite seguro.');
                }
                conta.currency = saldo + resultado.currency;
                if (Object.hasOwn(conta, 'moedas')) conta.moedas = conta.currency;
            }
            conta.gamesPlayed = (conta.gamesPlayed || 0) + 1;
            conta.lifetimeStats ||= {};
            conta.lifetimeStats.totalNotesHit = (conta.lifetimeStats.totalNotesHit || 0) + resultado.notasAcertadas;
            conta.lifetimeStats.totalMisses = (conta.lifetimeStats.totalMisses || 0) + resultado.notasErradas;
            conta.instrumentStats ||= {};
            const stats = conta.instrumentStats[resultado.instrumento] ||= {};
            stats.maxScore = Math.max(stats.maxScore || 0, resultado.pontuacao);
            stats.maxCombo = Math.max(stats.maxCombo || 0, resultado.maiorCombo);
            stats.bestAccuracy = Math.max(stats.bestAccuracy || 0, resultado.precisao);
            // fullCombos é um contador de execuções com full combo, nunca diminui.
            stats.fullCombos = (stats.fullCombos || 0) + Number(resultado.fullCombo);
            if (Array.isArray(conta.songRecords)) {
                conta.songRecords = Object.fromEntries(conta.songRecords.map(r => [r.musica, {
                    ...r, plays: r.plays ?? r.vezesJogada ?? 0,
                    bestScore: r.bestScore ?? r.melhorPontuacao ?? 0,
                    bestCombo: r.bestCombo ?? r.melhorCombo ?? 0,
                    bestAccuracy: r.bestAccuracy ?? r.melhorPrecisao ?? 0,
                }]));
            }
            conta.songRecords ||= {};
            const record = Object.hasOwn(conta.songRecords, resultado.musica) ? conta.songRecords[resultado.musica] : {};
            record.instrumentosCompletados ||= [];
            const primeira = !record.instrumentosCompletados.includes(resultado.instrumento);
            stats.songsCompleted = (stats.songsCompleted || 0) + Number(primeira);
            if (primeira) record.instrumentosCompletados.push(resultado.instrumento);
            record.plays = (record.plays || 0) + 1;
            record.bestScore = Math.max(record.bestScore || 0, resultado.pontuacao);
            record.bestCombo = Math.max(record.bestCombo || 0, resultado.maiorCombo);
            record.bestAccuracy = Math.max(record.bestAccuracy || 0, resultado.precisao);
            // Os detalhes abaixo descrevem a última execução desta música.
            // bestScore/bestCombo/bestAccuracy continuam sendo os recordes históricos;
            // cada execução completa permanece em resultadosPartidas[partidaId].
            for (const campo of ['nickname', 'currentTitle', 'currency']) delete record[campo];
            Object.assign(record, resultado, { updatedAt: timestamp });
            Object.defineProperty(conta.songRecords, resultado.musica, { value: record, enumerable: true, configurable: true, writable: true });
            const achievements = new Set(conta.achievements || []);
            for (const [id, criterio] of Object.entries(CRITERIOS_ACHIEVEMENTS)) if (criterio?.(conta, resultado)) achievements.add(id);
            conta.achievements = [...achievements];
            conta.updatedAt = timestamp;
            Object.defineProperty(resultados, resultado.partidaId, { value: resultado, enumerable: true, configurable: true, writable: true });
            conta.resultadosPartidas = resultados;
            gravar(raiz);
            return { raiz, records: registros(raiz), duplicado: false };
        },
    };
}
module.exports = { criarPersistenciaPartidas, validarResultado, inicializarPerfil };
