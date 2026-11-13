# Conquistas nos resultados do operador

## Comportamento

A alteração é somente no painel `operador.html` e no transporte de resultados do servidor.
Não modifica o executável, a tela de resultados da Unity ou as regras das 29 conquistas.
Combo 99 foi tratado como exemplo, conforme a confirmação do usuário, sem criar uma conquista nova.

O servidor já calculava os desbloqueios ao salvar cada partida. O painel agora mostra, em
**Resultados confirmados recentes**, a pontuação e as conquistas novas daquele resultado,
separadas por jogador e instrumento. Cada conquista exibe a imagem existente, nome, raridade,
dificuldade e requisito. Uma lista vazia mostra “Nenhuma conquista nova nesta partida”.

A confirmação do ticket continua necessária para associar corretamente os resultados do
executável às contas web. O operador não precisa observar notas, combos ou marcar conquistas
manualmente. Antes da confirmação, o painel explica que os desbloqueios serão calculados ao
confirmar; depois, remove o ticket da fila e mantém os resultados individuais abaixo.
Os nomes vêm das contas do ticket, não dos apelidos dos perfis locais do executável.

## Fonte dos desbloqueios

- O painel consome `novasConquistas` retornadas por `partidas.salvar`.
- Também reúne as novas conquistas de participação/banda retornadas pelos fluxos existentes,
  com ou sem nome de banda. Os mesmos critérios continuam no servidor.
- Conquistas já possuídas não aparecem novamente como novas.
- O resumo do operador não confirma/consome as notificações destinadas à conta do jogador.
- A renderização não concede conquistas e não recalcula os critérios no navegador.
- IDs são resolvidos pelo catálogo local; nomes usam `textContent`, e somente imagens dos
  IDs conhecidos são carregadas. IDs desconhecidos não viram caminhos arbitrários/HTML.
- Reenvio, callback e broadcast do mesmo resultado não criam cards duplicados.

Os resultados confirmados do executável são adicionados ao cache recente que já existia
no servidor, com limite de **40 resultados individuais**. Recarregar/reconectar o painel
recupera esse resumo enquanto o servidor continua ativo. Limpar os recentes também o remove.
Este cache não é um novo histórico persistente: reiniciar o servidor esvazia os recentes;
as conquistas e os perfis continuam persistidos pelo sistema existente.

Se a confirmação salvar um jogador e uma gravação posterior falhar, o ticket mantém em
memória os IDs realmente desbloqueados. Tentar novamente reutiliza os IDs idempotentes
existentes das partidas, preserva esse resumo e não duplica partidas nem notificações.
O resumo recente só é publicado quando a confirmação completa termina com sucesso.

Resultados recebidos pelo fluxo de sala `partidaFinalizada` também transportam os IDs novos.
Resultados legados sem esse campo mostram “Este resultado não informa os desbloqueios”,
sem afirmar incorretamente que ninguém desbloqueou conquistas.

## Arquivos

Modificados:

- `servidor/server.js`: inclui os IDs reais nos resultados, reúne desbloqueios de banda,
  conserva o resumo durante uma nova tentativa e publica resultados confirmados recentes.
- `docs/js/operador-resultados-ao-vivo.js`: exibe as conquistas por jogador, mantém os cards
  após confirmação, reaproveita o catálogo e deduplica resultados.
- `docs/operador.html`: título/explicação e estilos responsivos das imagens e badges.

Criados:

- `servidor/test/operador-conquistas-resultados.test.js`
- `servidor/test/operador-conquistas-painel.test.js`
- Este documento.

Nenhum asset novo, alteração de banco/formato de perfil ou configuração na Unity é necessário.

## Verificações executadas

Comando dos testes novos:

```sh
node --test --test-isolation=none servidor/test/operador-conquistas-resultados.test.js servidor/test/operador-conquistas-painel.test.js
```

**14 testes novos aprovados.** O backend usa persistência real em contas temporárias e os
handlers reais extraídos do servidor. O frontend executa os scripts reais em um DOM/socket
controlado. Cobertura: jogador correto, ausência de grant antes da confirmação, conquistas
anteriores, banda de quatro pessoas com/sem nome, jogador sem novas conquistas, campanha,
falta de autorização, falha parcial e retry, reconexão, resposta antiga, limpeza, IDs
inválidos, dados com HTML, imagens existentes e deduplicação de callback/broadcast.

`node --check` passou nos dois scripts modificados; `git diff --check` também passou.

A suíte geral foi executada com:

```sh
node --test --test-isolation=none servidor/test/*.test.js
```

Resultado atual: **66 testes, 45 aprovados, 21 falhas**. Para verificar a origem, os mesmos
52 testes anteriores foram executados usando o conteúdo de `HEAD` dos três arquivos de
produção alterados, antes desta implementação: **31 aprovados, as mesmas 21 falhas**.
Os nomes das falhas foram comparados e são idênticos. Elas incluem fixtures de campanha,
autorização e dependências do DOM que já não correspondem ao código atual. A suíte geral
não está totalmente verde; esta entrega não alterou regras para esconder essas falhas.

Não foi aberto um navegador real nem feita chamada ao servidor de produção. Os testes não
salvaram resultados em contas reais e não enviaram notificações a jogadores reais.

## Como colocar em uso e testar

Atualizar tanto o servidor Node quanto a página/scripts web, reiniciar o processo Node e
recarregar `operador.html`. Atualizar só a hospedagem estática não atualiza os handlers.
Não é necessário gerar outro executável para este recurso: ele já envia a telemetria usada.

1. Emitir um ticket legítimo com os jogadores e instrumentos corretos.
2. Jogar e aguardar o resultado no ticket da fila.
3. Confirmar a associação dos resultados. Conferir os cards em “Resultados confirmados recentes”.
4. Verificar as imagens/nomes dos desbloqueios de cada jogador e a mensagem de ausência
   de conquistas novas para quem não desbloqueou nada.
5. Recarregar a página e testar reconexão: os recentes devem retornar, sem duplicar cards.
6. Testar uma segunda partida e uma banda completa. Conquistas já possuídas não devem ser
   repetidas como novas; as de banda devem aparecer nos jogadores que realmente as receberam.
