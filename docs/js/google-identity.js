export const GOOGLE_SDK_URL = 'https://accounts.google.com/gsi/client?hl=pt-BR';
let sdkPromise;
export function googleConfigurationReady(enabled, config) {
    return enabled === true && /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(config?.clientId || '') &&
        /^[a-f0-9]{64}$/.test(config?.loginId || '') && /^[a-f0-9]{64}$/.test(config?.nonce || '');
}
export function loadGoogleIdentity(doc = document, win = window) {
    if (win.google?.accounts?.id) return Promise.resolve(win.google.accounts.id);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve,reject) => {
        const script=doc.createElement('script');
        const fail=()=>{ clearTimeout(timer);script.remove();reject(new Error('SDK Google indisponível.')); };
        const timer=setTimeout(fail,15000);
        script.src=GOOGLE_SDK_URL;script.async=true;
        script.onload=()=>{ clearTimeout(timer); if(win.google?.accounts?.id) resolve(win.google.accounts.id); else fail(); };
        script.onerror=fail;doc.head.append(script);
    }).catch(error=>{sdkPromise=null;throw error;});
    return sdkPromise;
}
export async function prepareGoogleClient({enabled,config,loadSdk=loadGoogleIdentity,renewAttempt}={}) {
    if (!googleConfigurationReady(enabled,config)) return null;
    const sdk=await loadSdk(), mounts=new Map();
    let current, consumed=false, active=true;
    function configure(attempt) {
        if(!googleConfigurationReady(true,attempt)) throw new Error('Configuração Google indisponível.');
        current=attempt;consumed=false;
        const generation=attempt.loginId;
        sdk.initialize({client_id:attempt.clientId,nonce:attempt.nonce,auto_select:false,ux_mode:'popup',use_fedcm_for_button:true,
            callback(response) {
                if(!active || consumed || current.loginId!==generation || (response?.state && response.state!==generation)) return;
                if(typeof response?.credential!=='string' || !response.credential.length || response.credential.length>16384) return;
                consumed=true;
                const handler=[...mounts.values()].at(-1);
                if(handler) handler(response.credential,generation);
            }});
        for(const host of mounts.keys()) render(host);
    }
    function render(host) {
        host.replaceChildren();sdk.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'signin_with',locale:'pt-BR',width:260,state:current.loginId});
    }
    configure(config);
    return {
        mount(host,handler){mounts.set(host,handler);render(host);},
        async renew(){if(typeof renewAttempt!=='function') throw new Error('Preparação indisponível.');configure(await renewAttempt());},
        async signOut(){sdk.disableAutoSelect?.();},
        dispose(){active=false;mounts.clear();},
    };
}
export function googleErrorMessage(error) {
    const messages={
        GOOGLE_AUTH_UNAVAILABLE:'Entrada Google indisponível no momento. Tente novamente mais tarde.',
        INVALID_GOOGLE_TOKEN:'Autenticação expirada ou inválida. Prepare a entrada e tente novamente.',
        GOOGLE_ATTEMPT_EXPIRED:'A tentativa expirou ou já foi utilizada. Prepare uma nova entrada.',
        GOOGLE_TRANSITION_REQUIRED:'Seu acesso anterior precisa ser preservado na troca de login. Fale com a organização; nenhuma segunda conta foi criada.',
        NICKNAME_ALREADY_SET:'Seu apelido já foi confirmado. Atualize a página para continuar.',
        INVALID_NICKNAME:'Escolha um apelido de até 40 caracteres, sem nomes reservados ou conteúdo ofensivo.',
        AUTH_CONTEXT_CHANGED:'A sessão mudou. Atualize a página antes de continuar.',
        RATE_LIMITED:'Muitas tentativas. Aguarde um minuto antes de tentar novamente.',
    };
    return Object.hasOwn(messages,error?.code) ? messages[error.code] : 'Não foi possível concluir a entrada. Confira a conexão e tente novamente.';
}
