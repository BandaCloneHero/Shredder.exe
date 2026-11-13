const fs = require('node:fs');
const {createHash} = require('node:crypto');
const {gravarJsonAtomico} = require('./persistencia-json');
const URL_CREDIT = 'https://feira-de-jogos.dev.br/api/v2/credit';
const PRODUCT = 87;
function configuracaoCreditos(env = process.env) {
    const raw = env.SHREDDER_FEIRA_CREDIT_VALUE;
    const value = typeof raw === 'string' && /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : 0;
    return {enabled:env.SHREDDER_FEIRA_CREDITS_ENABLED === 'true' && value >= 1 && value <= 3000, product:PRODUCT, value};
}
function criarCreditosFeira({arquivo, resolverConta, env = process.env, fetch:request = globalThis.fetch, agora = Date.now, timeoutMs = 10000} = {}) {
    const credenciais = new Map();
    let processando = false;
    let reagendar = false;
    const config = () => configuracaoCreditos(env);
    const key = (accountId, partidaId) => createHash('sha256').update(JSON.stringify([accountId, partidaId])).digest('hex');
    function ler() {
        if (!fs.existsSync(arquivo)) return {version:1, entries:{}};
        const data = JSON.parse(fs.readFileSync(arquivo,'utf8'));
        if (data?.version !== 1 || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) throw Error('INVALID_CREDIT_LEDGER');
        return data;
    }
    const gravar = data => gravarJsonAtomico(arquivo,data);
    function atualizar(id, patch) {
        const data=ler();if(!data.entries[id])throw Error('MISSING_CREDIT_ENTRY');
        Object.assign(data.entries[id],patch,{updatedAt:new Date(agora()).toISOString()});gravar(data);
    }
    function guardarCredencial({identidade, token, expiresAt}) {
        if(!config().enabled || identidade?.provider!=='google' || typeof identidade.sub!=='string' || typeof token!=='string' || !token || token.length>16384 || !Number.isFinite(expiresAt) || expiresAt<=agora())return;
        for(const [sub,c] of credenciais)if(c.expiresAt<=agora())credenciais.delete(sub);
        if(credenciais.size>=10000&&!credenciais.has(identidade.sub))return;
        // Only called after official Google verification. Never persisted or exposed.
        const anterior=credenciais.get(identidade.sub);if(anterior)clearTimeout(anterior.timer);
        const entry={token,expiresAt};
        entry.timer=setTimeout(()=>{if(credenciais.get(identidade.sub)===entry)credenciais.delete(identidade.sub);},Math.min(expiresAt-agora(),2147483647));
        entry.timer.unref?.();
        credenciais.set(identidade.sub,entry);
    }
    function registrarConfirmados(resultados) {
        if(!config().enabled)return {enabled:false,registered:0};
        const data=ler();let registered=0;
        for(const resultado of resultados) {
            if(resultado.tipo==='banda')continue;
            const conta=resolverConta({username:resultado.username});
            const saved=conta?.resultadosPartidas?.[resultado.partidaId];
            if(!conta?.accountId || !conta.authProviders?.google || !saved || saved.concluida===false)continue;
            const id=key(conta.accountId,resultado.partidaId);
            if(data.entries[id])continue;
            data.entries[id]={id,accountId:conta.accountId,partidaId:resultado.partidaId,product:PRODUCT,value:config().value,status:'pending',createdAt:new Date(agora()).toISOString()};registered++;
        }
        if(registered)gravar(data);
        return {enabled:true,registered};
    }
    async function processarPendentes() {
        if(!config().enabled || processando)return;
        processando=true;
        try {
            const data=ler();
            for(const entry of Object.values(data.entries)) {
                // An interrupted send has an unknown outcome. Never replay it.
                if(entry.status==='sending'){atualizar(entry.id,{status:'unknown',reason:'INTERRUPTED_SEND'});continue;}
                if(!['pending','awaiting_login'].includes(entry.status))continue;
                const conta=resolverConta({accountId:entry.accountId});
                const sub=conta?.authProviders?.google?.sub;
                const proof=sub && credenciais.get(sub);
                if(!proof || proof.expiresAt<=agora()){
                    if(sub)credenciais.delete(sub);
                    if(entry.status!=='awaiting_login')atualizar(entry.id,{status:'awaiting_login'});
                    continue;
                }
                if(entry.product!==PRODUCT || !Number.isSafeInteger(entry.value) || entry.value<1 || entry.value>3000)throw Error('INVALID_CREDIT_ENTRY');
                // Persist BEFORE sending. If later writes fail, the next run sees sending.
                atualizar(entry.id,{status:'sending'});
                let response;
                try {
                    response=await request(URL_CREDIT,{method:'POST',headers:{Authorization:`Bearer ${proof.token}`,'Content-Type':'application/json'},body:JSON.stringify({product:PRODUCT,value:entry.value}),redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
                } catch {
                    atualizar(entry.id,{status:'unknown',reason:'NETWORK_OUTCOME_UNKNOWN'});continue;
                }
                if(response.status!==201){
                    // No automatic retry, including 429: the public API has no idempotency key.
                    const status=Number.isSafeInteger(response.status)?response.status:0;
                    atualizar(entry.id,{status:status>=500||status<400?'unknown':'rejected',httpStatus:status});
                    continue;
                }
                let body;try{body=await response.json();}catch{body=null;}
                if(!Number.isSafeInteger(body?.operation)||body.operation<1){atualizar(entry.id,{status:'unknown',reason:'INVALID_SUCCESS_RESPONSE'});continue;}
                atualizar(entry.id,{status:'paid',operation:body.operation,paidAt:new Date(agora()).toISOString()});
            }
        } finally {
            processando=false;
            if(reagendar){reagendar=false;agendar();}
        }
    }
    function agendar() {
        if(!config().enabled)return;
        if(processando){reagendar=true;return;}
        // Safe diagnostic only; never include exception objects or payment requests.
        void processarPendentes().catch(()=>console.error('Falha ao registrar o estado dos créditos da Feira.'));
    }
    function consultar(accountId) {
        if(!config().enabled)return {enabled:false,product:PRODUCT,entries:[]};
        return {enabled:true,product:PRODUCT,entries:Object.values(ler().entries).filter(e=>e.accountId===accountId).map(e=>({partidaId:e.partidaId,status:e.status,operation:e.operation,createdAt:e.createdAt,paidAt:e.paidAt,httpStatus:e.httpStatus}))};
    }
    return {guardarCredencial,registrarConfirmados,processarPendentes,agendar,consultar,configuracao:config};
}
module.exports={criarCreditosFeira,configuracaoCreditos,PRODUCT,URL_CREDIT};
