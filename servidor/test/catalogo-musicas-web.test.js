const {test}=require('node:test');const assert=require('node:assert/strict');
const {browserFixture}=require('./helpers/browser-fixture');
const {mount}=require('../../docs/js/catalogo-musicas');
const songs=[{id:'guitar',nome:'<img src=x onerror=alert(1)> Águia',artista:'Banda',album:'Disco',instrumentos:['guitarra'],duracaoMs:123000},{id:'band',nome:'Banda completa',artista:'Outro',album:'',instrumentos:['guitarra','baixo','bateria','teclado']}];
function fixture({fetcher,select=async()=>true,owner=true}={}){
 const f=browserFixture(async()=>{throw Error('Unexpected network');});
 for(const [id,tag]of [['music-grid','div'],['music-status','p'],['music-search','input'],['music-instrument','select'],['music-count','p'],['music-room','p'],['music-retry','button']]){const e=f.document.createElement(tag);e.id=id;f.document.body.append(e);}
 const calls=[];const catalog=mount({document:f.document,fetch:fetcher||(async url=>{calls.push(url);return{ok:true,json:async()=>({musicas:songs})};}),isOwner:s=>Boolean(s&&owner),select});
 const group={participantes:[{instrumento:'guitarra'}]};
 catalog.atualizarSala(group);
 return {...f,catalog,group,calls,element:id=>f.document.querySelector('#'+id)};
}
test('catalog loads all songs, instruments and renders song metadata as text, not HTML',async()=>{
 const f=fixture();await f.catalog.ready;assert.deepEqual(f.calls,['/api/musicas']);assert.equal(f.element('music-grid').children.length,2);
 assert.equal(f.element('music-grid').children[0].querySelector('h2').textContent,songs[0].nome);assert.equal(f.element('music-grid').children[0].querySelector('h2').querySelector('img'),null);
 assert.equal(f.element('music-grid').querySelector('img').alt,'Guitarra');
 assert.equal(f.element('music-grid').children[1].querySelectorAll('span').length,4);
});
test('adding/removing players or changing instruments updates availability; disconnect/non-owner/pending block selection',async()=>{
 const f=fixture();await f.catalog.ready;const buttons=()=>f.element('music-grid').querySelectorAll('button');assert.equal(buttons()[0].disabled,false);
 f.catalog.atualizarSala({participantes:[{instrumento:'guitarra'},{instrumento:'baixo'}]});assert.equal(buttons()[0].disabled,true);assert.equal(buttons()[1].disabled,false);
 f.catalog.atualizarSala({participantes:[{instrumento:'teclado'}]});assert.equal(buttons()[0].disabled,true);
 f.catalog.atualizarSala({...f.group,ticketPendente:true});assert.ok(buttons().every(b=>b.disabled));
 f.catalog.atualizarSala(null);assert.ok(buttons().every(b=>b.disabled));
 f.catalog.atualizarSala(f.group);assert.equal(buttons()[0].disabled,false);
 const viewer=fixture({owner:false});await viewer.catalog.ready;assert.ok(viewer.element('music-grid').querySelectorAll('button').every(b=>b.disabled));
});
test('search is accent-insensitive and instrument filter works',async()=>{
 const f=fixture();await f.catalog.ready;f.element('music-search').value='aguia';await f.element('music-search').dispatch('input');assert.equal(f.element('music-grid').children.length,1);
 f.element('music-search').value='';f.element('music-instrument').value='teclado';await f.element('music-instrument').dispatch('change');assert.equal(f.element('music-grid').children[0].querySelector('h2').textContent,'Banda completa');
 f.element('music-search').value='no matches';await f.element('music-search').dispatch('input');assert.match(f.element('music-grid').textContent,/Nenhuma música/);
});
test('network error offers retry and recovers without creating a ticket',async()=>{
 let calls=0;const f=fixture({fetcher:async()=>{if(++calls===1)throw Error('offline');return{ok:true,json:async()=>({musicas:songs})};}});await f.catalog.ready;assert.equal(f.element('music-retry').hidden,false);
 await f.element('music-retry').click();assert.equal(f.element('music-retry').hidden,true);assert.equal(f.element('music-grid').children.length,2);
});
test('pending selection blocks duplicate clicks; failed ticket enables retry',async()=>{
 let resolve,calls=0;const f=fixture({select:()=>{calls++;return new Promise(r=>resolve=r);}});await f.catalog.ready;
 const first=f.element('music-grid').querySelector('button');const click=first.click();await first.click();assert.equal(calls,1);assert.ok(f.element('music-grid').querySelectorAll('button').every(b=>b.disabled));
 resolve(false);await click;assert.equal(f.element('music-grid').querySelector('button').disabled,false);assert.match(f.element('music-status').textContent,/Não foi possível/);
});

test('covers load lazily behind the card and disappear gracefully if missing',async()=>{
 const copy=songs.map(song=>({...song}));copy[0].capaUrl='/api/musicas/'+'a'.repeat(24)+'/capa';
 const f=fixture({fetcher:async()=>({ok:true,json:async()=>({musicas:copy})})});await f.catalog.ready;
 const card=f.element('music-grid').children[0];const cover=card.querySelector('.music-cover');
 assert.equal(cover.src,copy[0].capaUrl);assert.equal(cover.loading,'lazy');assert.equal(cover.alt,'');assert.equal(cover.getAttribute('aria-hidden'),'true');
 assert.equal(f.element('music-grid').children[1].querySelector('.music-cover'),null);
 await cover.dispatch('error');assert.equal(card.querySelector('.music-cover'),null);assert.equal(card.querySelector('button').disabled,false);
});
test('instrument badges use the existing local images and readable fallbacks; external cover URLs are rejected',async()=>{
 const copy=songs.map(song=>({...song,capaUrl:'https://untrusted.example/cover.png'}));
 const f=fixture({fetcher:async()=>({ok:true,json:async()=>({musicas:copy})})});await f.catalog.ready;
 assert.equal(f.element('music-grid').querySelector('.music-cover'),null);
 const icons=f.element('music-grid').children[1].querySelectorAll('img');assert.equal(icons.length,4);
 assert.deepEqual(icons.map(i=>i.src),['images/Guitarra.png','images/Baixo.png','images/Bateria.png','images/Teclado.png']);
 assert.deepEqual(icons.map(i=>i.alt),['Guitarra','Baixo','Bateria','Teclado']);
 for(const icon of icons)assert.equal(icon.parentNode.title,icon.alt);
 const badge=icons[0].parentNode;await icons[0].dispatch('error');assert.equal(badge.textContent,'Guitarra');
});
