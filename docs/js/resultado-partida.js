/* Integração Phaser: no callback real de término, chamar uma vez:
   await window.concluirMusica({ instrumento, pontuacao, precisao, maiorCombo,
       fullCombo, notasAcertadas, notasErradas, musica, banda });
   Precisão em 0–100; banda opcional: { id, nome }.
   Esta versão do repositório não contém a cena Phaser: não simulamos resultados.
*/
(() => {
    const status = document.getElementById('statusJogo');
    const retry = document.getElementById('sincronizar-resultado');
    const player = getPlayer();
    let resultadoDaCena = null;
    let sincronizando = false;
    getGameSocket();

    async function sincronizarPendentes() {
        if (sincronizando) return;
        sincronizando = true;
        retry.disabled = true;
        status.textContent = 'SINCRONIZANDO RESULTADO...';
        try {
            const pendentes = Object.values(readJson(PENDING_RESULTS_KEY, {}))
                .filter(r => r.username === player?.nome);
            for (const resultado of pendentes) await enviarPontuacaoParaRanking(resultado);
            status.textContent = 'RESULTADO SALVO // PERFIL E RANKING ATUALIZADOS';
            retry.hidden = true;
        } catch (error) {
            status.textContent = `FALHA AO SINCRONIZAR RESULTADO // ${error.message}`;
            retry.hidden = false;
        } finally {
            sincronizando = false;
            retry.disabled = false;
        }
    }

    window.concluirMusica = async (estatisticas) => {
        try {
            if (!player?.id || !player.nome) throw new Error('Jogador não identificado.');
            if (!estatisticas || typeof estatisticas !== 'object') throw new Error('Estatísticas reais da partida não recebidas.');
            // Um ID por término desta cena. Uma nova música deve abrir uma nova cena/página
            // ou fornecer seu próprio partidaId estável, criado no início da música.
            if (!resultadoDaCena || (estatisticas.partidaId && estatisticas.partidaId !== resultadoDaCena.partidaId)) {
                resultadoDaCena = {
                    partidaId: estatisticas.partidaId || crypto.randomUUID(),
                    operadorId: player.id, username: player.nome,
                    instrumento: estatisticas.instrumento || player.instrumento,
                    pontuacao: estatisticas.pontuacao, precisao: estatisticas.precisao,
                    maiorCombo: estatisticas.maiorCombo, fullCombo: estatisticas.fullCombo,
                    notasAcertadas: estatisticas.notasAcertadas,
                    notasErradas: estatisticas.notasErradas, musica: estatisticas.musica,
                    banda: estatisticas.banda ?? normalizeBand(player.banda),
                    // A cena pode informar estes dados opcionais para as
                    // conquistas contextuais, sem afetar jogos antigos.
                    pausada: estatisticas.pausada,
                    energiaFinal: estatisticas.energiaFinal,
                    dificuldade: estatisticas.dificuldade,
                };
            }
            const pendentes = readJson(PENDING_RESULTS_KEY, {});
            pendentes[resultadoDaCena.partidaId] = resultadoDaCena;
            writeJson(PENDING_RESULTS_KEY, pendentes);
            await sincronizarPendentes();
        } catch (error) {
            status.textContent = `FALHA AO SINCRONIZAR RESULTADO // ${error.message}`;
            retry.hidden = false;
        }
    };
    retry.addEventListener('click', () => {
        if (resultadoDaCena) window.concluirMusica(resultadoDaCena);
        else sincronizarPendentes();
    });
    if (Object.values(readJson(PENDING_RESULTS_KEY, {})).some(r => r.username === player?.nome)) {
        status.textContent = 'RESULTADO PENDENTE // SINCRONIZE PARA ATUALIZAR SEU PERFIL';
        retry.hidden = false;
    }
})();
