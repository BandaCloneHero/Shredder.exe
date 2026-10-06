const { INSTRUMENTOS, FASES_CAMPANHA } = require('./partidas');

// Retorna apenas contadores públicos, sem transportar o histórico inteiro.
// A leitura não concede conquistas: achievements continua sendo a autoridade.
function progressoConquistas(conta) {
    const desbloqueadas = new Set(conta.achievements || []);
    const stats = conta.instrumentStats || {};
    const numero = valor => Number.isFinite(valor) && valor > 0 ? valor : 0;
    const historico = Object.values(conta.resultadosPartidas || {}).filter(partida => partida && typeof partida === 'object');
    let concluidas = 0;
    const musicasFullCombo = new Set();
    const fasesMaximas = new Set();
    for (const partida of historico) {
        if (partida.concluida === false) continue;
        concluidas++;
        if (partida.fullCombo && partida.musica) musicasFullCombo.add(partida.musica);
        if (partida.modo === 'historia' && partida.bossDerrotado === true && partida.dificuldade === 'maxima' && FASES_CAMPANHA.includes(partida.fase)) fasesMaximas.add(partida.fase);
    }
    const saida = {};
    function contador(id, atual, meta, unidade) {
        const desbloqueada = desbloqueadas.has(id);
        const valor = desbloqueada ? meta : Math.min(meta, Math.max(0, numero(atual)));
        saida[id] = {
            atual: valor, meta, percentual: Math.round(valor / meta * 100), desbloqueada,
            tipo: 'contador', texto: `${valor}/${meta} ${unidade}`,
        };
    }
    contador('primeiros_acordes', concluidas, 1, 'partida concluída');
    contador('aquecimento', numero(conta.gamesPlayed), 5, 'partidas jogadas');
    contador('ritmo_de_ferro', Math.max(0, ...Object.values(conta.achievementProgress?.gamesByDay || {}).map(numero)), 10, 'partidas no melhor dia (UTC)');
    contador('especialista', musicasFullCombo.size, 10, 'músicas diferentes com Full Combo');
    contador('multi_instrumentista', INSTRUMENTOS.filter(id => numero(stats[id]?.songsCompleted) >= 1).length, INSTRUMENTOS.length, 'instrumentos');
    contador('perfeccionista', Math.max(0, ...INSTRUMENTOS.map(id => numero(stats[id]?.fullCombos))), 5, 'Full Combos no mesmo instrumento');
    const nomesInstrumentos = { guitarra: 'na guitarra', baixo: 'no baixo', bateria: 'na bateria', teclado: 'no teclado' };
    for (const instrumento of INSTRUMENTOS) contador(`mestre_${instrumento}`, numero(stats[instrumento]?.fullCombos), 5, `Full Combos ${nomesInstrumentos[instrumento]}`);
    contador('colecionador_de_fases', FASES_CAMPANHA.filter(fase => conta.fases?.desbloqueadas?.includes(fase)).length, FASES_CAMPANHA.length, 'fases desbloqueadas');
    contador('dono_do_palco', fasesMaximas.size, FASES_CAMPANHA.length, 'bosses derrotados na dificuldade máxima');
    contador('favorita_da_casa', FASES_CAMPANHA.filter(fase => conta.fases?.favoritas?.includes(fase)).length, FASES_CAMPANHA.length, 'fases favoritas');
    contador('maratonista', numero(conta.gamesPlayed), 50, 'partidas jogadas');
    contador('incansavel', numero(conta.gamesPlayed), 100, 'partidas jogadas');
    contador('lenda_viva', concluidas, 50, 'partidas concluídas');
    contador('desafinador_profissional', numero(conta.lifetimeStats?.totalMisses), 100, 'notas erradas');

    // Objetivos de uma execução não somam tentativas diferentes. Uma conquista
    // de banda ou de precisão fica pendente até sua concessão pelo servidor.
    const condicoes = {
        sem_errar_o_compasso: 'Conclua uma música sem pausar.',
        on_fire: 'Conclua uma música com Full Combo.',
        cirurgico: 'Conclua uma música com 100% de precisão.',
        no_limite: 'Conclua com pelo menos 99% e menos de 100% de precisão.',
        virada_insana: 'Conclua uma música com até 10% de energia.',
        banda_afinada: 'Jogue com quatro pessoas, uma em cada instrumento.',
        show_perfeito: 'Conclua em banda completa, com todos acima de 95% de precisão.',
        rei_do_ranking: 'Alcance o primeiro lugar na música e instrumento.',
        estrela_da_feira: 'Aguarde o encerramento da feira liderando um ranking.',
        tentativa_corajosa: 'Conclua uma música com menos de 50% de precisão.',
        quase_la: 'Conclua sem Full Combo, errando exatamente uma nota.',
        volta_por_cima: 'Supere seu recorde anterior do instrumento em pelo menos 25%.',
    };
    for (const [id, objetivo] of Object.entries(condicoes)) {
        const desbloqueada = desbloqueadas.has(id);
        saida[id] = {
            atual: Number(desbloqueada), meta: 1, percentual: desbloqueada ? 100 : 0,
            desbloqueada, tipo: id === 'estrela_da_feira' ? 'evento' : 'condicao',
            texto: desbloqueada ? 'Objetivo concluído' : objetivo,
        };
    }
    for (const id of ['estrela_da_feira', 'tentativa_corajosa', 'quase_la', 'desafinador_profissional']) {
        if (!desbloqueadas.has(id)) delete saida[id];
    }
    return saida;
}

module.exports = { progressoConquistas };
