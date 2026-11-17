// Calculation only: never contacts the Feira, changes local currency or queues payments.
const TETOS = Object.freeze({ facil: 400, media: 600, dificil: 800 });
function calcularRecompensaBoss({ modo, bossDerrotado, dificuldadeMusica, jogadores } = {}) {
    if (modo !== 'historia' || bossDerrotado !== true) return { total: 0, pagamentos: [], motivo: 'BOSS_NAO_DERROTADO_NA_HISTORIA' };
    if (!Object.hasOwn(TETOS, dificuldadeMusica)) throw new Error('Dificuldade da música de campanha não configurada.');
    if (!Array.isArray(jogadores) || jogadores.length < 1 || jogadores.length > 4) throw new Error('Banda inválida.');
    const ids = new Set();
    const pessoas = jogadores.map(jogador => {
        if (typeof jogador.id !== 'string' || !jogador.id || ids.has(jogador.id) || typeof jogador.precisao !== 'number' || !Number.isFinite(jogador.precisao) || jogador.precisao < 0 || jogador.precisao > 100) throw new Error('Jogador ou precisão inválida.');
        ids.add(jogador.id);
        return { id: jogador.id, peso: BigInt(Math.round(jogador.precisao * 100)), concluida: jogador.concluida === true };
    });
    if (pessoas.some(p => !p.concluida)) return { total: 0, pagamentos: [], motivo: 'PARTIDA_INCOMPLETA' };
    const soma = pessoas.reduce((total, p) => total + p.peso, 0n);
    if (soma === 0n) return { total: 0, pagamentos: [], motivo: 'SEM_DESEMPENHO' };
    const teto = TETOS[dificuldadeMusica], quantidade = BigInt(pessoas.length);
    const denominador = 2n * quantidade * soma;
    const partes = pessoas.map(p => {
        const numerador = BigInt(teto) * (soma + quantidade * p.peso);
        return { id: p.id, valor: Number(numerador / denominador), resto: numerador % denominador };
    });
    // Largest remainder: deterministic integers, conserving exactly the authorized pool.
    const ordem = [...partes].sort((a, b) => a.resto === b.resto ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.resto > b.resto ? -1 : 1);
    const sobras = teto - partes.reduce((total, p) => total + p.valor, 0);
    for (let i = 0; i < sobras; i++) ordem[i].valor++;
    return { total: teto, pagamentos: partes.map(({ id, valor }) => ({ id, valor })) };
}
module.exports = { TETOS, calcularRecompensaBoss };
