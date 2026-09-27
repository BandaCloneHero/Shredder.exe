(() => {
    const account = globalThis.shredderAccount;
    if (!account) return;

    const style = document.createElement('style');
    style.textContent = `
        body.operator-access-pending > main.operator-shell { visibility: hidden; }
        .operator-access-gate {
            position: fixed; z-index: 9998; inset: 0; display: grid; place-items: center;
            padding: 2rem; background: #07080c; color: #00f0ff; text-align: center;
            font: 700 clamp(1rem, 3vw, 2rem)/1.5 'Share Tech Mono', monospace;
        }
        .operator-denied-screen {
            position: fixed; z-index: 2147483647; inset: 0; display: grid;
            place-items: center; width: 100%; min-height: 100vh; min-height: 100dvh;
            padding: clamp(1.25rem, 5vw, 4rem); overflow: auto;
            background: #07080c; color: #ff334f; text-align: center;
            font: 800 clamp(1.8rem, 7vw, 6rem)/1.16 Orbitron, monospace;
            letter-spacing: .025em; overflow-wrap: anywhere;
            text-shadow: 0 0 18px #ff163c, 0 0 55px rgba(255, 22, 60, .65);
        }
        .operator-denied-screen > div { width: min(100%, 1100px); margin-inline: auto; }
    `;
    document.head.append(style);
    document.body.classList.add('operator-access-pending');

    const gate = document.createElement('div');
    gate.className = 'operator-access-gate';
    gate.textContent = 'Entre com uma conta oficial para acessar o painel.';
    document.body.append(gate);

    let checkNumber = 0;
    let denied = false;
    const deny = () => {
        if (denied) return;
        denied = true;
        const screen = document.createElement('main');
        screen.className = 'operator-denied-screen';
        screen.innerHTML = '<div>Acesso negado:<br>esta conta não está autorizada como operador oficial.</div>';
        document.body.replaceChildren(screen);
    };

    async function checkAccess(state) {
        const currentCheck = ++checkNumber;
        if (!state?.isLoggedIn || !state.token) {
            gate.textContent = 'Entre com uma conta oficial para acessar o painel.';
            return;
        }
        gate.textContent = 'VERIFICANDO AUTORIZAÇÃO...';
        try {
            const response = await fetch('/api/operador/acesso', {
                headers: { Accept: 'application/json', Authorization: `Bearer ${state.token}` },
            });
            if (currentCheck !== checkNumber || denied) return;
            if (response.status === 403) {
                deny();
                return;
            }
            if (response.ok) {
                denied = true;
                document.body.classList.remove('operator-access-pending');
                gate.remove();
                style.remove();
                return;
            }
            gate.textContent = response.status === 401
                ? 'Sessão encerrada. Entre novamente com uma conta oficial.'
                : 'Não foi possível verificar o acesso. Tente novamente.';
        } catch {
            if (currentCheck === checkNumber) gate.textContent = 'Sem conexão com o servidor. Tente novamente.';
        }
    }

    account.onChange(checkAccess);
})();
