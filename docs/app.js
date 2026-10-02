/*
 * Lobby local do Shredder.exe.
 * Estas chaves hoje vivem apenas neste navegador. Em uma versão multiplayer real,
 * use eventos WebSocket e trate o
 * servidor como fonte de verdade para lobby, instrumentos e progresso.
 */
const STORAGE = {
    player: "shredder_player",
    lobby: "shredder_lobby",
    roomId: "shredder_room_id",
    roomName: "shredder_room_name",
    roomBand: "shredder_room_band",
    mode: "shredder_modo",
    progress: "shredder_progresso",
};

const instruments = ["Guitarra", "Baixo", "Bateria", "Teclado"];
const currentPage = document.body.dataset.page;

function readJson(key, fallback) {
    try {
        const value = JSON.parse(localStorage.getItem(key));
        return value ?? fallback;
    } catch {
        return fallback;
    }
}

const PROFILE_INSTRUMENTS = [
    ["guitarra", "GUITARRA"],
    ["baixo", "BAIXO"],
    ["bateria", "BATERIA"],
    ["teclado", "TECLADO"],
];

let PROFILE_SHOP_ITEMS = [];

const PROFILE_RARITY_LABEL = { common: ["COMUM", "INICIANTE"], uncommon: ["INCOMUM", "INTERMEDIÁRIA"], rare: ["RARA", "AVANÇADA"], epic: ["ÉPICA", "ESPECIALISTA"], legendary: ["LENDÁRIA", "MESTRE"] };
const PROFILE_AVATARS = [
    ["night-sentinel", "Guardião do Pulso"], ["astral-oracle", "Oráculo Sonoro"], ["fox-wanderer", "Raposa Sincopada"], ["dune-explorer", "Errante do Eco"], ["deep-diver", "Frequência Abissal"],
    ["crystal-golem", "Golem Rítmico"], ["forest-spirit", "Espírito Harmônico"], ["nocturne", "Pulso Noturno"], ["alien-roamer", "Viajante de Frequência"], ["neon-android", "Equalizador Neon"],
    ["starfarer", "Ritmo Estelar"], ["void-knight", "Cavaleiro da Clave"], ["frost-mage", "Eco Glacial"], ["sun-guardian", "Guardião do BPM"], ["shadow-scout", "Sombra Sincopada"],
    ["brass-automaton", "Autômato Rítmico"], ["mothling", "Mariposa Sonora"], ["neon-familiar", "Felino do Pulso"], ["rune-guardian", "Guardião da Clave"], ["aurora-entity", "Aurora de Ondas"],
    ["pulse-vanguard", "Vanguarda do Pulso"], ["neon-reaper", "Ceifador Neon"], ["beat-runner", "Corredor do Beat"], ["soundcrow", "Corvo Sonoro"],
];
const PROFILE_AVATAR_IDS = PROFILE_AVATARS.map(([id]) => id);

async function loadProfileShopCatalog() {
    const response = await fetch("/api/loja/catalogo", { headers: { Accept: "application/json" }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.items)) throw new Error(payload.error || "Catálogo da loja indisponível.");
    PROFILE_SHOP_ITEMS = payload.items;
}

function profileNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function profilePercent(value) {
    return `${profileNumber(value).toFixed(1)}%`;
}

function profileInstrumentMarkup(profile, instrumentId) {
    const stats = profile.instrumentStats?.[instrumentId] || {};
    return `
        <div class="profile-stat"><span>MAX SCORE</span><strong>${formatScore(profileNumber(stats.maxScore))}</strong></div>
        <div class="profile-stat"><span>MAX COMBO</span><strong>${formatScore(profileNumber(stats.maxCombo))}</strong></div>
        <div class="profile-stat"><span>MELHOR PRECISÃO</span><strong>${profilePercent(stats.bestAccuracy)}</strong></div>
        <div class="profile-stat"><span>MÚSICAS CONCLUÍDAS</span><strong>${formatScore(profileNumber(stats.songsCompleted))}</strong></div>
        <div class="profile-stat"><span>FULL COMBOS</span><strong>${formatScore(profileNumber(stats.fullCombos))}</strong></div>`;
}

function renderProfile(profile, isOwnProfile) {
    const hit = profileNumber(profile.lifetimeStats?.totalNotesHit);
    const misses = profileNumber(profile.lifetimeStats?.totalMisses);
    const totalNotes = hit + misses;
    const hitRatio = totalNotes ? (hit / totalNotes) * 100 : 0;
    const achievements = new Set(profile.achievements || []);
    const favorite = String(
        profile.favoriteInstrument || "nenhum",
    ).toLowerCase();

    document.querySelector("#profile-nickname").innerHTML = `<span class="profile-avatar-stage" aria-hidden="true"><span class="avatar-effect-glow"></span><span class="avatar-effect-orbit"></span><span class="avatar-effect-sparks"><i></i><b></b></span><span class="champions-wings"><i></i><b></b></span><span class="profile-player-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"></circle><path d="M5.5 20c.4-3.6 2.8-5.6 6.5-5.6s6.1 2 6.5 5.6"></path></svg></span></span><span>${escapeHtml(profile.nickname)}</span>`;
    renderProfileAvatar(profile);
    setupProfileAvatarPicker(profile, isOwnProfile);
    document.querySelector("#profile-username").textContent =
        `// ${profile.username}`;
    document.querySelector("#profile-title").textContent =
        profile.tituloEquipado;
    document.querySelector("#profile-currency").textContent = formatScore(
        profileNumber(profile.moedas),
    );
    const customizationCurrency = document.querySelector("#customization-currency");
    if (customizationCurrency) {
        customizationCurrency.textContent = formatScore(
            profileNumber(profile.moedas),
        );
    }
    const customizationTitle = document.querySelector("#customization-current-title");
    if (customizationTitle) {
        customizationTitle.textContent = profile.tituloEquipado || "Novato do Rock";
    }
    renderProfileShop(profile, isOwnProfile);
    document.querySelector("#profile-games").textContent = formatScore(
        profileNumber(profile.gamesPlayed),
    );
    document.querySelector("#profile-hit").textContent = formatScore(hit);
    document.querySelector("#profile-misses").textContent = formatScore(misses);
    document.querySelector("#profile-hit-bar").style.width = `${hitRatio}%`;
    document.querySelector("#profile-hit-rate").textContent =
        profilePercent(hitRatio);
    document.querySelector("#profile-viewing").textContent = isOwnProfile
        ? "SEU PERFIL // DADOS SINCRONIZADOS"
        : `VISUALIZANDO: ${profile.username}`;
    document.querySelector("#profile-back").hidden = isOwnProfile;

    const tabs = document.querySelector("#profile-instrument-tabs");
    const panel = document.querySelector("#profile-instrument-panel");
    tabs.innerHTML = PROFILE_INSTRUMENTS.map(([id, label], index) => {
        const isFavorite = favorite === id;
        return `<button class="profile-tab${index === 0 ? " active" : ""}${isFavorite ? " is-favorite" : ""}" type="button" data-profile-instrument="${id}">${label}${isFavorite ? " <small>FAVORITO</small>" : ""}</button>`;
    }).join("");

    const selectInstrument = (instrumentId) => {
        const instrument = PROFILE_INSTRUMENTS.find(
            ([id]) => id === instrumentId,
        );
        if (!instrument) return;
        tabs.querySelectorAll(".profile-tab").forEach((tab) => {
            tab.classList.toggle(
                "active",
                tab.dataset.profileInstrument === instrumentId,
            );
        });
        panel.innerHTML = `<div class="profile-panel-kicker">${instrument[1]} // REGISTRO DE PERFORMANCE</div><div class="profile-stats-grid">${profileInstrumentMarkup(profile, instrumentId)}</div>`;
    };
    tabs.querySelectorAll(".profile-tab").forEach((tab) => {
        tab.addEventListener("click", () =>
            selectInstrument(tab.dataset.profileInstrument),
        );
    });
    selectInstrument(PROFILE_INSTRUMENTS[0][0]);

    const records = Array.isArray(profile.songRecords)
        ? profile.songRecords
        : [];
    document.querySelector("#profile-songs").innerHTML = records.length
        ? records
              .map(
                  (record) =>
                      `<div class="profile-song-row"><strong>${escapeHtml(record.musica || "SEM TÍTULO")}</strong><span>${formatScore(profileNumber(record.vezesJogada))}x</span><span>${formatScore(profileNumber(record.melhorPontuacao))}</span><span>${formatScore(profileNumber(record.melhorCombo))}</span><span>${profilePercent(record.melhorPrecisao)}</span></div>`,
              )
              .join("")
        : '<p class="profile-empty">NENHUMA FREQUÊNCIA REGISTRADA.</p>';

    const achievementHighlights = ORDERED_PROFILE_ACHIEVEMENTS.slice(0, 6);
    document.querySelector("#profile-achievements").innerHTML =
        achievementHighlights.map(({ id, label, icon, rarityKey }) => {
            const unlocked = achievements.has(id);
            return `<article class="profile-badge ${achievementRarityClass(rarityKey)}${unlocked ? " is-unlocked" : " is-locked"}"><b>${unlocked ? icon : "?"}</b><strong>${label}</strong><small>${unlocked ? "DESBLOQUEADA" : "BLOQUEADA // SINAL INSUFICIENTE"}</small></article>`;
        }).join("");
    const achievementDialog = document.querySelector("#achievement-dialog");
    const achievementDetails = document.querySelector("#achievement-details");
    const achievementButton = document.querySelector("#open-achievements");
    if (achievementDialog && achievementDetails && achievementButton) {
        achievementDetails.innerHTML = ORDERED_PROFILE_ACHIEVEMENTS.map(({ id, label, icon, rarity, rarityKey, difficulty, how }) => {
            const unlocked = achievements.has(id);
            return `<article id="achievement-detail-${id}" class="achievement-detail ${achievementRarityClass(rarityKey)}${unlocked ? " is-unlocked" : ""}" tabindex="-1"><b>${unlocked ? icon : "?"}</b><div><strong>${label}</strong><span class="achievement-rarity">RARIDADE: ${rarity}</span><span>DIFICULDADE: ${difficulty}</span><p>${how}</p></div><small>${unlocked ? "DESBLOQUEADA" : "BLOQUEADA"}</small></article>`;
        }).join("");
        achievementButton.onclick = () => achievementDialog.showModal();
        document.querySelector("#close-achievements").onclick = () => achievementDialog.close();
        achievementDialog.onclick = event => {
            if (event.target === achievementDialog) achievementDialog.close();
        };
    }
}

function renderProfileShop(profile, isOwnProfile) {
    const grid = document.querySelector("#customization-grid");
    const inventory = document.querySelector("#profile-inventory");
    const status = document.querySelector("#shop-status");
    if (!grid || !inventory) return;
    const owned = new Set(profile.cosmetics?.owned || []);
    const equipped = profile.cosmetics?.equipped || {};
    const inventoryDialog = document.querySelector("#profile-inventory-dialog");
    const inventoryTab = document.querySelector("#inventory-tab");
    const shopTab = document.querySelector("#shop-tab");
    const inventoryPanel = document.querySelector("#inventory-panel");
    const shopPanel = document.querySelector("#shop-panel");
    const selectTab = tab => {
        if (!inventoryDialog || !inventoryTab || !shopTab || !inventoryPanel || !shopPanel) return;
        inventoryDialog.dataset.activeTab = tab;
        const panels = { inventory: inventoryPanel, shop: shopPanel };
        const tabs = { inventory: inventoryTab, shop: shopTab };
        for (const [key, panel] of Object.entries(panels)) {
            const selected = key === tab;
            panel.hidden = !selected;
            tabs[key].classList.toggle("is-active", selected);
            tabs[key].setAttribute("aria-selected", String(selected));
        }
    };
    if (inventoryTab) inventoryTab.onclick = () => selectTab("inventory");
    if (shopTab) shopTab.onclick = () => selectTab("shop");
    if (inventoryTab) inventoryTab.textContent = `INVENTÁRIO · ${owned.size}`;
    const inventoryCount = document.querySelector("#inventory-owned-count");
    if (inventoryCount) inventoryCount.textContent = owned.size;
    selectTab(inventoryDialog?.dataset.activeTab || "inventory");
    const openInventory = document.querySelector("#open-profile-inventory");
    const closeInventory = document.querySelector("#close-profile-inventory");
    if (openInventory) openInventory.onclick = () => inventoryDialog?.showModal();
    if (closeInventory) closeInventory.onclick = () => inventoryDialog?.close();
    if (inventoryDialog) inventoryDialog.onclick = event => {
        if (event.target === inventoryDialog) inventoryDialog.close();
    };
    const card = (item, mode) => {
        const isEquipped = equipped[item.slot] === item.id;
        let action = "";
        if (mode === "inventory") {
            action = isEquipped
                ? '<span class="customization-status is-equipped">EQUIPADO</span>'
                : isOwnProfile ? `<button class="button button-ghost shop-action" type="button" data-shop-action="equip" data-item="${item.id}">EQUIPAR</button>` : '<span class="customization-status">NO INVENTÁRIO</span>';
        } else if (isOwnProfile) {
            action = `<button class="button button-primary shop-action" type="button" data-shop-action="buy" data-item="${item.id}">COMPRAR <b>◈ ${item.price}</b></button>`;
        } else {
            action = '<span class="customization-status">LOJA DO OPERADOR</span>';
        }
        const rarity = item.rarityKey || "common";
        const [rarityLabel, difficulty] = PROFILE_RARITY_LABEL[rarity];
        return `<article class="customization-card shop-rarity-card rarity-${rarity}"><div class="customization-preview shop-preview shop-${item.slot} shop-item-${item.id}" aria-hidden="true">${item.preview}</div><div class="customization-copy"><span class="customization-type">${item.type} // ACESSÓRIO</span><span class="shop-rarity">${rarityLabel} <i>·</i> ${difficulty}</span><h3>${item.name}</h3><p>${item.description}</p>${action}</div></article>`;
    };
    const ownedItems = PROFILE_SHOP_ITEMS.filter(item => owned.has(item.id));
    const loadout = document.querySelector("#profile-loadout-slots");
    if (loadout) {
        const slots = [["moldura", "MOLDURA"], ["efeito", "EFEITO"], ["fundo", "FUNDO"], ["título", "TÍTULO"], ["acessório", "ACESSÓRIO"]];
        loadout.innerHTML = slots.map(([slot, label]) => {
            const item = PROFILE_SHOP_ITEMS.find(entry => entry.id === equipped[slot]);
            const value = item?.name || (slot === "título" ? profile.tituloEquipado : "SLOT VAZIO");
            const preview = item?.preview || (slot === "título" && profile.tituloEquipado ? "✦" : "＋");
            const rarity = item?.rarityKey || "common";
            const removeButton = item && isOwnProfile ? `<button class="unequip-action" type="button" data-shop-action="unequip" data-item="${item.id}" aria-label="Retirar ${escapeHtml(item.name)} do espaço ${label.toLowerCase()}">RETIRAR</button>` : "";
            return `<article class="inventory-equipment-slot rarity-${rarity}${item ? " is-filled" : ""}"><span>${label}</span><b aria-hidden="true">${preview}</b><strong>${escapeHtml(value)}</strong><small>${item ? "EQUIPADO" : slot === "título" ? "TÍTULO ATUAL" : "VAZIO"}</small>${removeButton}</article>`;
        }).join("");
    }
    const inventoryFilter = document.querySelector("#inventory-filter-type");
    const inventoryRarityFilter = document.querySelector("#inventory-filter-rarity");
    const shopTypeFilter = document.querySelector("#shop-filter-type");
    const shopRarityFilter = document.querySelector("#shop-filter-rarity");
    const shopPriceFilter = document.querySelector("#shop-filter-price");
    const shopSort = document.querySelector("#shop-sort-price");
    if (inventoryFilter) inventoryFilter.onchange = () => renderProfileShop(profile, isOwnProfile);
    if (inventoryRarityFilter) inventoryRarityFilter.onchange = () => renderProfileShop(profile, isOwnProfile);
    if (shopTypeFilter) shopTypeFilter.onchange = () => renderProfileShop(profile, isOwnProfile);
    if (shopRarityFilter) shopRarityFilter.onchange = () => renderProfileShop(profile, isOwnProfile);
    if (shopPriceFilter) shopPriceFilter.onchange = () => renderProfileShop(profile, isOwnProfile);
    if (shopSort) shopSort.onchange = () => renderProfileShop(profile, isOwnProfile);
    const inventoryType = inventoryFilter?.value || "todos";
    const inventoryRarity = inventoryRarityFilter?.value || "todas";
    const visibleOwned = ownedItems.filter(item => (inventoryType === "todos" || item.slot === inventoryType) && (inventoryRarity === "todas" || item.rarityKey === inventoryRarity));
    inventory.innerHTML = visibleOwned.length
        ? [["moldura", "MOLDURAS"], ["efeito", "EFEITOS"], ["fundo", "FUNDOS"], ["título", "TÍTULOS"], ["acessório", "ACESSÓRIOS"]]
            .map(([slot, categoryLabel]) => {
                const categoryItems = visibleOwned.filter(item => item.slot === slot);
                if (!categoryItems.length) return "";
                const rarityGroups = ["common", "uncommon", "rare", "epic", "legendary"]
                    .map(rarity => {
                        const rarityItems = categoryItems
                            .filter(item => (item.rarityKey || "common") === rarity)
                            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
                        if (!rarityItems.length) return "";
                        const [rarityLabel, difficulty] = PROFILE_RARITY_LABEL[rarity];
                        return `<section class="inventory-rarity-group rarity-${rarity}"><h5>${rarityLabel}<span>${difficulty}</span></h5><div class="inventory-items-grid">${rarityItems.map(item => card(item, "inventory")).join("")}</div></section>`;
                    }).join("");
                return `<section class="inventory-category"><h4>${categoryLabel}<span>${categoryItems.length} ${categoryItems.length === 1 ? "ITEM" : "ITENS"}</span></h4>${rarityGroups}</section>`;
            }).join("")
        : ownedItems.length
            ? '<p class="profile-empty shop-empty">NENHUM ITEM NO INVENTÁRIO PARA ESTE TIPO.</p>'
        : '<p class="profile-empty shop-empty">INVENTÁRIO VAZIO // COMPRE UM ACESSÓRIO NO CATÁLOGO.</p>';
    const maxPrice = shopPriceFilter?.value || "todos";
    const selectedType = shopTypeFilter?.value || "todos";
    const selectedRarity = shopRarityFilter?.value || "todas";
    const direction = shopSort?.value === "desc" ? -1 : 1;
    const availableItems = PROFILE_SHOP_ITEMS
        .filter(item => !owned.has(item.id))
        .filter(item => selectedType === "todos" || item.slot === selectedType)
        .filter(item => selectedRarity === "todas" || item.rarityKey === selectedRarity)
        .filter(item => maxPrice === "todos" || item.price <= Number(maxPrice))
        .sort((a, b) => direction * (a.price - b.price));
    grid.innerHTML = availableItems.length
        ? availableItems.map(item => card(item, "catalog")).join("")
        : PROFILE_SHOP_ITEMS.length > 0 && PROFILE_SHOP_ITEMS.every(item => owned.has(item.id))
            ? '<p class="profile-empty shop-empty">CATÁLOGO COMPLETO // VOCÊ JÁ POSSUI TODOS OS ACESSÓRIOS.</p>'
            : '<p class="profile-empty shop-empty">NENHUM ITEM ENCONTRADO // AJUSTE OS FILTROS.</p>';
    if (inventoryDialog && !inventoryDialog.dataset.shopActionsBound) {
        inventoryDialog.dataset.shopActionsBound = "true";
        inventoryDialog.addEventListener("click", async event => {
            const button = event.target.closest("[data-shop-action]");
            if (!button || !inventoryDialog.contains(button)) return;
            button.disabled = true;
            status.textContent = "PROCESSANDO TRANSAÇÃO...";
            try {
                const action = ({ buy: "comprar", equip: "equipar", unequip: "retirar" })[button.dataset.shopAction];
                const result = await window.shredderAccount.request(`/api/loja/${action}`, {
                    method: "POST", body: { itemId: button.dataset.item },
                });
                profile.moedas = result.currency;
                profile.cosmetics = result.cosmetics;
                profile.tituloEquipado = result.currentTitle || profile.tituloEquipado;
                renderProfileAvatar(profile);
                window.shredderUI?.applyCosmetics(result.cosmetics);
                document.querySelector("#profile-currency").textContent = formatScore(result.currency);
                document.querySelector("#customization-currency").textContent = formatScore(result.currency);
                document.querySelector("#profile-title").textContent = profile.tituloEquipado;
                status.textContent = action === "comprar"
                    ? result.starterCreditsGranted
                        ? "500 MOEDAS INICIAIS ADICIONADAS. ACESSÓRIO COMPRADO!"
                        : "ACESSÓRIO ADICIONADO AO INVENTÁRIO."
                    : action === "equipar" ? "ACESSÓRIO EQUIPADO NO PERFIL." : "ACESSÓRIO RETIRADO E DEVOLVIDO AO INVENTÁRIO.";
                renderProfileShop(profile, true);
            } catch (error) {
                status.textContent = error.message || "NÃO FOI POSSÍVEL CONCLUIR A TRANSAÇÃO.";
                button.disabled = false;
            }
        });
    }
}

function renderProfileAvatar(profile) {
    const stage = document.querySelector("#profile-nickname .profile-avatar-stage");
    const avatar = stage?.querySelector(".profile-player-icon");
    if (!stage || !avatar) return;
    const equipped = profile.cosmetics?.equipped || {};
    stage.dataset.frame = equipped.moldura || "";
    stage.dataset.effect = equipped.efeito || "";
    avatar.dataset.frame = equipped.moldura || "";
    avatar.dataset.background = equipped.fundo || "";
    avatar.dataset.avatar = PROFILE_AVATAR_IDS.includes(profile.avatar) ? profile.avatar : "";
    avatar.style.backgroundImage = avatar.dataset.avatar ? `url("images/avatars/${avatar.dataset.avatar}.png?v=4")` : "";
    avatar.style.backgroundSize = avatar.dataset.avatar ? "cover" : "";
    avatar.style.backgroundPosition = avatar.dataset.avatar ? "center" : "";
    avatar.style.backgroundRepeat = avatar.dataset.avatar ? "no-repeat" : "";
    const preview = document.querySelector("#profile-avatar-preview");
    if (preview && stage && !preview.contains(stage)) preview.replaceChildren(stage.cloneNode(true));
}

function setupProfileAvatarPicker(profile, isOwnProfile) {
    const dialog = document.querySelector("#avatar-picker-dialog");
    const open = document.querySelector("#open-avatar-picker");
    const close = document.querySelector("#close-avatar-picker");
    const options = document.querySelector("#avatar-picker-options");
    const status = document.querySelector("#avatar-picker-status");
    if (!dialog || !open || !options) return;
    dialog.profileData = profile;
    options.innerHTML = `<button class="avatar-choice" type="button" data-avatar=""><span class="avatar-choice-image avatar-choice-default">♪</span><strong>PADRÃO</strong></button>${PROFILE_AVATARS.map(([id, label]) => `<button class="avatar-choice" type="button" data-avatar="${id}"><img class="avatar-choice-image" src="images/avatars/${id}.png?v=4" alt="" loading="lazy" decoding="async"><strong>${escapeHtml(label)}</strong></button>`).join("")}`;
    open.hidden = !isOwnProfile;
    dialog.dataset.canEdit = String(isOwnProfile);
    open.onclick = () => dialog.showModal();
    if (close) close.onclick = () => dialog.close();
    dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
    const selectedAvatar = PROFILE_AVATAR_IDS.includes(profile.avatar) ? profile.avatar : "";
    options.querySelectorAll("[data-avatar]").forEach(button => {
        const selected = button.dataset.avatar === selectedAvatar;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
    if (dialog.dataset.bound === "true") return;
    dialog.dataset.bound = "true";
    options.addEventListener("click", async event => {
        const button = event.target.closest("[data-avatar]");
        if (!button || dialog.dataset.canEdit !== "true") return;
        const activeProfile = dialog.profileData;
        const choices = [...options.querySelectorAll("[data-avatar]")];
        choices.forEach(choice => { choice.disabled = true; });
        status.textContent = "SALVANDO FOTO DE PERFIL...";
        try {
            const result = await window.shredderAccount.request("/api/perfil/avatar", {
                method: "POST", body: { avatar: button.dataset.avatar },
            });
            activeProfile.avatar = result.avatar;
            renderProfileAvatar(activeProfile);
            window.shredderUI?.applyCosmetics(activeProfile.cosmetics, undefined, undefined, activeProfile.avatar);
            choices.forEach(choice => {
                const selected = choice.dataset.avatar === (activeProfile.avatar || "");
                choice.classList.toggle("is-selected", selected);
                choice.setAttribute("aria-pressed", String(selected));
            });
            status.textContent = "FOTO DE PERFIL ATUALIZADA.";
        } catch (error) {
            status.textContent = error.message || "NÃO FOI POSSÍVEL SALVAR O AVATAR.";
        } finally {
            choices.forEach(choice => { choice.disabled = false; });
        }
    });
}

async function loadProfile(username, isOwnProfile) {
    const status = document.querySelector("#profile-status");
    const searchError = document.querySelector("#profile-search-error");
    status.textContent = "SINCRONIZANDO DADOS...";
    status.className = "profile-status is-loading";
    searchError.hidden = true;
    try {
        const response = await fetch(
            `/api/perfil/${encodeURIComponent(username)}`,
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.profile) {
            if (response.status === 404) {
                searchError.textContent = "JOGADOR NÃO EXISTE NA REDE.";
                searchError.hidden = false;
            }
            throw new Error(
                payload.error || "Não foi possível acessar este perfil.",
            );
        }
        renderProfile(payload.profile, isOwnProfile);
        status.textContent = "SINAL ONLINE // PERFIL ATUALIZADO";
        status.className = "profile-status is-online";
        return true;
    } catch (error) {
        status.textContent =
            error.message === "Operador não encontrado na rede."
                ? "CONSULTA ENCERRADA // NENHUM OPERADOR CORRESPONDE AO SINAL."
                : `SEM SINAL COM O SERVIDOR // ${error.message}`;
        status.className = "profile-status is-error";
        return false;
    }
}

async function initializeProfile() {
    // Aguarda validar o token antes de decidir qual conta carregar.
    // Sem isso, o perfil pode iniciar com o username ainda nulo e ler uma identidade local antiga.
    if (window.shredderAccount) await window.shredderAccount.restore();
    try {
        await loadProfileShopCatalog();
    } catch (error) {
        document.querySelector("#shop-status").textContent = `LOJA SEM SINAL // ${error.message}`;
    }

    const searchForm = document.querySelector("#profile-search-form");
    const searchInput = document.querySelector("#profile-search");
    const requestedUsername = new URLSearchParams(window.location.search)
        .get("username")
        ?.trim();
    const sessionUsername =
        window.shredderAccount?.snapshot().user || getPlayer()?.nome;
    const username = requestedUsername || sessionUsername;

    searchForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const searchUsername = searchInput.value.trim();
        if (!searchUsername) return;

        const loaded = await loadProfile(
            searchUsername,
            String(sessionUsername || "").toLowerCase() ===
                searchUsername.toLowerCase(),
        );
        if (loaded) {
            window.history.pushState(
                {},
                "",
                `perfil.html?username=${encodeURIComponent(searchUsername)}`,
            );
        }
    });

    document
        .querySelector("#profile-back")
        .addEventListener("click", async () => {
            if (!sessionUsername) return;
            const loaded = await loadProfile(sessionUsername, true);
            if (loaded) {
                searchInput.value = "";
                window.history.pushState({}, "", "perfil.html");
            }
        });

    if (!username) {
        document.querySelector("#profile-status").textContent =
            "IDENTIDADE AUSENTE // RETORNE AO LOGIN.";
        return;
    }

    const ownUsername =
        String(sessionUsername || "").toLowerCase() === username.toLowerCase();
    searchInput.value = requestedUsername || "";
    loadProfile(username, ownUsername).then(loaded => {
        if (!loaded) return;
        const achievementId = new URLSearchParams(window.location.search).get("conquista");
        if (!PROFILE_ACHIEVEMENTS.some(achievement => achievement.id === achievementId)) return;
        const dialog = document.querySelector("#achievement-dialog");
        const target = document.getElementById(`achievement-detail-${achievementId}`);
        if (!dialog || !target) return;
        dialog.showModal();
        requestAnimationFrame(() => {
            target.scrollIntoView({ block: "center", behavior: "smooth" });
            target.classList.add("is-targeted");
            target.focus({ preventScroll: true });
            window.setTimeout(() => target.classList.remove("is-targeted"), 2200);
        });
    });
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function getPlayer() {
    return readJson(STORAGE.player, null);
}

function getLobby() {
    return readJson(STORAGE.lobby, []);
}

function setLobby(lobby) {
    writeJson(STORAGE.lobby, lobby);
}

function ensurePlayer() {
    const player = getPlayer();
    if (!player || !player.id || !player.nome) {
        window.location.href = `index.html${window.location.search}`;
        return null;
    }
    return player;
}

function makePlayerId() {
    return `OP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function upsertPlayer(player) {
    const lobby = getLobby().filter((item) => item.id !== player.id);
    lobby.push(player);
    setLobby(lobby);
}

function formatInstrument(instrument) {
    return instrument || "SEM LOADOUT";
}

function initializeLogin() {
    const idField = document.querySelector("#player-id");
    const playerNameInput = document.querySelector("#player-name");
    const loginForm = document.querySelector("#login-form");
    const error = document.querySelector("#login-error");
    const existing = getPlayer();

    idField.value = existing?.id || makePlayerId();
    playerNameInput.value = existing?.nome || "";

    if (!loginForm) return;
    loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const accountState = window.shredderAccount
            ? window.shredderAccount.snapshot()
            : { isLoggedIn: false };

        if (!accountState.isLoggedIn) {
            alert(
                "Acesso restrito: faça login ou crie uma conta para iniciar o uplink.",
            );
            window.shredderUI?.openModal();
            return;
        }

        playerNameInput.value = accountState.user;
        const finalPlayerName = playerNameInput.value.trim();
        const previous = getPlayer();
        const player = {
            id: idField.value.trim(),
            nome: finalPlayerName,
            instrumento: previous?.instrumento || null,
        };
        writeJson(STORAGE.player, player);
        upsertPlayer(player);
        localStorage.setItem("shredder_player_name", finalPlayerName);
        window.location.href = `lobby.html${window.location.search}`;
    });

    if (window.shredderAccount) {
        window.shredderAccount.onChange((state) => {
            if (state.isLoggedIn && playerNameInput) {
                playerNameInput.value = state.user;
                playerNameInput.readOnly = true;
                playerNameInput.style.opacity = "0.7";
            } else if (playerNameInput) {
                playerNameInput.readOnly = false;
                playerNameInput.style.opacity = "";
            }
        });
    }
}

function renderLobby(player) {
    const list = document.querySelector("#lobby-list");
    if (!list) return;
    const lobby = getLobby();
    list.innerHTML = lobby.length
        ? lobby
              .map(
                  (item) =>
                      `<div class="roster-row ${item.id === player.id ? "current" : ""}"><span>${item.nome}${item.id === player.id ? " / VOCÊ" : ""}</span><strong>${formatInstrument(item.instrumento)}</strong></div>`,
              )
              .join("")
        : '<div class="roster-row">Nenhum operador conectado.</div>';
}

window.kickPlayer = function (targetUsername, roomId) {
    if (
        confirm(
            `Tem certeza de que deseja expulsar o operador ${targetUsername}?`,
        )
    ) {
        if (window.socket) {
            window.socket.emit("kick_player", { roomId, targetUsername });
        }
    }
};

window.setupKickListener = function () {
    if (window.socket) {
        window.socket.off("player_kicked");
        window.socket.on("player_kicked", (data) => {
            alert(data.message || "Você foi expulso da sala pelo criador.");
            if (
                window.shredderAccount &&
                typeof window.shredderAccount.logout === "function"
            ) {
                window.shredderAccount.logout();
            }
            window.location.href = "index.html";
        });
    }
};

window.renderLobbyPlayers = function (roomData, currentUsername) {
    const container = document.querySelector(
        "#operadores-conectados, .operadores-conectados, .connected-players, #lobby-list",
    );
    if (!container) return;

    const players = roomData.players || roomData.operadores || [];
    const isHost = roomData.host === currentUsername;
    container.replaceChildren();

    players.forEach((player) => {
        const playerRow = document.createElement("div");
        playerRow.className = "player-row roster-row";
        const isMe = player === currentUsername;

        const playerName = document.createElement("span");
        playerName.textContent = `${player}${isMe ? " / VOCÊ" : ""}`;
        playerRow.appendChild(playerName);

        if (isHost && !isMe) {
            const kickButton = document.createElement("button");
            kickButton.type = "button";
            kickButton.className = "kick-player-button";
            kickButton.textContent = "EXPULSAR";
            kickButton.addEventListener("click", () => {
                window.kickPlayer(player, roomData.id);
            });
            playerRow.appendChild(kickButton);
        }

        container.appendChild(playerRow);
    });

    if (players.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "roster-row";
        emptyState.textContent = "Nenhum operador conectado.";
        container.appendChild(emptyState);
    }
};

function initializeInstruments() {
    const player = ensurePlayer();
    if (!player) return;
    if (!localStorage.getItem(STORAGE.roomId)) {
        window.location.href = "lobby.html";
        return;
    }
    document.querySelector("#top-player").textContent = player.nome;
    document.querySelector("#operator-name").textContent = player.nome;
}

function saveRoom(room) {
    localStorage.setItem(STORAGE.roomId, room.roomId);
    localStorage.setItem(STORAGE.roomName, room.roomName || "SALA SEM NOME");
    localStorage.setItem(STORAGE.roomBand, JSON.stringify(room.banda || null));
}

window.updateOwnerControls = function (roomState) {
    const socket = window.socket;
    const isOwner = Boolean(socket?.connected && socket.id && roomState?.donoId === getPlayer()?.id && roomState?.socketDonoId === socket.id);
    document.querySelectorAll("[data-owner-control]").forEach((control) => {
        control.style.display = isOwner ? "" : "none";
    });
    if (currentPage === "modos") {
        document.querySelectorAll("#stage-grid .stage-card, #freeplay-card").forEach((control) => {
            control.disabled = !isOwner || control.classList.contains("locked");
            control.setAttribute("aria-disabled", String(control.disabled));
        });
    }
};

function initializeRoomPresence(player) {
    const roomId = localStorage.getItem(STORAGE.roomId);
    const socket = window.socket;
    if (!roomId || !socket) {
        window.location.href = "lobby.html";
        return;
    }

    const enterCurrentRoom = () => {
        window.shredderRoomState = null;
        window.updateOwnerControls(null);
        socket.emit("entrarSala", {
            roomId,
            username: player.nome,
            operadorId: player.id,
        });
    };

    socket.on("connect", enterCurrentRoom);
    socket.on("disconnect", () => {
        window.shredderRoomState = null;
        window.updateOwnerControls(null);
    });
    if (socket.connected) enterCurrentRoom();

    socket.on("atualizar_estado", (roomState) => {
        window.shredderRoomState = roomState;
        window.updateOwnerControls(roomState);
        const players = roomState.operadores || [];
        const roster = document.querySelector("#ticket-lobby");
        const count = document.querySelector("#ticket-count");
        if (!roster) return;

        if (count) count.textContent = players.length;
        roster.replaceChildren();
        players.forEach((username) => {
            const row = document.createElement("div");
            row.className = `roster-row${username === player.nome ? " current" : ""}`;
            const name = document.createElement("span");
            name.textContent = `${username}${username === player.nome ? " // VOCÊ" : ""}`;
            row.appendChild(name);
            roster.appendChild(row);
        });
    });

    socket.on("sala_emitiu_ticket", ({ modo } = {}) => {
        if (modo) writeJson(STORAGE.mode, modo);
        if (currentPage !== "ticket") window.location.href = "ticket.html";
    });
}

function initializeLobby() {
    // O lobby exige a identidade autenticada já criada no login; nenhuma identidade nova é gerada aqui.
    const player = ensurePlayer();
    const socket = window.socket;
    const roomList = document.querySelector("#room-list");
    const roomNameInput = document.querySelector("#room-name");
    const bandNameInput = document.querySelector("#band-name");
    const createForm = document.querySelector("#form-criar-sala");
    const status = document.querySelector("#lobby-status");
    const emptyState = document.querySelector("#lobby-empty");

    console.warn("[LOBBY] initializeLobby abortado:", {
        player,
        token: window.shredderAccount?.token,
        socket,
        roomList,
        createForm,
        roomNameInput,
    });

    if (
        !player ||
        !window.shredderAccount?.token ||
        !socket ||
        !roomList ||
        !createForm ||
        !roomNameInput
    )
        return;

    document.querySelector("#lobby-player").textContent = player.nome;
    const showError = (message) => {
        status.textContent = message;
        status.classList.add("is-error");
    };
    const clearError = () => {
        status.textContent = "SINAL ONLINE // SALAS EM TEMPO REAL";
        status.classList.remove("is-error");
    };
    const enterRoom = (room) => {
        socket.emit(
            "entrarSala",
            {
                roomId: room.roomId,
                username: player.nome,
                operadorId: player.id,
            },
            (response) => {
                if (!response?.ok) {
                    showError(
                        response?.erro || "Não foi possível entrar na sala.",
                    );
                    return;
                }
                saveRoom(response);
                window.location.href = "instrumentos.html";
            },
        );
    };
    const renderRooms = (rooms) => {
        const activeRooms = Array.isArray(rooms)
            ? rooms
            : Object.values(rooms || {});

        if (activeRooms.length === 0) {
            roomList.replaceChildren();
            emptyState.hidden = false;
            return;
        }

        emptyState.hidden = true;
        roomList.replaceChildren();

        activeRooms.forEach((room) => {
            const full = room.quantidadeJogadores >= room.limiteJogadores;
            const card = document.createElement("button");
            card.type = "button";
            card.className = `room-card${full ? " is-full" : ""}`;
            card.disabled = full;
            card.innerHTML = `<span class="room-card-kicker">${full ? "SALA CHEIA // BLOQUEADA" : "SALA DISPONÍVEL"}</span><strong></strong><small></small><b></b>`;
            card.querySelector("strong").textContent = room.roomName;
        card.querySelector("small").textContent =
                `CRIADOR // ${room.criadorUsername} · CÓDIGO ${room.roomId}${room.banda?.nome ? ` · BANDA // ${room.banda.nome}` : ""}`;
            card.querySelector("b").textContent =
                `${room.quantidadeJogadores}/${room.limiteJogadores} OPERADORES`;
            if (!full) card.addEventListener("click", () => enterRoom(room));
            roomList.appendChild(card);
        });
    };

    // O script e o listener só são registrados quando o formulário já existe no DOM.
    createForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const roomName = roomNameInput.value.trim();
        const bandName = bandNameInput?.value.trim() || "";
        if (!roomName) {
            showError("IDENTIFIQUE A SALA ANTES DE TRANSMITIR.");
            roomNameInput.focus();
            return;
        }
        socket.emit(
            "criarSala",
            { roomName, bandName, username: player.nome, operadorId: player.id },
            (response) => {
                if (!response?.ok) {
                    showError(
                        response?.erro || "Não foi possível criar a sala.",
                    );
                    return;
                }
                saveRoom(response);
                window.location.href = "instrumentos.html";
            },
        );
    });

    let requestedRoomHandled = false;
    socket.on("salas_atualizadas", (rooms) => {
        clearError();
        const activeRooms = Array.isArray(rooms)
            ? rooms
            : Object.values(rooms || {});
        renderRooms(activeRooms);
        const requestedRoomId = new URLSearchParams(window.location.search).get(
            "roomId",
        );
        const requestedRoom = activeRooms.find(
            (room) => room.roomId === requestedRoomId,
        );
        if (
            !requestedRoomHandled &&
            requestedRoom &&
            requestedRoom.quantidadeJogadores < requestedRoom.limiteJogadores
        ) {
            requestedRoomHandled = true;
            enterRoom(requestedRoom);
        } else if (
            requestedRoom?.quantidadeJogadores >= requestedRoom.limiteJogadores
        ) {
            showError("SALA CHEIA // escolha outra frequência.");
        }
    });
    const pedirSalas = () => socket.emit("pedir_salas");
    socket.on("connect", pedirSalas);
    if (socket.connected) pedirSalas();
    socket.on("connect_error", () =>
        showError("SEM SINAL COM O SERVIDOR // tente novamente."),
    );
    socket.on("disconnect", () =>
        showError("SEM SINAL COM O SERVIDOR // conexão interrompida."),
    );
}

function getProgress() {
    const saved = readJson(STORAGE.progress, null);
    if (Array.isArray(saved) && saved.length === 5) return saved;
    const initial = [false, false, false, false, false];
    writeJson(STORAGE.progress, initial);
    return initial;
}

const STAGES = [
    "PULSO ZERO",
    "CIDADE DE VIDRO",
    "SINAL FANTASMA",
    "SOBRECARGA",
    "ÚLTIMA TRANSMISSÃO",
];

function fasesLocaisComoPerfil() {
    const progress = getProgress();
    const desbloqueadas = progress.reduce(
        (fases, complete, index) => {
            if (index === 0 || progress[index - 1] || complete) fases.push(index + 1);
            return fases;
        },
        [],
    );
    return { desbloqueadas, favoritas: [], selecionada: null, historicoSelecionadas: [] };
}

function renderStages(fases) {
    const desbloqueadas = new Set(fases.desbloqueadas || [1]);
    const favoritas = new Set(fases.favoritas || []);
    const grid = document.querySelector("#stage-grid");
    document.querySelector("#progress-count").textContent =
        `${String([...desbloqueadas].filter(fase => fase <= STAGES.length).length).padStart(2, "0")} / ${String(STAGES.length).padStart(2, "0")}`;
    grid.innerHTML = STAGES
        .map((stage, index) => {
            const fase = index + 1;
            const isUnlocked = desbloqueadas.has(fase);
            const isComplete = fase < STAGES.length && desbloqueadas.has(fase + 1);
            const isFavorite = favoritas.has(fase);
            return `<button type="button" class="stage-card ${isUnlocked ? "" : "locked"} ${isComplete ? "complete" : ""}" data-stage="${fase}" ${isUnlocked ? "" : "disabled"}><span class="stage-number">0${fase}</span><strong>${stage}</strong><small>${isFavorite ? "★ FAVORITA" : isComplete ? "FREQUÊNCIA CONCLUÍDA" : isUnlocked ? "SINAL DISPONÍVEL" : "BLOQUEADA // COMPLETE A ANTERIOR"}</small>${isComplete ? "<em>✓ EXCELÊNCIA REGISTRADA</em>" : ""}</button>`;
        })
        .join("");
    grid.querySelectorAll(".stage-card:not(.locked)").forEach((card) =>
        card.addEventListener("click", () =>
            chooseMode("historia", Number(card.dataset.stage)),
        ),
    );
    window.updateOwnerControls(window.shredderRoomState);
}

async function carregarFasesDoPerfil(player) {
    try {
        const response = await fetch(`/api/perfil/${encodeURIComponent(player.nome)}`, { headers: { Accept: "application/json" } });
        const data = await response.json();
        if (!response.ok || !data?.profile?.fases) throw new Error("Perfil sem fases.");
        return data.profile.fases;
    } catch {
        // Mantém a tela utilizável offline e para contas ainda não migradas.
        return fasesLocaisComoPerfil();
    }
}

function initializeModes() {
    const player = ensurePlayer();
    if (
        !player ||
        !player.instrumento ||
        !localStorage.getItem(STORAGE.roomId)
    ) {
        window.location.href = "instrumentos.html";
        return;
    }
    initializeRoomPresence(player);
    document.querySelector("#mode-player").textContent = player.nome;
    document.querySelector("#mode-instrument").textContent = player.instrumento;
    renderStages(fasesLocaisComoPerfil());
    carregarFasesDoPerfil(player).then(renderStages);
    document
        .querySelector("#freeplay-card")
        .addEventListener("click", () => chooseMode("freeplay", null));
}

async function chooseMode(tipo, fase) {
    const player = getPlayer();
    const roomId = localStorage.getItem(STORAGE.roomId);
    const roomState = window.shredderRoomState;
    if (!player || !roomId || !window.socket?.connected || roomState?.donoId !== player.id || roomState?.socketDonoId !== window.socket.id) {
        return;
    }

    const status = document.querySelector("#mode-status");
    if (tipo === "historia") {
        if (status) status.textContent = "REGISTRANDO FASE...";
        try {
            await window.shredderAccount.request("/api/fases/selecionar", {
                method: "POST",
                body: { fase },
            });
        } catch (error) {
            console.error("Não foi possível registrar a fase:", error);
            if (status) status.textContent = "SEM SINAL // não foi possível registrar a fase.";
            return;
        }
    }
    const modo = { tipo, fase };
    writeJson(STORAGE.mode, modo);
    window.socket.emit(
        "owner_emitir_ticket",
        { roomId, operadorId: player.id, modo },
        (response) => {
            if (!response?.ok) {
                console.error(
                    "Não foi possível emitir o ticket:",
                    response?.erro,
                );
                if (status) status.textContent = "SEM SINAL // não foi possível emitir o ticket.";
            } else if (status) {
                status.textContent = "";
            }
        },
    );
}

// Uma conexão por página; reutiliza window.socket quando já foi inicializado.
function getGameSocket() {
    if (!window.socket) window.socket = io();
    return window.socket;
}

const PENDING_RESULTS_KEY = "shredder_resultados_pendentes";
const resultadosEmEnvio = new Map();

/** O callback real de fim de música do Phaser chama concluirMusica(estatisticas). */
function enviarPontuacaoParaRanking(dados) {
    const player = getPlayer();
    if (!player?.id || !player.nome) return Promise.reject(new Error("Jogador não identificado."));
    const modo = readJson(
        typeof STORAGE === "undefined" ? "shredder_modo" : STORAGE.mode,
        { tipo: "freeplay", fase: null },
    );
    const faseDaCampanha = modo.tipo === "historia" && Number.isSafeInteger(modo.fase) && modo.fase > 0
        ? modo.fase
        : undefined;
    const resultado = {
        ...dados,
        partidaId: dados.partidaId || crypto.randomUUID(),
        roomId: localStorage.getItem(STORAGE.roomId) || undefined,
        operadorId: dados.operadorId || player.id,
        username: dados.username || player.nome,
        instrumento: dados.instrumento || player.instrumento,
        banda: dados.banda ?? normalizeBand(player.banda),
        modo: dados.modo || modo.tipo,
        // A tela de fases escolhe o modo antes de abrir o jogo. Ao concluir a
        // música, a mesma fase segue junto do resultado para o perfil remoto.
        ...(dados.fase === undefined && faseDaCampanha !== undefined ? { fase: faseDaCampanha } : {}),
    };
    if (resultadosEmEnvio.has(resultado.partidaId)) return resultadosEmEnvio.get(resultado.partidaId);
    const pendentes = readJson(PENDING_RESULTS_KEY, {});
    pendentes[resultado.partidaId] = resultado;
    // Grava antes de enviar. Falhas/timeout preservam o mesmo ID para reenvio idempotente.
    writeJson(PENDING_RESULTS_KEY, pendentes);
    const promise = new Promise((resolve, reject) => {
        getGameSocket().timeout(10000).emit("partidaFinalizada", resultado, (error, resposta) => {
            if (error || !resposta?.ok) {
                reject(new Error(resposta?.erro || "Servidor sem confirmação. Tente sincronizar novamente."));
                return;
            }
            try {
                const atuais = readJson(PENDING_RESULTS_KEY, {});
                delete atuais[resultado.partidaId];
                writeJson(PENDING_RESULTS_KEY, atuais);
                // A própria aba da partida recebe o troféu pela confirmação.
                // As demais abas abertas recebem o mesmo evento pelo socket.
                resolve(resposta);
            } catch (storageError) { reject(storageError); }
        });
    }).finally(() => resultadosEmEnvio.delete(resultado.partidaId));
    resultadosEmEnvio.set(resultado.partidaId, promise);
    return promise;
}

function normalizeBand(banda) {
    if (!banda) return null;
    if (typeof banda === "string") return { id: banda, nome: banda };
    if (!banda.id && !banda.nome) return null;
    return { id: banda.id || banda.nome, nome: banda.nome || banda.id };
}

function rankingMode(record) {
    if (record.modo === "freeplay" || record.modo === "historia") return record.modo;
    return record.fase === undefined || record.fase === null ? "freeplay" : "historia";
}

function rankingSongs(records, mode) {
    return [...new Set(records
        .filter(record => rankingMode(record) === mode && typeof record.musica === "string" && record.musica.trim())
        .map(record => record.musica.trim()))]
        .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

function aggregateRanking(records, tab) {
    const groups = new Map();
    const membrosPorBanda = new Map();
    records.forEach((record) => {
        const score = Number(record.pontuacao);
        if (!record.nome || !Number.isFinite(score)) return;
        // Registros de banda não pertencem a um jogador individual e, por isso,
        // não têm jogadorId. Eles são válidos exclusivamente na aba Bandas.
        if (tab !== "bandas" && !record.jogadorId) return;
        const band = normalizeBand(record.banda);
        if (tab === "bandas") {
            if (!band) return;
            const current = groups.get(band.id) || { id: band.id, nome: band.nome, pontuacao: 0, instrumento: null, membros: [], pontuacaoExplicita: -1 };
            if (record.jogadorId) {
                const membros = membrosPorBanda.get(band.id) || new Map();
                const membro = membros.get(record.jogadorId);
                if (!membro || score > membro.pontuacao) membros.set(record.jogadorId, {
                    nome: record.nome,
                    instrumento: record.instrumento,
                    pontuacao: score,
                });
                membrosPorBanda.set(band.id, membros);
            } else if (score > current.pontuacaoExplicita) {
                current.pontuacaoExplicita = score;
                current.pontuacao = score;
                current.membros = Array.isArray(record.membros) ? record.membros : [];
            }
            groups.set(band.id, current);
            return;
        }
        if (record.instrumento?.toLowerCase() !== tab.toLowerCase()) return;
        const current = groups.get(record.jogadorId);
        if (!current || score > current.pontuacao)
            groups.set(record.jogadorId, {
                id: record.jogadorId,
                nome: record.nome,
                instrumento: record.instrumento,
                pontuacao: score,
            });
    });
    if (tab === "bandas") {
        for (const [id, band] of groups) {
            if (band.pontuacaoExplicita >= 0) continue;
            const membros = [...(membrosPorBanda.get(id)?.values() || [])];
            band.pontuacao = membros.reduce((total, membro) => total + membro.pontuacao, 0);
            band.membros = membros;
        }
    }
    return [...groups.values()].sort(
        (left, right) =>
            right.pontuacao - left.pontuacao ||
            left.nome.localeCompare(right.nome),
    );
}

function renderRankingChampions(records, mode, song) {
    const container = document.querySelector("#ranking-champions");
    if (!container) return;
    const scopedRecords = records.filter(record => rankingMode(record) === mode && record.musica === song);
    const instrumentos = ["Guitarra", "Baixo", "Bateria", "Teclado"];
    const campeoes = instrumentos
        .map((instrumento) => ({
            instrumento,
            jogador: aggregateRanking(scopedRecords, instrumento)[0],
        }))
        .filter(({ jogador }) => jogador);
    container.hidden = campeoes.length === 0;
    container.innerHTML = campeoes
        .map(({ instrumento, jogador }) =>
            '<article class="ranking-champion"><span>' +
            escapeHtml(instrumento.toUpperCase()) +
            ' // 1º LUGAR</span><strong>' +
            escapeHtml(jogador.nome) +
            '</strong><small>' +
            formatScore(jogador.pontuacao) +
            ' PONTOS</small></article>'
        )
        .join("");
}

function formatScore(score) {
    return new Intl.NumberFormat("pt-BR").format(score);
}

function escapeHtml(value) {
    return String(value).replace(
        /[&<>'"]/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "'": "&#039;",
                '"': "&quot;",
            })[character],
    );
}

function renderRankingTab(records, tab, player) {
    const list = document.querySelector("#ranking-list");
    const mine = document.querySelector("#my-ranking");
    const ranking = aggregateRanking(records, tab);
    const top = ranking.slice(0, 100);
    const playerId = tab === "bandas" ? normalizeBand(player?.banda)?.id : player?.nome?.toLowerCase();
    const playerPosition = playerId
        ? ranking.findIndex((item) => item.id === playerId)
        : -1;
    list.innerHTML = top.length
        ? top
              .map((item, index) => {
                  const detalhe = item.membros?.length
                      ? item.membros.map(membro =>
                          '<li><b>' + escapeHtml(formatInstrument(membro.instrumento)) +
                          '</b><span>' + escapeHtml(membro.nome) + '</span><strong>' +
                          formatScore(membro.pontuacao) + '</strong></li>'
                      ).join('')
                      : '<li class="band-members-empty">Sem integrantes detalhados.</li>';
                  const nome = tab === "bandas"
                      ? '<div class="ranking-band-cell"><button type="button" class="band-members-trigger" aria-expanded="false">' +
                          escapeHtml(item.nome) + '<small>TOQUE / SEGURE PARA VER A BANDA</small></button>' +
                          '<div class="band-members-popover"><span>INTEGRANTES // PONTUAÇÃO</span><ul>' +
                          detalhe + '</ul></div></div>'
                      : '<span>' + escapeHtml(item.nome) + '<small>' +
                          escapeHtml(formatInstrument(item.instrumento)) + '</small></span>';
                  return '<div class="ranking-row ' + (item.id === playerId ? 'current' : '') +
                      '"><b>' + String(index + 1).padStart(2, "0") + '</b>' + nome + '<strong>' +
                      formatScore(item.pontuacao) + '</strong></div>';
              })
              .join("")
        : '<p class="ranking-empty">NENHUM RESULTADO REAL REGISTRADO.</p>';
    if (playerPosition >= top.length) {
        const item = ranking[playerPosition];
        mine.hidden = false;
        mine.innerHTML = `<span>SEU SINAL</span><strong>${playerPosition + 1}º — ${escapeHtml(item.nome)} — ${formatScore(item.pontuacao)}</strong>`;
    } else {
        mine.hidden = true;
        mine.innerHTML = "";
    }
}

async function initializeRanking() {
    const player = getPlayer();
    if (!player) {
        window.location.href = "index.html";
        return;
    }
    document.querySelector("#ranking-player").textContent = player.nome;
    const list = document.querySelector("#ranking-list");
    const status = document.querySelector("#ranking-status");
    const tabs = document.querySelectorAll("[data-ranking-tab]");
    const modeTabs = document.querySelectorAll("[data-ranking-mode]");
    const songSelect = document.querySelector("#ranking-song-select");
    let records = [];
    let dataAvailable = false;
    let selectedMode = "freeplay";
    let selectedSong = "";
    let selectedTab = "Guitarra";
    let holdTimer;
    let heldBandCell = null;
    const posicionarDetalhesDaBanda = (cell) => {
        const popover = cell.querySelector(".band-members-popover");
        if (!popover) return;
        cell.classList.remove("popover-up");
        const verificar = () => {
            if (popover.getBoundingClientRect().bottom > window.innerHeight - 8) {
                cell.classList.add("popover-up");
            }
        };
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(verificar);
        else verificar();
    };
    const setBandDetails = (cell, aberto) => {
        cell.classList.toggle("is-open", aberto);
        cell.querySelector(".band-members-trigger")?.setAttribute("aria-expanded", String(aberto));
        if (aberto) posicionarDetalhesDaBanda(cell);
    };
    list?.addEventListener?.("pointerover", (event) => {
        const cell = event.target.closest?.(".ranking-band-cell");
        if (cell) posicionarDetalhesDaBanda(cell);
    });
    list?.addEventListener?.("click", (event) => {
        const trigger = event.target.closest?.(".band-members-trigger");
        if (!trigger) return;
        const cell = trigger.closest(".ranking-band-cell");
        if (heldBandCell === cell) {
            heldBandCell = null;
            return;
        }
        setBandDetails(cell, !cell.classList.contains("is-open"));
    });
    list?.addEventListener?.("pointerdown", (event) => {
        if (event.pointerType !== "touch") return;
        const cell = event.target.closest?.(".ranking-band-cell");
        if (!cell) return;
        holdTimer = setTimeout(() => {
            heldBandCell = cell;
            setBandDetails(cell, true);
        }, 450);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(eventName =>
        list?.addEventListener?.(eventName, () => clearTimeout(holdTimer))
    );
    const renderSelection = () => {
        const scopedRecords = selectedSong
            ? records.filter(record => rankingMode(record) === selectedMode && record.musica === selectedSong)
            : [];
        renderRankingChampions(records, selectedMode, selectedSong);
        renderRankingTab(dataAvailable ? scopedRecords : [], selectedTab, player);
    };
    const updateSongs = () => {
        if (!songSelect) return;
        const previous = selectedSong;
        const songs = rankingSongs(records, selectedMode);
        songSelect.replaceChildren();
        if (!songs.length) {
            const empty = document.createElement("option");
            empty.value = "";
            empty.textContent = "NENHUMA MÚSICA COM RESULTADOS";
            songSelect.append(empty);
            songSelect.disabled = true;
            selectedSong = "";
            return;
        }
        for (const song of songs) {
            const option = document.createElement("option");
            option.value = song;
            option.textContent = song;
            songSelect.append(option);
        }
        songSelect.disabled = false;
        selectedSong = songs.includes(previous) ? previous : songs[0];
        songSelect.value = selectedSong;
    };
    const selectTab = (tab) => {
        selectedTab = tab;
        tabs.forEach((button) =>
            button.classList.toggle(
                "active",
                button.dataset.rankingTab === tab,
            ),
        );
        renderSelection();
    };
    tabs.forEach((button) =>
        button.addEventListener("click", () =>
            selectTab(button.dataset.rankingTab),
    ),
    );
    modeTabs.forEach(button => button.addEventListener("click", () => {
        selectedMode = button.dataset.rankingMode;
        modeTabs.forEach(item => item.classList.toggle("active", item === button));
        updateSongs();
        renderSelection();
    }));
    songSelect?.addEventListener("change", () => {
        selectedSong = songSelect.value;
        renderSelection();
    });
    selectTab("Guitarra");
    updateSongs();
    renderSelection();
    const socket = getGameSocket();
    const atualizar = (payload) => {
        records = payload.records;
        dataAvailable = true;
        status.textContent = `SINAL ONLINE // ${records.length} REGISTRO(S) SINCRONIZADO(S)`;
        updateSongs();
        selectTab(document.querySelector(".ranking-tab.active")?.dataset.rankingTab || "Guitarra");
    };
    socket.on("rankingAtualizado", atualizar);
    const entrar = () => {
        status.textContent = "SINCRONIZANDO DADOS...";
        socket.timeout(10000).emit("entrarRanking", {}, (error, resposta) => {
            if (error || !resposta?.ok) {
                status.textContent = "FALHA AO SINCRONIZAR RANKING // TENTE RECONECTAR";
                return;
            }
            atualizar(resposta);
        });
    };
    socket.on("connect", entrar);
    socket.on("disconnect", () => { status.textContent = "SEM SINAL // AGUARDANDO RECONEXÃO"; });
    socket.on("connect_error", () => { status.textContent = "FALHA AO CONECTAR // TENTANDO NOVAMENTE"; });
    if (socket.connected) entrar();
}

function initializeTicket() {
    const player = ensurePlayer();
    if (!player || !localStorage.getItem(STORAGE.roomId)) {
        window.location.href = "lobby.html";
        return;
    }
    initializeRoomPresence(player);
    const mode = readJson(STORAGE.mode, { tipo: "freeplay", fase: null });
    const lobby = getLobby();
    document.querySelector("#ticket-date").textContent =
        new Intl.DateTimeFormat("pt-BR").format(new Date());
    document.querySelector("#ticket-player").textContent = player.nome;
    document.querySelector("#ticket-id").textContent = player.id;
    document.querySelector("#ticket-instrument").textContent = formatInstrument(
        player.instrumento,
    );
    document.querySelector("#ticket-mode").textContent =
        mode.tipo === "historia" ? "MODO HISTÓRIA" : "FREEPLAY";
    document.querySelector("#ticket-stage").textContent =
        mode.tipo === "historia" ? `FASE ${mode.fase}` : "LIVRE";
    document.querySelector("#ticket-band").textContent = readJson(STORAGE.roomBand, null)?.nome || "SEM BANDA";
    document.querySelector("#ticket-count").textContent = lobby.length;
    document.querySelector("#ticket-code").textContent = player.id
        .slice(-4)
        .toUpperCase();
    document.querySelector("#ticket-lobby").innerHTML = lobby
        .map(
            (item) =>
                `<div class="roster-row ${item.id === player.id ? "current" : ""}"><span><strong>${item.nome}</strong> ${item.id === player.id ? "// VOCÊ" : ""}</span><span>${formatInstrument(item.instrumento)} · ${item.id}</span></div>`,
        )
        .join("");
}

if (currentPage === "login") initializeLogin();
if (currentPage === "lobby") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeLobby, {
            once: true,
        });
    } else {
        initializeLobby();
    }
}
if (currentPage === "instrumentos") initializeInstruments();
if (currentPage === "modos") initializeModes();
if (currentPage === "ticket") initializeTicket();
if (currentPage === "ranking") initializeRanking();
if (currentPage === "perfil") initializeProfile();

// O jogo Phaser pode consumir as mesmas chaves ao abrir jogo.html. Ao concluir uma fase,
// marque progress[fase - 1] = true e persista com writeJson(STORAGE.progress, progress).
