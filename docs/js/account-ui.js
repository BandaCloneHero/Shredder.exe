class ShredderAccountUI {
  constructor(accountManager) {
    this.account = accountManager;
    this.modalEl = null;
    this.statusContainerEl = null;

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
      .shredder-player-icon { display: inline-grid; width: 23px; height: 23px; place-items: center; border: 1px solid rgba(0, 240, 255, 0.65); border-radius: 50%; color: #00f0ff; background: rgba(0, 240, 255, 0.08); }
      .shredder-player-icon svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
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

  updateUI(state) {
    if (state.isLoggedIn) {
      this.statusContainerEl.replaceChildren();
      const userBox = document.createElement('div');
      userBox.className = 'shredder-auth-user';
      const profileLink = document.createElement('a');
      profileLink.className = 'shredder-profile-btn';
      profileLink.href = `perfil.html?username=${encodeURIComponent(state.user)}`;
      const playerIcon = document.createElement('span');
      playerIcon.className = 'shredder-player-icon';
      playerIcon.setAttribute('aria-hidden', 'true');
      playerIcon.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"></circle><path d="M5.5 20c.4-3.6 2.8-5.6 6.5-5.6s6.1 2 6.5 5.6"></path></svg>';
      const playerName = document.createElement('span');
      playerName.textContent = state.user;
      profileLink.append(playerIcon, playerName);
      profileLink.setAttribute('aria-label', `Abrir perfil de ${state.user}`);
      const logoutBtn = document.createElement('button');
      logoutBtn.id = 'shredder-do-logout';
      logoutBtn.className = 'shredder-logout-btn';
      logoutBtn.textContent = 'Sair';
      logoutBtn.addEventListener('click', () => this.account.logout());
      userBox.append(profileLink, logoutBtn);
      this.statusContainerEl.appendChild(userBox);
    } else {
      this.statusContainerEl.innerHTML = '<button id="shredder-do-login" class="shredder-auth-btn" type="button">Entrar / Conta</button>';
      this.statusContainerEl.querySelector('#shredder-do-login').addEventListener('click', () => this.openModal());
    }
  }
}

window.ShredderAccountUI = ShredderAccountUI;
