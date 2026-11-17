# Boss e recompensas — 17/11/2026

## Combate

- A meta normalizada de dano mudou de 0,72 para 0,50, no script e na cena Gameplay.
  Isso aumenta o dano de cada acerto em 44%, mantendo os pesos dos julgamentos,
  combos e a normalização pelo total de notas da banda.
- Gepeto: aviso de 4s, defesa de 6s, exigência de 60% e sequência de dois acertos;
  até três ataques, redução de dano de 10% por 3s e aceleração visual de 15% por 4s.
- Cura: 0,5% por ataque, limitada a 2% da vida por música.
- Geminias: até quatro ataques, menor exigência nas duas alternâncias e aceleração
  de 20% por 4s. Cláudio: exigência de 70%/três acertos, redução de dano de 15% por 4s.
- Os intervalos entre ataques aumentaram. Nenhuma janela de acerto, pontuação ou
  chart foi alterada. Uma banda sem acertar notas não vence automaticamente.

Verificação reproduzível:

```sh
dotnet run --project tools/BossBalanceChecks/BossBalanceChecks.csproj
```

Esse projeto compila o BossHealthBar real com substitutos mínimos de Unity. Exercita
bandas de um a quatro jogadores, acertos ponderados, penalidade de dano e cura;
verifica vitória única, impossibilidade de cura após derrota e ausência de vitória
sem acertos. Isso não substitui testar as músicas e ataques visualmente no Unity.
As constantes de ataques também tiveram sintaxe C# verificada separadamente.

## Regras de recompensa acordadas

A dificuldade é definida pela própria música de campanha, não pela dificuldade
individual selecionada pelo jogador. Serão três músicas: fácil, média e difícil,
com reservas de 400, 600 e 800 tijolinhos, respectivamente.

`servidor/recompensa-boss.js` calcula 50% por participação e 50% proporcional à
precisão. Usa inteiros e maior resto para conservar exatamente o total aprovado,
com desempate estável por ID. Só calcula prêmio com vitória explícita no modo
história e todos os resultados concluídos. Todos com precisão zero não recebem.

O módulo é somente cálculo: não grava moedas, não faz chamadas à Feira e não foi
ligado à emissão de pagamentos. A associação das três músicas às faixas de prêmio
continua pendente; nenhum nome de música ou classificação foi presumido.
Não foi alterada a campanha atual de cinco fases para três nesta etapa.

Na fila existente de créditos foi acrescentada uma proteção independente: o
resultado persistido precisa ter modo história, bossDerrotado=true e concluida=true.
Modo livre, derrota, vitória ausente e partida incompleta não entram na fila.

**A integração financeira continua desativada.** A configuração antiga de valor
fixo não implementa a nova divisão. Antes de ativar qualquer flag, é necessário
ligar o cálculo aos resultados persistidos de toda a banda, configurar as três
músicas e adaptar a fila para os valores individuais; o cadastro da Feira também
precisa respeitar esses valores (a rota /credit pode usar o preço do produto em vez
de `value`, conforme o contrato recebido). Não foi feita chamada real à Feira.
