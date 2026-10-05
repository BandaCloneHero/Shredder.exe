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

O ranking público permite selecionar Freeplay ou Modo História e, dentro do modo, uma música com resultados registrados. A lista de músicas é derivada do histórico salvo, pois o site não mantém catálogo completo das músicas do YARG. Cada tabela individual mostra o maior resultado do jogador naquela música/instrumento; resultados de outras músicas não entram no cálculo. Resultados antigos sem `modo` são classificados como História quando têm `fase` registrada e Freeplay nos demais casos.

- Recordes individuais: maior pontuação por conta/instrumento; identidade no ranking é o username normalizado, para resistir à troca de operadorId do navegador.
- Bandas: mantém a regra de soma das pontuações dos registros vinculados à banda que o ranking já utilizava. O callback real precisa fornecer `{ id, nome }` ou definir `player.banda`; sem banda o resultado conta apenas na aba individual. Decidir se futuramente a classificação será por sessão, melhor música ou temporada.
- `songsCompleted`: músicas distintas **por instrumento**, rastreadas em `songRecords[musica].instrumentosCompletados`. Dados antigos sem esse histórico são preservados; a primeira execução após a integração passa a registrar a associação. Uma migração precisa de histórico real para deduplicar com totais antigos.
- `fullCombos`: contador cumulativo de execuções com full combo; `maxScore`, `maxCombo` e `bestAccuracy` nunca diminuem.
- As 29 conquistas têm critérios automáticos. Conquistas existentes são preservadas; resultados e notificações repetidos não duplicam progresso. Veja os critérios abaixo.
- Os limites numéricos de validação estão comentados em `validarResultado`; ajustar ao catálogo real do jogo. A identidade leve enviada pelo cliente permanece como no fluxo existente; não foi introduzida autenticação nova nem verificação antitrapaça.
- Recordes já presentes em `instrumentStats` aparecem no ranking. Nenhuma migração de dados externos do Firestore foi realizada.

Execute `npm test` dentro de `servidor`. Os testes usam arquivos temporários e não alteram contas reais.

## Campos adicionais no Painel do Operador

### Resultados do executável Unity e fila FIFO

Tickets de todas as salas recebem uma ordem global de emissão. O endpoint `/api/operador/resultados-executavel` associa cada lote ao ticket mais antigo ainda sem resultados, comparando os instrumentos enviados pelo YARG aos instrumentos reservados no ticket. O lote fica aguardando revisão no painel; nenhuma conta ou ranking muda antes da confirmação de um operador oficial. A confirmação é aceita somente para o primeiro ticket da fila e grava cada resultado pela rota compartilhada `partidas.salvar`, atualizando perfil, conquistas e ranking. O ticket só sai da fila depois que todas as gravações terminam. IDs de partida estáveis por ticket/instrumento tornam uma retentativa idempotente.

Ao criar a sala, o proprietário pode informar um nome de banda separado do nome da sala. A identidade da banda acompanha cada ticket. Após confirmar os resultados individuais, o servidor salva também o `BandScore` enviado pelo YARG (ou a soma dos resultados individuais para executáveis antigos), junto com música, modo e integrantes. A classificação de bandas usa a melhor pontuação dessa banda por música, sem somar tentativas ou faixas diferentes.

O executável inclui `loteId` para reconhecer reenvios durante a execução atual do servidor. Como as salas e tickets já eram mantidos em memória, tickets pendentes e revisões também são perdidos se o processo Node reiniciar; após reiniciar, emita novos tickets para as próximas músicas. Os instrumentos aceitos incluem os nomes localizados e os identificadores do YARG (`FiveFretGuitar`, `FiveFretBass`, `Drums` e `ProKeys`).

`operador.html` organiza o preenchimento em jogador/perfil, música/pontuação e precisão/combo/notas. O POST `/api/operador/salvar-pontuacao` aceita `nickname` (até 40 caracteres), `currentTitle` (até 80) e `currency` (inteiro de 0 a 1 bilhão) como campos opcionais. Apelido e título omitidos ou em branco mantêm os valores atuais. `currency` significa **moedas ganhas nesta sessão**: é somado ao saldo existente; não substitui o saldo. Campos legados `moedas` e `tituloEquipado`, quando presentes, são sincronizados com os ajustes para a página de perfil refletir o resultado.

A rota aceita `comboMaximo` ou `maiorCombo` e normaliza para `maiorCombo`. O histórico `resultadosPartidas[partidaId]` guarda o resultado completo validado e os ajustes opcionais enviados. Em `songRecords[musica]`, `pontuacao`, `precisao`, `maiorCombo`, `notasAcertadas`, `notasErradas`, `fullCombo`, `instrumento`, `musica` e `partidaId` descrevem a **última execução**; `bestScore`, `bestCombo`, `bestAccuracy` e `plays` continuam sendo agregados históricos. `updatedAt` do registro da música acompanha o do perfil.

Perfil, moedas e estatísticas são gravados juntos atomicamente. Um reenvio com o mesmo `partidaId` não credita moedas novamente. O painel HTTP gera um ID novo por envio; em caso de resposta perdida, conferir o resultado antes de reenviar manualmente, pois um novo POST representa outra partida. Resultados antigos não recebem detalhes que não foram registrados originalmente.

## Edição de conta e conquistas pelo operador

A seção “Editar perfil e conquistas” de `/operador.html` carrega a conta antes da edição. Permite alterar username, definir nova senha, editar nickname/avatar/título, ajustar o saldo total, partidas jogadas, totais de notas, instrumento favorito e os cinco indicadores de cada um dos quatro instrumentos. O saldo nessa seção é absoluto; “moedas ganhas na sessão”, no formulário de partida, continua sendo um acréscimo.

As 29 conquistas do catálogo são exibidas como checkboxes. As existentes aparecem marcadas; desmarcar remove a conquista ao salvar. IDs adicionais já presentes na conta também são exibidos e preservados. A concessão automática por partida continua funcionando (por exemplo, um novo full combo pode conceder `on_fire` novamente após uma remoção manual).

`GET /api/operador/perfil/:username` retorna apenas os campos necessários à edição e uma revisão opaca, nunca salt/hash/senha. `POST /api/operador/salvar-perfil` recebe `{ username, revisao, alteracoes, novaSenha? }`; `alteracoes` usa caminhos como `instrumentStats.guitarra.maxScore`. O endpoint rejeita campos fora da lista permitida. A nova senha usa scrypt e salt novo; campos em branco mantêm a senha atual. Username já cadastrado é rejeitado. Alterar username ou senha encerra sessões da conta, exigindo login novamente.

A edição relê o arquivo e rejeita revisão desatualizada (HTTP 409), evitando sobrescrever resultados recebidos enquanto o painel estava aberto, inclusive durante o cálculo do scrypt. Ajustes de perfil não registram partidas nem reescrevem o histórico. `createdAt` é exibido e preservado; `updatedAt` é mantido pelo servidor. A interface específica por música/histórico está adiada conforme solicitado. Alterações do recorde individual refletem no ranking individual; pontuações históricas de bandas são preservadas.


## Conquistas automáticas

Resultados confirmados pelo operador concedem conquistas automaticamente; não é necessário marcar os checkboxes de conquista. A confirmação do ticket continua associando os resultados do executável às contas dos jogadores. Favoritos são alterados pelo próprio jogador em `POST /api/fases/favoritar`; selecionar/desbloquear fases também avalia a conquista correspondente.

O executável deve ser recompilado com as mudanças em `OperatorScoreReporter`, `GameManager`, `BasePlayer` e `ScoreScreenContainer`. O envio inclui `pausada`, `energiaFinal` (0–100), `dificuldade` e `concluida`. Expert e ExpertPlus são enviados como `maxima`. Bots, treino e replay não geram resultados. Reenvios usam o mesmo `loteId`; falhas transitórias recebem até três tentativas. Executáveis antigos continuam aceitos, mas campos ausentes não concedem conquistas que dependem de pausa, energia ou dificuldade.

| Conquista | Critério |
| --- | --- |
| Primeiros Acordes | Concluir uma música |
| Aquecimento | Jogar 5 partidas |
| Ritmo de Ferro | Jogar 10 partidas no mesmo dia UTC |
| Sem Errar o Compasso | Concluir sem pausar |
| On Fire | Concluir com full combo |
| Cirúrgico | Concluir com 100% de precisão |
| No Limite | Concluir com pelo menos 99%, abaixo de 100% |
| Virada Insana | Concluir com energia final de 0% a 10% |
| Especialista | Full combo em 10 músicas diferentes |
| Multi Instrumentista | Concluir uma música em cada instrumento |
| Perfeccionista | 5 full combos no mesmo instrumento |
| Mestre da Guitarra/Baixo/Bateria/Teclado | 5 full combos no instrumento correspondente (4 conquistas) |
| Colecionador de Fases | Desbloquear as fases 1 a 5 |
| Dono do Palco | Concluir as fases 1 a 5 em História na dificuldade máxima |
| Favorita da Casa | Favoritar as fases 1 a 5 |
| Maratonista | Jogar 50 partidas |
| Incansável | Jogar 100 partidas |
| Lenda Viva | Concluir 50 músicas, incluindo repetições |
| Desafinador Profissional | Acumular 100 notas erradas |
| Tentativa Corajosa | Concluir com menos de 50% de precisão |
| Quase Lá | Concluir com exatamente uma nota errada, sem full combo |
| Volta por Cima | Superar em pelo menos 25% o recorde anterior do instrumento |
| Rei do Ranking | Alcançar a maior pontuação individual do instrumento na música/modo |
| Banda Afinada | Participar com quatro contas distintas, uma por instrumento |
| Show Perfeito | Banda completa com todos concluindo acima de 95% de precisão |
| Estrela da Feira | Liderar um ranking no encerramento da feira |

Bandas sem nome também concedem as conquistas de participação aos quatro jogadores, sem inventar um registro de ranking de banda. Cada conquista gera uma notificação persistida e enviada à conta; a concessão não se repete em um reenvio do resultado.

### Encerramento da feira

A data padrão é **19/11/2026, 17h30, horário de Brasília** (`2026-11-19T17:30:00-03:00`), conforme a estimativa informada. Pode ser alterada pela variável de ambiente `FEIRA_ENCERRA_EM`, com data ISO e fuso explícito.

O servidor verifica o encerramento a cada dez segundos, na inicialização e antes de gravar novos resultados. Concede `estrela_da_feira` ao primeiro colocado de cada instrumento e aos integrantes da banda vencedora, considerando cada música/modo do ranking público. Empates usam a ordem de nomes do ranking. A decisão fica em `fairAchievement` no arquivo de contas e sobrevive a reinicializações. O servidor precisa permanecer ligado para avaliar no horário; se estiver desligado, processa os rankings persistidos ao reiniciar.

## Foto própria do operador

Em `operador.html`, a seção **Minha foto de perfil** permite selecionar PNG, JPG ou WebP de até 8 MB, visualizar o recorte central e salvar na própria conta. O navegador prepara uma miniatura WebP de 256 × 256 antes do envio, com limite de 128 KB. A foto aparece no perfil e nos demais locais que exibem o avatar; também fica disponível como “Minha foto” no seletor do perfil.

`POST /api/operador/avatar` exige sessão de operador oficial antes de processar o arquivo. A conta vem da sessão autenticada; o cliente não escolhe outra conta. O servidor valida o contêiner WebP, limites de tamanho e dimensões, rejeita animação e gera o nome do arquivo. Imagens ficam em `docs/images/avatars/custom/`, e o identificador fica em `avatar` e `customAvatar` da conta. Preserve essa pasta junto com o arquivo de contas nas implantações e backups.

Se o formulário de edição do próprio perfil estava aberto durante o envio da foto, recarregue a conta antes de salvar a edição, pois a revisão mudou.
