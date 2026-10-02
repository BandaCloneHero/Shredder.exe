class ShredderAccountUI {
  constructor(accountManager) {
    this.account = accountManager;
    this.modalEl = null;
    this.statusContainerEl = null;
    this.cosmeticsRequestId = 0;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init(), { once: true });
    } else {
      this.init();
    }
  }

  async init() {
    this.injectStyles();
    this.createStatusWidget();
    this.createModal();

    this.hadActiveSession = this.account.snapshot().isLoggedIn;
    this.account.onChange((state) => {
      this.updateUI(state);
      if (state.isLoggedIn) {
        this.hadActiveSession = true;
        return;
      }
      const currentPage = window.location.pathname.split('/').pop();
      if (this.hadActiveSession && currentPage !== 'index.html' && currentPage !== '') {
        window.location.href = 'index.html';
      }
    });

    await this.account.restore();
    this.updateUI(this.account.snapshot());
  }

  injectStyles() {
    if (document.getElementById('shredder-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'shredder-auth-styles';
    style.textContent = `
      .shredder-auth-widget { position: fixed; top: 15px; right: 15px; z-index: 9999; font-family: system-ui, -apple-system, sans-serif; }
      .shredder-auth-btn { background: #111; color: #00ffcc; border: 1px solid #00ffcc; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: all 0.2s; box-shadow: 0 0 10px rgba(0, 255, 204, 0.2); }
      .shredder-auth-btn:hover { background: #00ffcc; color: #111; box-shadow: 0 0 15px rgba(0, 255, 204, 0.5); }
      .shredder-auth-user { display: flex; align-items: center; gap: 10px; background: rgba(17, 17, 17, 0.9); border: 1px solid #333; padding: 6px 12px; border-radius: 6px; color: #fff; font-size: 14px; }
      .shredder-profile-btn { display: inline-flex; align-items: center; gap: 7px; color: #00ffcc; font-weight: bold; text-decoration: none; }
      .shredder-avatar-stage { position: relative; display: inline-grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; isolation: isolate; }
      .shredder-player-icon { position: relative; z-index: 2; display: grid; width: 23px; height: 23px; place-items: center; border: 1px solid rgba(0, 240, 255, 0.65); border-radius: 50%; color: #00f0ff; background: radial-gradient(circle, #10131b 35%, rgba(0, 240, 255, .1)); box-shadow: 0 0 7px rgba(0, 240, 255, .35); }
      .shredder-player-icon svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
      .shredder-player-icon::before { position: absolute; z-index: 3; inset: -4px; content: ''; background: center / contain no-repeat; pointer-events: none; }
      .shredder-avatar-stage::before, .shredder-avatar-stage::after { position: absolute; inset: 2px; content: ''; border: 1px solid transparent; border-radius: 50%; pointer-events: none; }
      .shredder-avatar-stage::before { z-index: 0; opacity: .65; filter: blur(4px); background: var(--mini-effect, transparent); }
      .shredder-avatar-stage::after { z-index: 1; border-color: var(--mini-effect, transparent); box-shadow: 0 0 8px var(--mini-effect, transparent); }
      .shredder-avatar-mark { position: absolute; z-index: 3; top: -1px; right: 0; color: var(--mini-effect, transparent); font: 700 10px Orbitron, monospace; text-shadow: 0 0 5px currentColor, 0 0 9px currentColor; }
      .shredder-avatar-stage[data-frame='frame-royal'] .shredder-avatar-mark { top: -9px; right: 50%; color: #fff0a3; font-size: 16px; transform: translateX(50%); text-shadow: 0 0 4px #fff, 0 0 9px #ffe36d, 0 0 16px #ff8c00; }
      .shredder-avatar-stage[data-effect='effect-pulse'] { --mini-effect: #ff007f; }
      .shredder-avatar-stage[data-effect='effect-lightning'] { --mini-effect: #00f0ff; }
      .shredder-avatar-stage[data-effect='effect-stars'] { --mini-effect: #fff69a; }
      .shredder-avatar-stage[data-effect='effect-flame'] { --mini-effect: #ff542e; }
      .shredder-avatar-stage[data-effect='effect-notes'] { --mini-effect: #a4ff69; }
      .shredder-avatar-stage[data-effect='effect-glitch'] { --mini-effect: #ff4dcc; }
      .shredder-avatar-stage[data-effect='effect-aura'] { --mini-effect: #b6ff3b; }
      .shredder-avatar-stage[data-effect='effect-supernova'] { --mini-effect: #d95cff; }
      .shredder-avatar-stage[data-effect='effect-dragon'] { --mini-effect: #00f0ff; }
      .shredder-avatar-stage[data-effect='effect-headliner'] { --mini-effect: #ffe36d; }
      .shredder-avatar-stage[data-frame='frame-aurora'] { --mini-effect: #78ffce; }
      .shredder-avatar-stage[data-frame='frame-prism'] { --mini-effect: #d95cff; }
      .shredder-avatar-stage[data-frame='frame-comet'] { --mini-effect: #9ceeff; }
      .shredder-avatar-stage[data-frame='frame-circuit'] { --mini-effect: #b6ff3b; }
      .shredder-avatar-stage[data-frame='frame-royal'] { --mini-effect: #ffe36d; }
      .shredder-avatar-stage[data-frame='frame-royal']::before { inset: -3px; border: 1px solid #ffbf38; border-radius: 50%; background: transparent; box-shadow: 0 0 9px #ffb51b, inset 0 0 7px #ffb51b; filter: none; opacity: .95; animation: shredder-mini-pulse 2.4s ease-in-out infinite; }
      .shredder-avatar-stage[data-frame='frame-void'] { --mini-effect: #d95cff; }
      .shredder-avatar-stage[data-effect='effect-pulse']::after, .shredder-avatar-stage[data-effect='effect-aura']::after { animation: shredder-mini-pulse 1.5s ease-in-out infinite; }
      .shredder-avatar-stage[data-effect='effect-lightning']::after { border-style: dashed; animation: shredder-mini-flicker .7s steps(2, end) infinite; }
      .shredder-avatar-stage[data-effect='effect-stars']::after, .shredder-avatar-stage[data-effect='effect-notes']::after { border-style: dotted; animation: shredder-mini-orbit 8s linear infinite; }
      .shredder-avatar-stage[data-effect='effect-flame']::before { animation: shredder-mini-fire .7s ease-in-out infinite alternate; }
      .shredder-avatar-stage[data-effect='effect-glitch']::after { box-shadow: 2px 0 #00f0ff, -2px 1px #ff007f; animation: shredder-mini-flicker .45s steps(2, end) infinite; }
      .shredder-avatar-stage[data-effect='effect-supernova']::after { inset: -2px; border: 2px dotted #ffe36d; box-shadow: 0 0 12px #d95cff, 0 0 20px #00f0ff; animation: shredder-mini-orbit 4s linear infinite; }
      .shredder-avatar-stage[data-effect='effect-dragon']::after { inset: -3px; border: 2px solid transparent; background: linear-gradient(#111, #111) padding-box, conic-gradient(#ff542e, #ffe36d, #d95cff, #00f0ff, #b6ff3b, #ff542e) border-box; box-shadow: 0 0 10px #d95cff; animation: shredder-mini-orbit 3s linear infinite; }
      .shredder-avatar-stage[data-effect='effect-headliner']::after { inset: -3px; border: 3px double #ffe36d; box-shadow: 0 0 15px #ffb51b, inset 0 0 7px #ffb51b; animation: shredder-mini-pulse 1.7s ease-in-out infinite; }
      .shredder-player-icon[data-frame='frame-cyberpunk'] { border-color: #00f0ff; box-shadow: 0 0 8px #00f0ff; }
      .shredder-player-icon[data-frame='frame-cyberpunk']::before { background-image: url('images/moldura-cyberpunk-musical.png'); filter: drop-shadow(0 0 4px #00f0ff); }
      .shredder-player-icon[data-frame='frame-magma'] { border: 2px double #ff542e; box-shadow: 0 0 8px #ff321d; }
      .shredder-player-icon[data-frame='frame-frost'] { border: 2px dashed #9af7ff; box-shadow: 0 0 8px #75eaff; }
      .shredder-player-icon[data-frame='frame-gold'] { border: 2px double #ffd76b; box-shadow: 0 0 9px #ffb51b; }
      .shredder-player-icon[data-frame='frame-pixel'] { border: 2px dashed #ff4dcc; border-radius: 6px; box-shadow: 0 0 8px #ff4dcc; }
      .shredder-player-icon[data-frame='frame-violet'] { border: 2px dotted #bb77ff; box-shadow: 0 0 9px #9a42ff; }
      .shredder-player-icon[data-frame='frame-aurora'] { border: 2px solid #78ffce; box-shadow: 0 0 9px #48ffc3; }
      .shredder-player-icon[data-frame='frame-prism'] { border: 2px solid #fff; box-shadow: 0 0 12px #d95cff, inset 0 0 7px #00f0ff; }
      .shredder-player-icon[data-frame='frame-comet'] { border: 2px dashed #9ceeff; box-shadow: 0 0 12px #00cfff; }
      .shredder-player-icon[data-frame='frame-circuit'] { border: 2px dashed #b6ff3b; border-radius: 6px; box-shadow: 0 0 10px #b6ff3b; }
      .shredder-player-icon[data-frame='frame-royal'] { border: 3px double #ffe36d; box-shadow: 0 0 12px #ffb51b, inset 0 0 7px #ffb51b; }
      .shredder-player-icon[data-frame='frame-void'] { border: 2px solid #d95cff; box-shadow: 0 0 10px #d95cff, inset 0 0 10px #6522a5; }
      .shredder-player-icon[data-frame='frame-aurora']::before { inset: -3px; border: 1px solid #78ffce; border-radius: 50%; box-shadow: 0 0 9px #48ffc3; animation: shredder-mini-aurora 3s ease-in-out infinite alternate; }
      .shredder-player-icon[data-frame='frame-prism']::before { inset: -3px; border: 2px double #fff; border-radius: 50%; box-shadow: 0 0 9px #d95cff, 0 0 14px #00f0ff; animation: shredder-mini-aurora 2s linear infinite alternate; }
      .shredder-player-icon[data-frame='frame-comet']::before { inset: -4px; border: 1px dashed #9ceeff; border-radius: 50%; box-shadow: 0 0 10px #00cfff; animation: shredder-mini-orbit 2s linear infinite; }
      .shredder-player-icon[data-frame='frame-circuit']::before { inset: -3px; border: 1px dashed #b6ff3b; border-radius: 7px; box-shadow: 0 0 9px #b6ff3b; animation: shredder-mini-flicker .9s steps(2, end) infinite; }
      .shredder-player-icon[data-frame='frame-royal']::before { inset: -4px; border: 2px double #ffe36d; border-radius: 50%; box-shadow: 0 0 11px #ffb51b, inset 0 0 7px #ffb51b; animation: shredder-mini-pulse 2s ease-in-out infinite; }
      .shredder-champions-wings { position: absolute; z-index: 1; inset: -3px -16px; pointer-events: none; opacity: 0; }
      .shredder-champions-wings i, .shredder-champions-wings b { position: absolute; top: 7px; width: 29px; height: 22px; background: repeating-linear-gradient(105deg, transparent 0 5px, rgba(255, 248, 201, .45) 6px 7px, transparent 8px 10px), linear-gradient(145deg, #fff9cb, #ffcf55 52%, #b66a12); filter: drop-shadow(0 0 4px #ffbf38); }
      .shredder-champions-wings i { left: 0; clip-path: polygon(98% 64%, 80% 57%, 74% 27%, 67% 49%, 51% 8%, 53% 46%, 28% 0, 39% 49%, 5% 20%, 29% 59%, 0 54%, 31% 71%, 10% 84%, 48% 80%, 68% 100%, 78% 80%); transform-origin: 96% 64%; }
      .shredder-champions-wings b { right: 0; clip-path: polygon(2% 64%, 20% 57%, 26% 27%, 33% 49%, 49% 8%, 47% 46%, 72% 0, 61% 49%, 95% 20%, 71% 59%, 100% 54%, 69% 71%, 90% 84%, 52% 80%, 32% 100%, 22% 80%); transform-origin: 4% 64%; }
      .shredder-avatar-stage[data-frame='frame-royal'] .shredder-champions-wings { opacity: 1; }
      .shredder-avatar-stage[data-frame='frame-royal'] .shredder-champions-wings i { animation: shredder-wing-left 1.15s ease-in-out infinite alternate; }
      .shredder-avatar-stage[data-frame='frame-royal'] .shredder-champions-wings b { animation: shredder-wing-right 1.15s ease-in-out -.12s infinite alternate; }
      .shredder-player-icon[data-frame='frame-void']::before { inset: -3px; border: 1px solid #d95cff; border-radius: 50%; box-shadow: 0 0 12px #d95cff, 0 0 18px #6522a5; animation: shredder-mini-orbit 5s linear infinite; }
      .shredder-player-icon[data-background='bg-space'] { background-color: #28124f; }
      .shredder-player-icon[data-background='bg-sunset'] { background: radial-gradient(circle at 50% 75%, #ffcf5c, #ef4f73 55%, #321557); }
      .shredder-player-icon[data-background='bg-grid'] { background: linear-gradient(rgba(255,0,127,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,.4) 1px, transparent 1px), #151027; background-size: 6px 6px; }
      .shredder-player-icon[data-background='bg-matrix'] { background: repeating-linear-gradient(0deg, #07190f 0 3px, #35c45c 4px 5px); }
      .shredder-player-icon[data-background='bg-stage'] { background: radial-gradient(ellipse at 50% 0, #fff8bd, #b548d8 35%, #111322); }
      .shredder-player-icon[data-background='bg-crimson'] { background: radial-gradient(circle at 50% 20%, #ff6c6c, #70192e 55%, #100b16); }
      .shredder-player-icon[data-background='bg-ocean'] { background: repeating-radial-gradient(ellipse at 50% 115%, #29ddff 0 2px, #06406c 3px 6px, #071222 8px 11px); }
      .shredder-player-icon[data-avatar]:not([data-avatar='']) { border-radius: 50%; background-size: cover; background-position: center; background-repeat: no-repeat; }
      .shredder-player-icon[data-avatar]:not([data-avatar='']) svg { visibility: hidden; }
      @keyframes shredder-mini-pulse { 50% { transform: scale(1.13); opacity: .55; } }
      @keyframes shredder-mini-flicker { 50% { opacity: .28; transform: translateX(1px); } }
      @keyframes shredder-mini-orbit { to { transform: rotate(360deg); } }
      @keyframes shredder-mini-fire { to { transform: scale(1.12); filter: brightness(1.35); } }
      @keyframes shredder-mini-aurora { to { filter: hue-rotate(35deg) brightness(1.4); box-shadow: 0 0 14px #48ffc3, inset 0 0 8px #d95cff; } }
      @keyframes shredder-wing-left { to { transform: rotate(-11deg) rotateY(24deg) translateY(-3px) scaleY(.82); filter: drop-shadow(0 0 7px #fff1a8); } }
      @keyframes shredder-wing-right { to { transform: rotate(11deg) rotateY(-24deg) translateY(-3px) scaleY(.82); filter: drop-shadow(0 0 7px #fff1a8); } }
      @media (prefers-reduced-motion: reduce) { .shredder-avatar-stage::before, .shredder-avatar-stage::after, .shredder-player-icon[data-frame]::before, .shredder-champions-wings i, .shredder-champions-wings b { animation: none !important; } }
      .shredder-profile-btn:hover, .shredder-profile-btn:focus-visible { color: #fff; text-decoration: underline; }
      .shredder-logout-btn { background: transparent; border: 1px solid #ff4444; color: #ff4444; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s; }
      .shredder-logout-btn:hover { background: #ff4444; color: #fff; }
      .shredder-modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; pointer-events: none; transition: opacity 0.2s ease; }
      .shredder-modal-backdrop.open { opacity: 1; pointer-events: auto; }
      .shredder-modal-box { background: #16161a; border: 1px solid #2a2a33; border-radius: 12px; width: min(380px, calc(100% - 32px)); padding: 24px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); color: #fffffe; }
      .shredder-modal-box h3 { margin: 0 0 16px; font-size: 20px; color: #00ffcc; text-align: center; }
      .shredder-input-group { margin-bottom: 14px; }
      .shredder-input-group label { display: block; font-size: 12px; color: #94a1b2; margin-bottom: 6px; }
      .shredder-input-group input { width: 100%; padding: 10px 12px; background: #24242e; border: 1px solid #3d3d4d; border-radius: 6px; color: #fff; font-size: 14px; box-sizing: border-box; }
      .shredder-input-group input:focus { border-color: #00ffcc; outline: none; }
      .shredder-error-msg { color: #ff5555; font-size: 12px; margin-bottom: 12px; text-align: center; min-height: 16px; }
      .shredder-modal-actions { display: flex; gap: 10px; margin-top: 20px; }
      .shredder-modal-actions button { flex: 1; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none; }
      .shredder-btn-primary { background: #00ffcc; color: #111; }
      .shredder-btn-primary:hover { background: #00ccb0; }
      .shredder-btn-secondary { background: #24242e; color: #fffffe; border: 1px solid #3d3d4d !important; }
      .shredder-btn-secondary:hover { background: #2e2e3d; }
    `;
    document.head.appendChild(style);
  }

  createStatusWidget() {
    this.statusContainerEl = document.createElement('div');
    this.statusContainerEl.className = 'shredder-auth-widget';
    document.body.appendChild(this.statusContainerEl);
  }

  createModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'shredder-modal-backdrop';
    backdrop.innerHTML = `
      <div class="shredder-modal-box" role="dialog" aria-modal="true" aria-labelledby="shredder-modal-title">
        <h3 id="shredder-modal-title">Identidade no Shredder</h3>
        <form id="shredder-auth-form">
          <div class="shredder-input-group"><label for="shredder-username">Usuário (3 a 24 caracteres, letras/números)</label><input type="text" id="shredder-username" required autocomplete="username"></div>
          <div class="shredder-input-group"><label for="shredder-password">Senha (mínimo de 6 caracteres)</label><input type="password" id="shredder-password" required autocomplete="current-password"></div>
          <div id="shredder-error" class="shredder-error-msg" role="alert"></div>
          <div class="shredder-modal-actions"><button type="button" id="shredder-btn-cancel" class="shredder-btn-secondary">Cancelar</button><button type="submit" id="shredder-btn-submit" class="shredder-btn-primary">Entrar</button></div>
        </form>
        <div style="text-align: center; margin-top: 15px;"><button type="button" id="shredder-mode-switch" style="background: none; border: none; color: #00ffcc; cursor: pointer; font-size: 12px; text-decoration: underline;">Não tem conta? Crie uma agora</button></div>
      </div>
    `;
    document.body.appendChild(backdrop);
    this.modalEl = backdrop;
    this.formEl = backdrop.querySelector('#shredder-auth-form');
    this.titleEl = backdrop.querySelector('#shredder-modal-title');
    this.usernameInput = backdrop.querySelector('#shredder-username');
    this.passwordInput = backdrop.querySelector('#shredder-password');
    this.errorEl = backdrop.querySelector('#shredder-error');
    this.submitBtn = backdrop.querySelector('#shredder-btn-submit');
    this.switchBtn = backdrop.querySelector('#shredder-mode-switch');
    this.cancelBtn = backdrop.querySelector('#shredder-btn-cancel');
    this.isRegisterMode = false;

    this.switchBtn.addEventListener('click', () => {
      this.isRegisterMode = !this.isRegisterMode;
      this.errorEl.textContent = '';
      this.titleEl.textContent = this.isRegisterMode ? 'Criar Nova Conta' : 'Entrar na Conta';
      this.submitBtn.textContent = this.isRegisterMode ? 'Cadastrar' : 'Entrar';
      this.switchBtn.textContent = this.isRegisterMode ? 'Já tem conta? Faça login' : 'Não tem conta? Crie uma agora';
    });
    this.cancelBtn.addEventListener('click', () => this.closeModal());
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) this.closeModal();
    });
    this.formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      this.errorEl.textContent = '';
      this.submitBtn.disabled = true;
      try {
        const user = this.usernameInput.value.trim();
        const pass = this.passwordInput.value;
        if (this.isRegisterMode) await this.account.register(user, pass);
        else await this.account.login(user, pass);
        this.closeModal();
      } catch (error) {
        this.errorEl.textContent = error.message;
      } finally {
        this.submitBtn.disabled = false;
      }
    });
  }

  openModal() {
    this.errorEl.textContent = '';
    this.usernameInput.value = '';
    this.passwordInput.value = '';
    this.modalEl.classList.add('open');
    this.usernameInput.focus();
  }

  closeModal() {
    this.modalEl.classList.remove('open');
  }

  async loadProfileCosmetics(username, stage, icon) {
    const requestId = ++this.cosmeticsRequestId;
    try {
      const response = await fetch(`/api/perfil/${encodeURIComponent(username)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || requestId !== this.cosmeticsRequestId || !stage.isConnected) return;
      this.applyCosmetics(payload.profile?.cosmetics, stage, icon, payload.profile?.avatar);
    } catch { /* O widget continua mostrando o avatar padrão se a rede falhar. */ }
  }

  applyCosmetics(cosmetics, stage = this.statusContainerEl?.querySelector('.shredder-avatar-stage'), icon = this.statusContainerEl?.querySelector('.shredder-player-icon'), avatar = '') {
    if (!stage || !icon) return;
    const equipped = cosmetics?.equipped || {};
    stage.dataset.frame = equipped.moldura || '';
    stage.dataset.effect = equipped.efeito || '';
    icon.dataset.frame = equipped.moldura || '';
    icon.dataset.background = equipped.fundo || '';
    const avatarIds = ['night-sentinel', 'astral-oracle', 'fox-wanderer', 'dune-explorer', 'deep-diver', 'crystal-golem', 'forest-spirit', 'nocturne', 'alien-roamer', 'neon-android', 'starfarer', 'void-knight', 'frost-mage', 'sun-guardian', 'shadow-scout', 'brass-automaton', 'mothling', 'neon-familiar', 'rune-guardian', 'aurora-entity', 'pulse-vanguard', 'neon-reaper', 'beat-runner', 'soundcrow'];
    icon.dataset.avatar = avatarIds.includes(avatar) ? avatar : '';
    icon.style.backgroundImage = icon.dataset.avatar ? `url("images/avatars/${icon.dataset.avatar}.png?v=4")` : '';
    icon.style.backgroundSize = icon.dataset.avatar ? 'cover' : '';
    icon.style.backgroundPosition = icon.dataset.avatar ? 'center' : '';
    icon.style.backgroundRepeat = icon.dataset.avatar ? 'no-repeat' : '';
    const marks = { 'effect-lightning': 'ϟ', 'effect-stars': '✦', 'effect-flame': '◆', 'effect-notes': '♫', 'effect-glitch': '+', 'effect-aura': '✧', 'effect-pulse': '•', 'effect-supernova': '✺', 'effect-dragon': 'ϟ', 'effect-headliner': '♛' };
    const frameMarks = { 'frame-royal': '♛', 'frame-comet': '✦', 'frame-prism': '✧' };
    const mark = stage.querySelector('.shredder-avatar-mark');
    if (mark) mark.textContent = marks[equipped.efeito] || frameMarks[equipped.moldura] || '';
  }

  updateUI(state) {
    if (state.isLoggedIn) {
      this.statusContainerEl.replaceChildren();
      const userBox = document.createElement('div');
      userBox.className = 'shredder-auth-user';
      const profileLink = document.createElement('a');
      profileLink.className = 'shredder-profile-btn';
      profileLink.href = `perfil.html?username=${encodeURIComponent(state.user)}`;
      const avatarStage = document.createElement('span');
      avatarStage.className = 'shredder-avatar-stage';
      avatarStage.setAttribute('aria-hidden', 'true');
      const championsWings = document.createElement('span');
      championsWings.className = 'shredder-champions-wings';
      championsWings.innerHTML = '<i></i><b></b>';
      const playerIcon = document.createElement('span');
      playerIcon.className = 'shredder-player-icon';
      playerIcon.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"></circle><path d="M5.5 20c.4-3.6 2.8-5.6 6.5-5.6s6.1 2 6.5 5.6"></path></svg>';
      const avatarMark = document.createElement('span');
      avatarMark.className = 'shredder-avatar-mark';
      avatarStage.append(championsWings, playerIcon, avatarMark);
      const playerName = document.createElement('span');
      playerName.textContent = state.user;
      profileLink.append(avatarStage, playerName);
      profileLink.setAttribute('aria-label', `Abrir perfil de ${state.user}`);
      const logoutBtn = document.createElement('button');
      logoutBtn.id = 'shredder-do-logout';
      logoutBtn.className = 'shredder-logout-btn';
      logoutBtn.textContent = 'Sair';
      logoutBtn.addEventListener('click', () => this.account.logout());
      userBox.append(profileLink, logoutBtn);
      this.statusContainerEl.appendChild(userBox);
      this.loadProfileCosmetics(state.user, avatarStage, playerIcon);
    } else {
      this.statusContainerEl.innerHTML = '<button id="shredder-do-login" class="shredder-auth-btn" type="button">Entrar / Conta</button>';
      this.statusContainerEl.querySelector('#shredder-do-login').addEventListener('click', () => this.openModal());
    }
  }
}

window.ShredderAccountUI = ShredderAccountUI;
