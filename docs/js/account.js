class ShredderAccount {
  constructor() {
    this.storageKey = "shredder.account.token.v1";
    this.token = localStorage.getItem(this.storageKey) || null;
    this.user = null;
    this.listeners = new Set();
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
      isLoggedIn: Boolean(this.token && this.user),
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

    const response = await fetch(`${this.baseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.error || "Falha de comunicação com o servidor.");
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  applyAuth(payload) {
    if (payload.token) {
      this.token = payload.token;
      localStorage.setItem(this.storageKey, this.token);
    }
    this.user = payload.username || null;
    this.notify();
    return this.snapshot();
  }

  clear() {
    localStorage.removeItem(this.storageKey);
    this.token = null;
    this.user = null;
    this.notify();
  }

  protectCurrentPage() {
    const paginaAtual = window.location.pathname.split('/').pop();
    // O painel verifica a autorização oficial e mostra a tela de acesso negado
    // por conta própria; não redirecionar antes que essa verificação termine.
    const paginasPublicas = ['index.html', 'operador.html', ''];
    if (paginasPublicas.includes(paginaAtual)) return;

    setTimeout(() => {
      const accountState = this.snapshot();
      if (!accountState.isLoggedIn) {
        alert('Acesso negado: é necessário fazer login para acessar as salas.');
        window.location.href = 'index.html';
      }
    }, 150);
  }

  async restore() {
    if (!this.token) {
      this.protectCurrentPage();
      return this.snapshot();
    }

    try {
      const payload = await this.request("/api/auth/session");
      const state = this.applyAuth(payload);
      this.protectCurrentPage();
      return state;
    } catch (error) {
      // Uma falha de rede durante a navegação entre páginas não invalida a
      // sessão. Só removemos o token quando o servidor confirmar que expirou.
      if (error.status === 401) {
        this.clear();
        this.protectCurrentPage();
      }
      return this.snapshot();
    }
  }

  async login(username, password) {
    const payload = await this.request("/api/auth/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    });
    return this.applyAuth(payload);
  }

  async register(username, password) {
    const payload = await this.request("/api/auth/register", {
      method: "POST",
      body: { username, password },
      auth: false,
    });
    return this.applyAuth(payload);
  }

  async logout() {
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
