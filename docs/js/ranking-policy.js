// Shared visibility rule: hides this title without deleting player history.
(function (root) {
    const hiddenSongs = new Set(['nigger']);
    const policy = Object.freeze({
        permitir(record) {
            const song = typeof record?.musica === 'string' ? record.musica.normalize('NFKC').trim().toLowerCase() : '';
            return !hiddenSongs.has(song);
        },
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = policy;
    else root.shredderRankingPolicy = policy;
})(globalThis);
