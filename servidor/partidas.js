const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { validarNomePublico } = require('./protecao-nomes');
const { CONQUISTAS, perfilPublico, revisaoPerfil, aplicarAjustesPerfil, erroPerfil } = require('./perfil-operador');
const INSTRUMENTOS = ['guitarra', 'baixo', 'bateria', 'teclado'];
const MAX_FASE = 100000;
const TOTAL_FASES_CAMPANHA = 5;
const ENCERRAMENTO_FEIRA = '2026-11-19T17:30:00-03:00';
const FASES_CAMPANHA = Array.from({ length: TOTAL_FASES_CAMPANHA }, (_, index) => index + 1);

function validarListaFases(valor, campo) {
    if (!Array.isArray(valor) || valor.some(fase => !Number.isSafeInteger(fase) || fase < 1 || fase > MAX_FASE)) {
        throw new Error(`Estrutura de perfil inválida: fases.${campo}.`);
    }
}

function completarFasesAnteriores(fases) {
    const maiorFase = Math.max(1, ...fases);
    return Array.from({ length: maiorFase }, (_, index) => index + 1);
}

// A estrutura fica no perfil, separada dos recordes de músicas. Assim uma música
// pode ter vários recordes sem que a seleção/progresso de campanha seja perdida.
function inicializarFases(conta) {
    conta.fases ??= {};
    if (typeof conta.fases !== 'object' || Array.isArray(conta.fases)) {
        throw new Error('Estrutura de perfil inválida: fases.');
    }
    conta.fases.desbloqueadas ??= [1];
    conta.fases.favoritas ??= [];
    conta.fases.concluidas ??= [];
    conta.fases.selecionada ??= null;
    conta.fases.historicoSelecionadas ??= [];
    validarListaFases(conta.fases.desbloqueadas, 'desbloqueadas');
    validarListaFases(conta.fases.favoritas, 'favoritas');
    validarListaFases(conta.fases.concluidas, 'concluidas');
    // Progresso de campanha é sequencial: liberar a fase N também implica que
    // todas as fases anteriores já foram liberadas.
    conta.fases.desbloqueadas = completarFasesAnteriores(conta.fases.desbloqueadas);
    if (conta.fases.selecionada !== null && (!Number.isSafeInteger(conta.fases.selecionada) || conta.fases.selecionada < 1 || conta.fases.selecionada > MAX_FASE)) {
        throw new Error('Estrutura de perfil inválida: fases.selecionada.');
    }
    if (!Array.isArray(conta.fases.historicoSelecionadas) || conta.fases.historicoSelecionadas.some(item =>
        !item || typeof item !== 'object' || !Number.isSafeInteger(item.fase) || item.fase < 1 || item.fase > MAX_FASE || typeof item.selecionadaEm !== 'string')) {
        throw new Error('Estrutura de perfil inválida: fases.historicoSelecionadas.');
    }
    return conta.fases;
}

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
    conta.customAvatar ??= '';
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
    conta.achievementNotifications ??= [];
    if (!Array.isArray(conta.achievementNotifications)) {
        throw new Error('Estrutura de perfil inválida: achievementNotifications.');
    }
    const progressoConquistas = objeto(conta, 'achievementProgress');
    // Diário compacto usado por conquistas de sequência. As partidas completas
    // continuam em resultadosPartidas; aqui só guardamos o total por dia.
    progressoConquistas.gamesByDay ??= {};
    if (typeof progressoConquistas.gamesByDay !== 'object' || Array.isArray(progressoConquistas.gamesByDay)) {
        throw new Error('Estrutura de perfil inválida: achievementProgress.gamesByDay.');
    }
    inicializarFases(conta);
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
    const modo = dados.modo === undefined ? (dados.fase === undefined ? 'freeplay' : 'historia') : dados.modo;
    if (!['freeplay', 'historia'].includes(modo)) throw new Error('Modo de jogo inválido.');
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
        if (dados[campo].trim()) {
            if (campo === 'nickname') validarNomePublico(dados[campo], 'Apelido');
            perfil[campo] = dados[campo].trim();
        }
    }
    if (dados.currency !== undefined) {
        if (!Number.isSafeInteger(dados.currency) || dados.currency < 0 || dados.currency > 1e9) {
            throw new Error('Moedas da sessão inválidas (inteiro de 0 a 1000000000).');
        }
        perfil.currency = dados.currency;
    }
    if (dados.fase !== undefined && (!Number.isSafeInteger(dados.fase) || dados.fase < 1 || dados.fase > MAX_FASE)) {
        throw new Error('Fase inválida.');
    }
    if (dados.favorita !== undefined && typeof dados.favorita !== 'boolean') throw new Error('Favorito de fase inválido.');
    if (dados.favorita !== undefined && dados.fase === undefined) throw new Error('Informe a fase ao alterar o favorito.');
    if (dados.pausada !== undefined && typeof dados.pausada !== 'boolean') throw new Error('Estado de pausa inválido.');
    if (dados.concluida !== undefined && typeof dados.concluida !== 'boolean') throw new Error('Conclusão de partida inválida.');
    if (dados.bossDerrotado !== undefined && typeof dados.bossDerrotado !== 'boolean') throw erroPerfil('Resultado do boss inválido.');
    if (dados.energiaFinal !== undefined && (!Number.isFinite(dados.energiaFinal) || dados.energiaFinal < 0 || dados.energiaFinal > 100)) throw new Error('Energia final inválida (0–100).');
    if (dados.dificuldade !== undefined && !['maxima', 'easy', 'medium', 'hard', 'expert', 'expertplus', 'beginner'].includes(dados.dificuldade)) throw new Error('Dificuldade inválida.');
    return {
        ...Object.fromEntries(['partidaId', 'operadorId', 'username', 'pontuacao', 'precisao', 'maiorCombo', 'fullCombo', 'notasAcertadas', 'notasErradas', 'musica'].map(k => [k, dados[k]])),
        instrumento, banda, modo, ...perfil,
        ...(dados.pausada === undefined ? {} : { pausada: dados.pausada }),
        ...(dados.concluida === undefined ? {} : { concluida: dados.concluida }),
        ...(dados.bossDerrotado === undefined ? {} : { bossDerrotado: dados.bossDerrotado }),
        ...(dados.energiaFinal === undefined ? {} : { energiaFinal: dados.energiaFinal }),
        ...(dados.dificuldade === undefined ? {} : { dificuldade: dados.dificuldade }),
        ...(dados.fase === undefined ? {} : { fase: dados.fase }),
        ...(dados.favorita === undefined ? {} : { favorita: dados.favorita }),
    };
}

function registrarFase(conta, fase, favorita, timestamp, desbloquearProxima = false) {
    if (fase === undefined) return;
    const fases = inicializarFases(conta);
    const desbloquear = valor => {
        if (!fases.desbloqueadas.includes(valor)) fases.desbloqueadas.push(valor);
    };
    desbloquear(fase);
    if (desbloquearProxima) {
        if (!fases.concluidas.includes(fase)) fases.concluidas.push(fase);
        if (fase < TOTAL_FASES_CAMPANHA) desbloquear(fase + 1);
        fases.concluidas.sort((a, b) => a - b);
    }
    fases.desbloqueadas = completarFasesAnteriores(fases.desbloqueadas);
    fases.selecionada = fase;
    fases.historicoSelecionadas.push({ fase, selecionadaEm: timestamp });
    // Mantém um histórico útil sem permitir que uma conta cresça indefinidamente.
    if (fases.historicoSelecionadas.length > 50) fases.historicoSelecionadas.splice(0, fases.historicoSelecionadas.length - 50);
    if (favorita === true && !fases.favoritas.includes(fase)) fases.favoritas.push(fase);
    if (favorita === false) fases.favoritas = fases.favoritas.filter(item => item !== fase);
    fases.favoritas.sort((a, b) => a - b);
}

const CRITERIOS_ACHIEVEMENTS = {
    primeiros_acordes: conta => Object.values(conta.resultadosPartidas).some(partida => partida.concluida !== false),
    aquecimento: conta => conta.gamesPlayed >= 5,
    ritmo_de_ferro: conta => Object.values(conta.achievementProgress.gamesByDay).some(total => total >= 10),
    sem_errar_o_compasso: (_conta, resultado) => resultado.pausada === false,
    on_fire: (_conta, resultado) => resultado.fullCombo,
    cirurgico: (_conta, resultado) => resultado.precisao === 100,
    no_limite: (_conta, resultado) => resultado.precisao >= 99 && resultado.precisao < 100,
    virada_insana: (_conta, resultado) => resultado.energiaFinal >= 0 && resultado.energiaFinal <= 10,
    especialista: (conta, resultado) => {
        const partidas = [...Object.values(conta.resultadosPartidas || {}), resultado];
        return new Set(partidas.filter(partida => partida.fullCombo && partida.concluida !== false).map(partida => partida.musica)).size >= 10;
    },
    multi_instrumentista: conta => INSTRUMENTOS.every(instrumento => conta.instrumentStats[instrumento].songsCompleted >= 1),
    perfeccionista: (conta, resultado) => conta.instrumentStats[resultado.instrumento].fullCombos >= 5,
    mestre_guitarra: conta => conta.instrumentStats.guitarra.fullCombos >= 5,
    mestre_baixo: conta => conta.instrumentStats.baixo.fullCombos >= 5,
    mestre_bateria: conta => conta.instrumentStats.bateria.fullCombos >= 5,
    mestre_teclado: conta => conta.instrumentStats.teclado.fullCombos >= 5,
    colecionador_de_fases: conta => FASES_CAMPANHA.every(fase => conta.fases.desbloqueadas.includes(fase)),
    dono_do_palco: (conta, resultado) => {
        const fasesConcluidas = new Set([...Object.values(conta.resultadosPartidas || {}), resultado]
            .filter(partida => partida.modo === 'historia' && FASES_CAMPANHA.includes(partida.fase) && partida.dificuldade === 'maxima' && partida.concluida !== false && partida.bossDerrotado === true)
            .map(partida => partida.fase));
        return FASES_CAMPANHA.every(fase => fasesConcluidas.has(fase));
    },
    favorita_da_casa: conta => FASES_CAMPANHA.every(fase => conta.fases.favoritas.includes(fase)),
    maratonista: conta => conta.gamesPlayed >= 50,
    incansavel: conta => conta.gamesPlayed >= 100,
    lenda_viva: conta => Object.values(conta.resultadosPartidas).filter(partida => partida.concluida !== false).length >= 50,
    desafinador_profissional: conta => conta.lifetimeStats.totalMisses >= 100,
    tentativa_corajosa: (_conta, resultado) => resultado.precisao < 50,
    quase_la: (_conta, resultado) => !resultado.fullCombo && resultado.notasErradas === 1,
    volta_por_cima: (_conta, resultado, contexto) => contexto.pontuacaoAnterior > 0 && resultado.pontuacao >= contexto.pontuacaoAnterior * 1.25,
};

function registrarNotificacoesConquistas(conta, ids, timestamp = new Date().toISOString()) {
    const notificacoes = ids.map(conquistaId => ({ id: randomUUID(), conquistaId, criadaEm: timestamp }));
    conta.achievementNotifications.push(...notificacoes);
    return notificacoes;
}

function desbloquearConquistas(conta, ids, timestamp) {
    const anteriores = new Set(conta.achievements);
    const novasConquistas = [...new Set(ids)].filter(id => !anteriores.has(id));
    conta.achievements.push(...novasConquistas);
    return { novasConquistas, notificacoesConquistas: registrarNotificacoesConquistas(conta, novasConquistas, timestamp) };
}

function validarMembrosBanda(membrosEnviados) {
    const texto = (valor, max) => typeof valor === 'string' && valor.trim().length > 0 && valor.length <= max;
    if (!Array.isArray(membrosEnviados) || membrosEnviados.length > INSTRUMENTOS.length) {
        throw erroPerfil('Integrantes da banda inválidos.');
    }
    const membros = membrosEnviados.map(membro => {
        if (!texto(membro?.nome, 100) || !INSTRUMENTOS.includes(membro.instrumento) ||
            !Number.isSafeInteger(membro.pontuacao) || membro.pontuacao < 0 || membro.pontuacao > 1e9) {
            throw erroPerfil('Integrante da banda inválido.');
        }
        if (membro.precisao !== undefined && (!Number.isFinite(membro.precisao) || membro.precisao < 0 || membro.precisao > 100)) throw erroPerfil('Precisão de integrante inválida.');
        if (membro.concluida !== undefined && typeof membro.concluida !== 'boolean') throw erroPerfil('Conclusão de integrante inválida.');
        return {
            nome: membro.nome.trim(), instrumento: membro.instrumento, pontuacao: membro.pontuacao,
            ...(membro.precisao === undefined ? {} : { precisao: membro.precisao }),
            ...(membro.concluida === undefined ? {} : { concluida: membro.concluida }),
        };
    });
    return membros;
}

function premiarBanda(raiz, membros, contas) {
    const bandaCompleta = membros.length === INSTRUMENTOS.length &&
        INSTRUMENTOS.every(instrumento => membros.some(membro => membro.instrumento === instrumento)) &&
        new Set(membros.map(membro => membro.nome.toLowerCase())).size === INSTRUMENTOS.length;
    const notificacoesPorJogador = [];
    if (bandaCompleta) {
        const ids = ['banda_afinada'];
        if (membros.every(membro => membro.precisao > 95 && membro.concluida !== false)) ids.push('show_perfeito');
        for (const membro of membros) {
            const key = membro.nome.toLowerCase();
            const conta = contas(raiz)[key];
            if (!conta) continue;
            inicializarPerfil(conta, key);
            const timestamp = new Date().toISOString();
            const conquistas = desbloquearConquistas(conta, ids, timestamp);
            if (!conquistas.novasConquistas.length) continue;
            conta.updatedAt = timestamp;
            notificacoesPorJogador.push({ username: conta.username, ...conquistas });
        }
    }
    return notificacoesPorJogador;
}

function criarPersistenciaPartidas(arquivo, { encerramentoFeira = ENCERRAMENTO_FEIRA } = {}) {
    const fimFeira = Date.parse(encerramentoFeira);
    if (!Number.isFinite(fimFeira)) throw new Error('Data de encerramento da feira inválida.');
    let feiraPremiada = false;
    const ler = () => JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const contas = raiz => raiz.accounts || Object.fromEntries(
        Object.entries(raiz).filter(([chave]) => !['bandRecords', 'fairAchievement'].includes(chave)),
    );
    const gravar = raiz => {
        const temporario = `${arquivo}.${randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporario, JSON.stringify(raiz, null, 2), { encoding: 'utf8', mode: 0o600 });
            fs.renameSync(temporario, arquivo);
        } finally {
            if (fs.existsSync(temporario)) fs.unlinkSync(temporario);
        }
    };
    const registros = raiz => {
        const individuais = Object.entries(contas(raiz)).flatMap(([username, conta]) => {
        const identidade = { jogadorId: username.toLowerCase(), nome: conta.username || username };
        const partidas = Object.values(conta.resultadosPartidas || {}).map(r => ({
            ...identidade,
            instrumento: r.instrumento[0].toUpperCase() + r.instrumento.slice(1),
            musica: r.musica,
            modo: r.modo || (r.fase == null ? 'freeplay' : 'historia'),
            fase: r.fase,
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
        const bandas = Object.values(raiz.bandRecords || {}).map(registro => ({
            jogadorId: null,
            nome: registro.banda.nome,
            instrumento: null,
            musica: registro.musica,
            modo: registro.modo || 'freeplay',
            pontuacao: registro.pontuacao,
            banda: registro.banda,
            membros: registro.membros || [],
        }));
        return [...individuais, ...bandas];
    };
    return {
        salvarAvatarPersonalizado(username, avatar) {
            if (typeof avatar !== 'string' || !/^custom\/[a-f0-9-]{36}$/.test(avatar)) throw erroPerfil('Avatar personalizado inválido.');
            const raiz = ler();
            const key = String(username || '').trim().toLowerCase();
            const conta = contas(raiz)[key];
            if (!conta) throw erroPerfil('Conta não encontrada.', 404);
            inicializarPerfil(conta, key);
            conta.avatar = avatar;
            conta.customAvatar = avatar;
            conta.updatedAt = new Date().toISOString();
            gravar(raiz);
            return { raiz, avatar, customAvatar: avatar };
        },
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
            const conquistasAnteriores = new Set(conta.achievements);
            aplicarAjustesPerfil(conta, alteracoes);
            const novasConquistas = conta.achievements.filter(id => !conquistasAnteriores.has(id));
            const notificacoesConquistas = registrarNotificacoesConquistas(conta, novasConquistas);
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
            return {
                raiz,
                records: registros(raiz),
                perfil: perfilPublico(conta),
                revisao: revisaoPerfil(conta),
                conquistas: CONQUISTAS,
                novasConquistas,
                notificacoesConquistas,
                encerrarSessoes: credenciais || Object.hasOwn(alteracoes, 'username') ? key : null,
            };
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
        conquistasPendentes(username) {
            const raiz = ler();
            const key = String(username || '').trim().toLowerCase();
            const conta = contas(raiz)[key];
            if (!conta) return [];
            inicializarPerfil(conta, key);
            return conta.achievementNotifications.map(notificacao => ({ ...notificacao }));
        },
        confirmarConquistasExibidas(username, ids) {
            if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || id.length > 100)) {
                throw erroPerfil('Confirmação de conquistas inválida.');
            }
            const raiz = ler();
            const key = String(username || '').trim().toLowerCase();
            const conta = contas(raiz)[key];
            if (!conta) return false;
            inicializarPerfil(conta, key);
            const confirmadas = new Set(ids);
            const pendentes = conta.achievementNotifications;
            conta.achievementNotifications = pendentes.filter(notificacao => !confirmadas.has(notificacao.id));
            if (conta.achievementNotifications.length !== pendentes.length) gravar(raiz);
            return true;
        },
        ranking: () => registros(ler()),
        encerrarFeira(agora = new Date()) {
            const timestamp = new Date(agora).toISOString();
            if (Date.parse(timestamp) < fimFeira) return { encerrada: false, notificacoesPorJogador: [] };
            if (feiraPremiada) return { encerrada: true, duplicado: true, notificacoesPorJogador: [] };
            const raiz = ler();
            if (raiz.fairAchievement) {
                feiraPremiada = true;
                return { encerrada: true, duplicado: true, notificacoesPorJogador: [] };
            }
            const escopos = new Map();
            for (const registro of registros(raiz)) {
                if (!registro.musica) continue;
                const modo = registro.modo || 'freeplay';
                const key = JSON.stringify([modo, registro.musica]);
                const escopo = escopos.get(key) || { modo, musica: registro.musica, ranking: [] };
                escopo.ranking.push(registro);
                escopos.set(key, escopo);
            }
            const vencedores = new Set();
            const lideres = [];
            const ordenar = (a, b) => b.pontuacao - a.pontuacao || a.nome.localeCompare(b.nome);
            for (const { ranking, modo, musica } of escopos.values()) {
                for (const instrumento of INSTRUMENTOS) {
                    const candidatos = ranking.filter(item => item.jogadorId && item.instrumento?.toLowerCase() === instrumento)
                        .map(item => ({ nome: item.nome, key: item.jogadorId, pontuacao: item.pontuacaoIndividual ?? item.pontuacao }))
                        .filter(item => item.pontuacao > 0).sort(ordenar);
                    if (!candidatos.length) continue;
                    vencedores.add(candidatos[0].key);
                    lideres.push({ ranking: instrumento, modo, musica, username: candidatos[0].nome, pontuacao: candidatos[0].pontuacao });
                }
                const bandas = new Map();
                for (const item of ranking) {
                    if (!item.banda) continue;
                    const grupo = bandas.get(item.banda.id) || { nome: item.banda.nome, explicita: -1, membros: new Map(), integrantes: [] };
                    if (!item.jogadorId && item.pontuacao > grupo.explicita) {
                        grupo.explicita = item.pontuacao;
                        grupo.integrantes = item.membros || [];
                    } else if (item.jogadorId && item.pontuacao > (grupo.membros.get(item.jogadorId)?.pontuacao ?? -1)) {
                        grupo.membros.set(item.jogadorId, { nome: item.nome, pontuacao: item.pontuacao });
                    }
                    bandas.set(item.banda.id, grupo);
                }
                const rankingBandas = [...bandas.values()].map(banda => ({
                    nome: banda.nome,
                    pontuacao: banda.explicita >= 0 ? banda.explicita : [...banda.membros.values()].reduce((total, item) => total + item.pontuacao, 0),
                    membros: banda.explicita >= 0 ? banda.integrantes : [...banda.membros.values()],
                })).filter(item => item.pontuacao > 0).sort(ordenar);
                if (rankingBandas.length) {
                    for (const membro of rankingBandas[0].membros) vencedores.add(membro.nome.toLowerCase());
                    lideres.push({ ranking: 'bandas', modo, musica, banda: rankingBandas[0].nome, pontuacao: rankingBandas[0].pontuacao });
                }
            }
            const notificacoesPorJogador = [];
            for (const key of vencedores) {
                const conta = contas(raiz)[key];
                if (!conta) continue;
                inicializarPerfil(conta, key);
                const conquistas = desbloquearConquistas(conta, ['estrela_da_feira'], timestamp);
                if (conquistas.novasConquistas.length) {
                    conta.updatedAt = timestamp;
                    notificacoesPorJogador.push({ username: conta.username, ...conquistas });
                }
            }
            raiz.fairAchievement = { encerramento: new Date(fimFeira).toISOString(), processadoEm: timestamp, lideres };
            gravar(raiz);
            feiraPremiada = true;
            return { raiz, encerrada: true, notificacoesPorJogador };
        },
        selecionarFase(username, fase) {
            if (!FASES_CAMPANHA.includes(fase)) throw erroPerfil('Fase inválida.');
            const raiz = ler();
            const key = String(username || '').trim().toLowerCase();
            if (!Object.hasOwn(contas(raiz), key)) throw erroPerfil('Conta não encontrada.', 404);
            const conta = contas(raiz)[key];
            const timestamp = new Date().toISOString();
            inicializarPerfil(conta, key, timestamp);
            if (!conta.fases.desbloqueadas.includes(fase)) throw erroPerfil('Derrote o boss da fase anterior para liberar esta fase.', 403);
            registrarFase(conta, fase, undefined, timestamp);
            const ids = CRITERIOS_ACHIEVEMENTS.colecionador_de_fases(conta) ? ['colecionador_de_fases'] : [];
            const conquistas = desbloquearConquistas(conta, ids, timestamp);
            conta.updatedAt = timestamp;
            gravar(raiz);
            return { raiz, fases: conta.fases, ...conquistas };
        },
        favoritarFase(username, fase, favorita) {
            if (!FASES_CAMPANHA.includes(fase) || typeof favorita !== 'boolean') throw erroPerfil('Favorito de fase inválido.');
            const raiz = ler();
            const key = String(username || '').trim().toLowerCase();
            const conta = contas(raiz)[key];
            if (!conta) throw erroPerfil('Conta não encontrada.', 404);
            inicializarPerfil(conta, key);
            if (!conta.fases.desbloqueadas.includes(fase)) throw erroPerfil('A fase ainda não foi desbloqueada.', 403);
            if (favorita && !conta.fases.favoritas.includes(fase)) conta.fases.favoritas.push(fase);
            if (!favorita) conta.fases.favoritas = conta.fases.favoritas.filter(item => item !== fase);
            conta.fases.favoritas.sort((a, b) => a - b);
            const timestamp = new Date().toISOString();
            const ids = CRITERIOS_ACHIEVEMENTS.favorita_da_casa(conta) ? ['favorita_da_casa'] : [];
            const conquistas = desbloquearConquistas(conta, ids, timestamp);
            conta.updatedAt = timestamp;
            gravar(raiz);
            return { raiz, fases: conta.fases, ...conquistas };
        },
        registrarParticipacaoBanda(membrosEnviados) {
            const membros = validarMembrosBanda(membrosEnviados);
            const raiz = ler();
            const notificacoesPorJogador = premiarBanda(raiz, membros, contas);
            if (notificacoesPorJogador.length) gravar(raiz);
            return { raiz, notificacoesPorJogador };
        },
        salvarPontuacaoBanda(payload) {
            if (!payload || typeof payload !== 'object') throw erroPerfil('Pontuação de banda inválida.');
            const texto = (valor, max) => typeof valor === 'string' && valor.trim().length > 0 && valor.length <= max;
            if (!texto(payload.partidaId, 100) || !texto(payload.banda?.id, 100) || !texto(payload.banda?.nome, 100)) {
                throw erroPerfil('Banda inválida.');
            }
            if (!Number.isSafeInteger(payload.pontuacao) || payload.pontuacao < 0 || payload.pontuacao > 4e9) {
                throw erroPerfil('Pontuação de banda inválida.');
            }
            if (payload.musica !== undefined && !texto(payload.musica, 200)) throw erroPerfil('Música da banda inválida.');
            if (payload.modo !== undefined && !['freeplay', 'historia'].includes(payload.modo)) throw erroPerfil('Modo da banda inválido.');
            const membros = validarMembrosBanda(payload.membros ?? []);
            const raiz = ler();
            raiz.bandRecords ??= {};
            if (typeof raiz.bandRecords !== 'object' || Array.isArray(raiz.bandRecords)) throw erroPerfil('Registros de bandas inválidos.');
            if (Object.hasOwn(raiz.bandRecords, payload.partidaId)) {
                const existente = raiz.bandRecords[payload.partidaId];
                const mesmaPontuacao = existente.banda?.id === payload.banda.id.trim() &&
                    existente.banda?.nome === payload.banda.nome.trim() && existente.musica === payload.musica?.trim() &&
                    existente.modo === payload.modo && existente.pontuacao === payload.pontuacao &&
                    JSON.stringify(existente.membros || []) === JSON.stringify(membros);
                if (!mesmaPontuacao) throw erroPerfil('ID de pontuação de banda já usado.', 409);
                return { raiz, records: registros(raiz), duplicado: true, notificacoesPorJogador: [] };
            }
            raiz.bandRecords[payload.partidaId] = {
                partidaId: payload.partidaId,
                banda: { id: payload.banda.id.trim(), nome: payload.banda.nome.trim() },
                pontuacao: payload.pontuacao,
                membros,
                ...(payload.musica === undefined ? {} : { musica: payload.musica.trim() }),
                ...(payload.modo === undefined ? {} : { modo: payload.modo }),
                createdAt: new Date().toISOString(),
            };
            const notificacoesPorJogador = premiarBanda(raiz, membros, contas);
            gravar(raiz);
            return { raiz, records: registros(raiz), notificacoesPorJogador };
        },
        salvar(payload, { origemExecutavel = false } = {}) {
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
                return { raiz, records: registros(raiz), duplicado: true, novasConquistas: [] };
            }
            const timestamp = new Date().toISOString();
            inicializarPerfil(conta, resultado.username.trim(), timestamp);
            // Somente o resultado do executável confirmado no ticket pode
            // comprovar a vitória. Terminar a música sozinho não libera fases.
            if (resultado.bossDerrotado === true && !origemExecutavel) throw erroPerfil('A vitória sobre o boss precisa ser confirmada pelo resultado do executável.', 403);
            if (resultado.modo === 'historia') {
                if (!FASES_CAMPANHA.includes(resultado.fase)) throw erroPerfil('Informe uma fase válida da campanha.');
                if (!conta.fases.desbloqueadas.includes(resultado.fase)) throw erroPerfil('A fase ainda está bloqueada para este jogador.', 403);
                registrarFase(conta, resultado.fase, resultado.favorita, timestamp,
                    origemExecutavel && resultado.bossDerrotado === true && resultado.concluida !== false);
                if (origemExecutavel) conta.fases.ultimaBatalha = {
                    fase: resultado.fase, partidaId: resultado.partidaId,
                    bossDerrotado: resultado.bossDerrotado ?? null,
                    venceu: resultado.bossDerrotado === true && resultado.concluida !== false,
                    registradaEm: timestamp,
                };
            }
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
            const diaDaPartida = timestamp.slice(0, 10);
            conta.achievementProgress.gamesByDay[diaDaPartida] = (conta.achievementProgress.gamesByDay[diaDaPartida] || 0) + 1;
            conta.instrumentStats ||= {};
            const stats = conta.instrumentStats[resultado.instrumento] ||= {};
            const pontuacaoAnterior = stats.maxScore || 0;
            stats.maxScore = Math.max(stats.maxScore || 0, resultado.pontuacao);
            stats.maxCombo = Math.max(stats.maxCombo || 0, resultado.maiorCombo);
            stats.bestAccuracy = Math.max(stats.bestAccuracy || 0, resultado.precisao);
            // fullCombos é um contador de execuções com full combo, nunca diminui.
            stats.fullCombos = (stats.fullCombos || 0) + Number(resultado.fullCombo && resultado.concluida !== false);
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
            const primeira = resultado.concluida !== false && !record.instrumentosCompletados.includes(resultado.instrumento);
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
            // Inclui a partida atual na consulta das conquistas que olham o
            // histórico, sem modificar seu formato público no accounts.json.
            Object.defineProperty(resultados, resultado.partidaId, { value: resultado, enumerable: true, configurable: true, writable: true });
            conta.resultadosPartidas = resultados;
            const achievementsAnteriores = new Set(conta.achievements || []);
            const achievements = new Set(achievementsAnteriores);
            for (const [id, criterio] of Object.entries(CRITERIOS_ACHIEVEMENTS)) {
                if (resultado.concluida === false && ['sem_errar_o_compasso', 'on_fire', 'cirurgico', 'no_limite', 'virada_insana', 'tentativa_corajosa', 'quase_la', 'volta_por_cima'].includes(id)) continue;
                if (criterio?.(conta, resultado, { pontuacaoAnterior })) achievements.add(id);
            }
            const melhorDoInstrumento = Math.max(
                0,
                ...registros(raiz)
                    .filter(registro => registro.jogadorId && registro.instrumento?.toLowerCase() === resultado.instrumento && registro.musica === resultado.musica && registro.modo === resultado.modo)
                    .map(registro => registro.pontuacaoIndividual ?? registro.pontuacao),
            );
            if (stats.maxScore > 0 && stats.maxScore >= melhorDoInstrumento) achievements.add('rei_do_ranking');
            conta.achievements = [...achievements];
            const novasConquistas = conta.achievements.filter(id => !achievementsAnteriores.has(id));
            const notificacoesConquistas = registrarNotificacoesConquistas(conta, novasConquistas, timestamp);
            conta.updatedAt = timestamp;
            gravar(raiz);
            return { raiz, records: registros(raiz), duplicado: false, novasConquistas, notificacoesConquistas };
        },
    };
}
module.exports = { criarPersistenciaPartidas, validarResultado, inicializarPerfil, inicializarFases, ENCERRAMENTO_FEIRA, INSTRUMENTOS, FASES_CAMPANHA };
