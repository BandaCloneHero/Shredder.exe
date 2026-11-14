(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ShredderMusicPolicy = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    const nomes = { guitarra: 'Guitarra', baixo: 'Baixo', bateria: 'Bateria', teclado: 'Teclado' };
    function avaliarMusica(musica, participantes) {
        const pessoas = Array.isArray(participantes) ? participantes : [];
        const disponiveis = new Set((musica?.instrumentos || []).filter(id => Object.hasOwn(nomes, id)));
        if (!pessoas.length) return { permitida: false, motivo: 'Aguardando os jogadores da sala.' };
        if (pessoas.length > disponiveis.size) return { permitida: false, motivo: `${pessoas.length} jogadores para ${disponiveis.size} instrumento${disponiveis.size === 1 ? '' : 's'}.` };
        const ocupados = new Set();
        for (const pessoa of pessoas) {
            const instrumento = pessoa.instrumento;
            if (!Object.hasOwn(nomes, instrumento)) return { permitida: false, motivo: 'Todos precisam escolher um instrumento.' };
            if (!disponiveis.has(instrumento)) return { permitida: false, motivo: `${nomes[instrumento]} não disponível. Troque os instrumentos da banda.` };
            if (ocupados.has(instrumento)) return { permitida: false, motivo: 'Cada jogador precisa de um instrumento diferente.' };
            ocupados.add(instrumento);
        }
        return { permitida: true, motivo: 'Pronta para a banda.' };
    }
    return { nomes, avaliarMusica };
});
