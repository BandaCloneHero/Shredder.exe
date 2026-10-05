/* Um único apresentador vive no documento externo durante toda a navegação. */
window.createAchievementNotifications = ({ confirm, open }) => {
    const queue = [];
    const known = new Set();
    const timers = new Set();
    let active = null;
    let scheduled = false;
    const openedAt = Date.now();

    function later(callback, delay) {
        const id = setTimeout(() => { timers.delete(id); callback(); }, delay);
        timers.add(id);
    }

    function clearTimers() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
    }

    function finish(showGallery = false) {
        if (!active) return;
        const { item, element } = active;
        clearTimers();
        element.remove();
        active = null;
        if (item.notificationId) confirm(item.notificationId);
        if (showGallery) open(`perfil.html?conquista=${encodeURIComponent(item.conquistaId)}`);
        showNext();
    }

    function showNext() {
        if (active || !queue.length) return;
        const item = queue.shift();
        const achievement = PROFILE_ACHIEVEMENTS.find(value => value.id === item.conquistaId);
        const element = document.createElement('aside');
        element.className = `achievement-toast ${achievementRarityClass(achievement.rarityKey)}`;
        element.setAttribute('role', 'link');
        element.tabIndex = 0;
        element.setAttribute('aria-label', `Conquista ${achievement.label}. Clique para ver na galeria.`);
        // O conteúdo vem exclusivamente do catálogo local de conquistas.
        element.innerHTML = `<div class="achievement-toast-icon">${achievementArtworkMarkup(achievement.id, { eager: true })}</div><div><span>CONQUISTA DESBLOQUEADA</span><strong>${achievement.label}</strong><small>${achievement.rarity.toUpperCase()} · ${achievement.difficulty.toUpperCase()}</small></div>`;
        element.addEventListener('click', () => finish(true));
        element.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            finish(true);
        });
        document.body.append(element);
        active = { item, element };
        void element.offsetWidth;
        later(() => element.classList.add('is-visible'), 50);
        later(() => element.classList.add('is-leaving'), 6050);
        later(() => finish(), 8150);
    }

    return {
        enqueue(notifications, { pendentesAoEntrar = false } = {}) {
            for (const item of Array.isArray(notifications) ? notifications : []) {
                const conquistaId = typeof item === 'string' ? item : item?.conquistaId;
                if (!PROFILE_ACHIEVEMENTS.some(value => value.id === conquistaId)) continue;
                const notificationId = typeof item?.id === 'string' ? item.id : null;
                const key = notificationId || conquistaId;
                if (known.has(key)) continue;
                known.add(key);
                queue.push({ conquistaId, notificationId });
            }
            if (active || scheduled || !queue.length) return;
            scheduled = true;
            const delay = pendentesAoEntrar ? Math.max(0, 5000 - (Date.now() - openedAt)) : 5000;
            later(() => { scheduled = false; showNext(); }, delay);
        },
        reset() {
            clearTimers();
            active?.element.remove();
            active = null;
            scheduled = false;
            queue.length = 0;
            known.clear();
        },
    };
};
