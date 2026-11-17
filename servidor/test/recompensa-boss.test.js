const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calcularRecompensaBoss, TETOS } = require('../recompensa-boss');
const run = (precisoes, extra={}) => calcularRecompensaBoss({modo:'historia',bossDerrotado:true,dificuldadeMusica:'facil',jogadores:precisoes.map((precisao,i)=>({id:String(i),precisao,concluida:true})),...extra});
test('winning reward is half participation, half accuracy with exact integer rounding',()=>{
 assert.deepEqual(run([100,60,40,10]).pagamentos.map(p=>p.valor),[145,107,88,60]);
 assert.deepEqual(run([100,100,100,100]).pagamentos.map(p=>p.valor),[100,100,100,100]);
});
test('boss defeat in story and completed results are mandatory',()=>{
 for(const extra of [{modo:'freeplay'},{bossDerrotado:false},{bossDerrotado:undefined},{jogadores:[{id:'x',precisao:100,concluida:false}]}])assert.equal(run([100],extra).total,0);
 assert.equal(run([0,0,0,0]).total,0);
});
test('all allowed pools and band sizes preserve the full cap without negative/fractional payments',()=>{
 for(const [dificuldadeMusica,teto] of Object.entries(TETOS))for(let count=1;count<=4;count++)for(let sample=1;sample<=50;sample++){
  const result=run(Array.from({length:count},(_,i)=>(sample*(i+3)*137)%10001/100),{dificuldadeMusica});
  assert.equal(result.total,teto);assert.equal(result.pagamentos.reduce((sum,p)=>sum+p.valor,0),teto);
  assert.ok(result.pagamentos.every(p=>Number.isSafeInteger(p.valor)&&p.valor>=0));
 }
});
test('missing song difficulty, malformed accuracy and duplicate players fail closed',()=>{
 for(const extra of [{dificuldadeMusica:undefined},{dificuldadeMusica:'expert'},{jogadores:[]},{jogadores:[{id:'x',precisao:NaN,concluida:true}]},{jogadores:[{id:'x',precisao:100,concluida:true},{id:'x',precisao:50,concluida:true}]}])assert.throws(()=>run([100],extra));
});
test('a player difficulty field does not change the prize: the song defines the tier',()=>{
 assert.equal(run([100],{jogadores:[{id:'x',precisao:100,concluida:true,dificuldade:'expert'}]}).total,400);
});
