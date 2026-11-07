# Julgamento de notas em Shredder.exe

## Configuração atual

A comparação usa o timestamp double de entrada convertido pelo SongRunner para o relógio
musical, preservando offsets, calibração e velocidade. Não arredonda para frames ou ms inteiros.

| Resultado | Antecipado, até | Atrasado, até | Pontos da cabeça da nota | Dano ao boss |
| --- | ---: | ---: | ---: | ---: |
| PERFEITO! | 32 ms | 30 ms | 100% | 1,15× |
| ÓTIMO! | 65 ms | 62 ms | 80% | 1,00× |
| BOM! | 185 ms | 170 ms | 50% | 0,70× |
| ERROU! | fora da janela ou erro registrado pelo motor | — | 0 | 0 |

As faixas são contínuas: por exemplo, +31 ms é ÓTIMO!, −66 ms é BOM!.
O ajuste mais recente ampliou somente PERFEITO! de 28/26 para 32/30 ms (+4 ms de cada lado).
A configuração anterior à assimetria era ±25/60/180 ms. A ampliação antecipada foi pequena; a margem
atrasada de aceitação é 15 ms menor que a antecipada. Todos esses campos e os pesos ficam no
Inspector, em `JudgmentSettings`, nos quatro prefabs de jogadores em `Assets/Prefabs/Gameplay/Visual`.
PERFEITO! conserva o valor base do instrumento: uma nota base de 50 dá 50/40/25 pontos antes
dos multiplicadores existentes. Pro Keys e Pro Drums conservam seus próprios valores base.

`UseMillisecondWindow` desativado preserva a janela do preset. Permissões de sustain,
HOPO, strum, notas seguradas, lanes e autohit continuam no motor. Se ele aceitar um acerto
por uma dessas permissões fora da janela normal, o resultado é BOM!, preservando o acerto.
Não foi alterada a calibração global de áudio/entrada; um atraso constante deve ser calibrado.

## Integração

- `RhythmJudgmentSettings`: limites antecipados/atrasados, configuração do preset e pesos.
- `RhythmJudgmentSession`: resultado único por nota, compartilhado por pontuação, HUD,
  dano ao boss e contadores. A política é copiada ao iniciar a sessão.
- `JudgedEngines`: subclasses dos motores existentes, modificando apenas a pontuação da
  cabeça da nota pelo `AddScore(int)` original. Combo, Star Power, bônus de solo, sustains,
  band multiplier e cálculo de estrelas continuam no fluxo original.
- Os quatro `TrackPlayer` concretos instanciam essas subclasses: guitarra/baixo de cinco
  trastes (incluindo All Taps), teclas de cinco/seis pistas, Pro Keys/sete teclas brancas,
  baterias de quatro/cinco pistas e Pro Drums. Vocais mantêm o julgamento próprio de afinação;
  não recebem contagens temporais fictícias. Six Fret e Pro Guitar não têm jogador ativo nesta cena.
- Teclas capturam o timestamp antes de o motor limpar o estado da tecla, inclusive ao resolver
  acordes por stagger. Os motores de guitarra/bateria usam o instante real de confirmação do motor.
- `TrackPlayer` encaminha o mesmo resultado ao HUD e ao boss. `BossHealthBar` não calcula uma
  segunda classificação; preserva o bônus de combo e as penalidades do combate.
- Em guitarra, um acorde gera um evento lógico de combo/pontuação e um julgamento visual por
  parte. Os contadores contam cada parte: um acorde de três notas perfeito soma três perfeitos.
  Teclas e bateria preservam seus callbacks por parte. Sustains contam apenas o início.
- ERROU! no resumo soma notas perdidas e entradas inválidas efetivamente registradas pelo
  motor; por isso pode exceder o número de notas perdidas. Uma callback repetida não conta
  uma nota duas vezes. Reinício e seek limpam/reconstroem os contadores.

## Apresentação e resultado final

As imagens existentes em `Assets/Resources/Julgamentos` continuam aparecendo na própria coluna,
sem ms, com crescimento, subida curta e transparência. Cada nota tem sua própria animação;
uma nota nova não reinicia a imagem anterior. Consulte [julgamentos por pista](julgamentos-por-pista.md).

`GameManager.EndSong` captura um resumo por jogador e o transfere por `PlayerScoreCard` para
`ScoreCard`. `JudgmentResultsView` cria quatro linhas com imagens e contadores no painel de
estatísticas básicas já existente, dentro da área rolável. Não requer montar objetos ou arrastar
referências na Unity. Os contadores também são salvos em novas colunas nullable de
`PlayerScoreRecord`; o mecanismo existente `CreateTable` migra a tabela. Registros antigos
permanecem sem contagens, em vez de receber números inventados.

## Replays

O formato binário do Core permanece intacto. Partidas novas salvam um arquivo companheiro
`nome.replay.judgments.json`, com versão, checksum, jogadores e políticas de julgamento.
A reprodução e a reanálise usam essas políticas, inclusive no recálculo sem bots. A exportação
pelo jogo copia o companheiro; ao transferir arquivos manualmente, mantenha os dois juntos.
Replays antigos sem companheiro continuam com os motores/regras originais. Arquivos
companheiros inválidos são registrados no log e ignorados, com fallback legado.

O adaptador `JudgmentReplayAnalyzer` usa o EngineManager original e os mesmos motores da
partida. Sua criação de instrumentos e validação estatística foram adaptadas do ReplayAnalyzer
existente porque a fábrica de motores dele é privada. Não há um segundo cálculo de score.

## Correção do aviso de replay na tela final

A tela final ainda chamava diretamente `ReplayAnalyzer` do Core, enquanto gameplay, histórico e
recálculo da banda já usavam `JudgmentReplayAnalyzer`. Assim, um acerto ÓTIMO! de 40 pontos
podia ser reanalisado como 50, gerando “Inconsistent Replay Results!”. `ScoreScreenMenu` agora
carrega os metadados do replay e usa o mesmo adaptador da partida, mantendo o fallback legado.

O diagnóstico também era aberto antes da inicialização da navegação de resultados. A tela
empilhava seus controles por cima do diálogo; fechar a janela podia remover o esquema errado.
Agora os avisos são abertos depois da navegação final estar instalada. Um `finally` libera
`_analyzingReplay` em retornos normais e exceções, impedindo que uma falha na análise deixe
Continuar bloqueado. Avisos reais continuam existindo, em português; os scores não são substituídos.

Verificação desta correção: **6.584 verificações aprovadas** no harness, incluindo os métodos
reais de análise/diagnóstico da tela final com motores reais, replay novo/legado solo,
divergência deliberada e exceção de carregamento. UI/navegação e carregamento de arquivo são
substitutos controlados nesse teste; não equivale a testar a janela real no Editor.
No Play, terminar uma música solo com ÓTIMOS/BONS, conferir a ausência do falso aviso e testar
Continuar e Reiniciar. Se houver uma divergência real, conferir se Fechar restaura os controles.

## Arquivos desta alteração

Criados em `Assets/Script/Gameplay/Judgments`, com seus `.meta`:
`JudgedEngines.cs`, `RhythmJudgmentSession.cs`, `JudgmentReplayMetadata.cs`,
`JudgmentReplayAnalyzer.cs` e `JudgmentResultsView.cs`.

Modificados: `RhythmJudgmentSettings.cs`, `TrackPlayer.cs`, `FiveFretGuitarPlayer.cs`,
`FiveLaneKeysPlayer.cs`, `ProKeysPlayer.cs`, `DrumsPlayer.cs`, os quatro prefabs de jogadores,
`BossHealthBar.cs`, `GepetoBossReaction.cs`, `GameManager.cs`, `GameManager.Loading.cs`,
`ScoreScreenContainer.cs`, `ScoreScreenMenu.cs`, `ScoreCard.cs`, `PlayerScoreRecord.cs` e
`ReplayViewType.cs`. O harness `tools/JudgmentChecks` foi ampliado.
As imagens e a animação de gameplay aprovadas não foram modificadas.

## Verificação

Execute `dotnet run --project tools/JudgmentChecks/JudgmentChecks.csproj --no-restore`.
Resultado executado nesta entrega: **3.748 verificações aprovadas, sem falhas**.
O harness compila os settings, sessão, motores ponderados e adaptadores de replay reais
contra o Core. Testa antecipação/atraso em 30/60/120/144 FPS; velocidades 0,75×/1×/1,5×;
50/40/25 e valores próprios de Pro Keys/Pro Drums; contadores; reset; acorde com sustain;
replay novo/legado e exportação; assets e referências reais dos prefabs; sintaxe C# 9.

O ambiente não tem Unity Editor. Ainda dependem de Play no Editor: renderização e layout
final em diferentes resoluções/multiplayer; animação e pausa/retomada visuais; sensação dos
limites com sua calibração; combate completo e migração da base SQLite da instalação.
Não se deve confundir a compilação do harness com a compilação completa do projeto Unity.

Para validar numa música: acertar perto do centro deve dar PERFEITO!, aproximadamente
50 ms antes/depois deve dar ÓTIMO!, cerca de 100 ms antes/depois deve dar BOM!, e deixar
passar deve dar ERROU!. Compare a pontuação em trechos equivalentes sem mudar combo/SP;
verifique a diferença de dano e, ao terminar, as quatro imagens/contagens nas estatísticas
básicas. Teste acordes, sustain, inputs inválidos e reinício, e depois reproduza o replay.

## Dependência do Core já existente

Esta alteração não cria outro commit de submódulo. O checkout usa as correções anteriores
do Core. Se outro checkout não as tiver, existe `docs/patches/rhythm-judgments-core.patch`
e o aplicador `scripts/apply-rhythm-core-patch.py`. O ponteiro remoto do submódulo já causou
`not our ref` anteriormente; não confundir esse problema de distribuição com estes novos scripts.
