(() => {
    const status = document.getElementById('incoming-results-status');
    const ticketList = document.getElementById('incoming-ticket-list');
    const matchList = document.getElementById('incoming-match-list');
    const clearResultsButton = document.getElementById('clear-recent-results');
    if (!status || !ticketList || !matchList || !clearResultsButton) return;

    const socket = window.socket || (window.socket = io());
    const received = new Set();
    const ticketCards = new Map();
    const receivedMatches = new Set();
    const removedStorageKey = 'shredder_tickets_sessao_removidos';
    let removedTickets = new Set();
    try {
        const savedRemoved = JSON.parse(localStorage.getItem(removedStorageKey) || '[]');
        if (Array.isArray(savedRemoved)) removedTickets = new Set(savedRemoved);
    } catch { /* Ignora uma lista local inválida sem bloquear o painel. */ }
    let monitorRequest = 0;

    function renderTicket(ticket) {
        if (!ticket?.ticketId || received.has(ticket.ticketId) || removedTickets.has(ticket.ticketId)) return;
        received.add(ticket.ticketId);
        const card = document.createElement('article');
        card.className = 'incoming-result';

        const heading = document.createElement('header');
        const roomName = document.createElement('strong');
        roomName.textContent = ticket.roomName || 'TICKET DE SESSÃO';
        const time = document.createElement('span');
        time.textContent = ticket.emitidoEm
            ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ticket.emitidoEm))
            : 'AGORA';
        heading.append(roomName, time);
        card.append(heading);

        const mode = ticket.modo || {};
        const facts = document.createElement('dl');
        const values = [
            ['CÓDIGO DA SALA', ticket.roomId],
            ['MODO', mode.tipo === 'historia' ? 'MODO HISTÓRIA' : 'FREEPLAY'],
            ['FASE', mode.tipo === 'historia' ? `FASE ${mode.fase}` : 'LIVRE'],
            ['OPERADORES', Array.isArray(ticket.jogadores) ? ticket.jogadores.length : 0],
        ];
        for (const [label, value] of values) {
            const group = document.createElement('div');
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = value ?? '—';
            group.append(term, description);
            facts.append(group);
        }
        card.append(facts);

        const rosterTitle = document.createElement('p');
        rosterTitle.className = 'eyebrow';
        rosterTitle.textContent = 'OPERADORES DO TICKET';
        card.append(rosterTitle);
        const roster = document.createElement('div');
        for (const player of ticket.jogadores || []) {
            const row = document.createElement('p');
            row.className = 'operator-help';
            row.textContent = `${player.nome} · ID ${player.id} · ${String(player.instrumento || 'sem instrumento').toUpperCase()}`;
            roster.append(row);
        }
        card.append(roster);
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'button button-ghost';
        removeButton.textContent = 'Remover ticket';
        removeButton.addEventListener('click', () => {
            removeButton.disabled = true;
            const token = localStorage.getItem('shredder.account.token.v1');
            removedTickets.add(ticket.ticketId);
            localStorage.setItem(removedStorageKey, JSON.stringify([...removedTickets]));
            removeTicket(ticket.ticketId);
            status.textContent = 'Removendo ticket...';
            socket.timeout(10000).emit('remover_ticket_sessao', { token, ticketId: ticket.ticketId }, (error, response) => {
                if (error || !response?.ok) {
                    status.textContent = response?.erro || 'Removido desta tela, mas o servidor não confirmou. Reinicie o servidor para sincronizar a remoção com outras janelas.';
                    return;
                }
                removeTicket(ticket.ticketId);
            });
        });
        card.append(removeButton);
        ticketList.prepend(card);
        ticketCards.set(ticket.ticketId, card);
        status.textContent = `TICKET RECEBIDO // ${ticket.roomName || ticket.roomId}`;
    }

    function removeTicket(ticketId) {
        ticketCards.get(ticketId)?.remove();
        ticketCards.delete(ticketId);
        if (!ticketList.childElementCount) status.textContent = 'AO VIVO // aguardando tickets ou resultados do jogo.';
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
        heading.append(profile, score);
        card.append(heading);

        const facts = document.createElement('dl');
        const values = [
            ['PERFIL DO JOGO', result.perfil?.nome], ['MODO DO JOGO', result.perfil?.modoJogo], ['MÚSICA', result.musica],
            ['PRECISÃO', `${result.precisao}%`], ['COMBO MÁXIMO', result.maiorCombo],
            ['NOTAS ACERTADAS', result.notasAcertadas], ['NOTAS ERRADAS', result.notasErradas],
            ['FULL COMBO', result.fullCombo ? 'SIM' : 'NÃO'],
            ['RECEBIDO', result.recebidoEm ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(result.recebidoEm)) : 'AGORA'],
        ];
        for (const [label, value] of values) {
            const group = document.createElement('div');
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = value ?? '—';
            group.append(term, description);
            facts.append(group);
        }
        card.append(facts);
        matchList.prepend(card);
    }

    clearResultsButton.addEventListener('click', () => {
        if (!matchList.childElementCount) return;
        if (!window.confirm('Limpar todos os resultados recentes do painel?')) return;
        clearResultsButton.disabled = true;
        const token = localStorage.getItem('shredder.account.token.v1');
        socket.timeout(10000).emit('limpar_resultados_recentes', { token }, (error, response) => {
            clearResultsButton.disabled = false;
            if (error || !response?.ok) {
                status.textContent = response?.erro || 'Não foi possível limpar os resultados no servidor.';
                return;
            }
            clearResults();
            status.textContent = 'RESULTADOS RECENTES LIMPOS // aguardando novos resultados.';
        });
    });

    function clearResults() {
        matchList.replaceChildren();
        receivedMatches.clear();
    }

    function monitorRooms() {
        const request = ++monitorRequest;
        const token = localStorage.getItem('shredder.account.token.v1');
        if (!token) {
            status.textContent = 'Entre em uma conta oficial para receber tickets e resultados.';
            return;
        }
        socket.timeout(10000).emit('monitorar_resultados_salas', { token }, (error, response) => {
            if (request !== monitorRequest) return;
            if (error || !response?.ok) {
                status.textContent = response?.erro || 'Sem conexão com o servidor. Tentando novamente...';
                return;
            }
            for (const ticket of response.tickets || []) renderTicket(ticket);
            for (const result of response.resultados || []) renderMatch(result);
            if (!ticketList.childElementCount && !matchList.childElementCount) {
                status.textContent = 'AO VIVO // aguardando tickets ou resultados do jogo.';
            }
        });
    }

    socket.on('ticket_sessao_recebido', renderTicket);
    socket.on('ticket_sessao_removido', ({ ticketId } = {}) => removeTicket(ticketId));
    socket.on('resultado_individual_recebido', renderMatch);
    socket.on('resultados_recentes_limpos', clearResults);
    socket.on('salas_atualizadas', monitorRooms);
    socket.on('connect', monitorRooms);
    socket.on('disconnect', () => {
        status.textContent = 'Conexão interrompida. Reconectando para acompanhar os tickets...';
    });
    window.shredderAccount?.onChange((state) => {
        if (state.isLoggedIn) monitorRooms();
    });
    if (socket.connected) monitorRooms();
})();
