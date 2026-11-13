// Private Codespaces forwarding can rewrite Origin to localhost. This adapter
// is installed only inside Codespaces and requires independent browser proof.
const {randomBytes,timingSafeEqual}=require('node:crypto');
function configurarCodespaces(env=process.env) {
    if(env.CODESPACES!=='true')return null;
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(env.CODESPACE_NAME||'') ||
        (env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN!=='app.github.dev'))throw Error('INVALID_CODESPACES_CONFIGURATION');
    const port=env.PORT===undefined?3000:Number(env.PORT);
    if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_CODESPACES_PORT');
    const origin=`https://${env.CODESPACE_NAME}-${port}.app.github.dev`;
    if(Object.hasOwn(env,'SHREDDER_PUBLIC_ORIGIN')&&env.SHREDDER_PUBLIC_ORIGIN!==origin)throw Error('CODESPACES_ORIGIN_MISMATCH');
    env.SHREDDER_PUBLIC_ORIGIN=origin;
    if(!Object.hasOwn(env,'SHREDDER_GOOGLE_AUTH_ENABLED'))env.SHREDDER_GOOGLE_AUTH_ENABLED='true';
    return {origin,port};
}
function criarProxyCodespaces({origin,port}) {
    if(!Number.isInteger(port)||!new RegExp(`^https://[a-z0-9-]+-${port}\\.app\\.github\\.dev$`).test(origin))throw Error('INVALID_CODESPACES_CONFIGURATION');
    const nonce=randomBytes(32).toString('hex');
    const loopback=new Set([`http://localhost:${port}`,`https://localhost:${port}`,`http://127.0.0.1:${port}`,`http://0.0.0.0:${port}`]);
    return(req,res,next)=>{
        const path=req.path.toLowerCase().replace(/\/+$/,'')||'/';
        const bootstrap=req.method==='GET'&&path==='/api/dev/codespaces';
        const protectedPost=req.method==='POST'&&(/^\/api\/auth\/google(?:\/(?:start|register|link))?$/.test(path)||path==='/api/perfil/apelido');
        if(!bootstrap&&!protectedPost)return next();
        res.set('Cache-Control','no-store');
        const deny=()=>res.status(403).json({ok:false,code:'CODESPACES_PROOF_REQUIRED',error:'Abra o jogo pelo endereço privado correto do Codespaces.'});
        if(req.headers['sec-fetch-site']!=='same-origin')return deny();
        if(bootstrap){
            if(req.headers.origin&&req.headers.origin!==origin&&!loopback.has(req.headers.origin))return deny();
            return res.json({ok:true,origin,nonce});
        }
        if(req.headers['x-shredder-origin']!==origin||(!loopback.has(req.headers.origin)&&req.headers.origin!==origin))return deny();
        const proof=req.headers['x-shredder-nonce'];
        if(typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof)||!timingSafeEqual(Buffer.from(proof),Buffer.from(nonce)))return deny();
        if(!req.is('application/json'))return deny();
        if(loopback.has(req.headers.origin))req.headers.origin=origin;
        next();
    };
}
module.exports={configurarCodespaces,criarProxyCodespaces};
