# Recompensas da Feira — teste completo, ativação manual

## O que está ligado

A confirmação do operador chama `registrarConfirmados(resultados, {ticket})` somente
após persistir os resultados de toda a banda. O serviço relê esses resultados; não
usa um valor, dificuldade ou precisão fornecidos separadamente pelo navegador.

Requisitos: modo história, boss derrotado explicitamente, resultados concluídos,
contas Google identificadas e mesma música/fase para toda a banda. Resultado parcial,
modo livre, derrota, ausência de vitória e música não configurada não geram crédito.

`recompensas-campanha.json` associa cada fase às músicas autorizadas e ao teto:

- Fácil (Kairós): 400 tijolinhos por partida da sala.
- Média (Neon em Ruínas): 600.
- Difícil (Colapso do Núcleo): 800.

Metade é dividida igualmente; metade é proporcional à precisão percentual de cada
jogador. O maior resto distribui arredondamentos inteiros, com desempate estável por
accountId. O total nunca aumenta: 100/60/40/10% na fácil produz 145/107/88/60. Quatro
iguais recebem 100; um único vencedor recebe 400. Todos com 0% não recebem.

Os pacotes das três músicas ficam em `musicas/musicas_autorais/Campanha`. O ticket
identifica a música da fase e o servidor confere o título recebido do executável.
As fases 4/5 não geram recompensa. A dificuldade individual não determina o teto.
Cada novo ticket confirmado é uma nova partida; a regra atual não limita partidas
premiadas por pessoa/dia. Repetir o mesmo resultado/ticket não gera outro crédito.

## Dois contratos; nunca há fallback entre eles

### Segredo do jogo (modo `secret`)

O código de `/gameCredit` fornecido aceita Bearer com segredo de jogo, `{userId,price}`
e devolve `201 {operationId}`. Ele respeita `price` explícito. Esse é o modo padrão.

O professor também indicou `/adminCredit`. Se essa for a URL autorizada para o segredo
entregue, configurá-la explicitamente. A implementação aceita `operationId` ou
`operation` inteiro positivo nesse modo. A compatibilidade do segredo com essa rota
precisa ser confirmada no teste; não foi feita chamada para descobrir isso. Não há
segunda tentativa automática em outra rota se ocorrer 401, 403, timeout ou erro.

Configurações do processo Node, sem colocá-las no frontend:

```
SHREDDER_FEIRA_CREDITS_ENABLED=true
SHREDDER_FEIRA_CREDIT_AUTH=secret
SHREDDER_FEIRA_GAME_SECRET=<segredo fornecido pelo responsável>
SHREDDER_FEIRA_GAME_CREDIT_URL=https://feira-de-jogos.dev.br/api/v2/gameCredit
```

Para usar a orientação original do professor, o último valor será
`https://feira-de-jogos.dev.br/api/v2/adminCredit`. Nunca use um JWT Google no campo
GAME_SECRET. Nunca copie o segredo para a Unity, `docs/`, Git ou mensagens de suporte.

O ID da Feira não é o accountId do Shredder, Google sub ou email. O jogador clica em
**Conectar cadastro da Feira** no ticket e autoriza explicitamente a conexão. O
backend encaminha sua prova Google verificada a `POST /api/v2/login` da Feira, recebe
`user` e guarda o vínculo privado por accountId. Essa rota da Feira pode criar cadastro
se ele não existir — o consentimento informa isso. Não há input de userId/email livre.
O mesmo ID da Feira não pode ser vinculado a duas contas locais, e mudar username não
remove o vínculo. A permissão `operator` da resposta externa é ignorada.

O cliente OAuth do Shredder precisa ser aceito em `GOOGLE_CLIENT_ID` da Feira para
/login e /balance. Estar apenas em `GOOGLE_CLIENT_ID_GAMES` não basta. Conectar exige
um login Google recente no Shredder; saia e entre novamente se necessário. O vínculo
é durável, mas o JWT permanece somente em memória até expirar.

### Google direto (modo `google`, opcional)

`POST /api/v2/credit`, Google ID Token no Bearer, `{product:87,value}` e
`201 {operation}`. Só é habilitado com:

```
SHREDDER_FEIRA_CREDITS_ENABLED=true
SHREDDER_FEIRA_CREDIT_AUTH=google
SHREDDER_FEIRA_CUSTOM_VALUES_CONFIRMED=true
```

A última flag exige confirmação do responsável de que /credit respeitará `value`.
O código recebido pode substituir value pelo preço positivo do produto 87, o que
invalidaria a divisão. Não usar esse modo sem confirmar a semântica do cadastro.
O servidor guarda somente provas Google já validadas, em memória. Sessão local
restaurada sem login Google novo não fornece JWT para esse envio. Sem prova válida,
a recompensa aguarda novo login, sem enviar transferência. O segredo do jogo não é
usado neste modo. `SHREDDER_FEIRA_CREDIT_VALUE` deixou de ser usado.

## Registro privado e proteção contra duplicação

`creditos-feira.json` permanece fora de docs, ignorado no Git e gravado atomicamente
com permissão 0600. Não contém tokens nem emails. A mesma escrita registra a divisão
inteira da banda e seus pedidos. Cada pedido deriva de accountId + partidaId; o grupo
deriva do conjunto de partidas. Os valores ficam congelados depois de registrados.

Estados: pending, awaiting_login, awaiting_feira, sending, paid, rejected e unknown.
`paid` exige HTTP 201 e ID de operação válido. Esse ID e o valor solicitado ficam no
registro. A API da Feira não devolve o saldo ou o valor efetivamente lançado nessa
resposta; a consulta de saldo é independente. Não se apresenta uma fila como pagamento.

O estado sending é persistido antes da chamada. Timeout, erro de rede, 5xx, resposta
inválida e envio interrompido ficam unknown, sem reenvio automático. Rejeições 4xx,
inclusive 429, também não são repetidas automaticamente. Um ID de operação já usado
em outro pagamento fica em revisão. Mudança de transporte e pedidos pendentes antigos
da regra de valor fixo são bloqueados para revisão, não pagos retroativamente.

A fila foi feita para **um processo Node**, como o armazenamento JSON das contas.
Não executar múltiplos processos compartilhando esses arquivos. A Feira não oferece
idempotência externa neste contrato: não é possível garantir exatamente uma vez entre
os dois servidores. Uma falha depois de o dinheiro ser lançado exige conciliação com
a Feira; não apagar registros nem criar outro pedido para "tentar de novo".
Uma falha em um jogador não desfaz automaticamente os créditos já confirmados dos
outros. Erros financeiros nunca apagam resultados, ranking ou progresso.

## Interface e consultas

O ticket mostra as próprias recompensas, valores, operações e estados. O navegador
consulta somente o backend local; nunca recebe o segredo nem o JWT guardado.

- GET /api/feira/creditos: sessão local, somente a própria conta.
- POST /api/feira/vincular: sessão local, JSON `{consent:true}`, origem protegida,
  limite de frequência e Google recente; não aceita userId/email do navegador.
- GET /api/feira/saldo: somente após clique, sessão local e prova Google válida;
  encaminha GET /api/v2/balance. Não cria créditos nem cadastros.
- GET /api/feira/recompensas: configuração pública de fases e músicas, sem segredos.

Vincular cadastro e consultar saldo não acontecem automaticamente ao abrir o ticket.
A página atualiza o estado local da fila a cada 10 segundos. As moedas locais do jogo
continuam independentes do saldo da Feira. Nenhum /debit foi implementado aqui.

## Verificação e homologação

Os testes automatizados usam provas, contas, arquivos e HTTP fictícios, sem abrir
servidores nem chamar a Feira. Exercitam a persistência real de partidas e a divisão
por banda; falta/expiração de prova; vínculo verificado; isolamento de conta;
consentimento; rede/HTTP/disco; duplicação; transporte e interface.

A implementação não ativa flags, modifica dados reais, executa transferência,
consulta usuários, faz deploy, commit ou push. Veja **TESTE-CREDITOS.md** para o
roteiro manual da build. Atualizar apenas o executável não atualiza o backend.
