import {googleErrorMessage} from './google-identity.js';
export class GoogleAccountUI {
    constructor({account,ui,client,document:doc=document,window:win=window}) {
        Object.assign(this,{account,ui,client,doc,win,busy:false,flow:0,attemptReady:true,preparingLogin:false});
        this.build();
        this.unsubscribe=account.onChange(state=>this.render(state));
        win.addEventListener('pagehide',()=>{this.flow++;this.client.dispose?.();});
    }
    element(tag,text='',props={}) {const node=this.doc.createElement(tag);node.textContent=text;Object.assign(node,props);return node;}
    button(text,fn,parent) {const button=this.element('button',text,{type:'button',className:'shredder-btn-secondary'});button.addEventListener('click',fn);parent.append(button);return button;}
    build() {
        this.dialog=this.element('dialog','',{id:'google-account-dialog',className:'google-account-dialog'});
        this.dialog.setAttribute('aria-labelledby','google-account-title');
        this.title=this.element('h2','Entrar com Google',{id:'google-account-title'});
        this.status=this.element('p','',{className:'google-account-status'});this.status.setAttribute('role','status');
        this.status.setAttribute('aria-live','polite');this.dialog.append(this.title,this.status);
        this.nicknameForm=this.element('form');
        const label=this.element('label','Como você quer aparecer no jogo?');
        this.nicknameInput=this.element('input','',{id:'google-nickname',required:true,maxLength:40,autocomplete:'nickname'});label.htmlFor=this.nicknameInput.id;
        this.nicknameForm.append(label,this.nicknameInput,this.element('p','Escolha seu apelido. Ele será confirmado uma única vez.'));
        this.nicknameButton=this.button('Confirmar apelido e continuar',()=>{},this.nicknameForm);this.nicknameButton.type='submit';
        this.nicknameForm.addEventListener('submit',event=>{event.preventDefault();return this.saveNickname();});
        this.dialog.append(this.nicknameForm);
        this.retryButton=this.button('Preparar nova entrada',()=>this.retry(),this.dialog);
        this.nicknameLogoutButton=this.button('Usar outra conta',()=>this.account.logout().catch(()=>{}),this.dialog);
        this.cancelButton=this.button('Fechar',()=>this.cancel(),this.dialog);
        this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.cancel();});
        this.doc.body.append(this.dialog);
        this.mainButton=this.doc.getElementById('google-login-main');
        this.modalButton=this.element('div','',{className:'google-login-button-host'});
        this.ui.modalEl.querySelector('.shredder-modal-box').append(this.modalButton);
        const handler=(credential,loginId)=>this.receiveCredential(credential,loginId);
        if(this.mainButton)this.client.mount(this.mainButton,handler);
        this.client.mount(this.modalButton,handler);
        this.view('progress');
    }
    view(name) {
        this.currentView=name;this.nicknameForm.hidden=name!=='nickname';
        this.cancelButton.hidden=name==='nickname';this.nicknameLogoutButton.hidden=name!=='nickname';
        this.retryButton.hidden=name!=='error';
    }
    show(title) {this.ui.closeModal();this.title.textContent=title;this.status.textContent='';if(!this.dialog.open)this.dialog.showModal();}
    render(state) {
        const loggedOut = this.wasLoggedIn === true && !state.isLoggedIn && !state.isRestoring;
        this.wasLoggedIn = state.isLoggedIn;
        if(loggedOut){this.flow++;this.prepareNextLogin();}
        for(const host of [this.mainButton,this.modalButton]) if(host)host.hidden=state.isLoggedIn||state.isRestoring||this.busy||this.preparingLogin||!this.attemptReady;
        if(state.isLoggedIn&&state.needsNickname&&!this.busy)this.showNickname();
        if(!state.isLoggedIn&&this.currentView==='nickname'){this.flow++;this.nicknameContext=null;this.nicknameInput.value='';this.dialog.close();}
    }
    ensure(flow,context) {if(flow!==this.flow||!this.account.isAuthContextCurrent(context))throw Object.assign(new Error('Sessão alterada.'),{code:'AUTH_CONTEXT_CHANGED'});}
    async run(action) {
        if(this.busy)return;
        this.busy=true;const flow=this.flow;
        this.nicknameButton.disabled=true;this.nicknameInput.disabled=true;this.nicknameLogoutButton.disabled=true;
        this.render(this.account.snapshot());
        try {await action(flow);}
        catch(error){if(flow===this.flow){this.status.textContent=googleErrorMessage(error);if(this.currentView!=='nickname')this.view('error');}}
        finally {
            await this.client.signOut().catch(()=>{});this.busy=false;
            this.nicknameButton.disabled=false;this.nicknameInput.disabled=false;this.nicknameLogoutButton.disabled=false;
            this.render(this.account.snapshot());if(this.currentView==='nickname')this.nicknameInput.focus();
        }
    }
    receiveCredential(credential,loginId) {
        if(this.busy||this.preparingLogin||!this.attemptReady||this.account.snapshot().isLoggedIn)return;
        this.attemptReady=false;
        this.flow++;const context=this.account.authContext();
        this.show('Entrar com Google');this.view('progress');this.status.textContent='Confirmando sua entrada…';
        return this.run(async flow=>{
            this.ensure(flow,context);
            await this.account.loginGoogle(credential,loginId);
            if(flow!==this.flow)return;
            if(this.account.snapshot().needsNickname)this.showNickname();else this.dialog.close();
        });
    }
    // GIS requires a click on its rendered official button, never a scripted popup.
    startLogin(){this.ui.openModal();}
    prepareNextLogin(){
        if(this.refreshPromise)return this.refreshPromise;
        this.preparingLogin=true;this.attemptReady=false;
        this.ui.errorEl.textContent='Preparando entrada com Google…';
        const preparationStatus=this.doc.getElementById('google-login-status');
        if(preparationStatus){preparationStatus.hidden=false;preparationStatus.textContent='Preparando entrada com Google…';}
        this.render(this.account.snapshot());
        this.refreshPromise=Promise.resolve().then(async()=>{
            try {
                await this.client.renew();
                this.attemptReady=true;this.ui.errorEl.textContent='';
                if(preparationStatus)preparationStatus.hidden=true;
                return true;
            } catch(error) {
                if(!this.account.snapshot().isLoggedIn){
                    this.show('Entrar com Google');this.status.textContent=googleErrorMessage(error);this.view('error');
                    this.ui.errorEl.textContent=this.status.textContent;
                    if(preparationStatus){preparationStatus.hidden=false;preparationStatus.textContent=this.status.textContent;}
                }
                return false;
            } finally {
                this.preparingLogin=false;this.refreshPromise=null;this.render(this.account.snapshot());
            }
        });
        return this.refreshPromise;
    }
    async retry(){
        if(this.busy)return;this.retryButton.disabled=true;
        try{if(await this.prepareNextLogin()){this.cancel();this.ui.openModal();}}
        finally{this.retryButton.disabled=false;}
    }
    showNickname(){
        const state=this.account.snapshot();if(!state.isLoggedIn||!state.needsNickname)return;
        this.nicknameContext=this.account.authContext();
        if(this.currentView==='nickname'&&this.dialog.open)return;
        const nickname=state.nickname||'';this.nicknameInput.value=/^jogador_[a-f0-9]{12}$/.test(nickname)?'':nickname;
        this.show('Escolha seu apelido');this.status.textContent='Seu login Google foi confirmado. Escolha como você será chamado.';this.view('nickname');
    }
    saveNickname(){
        if(this.busy||!this.nicknameContext)return;
        const nickname=this.nicknameInput.value.trim();if(!nickname||nickname.length>40){this.status.textContent='Escolha um apelido de 1 a 40 caracteres.';return;}
        const context=this.nicknameContext;
        return this.run(async flow=>{
            this.ensure(flow,context);
            try{await this.account.updateNickname(nickname);}catch(error){
                if(error?.code!=='NICKNAME_ALREADY_SET')throw error;
                await this.account.restore();if(this.account.snapshot().needsNickname)throw error;
            }
            this.ensure(flow,context);this.nicknameContext=null;this.dialog.close();
        });
    }
    cancel(){
        if(this.account.snapshot().isLoggedIn&&this.account.snapshot().needsNickname)return;
        this.flow++;this.account.cancelPendingAuthentication();this.nicknameContext=null;this.nicknameInput.value='';this.dialog.close();
        this.client.signOut().catch(()=>{});
    }
}
