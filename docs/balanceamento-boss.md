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

O módulo continua sendo cálculo puro, mas agora a fila de `servidor/feira-creditos.js`
o utiliza depois da confirmação do operador e da releitura dos resultados persistidos.
A configuração pública de músicas/fases fica em `servidor/recompensas-campanha.json`.
A faixa original **Teste de creditos - Shredder** foi autorizada pelo responsável e
cadastrada nas fases 1/2/3 para homologar os tetos sem as músicas definitivas.
A campanha de cinco fases não foi reduzida; fases 4/5 não têm prêmio configurado.

A fila exige modo história, bossDerrotado=true e concluida=true em todos os resultados.
Não aceita uma banda parcialmente salva nem redistribui a parte de alguém ausente.
Todos os valores individuais e o grupo ficam registrados atomicamente antes do envio.
O modo livre não gera recompensa. Nenhuma moeda local é alterada pelo cálculo.

**A integração financeira depende de ativação manual no servidor.** Não foi ativada
nesta implementação nem houve chamada real. Os contratos Google/segredo, proteção
contra duplicação e o roteiro da build estão em `servidor/CREDITOS-FEIRA.md` e
`servidor/TESTE-CREDITOS.md`. O valor fixo antigo do `.env` deixou de ser utilizado.
