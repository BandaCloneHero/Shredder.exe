// Adicione novos IDs e rótulos nesta lista quando o evento ganhar badges novas.
const PROFILE_ACHIEVEMENTS = [
    { id: "primeiros_acordes", label: "PRIMEIROS ACORDES", icon: "◆", rarity: "Comum", rarityKey: "common", difficulty: "Iniciante", how: "Conclua sua primeira partida." },
    { id: "aquecimento", label: "AQUECIMENTO", icon: "◌", rarity: "Comum", rarityKey: "common", difficulty: "Iniciante", how: "Jogue cinco partidas." },
    { id: "ritmo_de_ferro", label: "RITMO DE FERRO", icon: "≋", rarity: "Incomum", rarityKey: "uncommon", difficulty: "Intermediária", how: "Jogue dez partidas no mesmo dia." },
    { id: "sem_errar_o_compasso", label: "SEM ERRAR O COMPASSO", icon: "♩", rarity: "Incomum", rarityKey: "uncommon", difficulty: "Intermediária", how: "Conclua uma música sem pausá-la." },
    { id: "on_fire", label: "ON FIRE", icon: "◇", rarity: "Incomum", rarityKey: "uncommon", difficulty: "Intermediária", how: "Conclua uma partida com Full Combo." },
    { id: "cirurgico", label: "CIRÚRGICO", icon: "✦", rarity: "Rara", rarityKey: "rare", difficulty: "Avançada", how: "Alcance 100% de precisão em uma partida." },
    { id: "no_limite", label: "NO LIMITE", icon: "≈", rarity: "Rara", rarityKey: "rare", difficulty: "Avançada", how: "Termine uma partida entre 99% e 99,9% de precisão." },
    { id: "virada_insana", label: "VIRADA INSANA", icon: "↯", rarity: "Rara", rarityKey: "rare", difficulty: "Avançada", how: "Termine com até 10% de energia." },
    { id: "especialista", label: "ESPECIALISTA", icon: "✹", rarity: "Épica", rarityKey: "epic", difficulty: "Especialista", how: "Faça Full Combo em dez músicas diferentes." },
    { id: "multi_instrumentista", label: "MULTI-INSTRUMENTISTA", icon: "✣", rarity: "Rara", rarityKey: "rare", difficulty: "Avançada", how: "Conclua músicas com os quatro instrumentos." },
    { id: "perfeccionista", label: "PERFECCIONISTA", icon: "◈", rarity: "Épica", rarityKey: "epic", difficulty: "Especialista", how: "Faça cinco Full Combos no mesmo instrumento." },
    { id: "mestre_guitarra", label: "MESTRE DA GUITARRA", icon: "𝄞", rarity: "Épica", rarityKey: "epic", difficulty: "Especialista", how: "Faça cinco Full Combos na guitarra." },
    { id: "mestre_baixo", label: "MESTRE DO BAIXO", icon: "♬", rarity: "Épica", rarityKey: "epic", difficulty: "Especialista", how: "Faça cinco Full Combos no baixo." },
    { id: "mestre_bateria", label: "MESTRE DA BATERIA", icon: "◉", rarity: "Épica", rarityKey: "epic", difficulty: "Especialista", how: "Faça cinco Full Combos na bateria." },
    { id: "mestre_teclado", label: "MESTRE DO TECLADO", icon: "⌘", rarity: "Épica", rarityKey: "epic", difficulty: "Especialista", how: "Faça cinco Full Combos no teclado." },
    { id: "banda_afinada", label: "BANDA AFINADA", icon: "♜", rarity: "Rara", rarityKey: "rare", difficulty: "Avançada", how: "Participe de uma banda completa, com os quatro instrumentos." },
    { id: "show_perfeito", label: "SHOW PERFEITO", icon: "✺", rarity: "Lendária", rarityKey: "legendary", difficulty: "Mestre", how: "Conclua um show de banda com todos acima de 95% de precisão." },
    { id: "colecionador_de_fases", label: "COLECIONADOR DE FASES", icon: "▣", rarity: "Épica", rarityKey: "epic", difficulty: "Especialista", how: "Desbloqueie as cinco fases da campanha." },
    { id: "dono_do_palco", label: "DONO DO PALCO", icon: "♛", rarity: "Lendária", rarityKey: "legendary", difficulty: "Mestre", how: "Conclua as cinco fases na dificuldade máxima." },
    { id: "favorita_da_casa", label: "FAVORITA DA CASA", icon: "♥", rarity: "Comum", rarityKey: "common", difficulty: "Iniciante", how: "Marque as cinco fases como favoritas." },
    { id: "maratonista", label: "MARATONISTA", icon: "➜", rarity: "Épica", rarityKey: "epic", difficulty: "Especialista", how: "Jogue 50 partidas." },
    { id: "incansavel", label: "INCANSÁVEL", icon: "∞", rarity: "Lendária", rarityKey: "legendary", difficulty: "Mestre", how: "Jogue 100 partidas." },
    { id: "lenda_viva", label: "LENDA VIVA", icon: "★", rarity: "Lendária", rarityKey: "legendary", difficulty: "Mestre", how: "Conclua 50 partidas." },
    { id: "rei_do_ranking", label: "REI DO RANKING", icon: "♕", rarity: "Lendária", rarityKey: "legendary", difficulty: "Mestre", how: "Alcance o primeiro lugar em um instrumento." },
    { id: "estrela_da_feira", label: "ESTRELA DA FEIRA", icon: "✧", rarity: "Oculta", rarityKey: "hidden", difficulty: "Evento", how: "Fique em primeiro em qualquer ranking no encerramento da feira." },
    { id: "tentativa_corajosa", label: "TENTATIVA CORAJOSA", icon: "⚑", rarity: "Oculta", rarityKey: "hidden", difficulty: "Curiosa", how: "Conclua uma música com menos de 50% de precisão." },
    { id: "quase_la", label: "QUASE LÁ", icon: "!", rarity: "Oculta", rarityKey: "hidden", difficulty: "Curiosa", how: "Perca um Full Combo por apenas uma nota." },
    { id: "volta_por_cima", label: "VOLTA POR CIMA", icon: "↑", rarity: "Rara", rarityKey: "rare", difficulty: "Avançada", how: "Supere seu recorde anterior em pelo menos 25%." },
    { id: "desafinador_profissional", label: "DESAFINADOR PROFISSIONAL", icon: "⊗", rarity: "Oculta", rarityKey: "hidden", difficulty: "Curiosa", how: "Acumule 100 notas erradas." },
];

function achievementArtworkMarkup(id, { eager = false } = {}) {
    if (!PROFILE_ACHIEVEMENTS.some(achievement => achievement.id === id)) return "";
    return `<img class="achievement-artwork" src="assets/achievements/${id}.webp?v=1" alt="" aria-hidden="true" width="256" height="256" loading="${eager ? "eager" : "lazy"}" decoding="async">`;
}

function achievementRarityClass(rarityKey) {
    const knownRarities = new Set(["common", "uncommon", "rare", "epic", "legendary", "hidden"]);
    return `rarity-${knownRarities.has(rarityKey) ? rarityKey : "common"}`;
}

const ACHIEVEMENT_RARITY_ORDER = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    hidden: 5,
};

const ORDERED_PROFILE_ACHIEVEMENTS = [...PROFILE_ACHIEVEMENTS].sort(
    (left, right) =>
        (ACHIEVEMENT_RARITY_ORDER[left.rarityKey] ?? Infinity) -
        (ACHIEVEMENT_RARITY_ORDER[right.rarityKey] ?? Infinity),
);
