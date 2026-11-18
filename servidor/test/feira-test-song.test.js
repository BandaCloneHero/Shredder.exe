const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {instrumentosMidi}=require('../catalogo-musicas');
test('original test song has four playable instruments and 40s PCM audio',()=>{
 const dir=path.join(__dirname,'../../musicas/Shredder - Teste de creditos');
 assert.deepEqual(instrumentosMidi(fs.readFileSync(path.join(dir,'notes.mid'))),['guitarra','baixo','bateria','teclado']);
 const audio=fs.readFileSync(path.join(dir,'song.wav'));assert.equal(audio.toString('ascii',0,4),'RIFF');assert.equal(audio.toString('ascii',8,12),'WAVE');
 assert.equal(audio.readUInt32LE(24),44100);assert.equal(audio.readUInt16LE(34),16);assert.equal(audio.readUInt32LE(40)/audio.readUInt32LE(28),40);
 assert.ok(audio.subarray(44+3*44100*2,44+4*44100*2).some(b=>b!==0));
});
