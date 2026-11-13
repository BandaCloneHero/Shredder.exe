class ShredderAccount {
  constructor() {
    this.storageKey = "shredder.account.token.v1";
    this.token = localStorage.getItem(this.storageKey) || null;
    this.user = null;
    this.nickname = null;
    this.needsNickname = false;
    this.listeners = new Set();
    this.ready = false;
    this.restorePromise = null;
    this.authRevision = 0;
    this.authBusy = false;
  }

  onChange(callback) {
    this.listeners.add(callback);
    callback(this.snapshot());
    return () => this.listeners.delete(callback);
  }

  notify() {
    const snap = this.snapshot();
    for (const cb of this.listeners) {
      cb(snap);
    }
  }

  snapshot() {
    return {
      token: this.token,
      user: this.user,
      nickname: this.nickname || this.user,
      needsNickname: this.needsNickname,
      isLoggedIn: Boolean(this.token && this.user),
      isRestoring: !this.ready,
    };
  }

  baseUrl() {
    return "";
  }

  async request(path, { method = "GET", body, auth = true } = {}) {
    const headers = { Accept: "application/json" };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (auth && this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const dev = this.codespacesProof;
    if (dev && dev.origin === window.location.origin && method === 'POST' &&
        (/^\/api\/auth\/google(?:\/(?:start|register|link))?$/.test(path) || path === '/api/perfil/apelido')) {
      headers['X-Shredder-Origin'] = dev.origin;
      headers['X-Shredder-Nonce'] = dev.nonce;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${this.baseUrl()}${path}`, {
        method,
        cache: "no-store",
        credentials: "same-origin",
        headers,
        signal: controller.signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || "Falha de comunicação com o servidor.");
        error.status = response.status;
        error.code = payload.code;
        throw error;
      }
      return payload;
    } catch (error) {
      if (controller.signal.aborted) throw Object.assign(new Error("Tempo de comunicação esgotado."), { code: "AUTH_REQUEST_TIMEOUT" });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  applyAuth(payload) {
    if (!payload || typeof payload.username !== "string" || !payload.username) {
      throw new Error("Resposta de autenticação inválida.");
    }
    if (payload.token) {
      try { localStorage.setItem(this.storageKey, payload.token); }
      catch { throw Object.assign(new Error("Não foi possível salvar a sessão."), { code: "AUTH_STORAGE_UNAVAILABLE" }); }
      this.token = payload.token;
    }
    this.authRevision++;
    this.user = payload.username;
    this.nickname = typeof payload.nickname === "string" && payload.nickname.trim() ? payload.nickname : payload.username;
    this.needsNickname = payload.needsNickname === true;
    this.ready = true;
    this.notify();
    return this.snapshot();
  }

  clear() {
    this.authRevision++;
    this.ready = true;
    localStorage.removeItem(this.storageKey);
    this.token = null;
    this.user = null;
    this.nickname = null;
    this.needsNickname = false;
    this.notify();
  }

  protectCurrentPage() {
    const paginaAtual = window.location.pathname.split('/').pop();
    // O painel verifica a autorização oficial e mostra a tela de acesso negado
    // por conta própria; não redirecionar antes que essa verificação termine.
    const paginasPublicas = ['index.html', 'operador.html', ''];
    if (paginasPublicas.includes(paginaAtual)) return;

    if (!this.ready) return;
    // Falha transitória de rede não apaga nem redireciona uma sessão preservada.
    if (!this.snapshot().isLoggedIn && !this.token) {
      alert('Acesso negado: é necessário fazer login para acessar as salas.');
      window.location.href = 'index.html';
    }
  }

  authContext() {
    return { revision: this.authRevision, token: this.token, user: this.user };
  }

  isAuthContextCurrent(context) {
    return context.revision === this.authRevision && context.token === this.token &&
      context.user === this.user && localStorage.getItem(this.storageKey) === this.token;
  }

  async restore() {
    if (this.restorePromise) return this.restorePromise;
    const context = this.authContext();
    this.restorePromise = (async () => {
      try {
        if (this.token) {
          const payload = await this.request("/api/auth/session");
          if (this.isAuthContextCurrent(context)) this.applyAuth(payload);
        }
      } catch (error) {
        if (error.status === 401 && this.isAuthContextCurrent(context)) this.clear();
      } finally {
        this.ready = true;
        this.notify();
        this.protectCurrentPage();
      }
      return this.snapshot();
    })().finally(() => { this.restorePromise = null; });
    return this.restorePromise;
  }

  cancelPendingAuthentication() {
    this.authRevision++;
  }

  async authenticate(path, body, { auth = false, anonymous = false } = {}) {
    if (this.authBusy) throw Object.assign(new Error("Já existe uma entrada em andamento."), { code: "AUTH_BUSY" });
    if (anonymous && this.token) throw Object.assign(new Error("A sessão mudou."), { code: "AUTH_CONTEXT_CHANGED" });
    const context = this.authContext();
    this.authBusy = true;
    try {
      const payload = await this.request(path, { method: "POST", body, auth });
      if (!this.isAuthContextCurrent(context)) throw Object.assign(new Error("A sessão mudou."), { code: "AUTH_CONTEXT_CHANGED" });
      if (!payload.ok) throw new Error("Resposta de autenticação inválida.");
      if (payload.needsRegistration === true && path === "/api/auth/google") return { needsRegistration: true };
      if (!payload.ok || typeof payload.token !== "string" || !payload.token) throw new Error("Resposta de autenticação inválida.");
      return this.applyAuth(payload);
    } finally {
      this.authBusy = false;
    }
  }

  loginGoogle(idToken, loginId) {
    return this.authenticate("/api/auth/google", { idToken, loginId }, { anonymous: true });
  }

  registerGoogle(idToken, username) {
    return this.authenticate("/api/auth/google/register", { idToken, username }, { anonymous: true });
  }

  linkGoogle(idToken, password) {
    if (!this.snapshot().isLoggedIn) return Promise.reject(Object.assign(new Error("Entre novamente."), { code: "LOCAL_SESSION_REQUIRED" }));
    return this.authenticate("/api/auth/google/link", { idToken, password }, { auth: true });
  }

  async updateNickname(nickname) {
    const context = this.authContext();
    const payload = await this.request('/api/perfil/apelido', {method:'POST', body:{nickname}});
    if (!this.isAuthContextCurrent(context)) throw Object.assign(new Error('A sessão mudou.'), {code:'AUTH_CONTEXT_CHANGED'});
    if (!payload.ok || typeof payload.nickname !== 'string' || !payload.nickname.trim()) throw new Error('Resposta inválida.');
    this.nickname = payload.nickname;
    this.needsNickname = payload.needsNickname === true;
    this.notify();
    return payload;
  }

  providers() {
    return this.request("/api/auth/providers");
  }

  login(username, password) {
    return this.authenticate("/api/auth/login", { username, password });
  }

  register(username, password) {
    return this.authenticate("/api/auth/register", { username, password });
  }

  async logout() {
    // Invalida imediatamente operações pendentes, inclusive popup em outra janela.
    this.authRevision++;
    try {
      if (this.token) {
        await this.request("/api/auth/logout", { method: "POST" });
      }
    } finally {
      this.clear();
    }
  }
}

window.ShredderAccount = ShredderAccount;
