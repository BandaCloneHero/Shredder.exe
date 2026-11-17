# Testar os tijolinhos com uma build

## Antes de jogar

1. Atualize esta versão do backend e do site no mesmo servidor onde fará login.
   Nenhum deploy ou reinício foi executado pelo assistente.
2. No ambiente do Node, mantenha a configuração de login que já funciona e configure
   os créditos conforme CREDITOS-FEIRA.md. `.env.example` é documentação: o Node
   deste projeto não carrega `.env` automaticamente. O segredo é somente do backend.
3. Confirme a URL com o responsável. A mensagem original dele indicou `/adminCredit`;
   o código fornecido foi de `/gameCredit`. Configure UMA URL autorizada. A aplicação
   não tenta as duas nem trata um erro como permissão para repetir a transferência.
4. Inicie/reinicie seu Node com essa configuração. Saia e entre novamente com Google
   no site. O cliente Google do Shredder precisa estar autorizado na Feira.

Exemplo para informar o segredo sem exibi-lo no PowerShell, no MESMO terminal que
iniciará o Node e já com as variáveis do seu login configuradas:

```powershell
$env:SHREDDER_FEIRA_CREDITS_ENABLED = "true"
$env:SHREDDER_FEIRA_CREDIT_AUTH = "secret"
$env:SHREDDER_FEIRA_GAME_CREDIT_URL = "https://feira-de-jogos.dev.br/api/v2/adminCredit"
$segredoFeira = Read-Host "Token fornecido pelo professor" -AsSecureString
$env:SHREDDER_FEIRA_GAME_SECRET = [System.Net.NetworkCredential]::new("", $segredoFeira).Password
npm start
```

Execute dentro de `servidor/`. Se a rota autorizada for `/gameCredit`, altere somente
a URL antes de iniciar. Não envie o token no chat, não o escreva na build ou em arquivo
versionado. O exemplo é para o teste manual; não foi executado pelo assistente.

## Build e endereço do backend

A Unity ainda usa o domínio público atual por padrão:
`https://shredder.feira-de-jogos.dev.br/api/operador/resultados-executavel`.

Se você usar outro backend no teste, crie `shredder-server.json` ao lado do `.exe`
(fora da pasta `_Data`), com a URL pública desse MESMO backend:

```json
{
  "resultsUrl": "https://SEU-ENDERECO/api/operador/resultados-executavel"
}
```

Nenhum token vai nesse arquivo. Opcionalmente, a variável `SHREDDER_RESULTS_URL`
do processo Unity substitui o JSON. Só HTTPS ou HTTP loopback são aceitos; configuração
inválida bloqueia o envio e não desvia silenciosamente para produção. No Editor,
o JSON opcional fica na raiz do projeto. Para um Node local no mesmo computador,
a URL de teste pode ser `http://localhost:3000/api/operador/resultados-executavel`.

Se usar Codespaces, o encaminhamento precisa ser acessível ao executável. Uma porta
privada protegida pelo login do GitHub pode retornar 403 ao jogo. A implementação não
alterou visibilidade de portas. Não confundir a URL do Google/Feira com a URL do backend
Shredder. O painel do operador e o executável precisam usar a mesma fila.

## Uma partida autorizada

1. Copie a pasta `musicas/Shredder - Teste de creditos` para uma pasta de músicas
   configurada no jogo. Faça uma busca completa. Arquivos na raiz `musicas/` não são
   incorporados automaticamente pelo processo de build do Unity.
2. No site, crie sua sala, escolha um instrumento e selecione história/fase 1.
3. No ticket, marque o consentimento e clique **Conectar cadastro da Feira**. A Feira
   pode criar seu cadastro se ele ainda não existir; o site avisa isso. Essa conexão
   não é concessão de operador nem transferência de créditos.
4. Se quiser comparar, clique **Consultar saldo da Feira** antes de jogar.
5. No executável, escolha Gepeto e **Teste de creditos - Shredder**. São 40 segundos,
   com quatro instrumentos e charts simples em todas as dificuldades. A música é
   original e feita para teste; seus sons são sintetizados.
6. Termine a música e derrote o boss. Se ele sobreviver, não há recompensa.
7. No painel de operador oficial, confira a música, os jogadores e a vitória; confirme
   o resultado do ticket correto. Essa ação autoriza o crédito real com a flag ligada.
8. No ticket do jogador, use **Atualizar créditos** ou aguarde até 10s. O estado deve
   passar de aguardando envio a **Crédito confirmado pela Feira**, com valor e operação.
9. Sozinho, a fase 1 solicita 400 tijolinhos. Quatro pessoas com precisão igual solicitam
   100 para cada uma. Depois consulte o saldo na Feira para verificar o lançamento real.

A mesma faixa está liberada temporariamente na fase 2 (600) e 3 (800). A fase precisa
estar desbloqueada pela vitória anterior; não é necessário alterar contas reais para
isso. A dificuldade escolhida no perfil não altera o prêmio. Repetir uma nova partida
com outro ticket pode gerar outra recompensa; não faça isso como diagnóstico de um
pagamento incerto. Repetir o pedido antigo não o duplica.

## Se algo não confirmar

- Integração desativada: revise as variáveis do processo Node. Build não as configura.
- Aguardando conexão da Feira: use o botão com consentimento na sua própria conta.
- Login Google necessário: saia e entre novamente com Google; restaurar sessão não
  fornece um token Google novo ao backend.
- Conexão à Feira recusada: conferir cadastro e autorização do cliente Google em
  GOOGLE_CLIENT_ID na Feira, além de confirmar o contrato da URL escolhida.
- Música não configurada: conferir nome exato no ticket e `recompensas-campanha.json`.
- HTTP 401/403/429 no pagamento: pedido recusado, sem reenvio automático. Não tente
  outra rota nem apague o controle para forçar repetição.
- Resultado desconhecido: houve possibilidade de envio. Guarde a operação/contexto
  e peça conciliação à Feira; não repita a cobrança/recompensa.
- Crédito confirmado, mas saldo diferente: a operação da Feira precisa ser conferida.
  O protocolo não devolve o valor lançado no recibo. Não pague novamente por conta própria.

O assistente não executou nenhuma dessas ações reais. Os testes de código são offline.
