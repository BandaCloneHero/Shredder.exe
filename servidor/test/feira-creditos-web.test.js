const {test}=require('node:test'),assert=require('node:assert/strict');
const {browserFixture}=require('./helpers/browser-fixture');
const mount=require('../../docs/js/feira-creditos');
function setup(){
 const f=browserFixture(async()=>{throw Error('No network');});
 for(const id of ['feira-creditos','feira-credit-status','feira-credit-list','feira-connect','feira-consent','feira-consent-label','feira-balance','feira-refresh']){const e=f.document.createElement(id==='feira-consent'?'input':id.includes('list')?'ul':'div');e.id=id;f.document.body.append(e);}
 let listener;const calls=[];const account={token:'local-session',onChange(fn){listener=fn;fn({isLoggedIn:false});},async request(url,options){calls.push({url,options});if(url.endsWith('saldo'))return{balance:400};return{enabled:true,mode:'secret',linked:false,entries:[{status:'paid',value:400,musica:'Test',operation:101}]};}};
 const timers=[];const win={setInterval(fn){timers.push(fn);return 1;},clearInterval(){},addEventListener(){}};
 const controller=mount(win,f.document,account);return{...f,controller,calls,account,login(){listener({isLoggedIn:true});},get:id=>f.document.querySelector('#'+id)};
}
test('credit UI displays exact confirmed share and does not link or query saldo automatically',async()=>{
 const f=setup();f.login();await new Promise(setImmediate);assert.match(f.get('feira-credit-list').textContent,/400 tijolinhos/);assert.match(f.get('feira-credit-list').textContent,/Crédito confirmado/);assert.deepEqual(f.calls.map(c=>c.url),['/api/feira/creditos']);
});
test('connection requires consent; saldo requires an explicit click',async()=>{
 const f=setup();f.login();await new Promise(setImmediate);await f.get('feira-connect').click();assert.equal(f.calls.length,1);
 f.get('feira-consent').checked=true;await f.get('feira-consent').dispatch('change');await f.get('feira-connect').click();assert.ok(f.calls.some(c=>c.url==='/api/feira/vincular'&&c.options.body.consent===true));
 await f.get('feira-balance').click();assert.match(f.get('feira-credit-status').textContent,/400 tijolinhos/);
});
