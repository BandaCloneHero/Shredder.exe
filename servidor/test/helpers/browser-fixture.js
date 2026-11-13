const fs = require('fs');
const path = require('path');
const vm = require('vm');

// DOM em memória para testar eventos/estados sem instalar dependências de navegador.
// Não simula OAuth, layout ou políticas de popup de um navegador real.
class Element {
    constructor(tag, document) {
        this.tagName = tag.toLowerCase(); this.ownerDocument = document;
        this.children = []; this.handlers = {}; this.attributes = {}; this.style = {}; this.dataset = {};
        this.className = ''; this.value = ''; this.hidden = false; this.disabled = false; this.open = false;
        this.classList = {
            add: name => { this.className = [...new Set([...this.className.split(' '), name])].filter(Boolean).join(' '); },
            remove: name => { this.className = this.className.split(' ').filter(x => x !== name).join(' '); },
            contains: name => this.className.split(' ').includes(name),
        };
    }
    append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; }
    get isConnected() { return this === this.ownerDocument.body || this === this.ownerDocument.head || Boolean(this.parentNode?.isConnected); }
    set textContent(value) { this._text = String(value); this.replaceChildren(); }
    get textContent() { return (this._text || '') + this.children.map(x => x.textContent).join(''); }
    set innerHTML(html) {
        this.replaceChildren(); this._text = '';
        const stack = [this];
        const parts = html.match(/<[^>]+>|[^<]+/g) || [];
        for (const part of parts) {
            if (part.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
            if (part.startsWith('<')) {
                const tag = part.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
                const node = this.ownerDocument.createElement(tag);
                for (const attr of part.matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(attr[1], attr[2]);
                stack.at(-1).append(node);
                if (!['input', 'br', 'img', 'hr', 'meta', 'link'].includes(tag) && !part.endsWith('/>')) stack.push(node);
            } else stack.at(-1)._text = (stack.at(-1)._text || '') + part;
        }
    }
    setAttribute(key, value) {
        this.attributes[key] = String(value);
        if (key === 'class') this.className = String(value);
        else if (['id', 'type', 'name', 'value'].includes(key)) this[key] = String(value);
    }
    getAttribute(key) { return this.attributes[key] ?? null; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
        const match = node => selector[0] === '#' ? node.id === selector.slice(1) :
            selector[0] === '.' ? node.className.split(' ').includes(selector.slice(1)) : node.tagName === selector;
        return this.children.flatMap(node => [...(match(node) ? [node] : []), ...node.querySelectorAll(selector)]);
    }
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
    async dispatch(name, extra = {}) {
        if (this.disabled) return;
        await Promise.all((this.handlers[name] || []).map(fn => fn({ target: this, preventDefault() {}, ...extra })));
    }
    click() { return this.dispatch('click'); }
    focus() { this.ownerDocument.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
}

function browserFixture(fetcher, { initialToken, embedded = false, pathname = '/index.html', googleOnly = false } = {}) {
    const data = new Map();
    if (initialToken) data.set('shredder.account.token.v1', initialToken);
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
    const document = {
        readyState: 'loading', activeElement: null, addEventListener() {},
        createElement: tag => new Element(tag, document),
        getElementById: id => document.querySelector('#' + id),
        querySelector: selector => document.head.querySelector(selector) || document.body.querySelector(selector),
    };
    document.head = new Element('head', document); document.body = new Element('body', document);
    const main = document.createElement('button'); main.id = 'google-login-main'; main.hidden = true;
    const status = document.createElement('p'); status.id = 'google-login-status'; status.hidden = true;
    document.body.append(main, status);
    const events = {};
    const location = { origin: 'https://shredder.feira-de-jogos.dev.br', pathname, href: pathname, assign(url) { this.href = url; } };
    const window = {
        location, SHREDDER_GOOGLE_LOGIN_ENABLED: false, SHREDDER_GOOGLE_ONLY: googleOnly,
        addEventListener: (name, callback) => { events[name] = callback; },
    };
    window.parent = embedded ? {} : window; window.top = window;
    const requests = [];
    const fetch = async (url, options = {}) => {
        requests.push({ url, options });
        return fetcher(url, options);
    };
    const alerts = [];
    const context = vm.createContext({ window, document, localStorage: storage, fetch, URL, AbortController, setTimeout, clearTimeout, alert: value => alerts.push(value) });
    for (const name of ['account.js', 'account-ui.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../../../docs/js', name), 'utf8'), context);
    }
    const account = new window.ShredderAccount();
    const ui = new window.ShredderAccountUI(account);
    ui.loadProfileCosmetics = async () => {};
    return { window, document, storage, data, requests, account, ui, alerts, main, events };
}
module.exports = { browserFixture };
