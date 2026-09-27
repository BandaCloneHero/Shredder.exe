# Resultados locais e ranking ao vivo

O perfil e o ranking usam `accounts.json`. `partidas.js` relê o arquivo antes de cada alteração, grava em arquivo temporário no mesmo diretório e publica com `renameSync`. A região crítica é síncrona, sem `await`: serializa partidas dentro de **um processo Node**. Vários processos escrevendo simultaneamente (cluster ou scripts externos) exigem um lock compartilhado. Não execute reset de senha simultaneamente à gravação de resultados.

`server.js` recebe `partidaFinalizada`, confirma após salvar e publica `rankingAtualizado` para os sockets inscritos via `entrarRanking`. O evento inicial devolve o mesmo formato `{ records }`; reconexões solicitam um snapshot novo. Os dados transmitidos contêm apenas informações públicas de ranking, nunca hashes/salts/sessões.

## Ponto de integração com Phaser

O `jogo.html` disponível no repositório era uma simulação com temporizador; não há cena Phaser para conectar diretamente. Agora carrega `js/resultado-partida.js`. No callback real de término da música, use:

```js
await window.concluirMusica({
    partidaId: idUnicoDaExecucao, // criar uma vez no início; reutilizar ao reenviar
    instrumento: 'Guitarra',
    pontuacao: score,
    precisao: accuracyPercent, // 0–100
    maiorCombo: maxCombo,
    fullCombo: isFullCombo,
    notasAcertadas: hits,
    notasErradas: misses,
    musica: songId,
    banda: bandaAtual, // opcional: { id, nome }
});
```

`operadorId` e `username` são obtidos de `shredder_player`. O socket é sempre `window.socket`, criado apenas se ausente. `partidaId` é gerado automaticamente se omitido, mas uma cena que executa várias músicas sem navegar deve fornecer um ID novo por execução. A chamada repetida com mesmo ID é idempotente no servidor. O resultado fica em `shredder_resultados_pendentes` até confirmação e pode ser reenviado pelo botão, inclusive após recarregar a página. A simulação não atribui pontuações fictícias. O código não apaga o progresso local.

## Semântica e decisões pendentes

- Recordes individuais: maior pontuação por conta/instrumento; identidade no ranking é o username normalizado, para resistir à troca de operadorId do navegador.
- Bandas: mantém a regra de soma das pontuações dos registros vinculados à banda que o ranking já utilizava. O callback real precisa fornecer `{ id, nome }` ou definir `player.banda`; sem banda o resultado conta apenas na aba individual. Decidir se futuramente a classificação será por sessão, melhor música ou temporada.
- `songsCompleted`: músicas distintas **por instrumento**, rastreadas em `songRecords[musica].instrumentosCompletados`. Dados antigos sem esse histórico são preservados; a primeira execução após a integração passa a registrar a associação. Uma migração precisa de histórico real para deduplicar com totais antigos.
- `fullCombos`: contador cumulativo de execuções com full combo; `maxScore`, `maxCombo` e `bestAccuracy` nunca diminuem.
- `on_fire`: concedido por full combo conforme o exemplo solicitado. Os critérios de `primeiros_acordes`, `cirurgico`, `perfeccionista`, `lenda_viva` e `desafinador_profissional` permanecem `null` em `CRITERIOS_ACHIEVEMENTS`; definir regras antes de ativar. Conquistas existentes são preservadas.
- Os limites numéricos de validação estão comentados em `validarResultado`; ajustar ao catálogo real do jogo. A identidade leve enviada pelo cliente permanece como no fluxo existente; não foi introduzida autenticação nova nem verificação antitrapaça.
- Recordes já presentes em `instrumentStats` aparecem no ranking. Nenhuma migração de dados externos do Firestore foi realizada.

Execute `npm test` dentro de `servidor`. Os testes usam arquivos temporários e não alteram contas reais.

## Campos adicionais no Painel do Operador

`operador.html` organiza o preenchimento em jogador/perfil, música/pontuação e precisão/combo/notas. O POST `/api/operador/salvar-pontuacao` aceita `nickname` (até 40 caracteres), `currentTitle` (até 80) e `currency` (inteiro de 0 a 1 bilhão) como campos opcionais. Apelido e título omitidos ou em branco mantêm os valores atuais. `currency` significa **moedas ganhas nesta sessão**: é somado ao saldo existente; não substitui o saldo. Campos legados `moedas` e `tituloEquipado`, quando presentes, são sincronizados com os ajustes para a página de perfil refletir o resultado.

A rota aceita `comboMaximo` ou `maiorCombo` e normaliza para `maiorCombo`. O histórico `resultadosPartidas[partidaId]` guarda o resultado completo validado e os ajustes opcionais enviados. Em `songRecords[musica]`, `pontuacao`, `precisao`, `maiorCombo`, `notasAcertadas`, `notasErradas`, `fullCombo`, `instrumento`, `musica` e `partidaId` descrevem a **última execução**; `bestScore`, `bestCombo`, `bestAccuracy` e `plays` continuam sendo agregados históricos. `updatedAt` do registro da música acompanha o do perfil.

Perfil, moedas e estatísticas são gravados juntos atomicamente. Um reenvio com o mesmo `partidaId` não credita moedas novamente. O painel HTTP gera um ID novo por envio; em caso de resposta perdida, conferir o resultado antes de reenviar manualmente, pois um novo POST representa outra partida. Resultados antigos não recebem detalhes que não foram registrados originalmente.

## Edição de conta e conquistas pelo operador

A seção “Editar perfil e conquistas” de `/operador.html` carrega a conta antes da edição. Permite alterar username, definir nova senha, editar nickname/avatar/título, ajustar o saldo total, partidas jogadas, totais de notas, instrumento favorito e os cinco indicadores de cada um dos quatro instrumentos. O saldo nessa seção é absoluto; “moedas ganhas na sessão”, no formulário de partida, continua sendo um acréscimo.

As seis conquistas do catálogo são exibidas como checkboxes. As existentes aparecem marcadas; desmarcar remove a conquista ao salvar. IDs adicionais já presentes na conta também são exibidos e preservados. A concessão automática por partida continua funcionando (por exemplo, um novo full combo pode conceder `on_fire` novamente após uma remoção manual).

`GET /api/operador/perfil/:username` retorna apenas os campos necessários à edição e uma revisão opaca, nunca salt/hash/senha. `POST /api/operador/salvar-perfil` recebe `{ username, revisao, alteracoes, novaSenha? }`; `alteracoes` usa caminhos como `instrumentStats.guitarra.maxScore`. O endpoint rejeita campos fora da lista permitida. A nova senha usa scrypt e salt novo; campos em branco mantêm a senha atual. Username já cadastrado é rejeitado. Alterar username ou senha encerra sessões da conta, exigindo login novamente.

A edição relê o arquivo e rejeita revisão desatualizada (HTTP 409), evitando sobrescrever resultados recebidos enquanto o painel estava aberto, inclusive durante o cálculo do scrypt. Ajustes de perfil não registram partidas nem reescrevem o histórico. `createdAt` é exibido e preservado; `updatedAt` é mantido pelo servidor. A interface específica por música/histórico está adiada conforme solicitado. Alterações do recorde individual refletem no ranking individual; pontuações históricas de bandas são preservadas.
