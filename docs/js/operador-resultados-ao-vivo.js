(() => {
    const status = document.getElementById('incoming-results-status');
    const ticketList = document.getElementById('incoming-ticket-list');
    const matchList = document.getElementById('incoming-match-list');
    const clearResultsButton = document.getElementById('clear-recent-results');
    if (!status || !ticketList || !matchList || !clearResultsButton) return;

    const socket = window.socket || (window.socket = io());
    const ticketCards = new Map();
    const receivedMatches = new Set();
    let monitorRequest = 0;
    let ticketOrder = [];

    function displayTicket(ticket) {
        if (!ticket?.ticketId) return;
        let card = ticketCards.get(ticket.ticketId);
        if (!card) {
            card = document.createElement('article');
            card.className = 'incoming-result';
            ticketCards.set(ticket.ticketId, card);
        }
        card.replaceChildren();
        const position = ticketOrder.indexOf(ticket.ticketId) + 1;
        const heading = document.createElement('header');
        const title = document.createElement('strong');
        title.textContent = `FILA ${position > 0 ? position : '—'} // ${ticket.roomName || 'TICKET DE SESSÃO'}`;
        const time = document.createElement('span');
        time.textContent = ticket.emitidoEm
            ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ticket.emitidoEm))
            : 'AGORA';
        heading.append(title, time);
        card.append(heading);

        const mode = ticket.modo || {};
        const facts = document.createElement('dl');
        for (const [label, value] of [
            ['CÓDIGO DA SALA', ticket.roomId],
            ['MODO', mode.tipo === 'historia' ? `HISTÓRIA · FASE ${mode.fase}` : 'FREEPLAY'],
            ['STATUS', ticket.resultadosExecutavel ? 'AGUARDANDO CONFIRMAÇÃO' : 'AGUARDANDO RESULTADO'],
            ['MÚSICA', ticket.musica || '—'],
            ['BANDA', ticket.banda?.nome || 'SEM BANDA'],
            ...(mode.tipo === 'historia' && ticket.resultadosExecutavel ? [['BOSS', ticket.bossDerrotado === true ? 'DERROTADO · avanço após confirmação' : ticket.bossDerrotado === false ? 'NÃO DERROTADO · repetir fase' : 'VITÓRIA NÃO INFORMADA · fase bloqueada']] : []),
            ...(ticket.resultadosExecutavel && ticket.banda ? [['PONTUAÇÃO TOTAL DA BANDA', Number(ticket.pontuacaoBanda ?? ticket.resultadosExecutavel.reduce((total, item) => total + item.pontuacao, 0)).toLocaleString('pt-BR')]] : []),
        ]) {
            const group = document.createElement('div');
            const term = document.createElement('dt'); term.textContent = label;
            const description = document.createElement('dd'); description.textContent = value ?? '—';
            group.append(term, description); facts.append(group);
        }
        card.append(facts);

        const rosterTitle = document.createElement('p');
        rosterTitle.className = 'eyebrow';
        rosterTitle.textContent = ticket.resultadosExecutavel ? 'REVISÃO DAS PONTUAÇÕES' : 'JOGADORES DO TICKET';
        card.append(rosterTitle);
        const roster = document.createElement('div');
        for (const player of ticket.jogadores || []) {
            const instrumento = String(player.instrumento || 'sem instrumento').toUpperCase();
            const resultado = ticket.resultadosExecutavel?.find((item) => {
                const nome = String(item.perfil?.instrumento || '').toLowerCase();
                return nome === String(player.instrumento || '').toLowerCase() ||
                    (nome.includes('guitar') && instrumento === 'GUITARRA') ||
                    (nome.includes('bass') && instrumento === 'BAIXO') ||
                    (nome.includes('drum') && instrumento === 'BATERIA') ||
                    (nome.includes('key') && instrumento === 'TECLADO');
            });
            const row = document.createElement('p');
            row.className = 'operator-help';
            row.textContent = resultado
                ? `${player.nome} · ${instrumento} · ${Number(resultado.pontuacao).toLocaleString('pt-BR')} pontos · ${resultado.precisao}% · combo ${resultado.maiorCombo}${resultado.fullCombo ? ' · FULL COMBO' : ''}`
                : `${player.nome} · ID ${player.id} · ${instrumento}`;
            roster.append(row);
        }
        card.append(roster);

        const token = localStorage.getItem('shredder.account.token.v1');
        if (ticket.resultadosExecutavel) {
            const confirmButton = document.createElement('button');
            confirmButton.type = 'button';
            confirmButton.className = 'button';
            confirmButton.textContent = position === 1 ? 'Confirmar pontuações' : 'Aguardando ticket anterior';
            confirmButton.disabled = position !== 1;
            confirmButton.addEventListener('click', () => {
                confirmButton.disabled = true;
                confirmButton.textContent = 'Salvando resultados...';
                socket.timeout(15000).emit('confirmar_resultados_ticket', { token, ticketId: ticket.ticketId }, (error, response) => {
                    if (error || !response?.ok) {
                        status.textContent = response?.erro || 'Não foi possível confirmar os resultados.';
                        confirmButton.disabled = false;
                        confirmButton.textContent = 'Confirmar pontuações';
                        return;
                    }
                    const resultadosJogadores = (response.resultados || []).filter(item => item.tipo !== 'banda').length;
                    const resultadosBandas = (response.resultados || []).filter(item => item.tipo === 'banda').length;
                    status.textContent = `RESULTADOS CONFIRMADOS // ${resultadosJogadores} perfil(is) e ${resultadosBandas} banda(s) atualizado(s).`;
                    ticketCards.delete(ticket.ticketId);
                    card.remove();
                    monitorRooms();
                });
            });
            card.append(confirmButton);
        } else {
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'button button-ghost';
            removeButton.textContent = position === 1 ? 'Remover ticket da fila' : 'Somente o primeiro ticket pode ser removido';
            removeButton.disabled = position !== 1;
            removeButton.addEventListener('click', () => {
                removeButton.disabled = true;
                socket.timeout(10000).emit('remover_ticket_sessao', { token, ticketId: ticket.ticketId }, (error, response) => {
                    if (error || !response?.ok) {
                        status.textContent = response?.erro || 'Não foi possível remover o ticket.';
                        removeButton.disabled = false;
                        return;
                    }
                    ticketCards.delete(ticket.ticketId);
                    card.remove();
                    monitorRooms();
                });
            });
            card.append(removeButton);
        }
        ticketList.append(card);
    }

    function renderMatch(result) {
        if (!result?.partidaId || receivedMatches.has(result.partidaId)) return;
        receivedMatches.add(result.partidaId);
        const card = document.createElement('article');
        card.className = 'incoming-result';
        const heading = document.createElement('header');
        const profile = document.createElement('strong');
        profile.textContent = `${result.perfil?.nome || 'PERFIL'} · ${String(result.perfil?.instrumento || 'INSTRUMENTO').toUpperCase()}`;
        const score = document.createElement('span');
        score.textContent = `PONTUAÇÃO ${Number(result.pontuacao || 0).toLocaleString('pt-BR')}`;
        heading.append(profile, score); card.append(heading);
        const details = document.createElement('p');
        details.className = 'operator-help';
        details.textContent = `${result.perfil?.modoJogo || 'Modo desconhecido'} · ${result.musica || 'Música desconhecida'} · ${result.precisao}% precisão · combo ${result.maiorCombo}${result.fullCombo ? ' · FULL COMBO' : ''}`;
        card.append(details); matchList.prepend(card);
    }

    clearResultsButton.addEventListener('click', () => {
        if (!matchList.childElementCount || !window.confirm('Limpar os resultados individuais recentes?')) return;
        clearResultsButton.disabled = true;
        const token = localStorage.getItem('shredder.account.token.v1');
        socket.timeout(10000).emit('limpar_resultados_recentes', { token }, (error, response) => {
            clearResultsButton.disabled = false;
            if (error || !response?.ok) { status.textContent = response?.erro || 'Não foi possível limpar os resultados.'; return; }
            matchList.replaceChildren(); receivedMatches.clear();
        });
    });

    function monitorRooms() {
        const request = ++monitorRequest;
        const token = localStorage.getItem('shredder.account.token.v1');
        if (!token) { status.textContent = 'Entre em uma conta oficial para receber tickets e resultados.'; return; }
        socket.timeout(10000).emit('monitorar_resultados_salas', { token }, (error, response) => {
            if (request !== monitorRequest) return;
            if (error || !response?.ok) { status.textContent = response?.erro || 'Sem conexão. Tentando novamente...'; return; }
            ticketOrder = (response.tickets || []).map((ticket) => ticket.ticketId);
            const active = new Set(ticketOrder);
            for (const [id, card] of ticketCards) if (!active.has(id)) { card.remove(); ticketCards.delete(id); }
            ticketList.replaceChildren();
            for (const ticket of response.tickets || []) displayTicket(ticket);
            for (const result of response.resultados || []) renderMatch(result);
            status.textContent = response.tickets?.length
                ? `FILA FIFO // ${response.tickets.length} ticket(s) pendente(s). O mais antigo recebe os próximos resultados.`
                : 'AO VIVO // aguardando tickets ou resultados do jogo.';
        });
    }

    socket.on('ticket_sessao_recebido', monitorRooms);
    socket.on('ticket_sessao_removido', monitorRooms);
    socket.on('revisao_ticket_recebida', monitorRooms);
    socket.on('resultado_individual_recebido', renderMatch);
    socket.on('resultados_recentes_limpos', () => { matchList.replaceChildren(); receivedMatches.clear(); });
    socket.on('salas_atualizadas', monitorRooms);
    socket.on('connect', monitorRooms);
    socket.on('disconnect', () => { status.textContent = 'Conexão interrompida. Reconectando...'; });
    window.shredderAccount?.onChange((state) => { if (state.isLoggedIn) monitorRooms(); });
    if (socket.connected) monitorRooms();
})();
