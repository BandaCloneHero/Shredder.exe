# Julgamento de notas em Shredder.exe

## Estado da entrega

Código integrado à gameplay e ao prefab compartilhado do HUD. Não é uma cena de demonstração.
A execução/renderização no Editor da Unity ainda precisa ser validada; não há Unity instalado
neste ambiente. Não considero os critérios visuais comprovados apenas pelos testes .NET.

Neste checkout não é necessário arrastar referências ou montar objetos manualmente.
O componente `RhythmJudgmentDisplay` já está em `Assets/Prefabs/Gameplay/HUD/TrackView.prefab`,
com a fonte TMP Barlow Black existente, cores, posição e animação configuradas. Os elementos
visuais são construídos e pré-alocados automaticamente na inicialização de cada highway.

## Análise da arquitetura

- `Input/Bindings/ControlBinding.cs` encaminha `eventPtr.time`. `InputManager` usa o relógio
  do Input System, não frames, para a entrada.
- `BasePlayer.OnGameInput` converte esse timestamp usando `GameManager.GetRelativeInputTime`,
  aplica `InputCalibration` e enfileira a entrada no motor. `UpdateInputs` aplica a mesma
  calibração ao avanço do motor. Este fluxo foi preservado.
- `SongRunner` converte o relógio de entrada para o tempo da música, incluindo velocidade;
  áudio e vídeo possuem suas compensações existentes. Nenhum relógio adicional foi criado.
- `YARG.Core/Engine/BaseEngine.ProcessInputs` processa cada evento em seu timestamp antes
  do avanço até o tempo do frame. Portanto, uma entrada enfileirada durante um frame lento
  não é avaliada como se tivesse ocorrido no fim desse frame.
- O motor já tinha janelas temporais, inclusive presets dinâmicos com janelas mais estreitas.
  Não foi encontrada uma conversão explícita do julgamento para frames. Sem executar a
  configuração original no Unity, não é possível atribuir todo o sintoma relatado a uma
  única causa. A nova configuração substitui essas janelas por ±100 ms para partidas novas.
  Também foi corrigida a exclusão do limite antecipado exato no motor de teclas.
- Guitarra usa um callback por acorde; teclas e bateria podem emitir callbacks por parte.
  O HUD agrupa pelo objeto `ParentOrSelf`, mantém o pior resultado real e reutiliza a mesma
  animação para as partes desse acorde, sem esperar sua conclusão para mostrar o primeiro acerto.
- Teclas podem resolver acordes após uma tolerância de stagger. O motor agora fornece
  `NoteHitTime`, preservando o timestamp de cada tecla antes de limpá-lo. Os demais motores
  fornecem o instante em que o motor efetivamente confirmou o acerto, inclusive suas regras
  existentes de strum/HOPO e autohit.
- Sustains continuam nos callbacks próprios de início/fim e na pontuação existente.
  O feedback de precisão só consome `OnNoteHit`, `OnNoteMissed` e `OnOverhit`.
- `TrackView` continua posicionando o HUD pela projeção da highway. O novo elemento usa
  essa mesma projeção e o contêiner de escala existente.

## Julgamento real

`RhythmJudgmentSettings.Configure` copia o preset do instrumento sem alterar o preset
compartilhado. Aplica uma janela total de 0,200 s, simétrica, para produzir ±100 ms no motor.
As faixas iniciais são contínuas, sem arredondamento antes da classificação:

| Resultado | Diferença absoluta |
| --- | --- |
| PERFEITO! | até 25 ms, inclusive |
| ÓTIMO! | acima de 25 até 60 ms |
| BOM! | acima de 60 até 100 ms |
| ERROU! | entrada inválida ou nota perdida pelo motor |

O valor com sinal é `(NoteHitTime - note.Time) * 1000 / Engine.BaseParameters.SongSpeed`.
Negativo significa antecipado; positivo, atrasado. Só a apresentação arredonda para ms inteiros.
Uma perda/entrada inválida não recebe um número fictício.

As permissões existentes de lanes/trills/autohit continuam soberanas. Se elas aceitarem uma
nota fora da janela normal, o HUD mostra BOM! com o desvio real, em vez de contradizer o motor
mostrando ERROU! em uma nota pontuada. Não foram removidas essas regras de instrumento.
O modo de prática mantém a política existente de não estreitar a janela ao reduzir a velocidade.

Notas equivalentes próximas não roubam a entrada da nota mais próxima: antes da lógica normal,
o motor pode perder a anterior pelo caminho normal de miss, preservando a entrada para a próxima.
Essa escolha só ocorre durante o processamento de uma entrada, nunca apenas porque um frame
passou pelo ponto médio. Mantém as regras do instrumento para verificar compatibilidade.

A pontuação por nota, os pontos de sustain, o combo e os multiplicadores não receberam pesos
por classificação. PERFEITO!, ÓTIMO! e BOM! consomem o acerto já confirmado pelo motor.
Notas não podem pontuar duas vezes pelas proteções existentes `WasHit`/`WasMissed`.

Replays continuam usando os parâmetros gravados, sem substituir suas janelas pelo Inspector.
A preferência nova por nota mais próxima está habilitada só em partidas novas, para não mudar
as regras de replays antigos. A seleção em overlaps de notas idênticas não é versionada no
formato de replay atual; esse caso precisa de validação antes de prometer reprodução idêntica
de novos replays. Vocais mantêm seu sistema específico de avaliação de afinação.

## Inspector

Nos componentes de jogador da highway, seção **Julgamento — janelas em milissegundos**:

- `UseMillisecondWindow`: habilita a janela nova; desativado preserva o preset original.
- `PerfectMs`, `GreatMs`, `GoodMs`: limites ordenados, inicialmente 25, 60, 100.

A janela de aceitação é capturada ao criar o motor: reinicie a música/seção depois de alterar
`GoodMs` ou `UseMillisecondWindow`. Não reduza apenas o limite visual no meio de uma partida.

Em **RhythmJudgmentDisplay**, no prefab **TrackView**:

- Fonte TMP, tamanho principal e tamanho dos milissegundos.
- Cores individuais e espessura do contorno escuro.
- Profundidade na highway, deslocamento, escala e distância entre feedbacks.
- Limite de feedbacks simultâneos: 1–8, inicialmente 3. Com 1, cada evento substitui o anterior.
- Crescimento, estabilização, permanência e desaparecimento: 0,08 / 0,10 / 0,20 / 0,20 s.
- Escala inicial e máxima; ÓTIMO! usa intensidade menor; BOM!/ERROU! usam intensidade discreta.
- Ativação do brilho e do impacto, com intensidades independentes.

Configure fonte, tamanhos e capacidade do pool antes de iniciar a música. O pool não é
reconstruído durante sequências rápidas. Não há Instantiate/Destroy por acerto, coroutines,
bibliotecas novas, imagens externas ou pós-processamento. O impacto é uma malha UI pequena.
Os efeitos congelam na pausa; reset/prática/seek limpam os elementos; saída da cena libera o pool.

## Arquivos

Criados:

- `Assets/Script/Gameplay/Judgments/RhythmJudgmentSettings.cs`
- `Assets/Script/Gameplay/Judgments/RhythmJudgmentDisplay.cs`
- `Assets/Script/Gameplay/Judgments/JudgmentImpactGraphic.cs`
- Metadados Unity dos três scripts e da pasta.
- `YARG.Core/YARG.Core.UnitTests/Engine/MillisecondJudgmentTests.cs`
- `tools/JudgmentChecks/`: projeto, programa, shim mínimo para atributos/Mathf e `.gitignore`.
- `docs/patches/rhythm-judgments-core.patch`
- `scripts/apply-rhythm-core-patch.py`
- Este documento.

Modificados:

- `Assets/Script/Gameplay/Player/TrackPlayer.cs`: configuração compartilhada e consumo dos callbacks.
- `FiveFretGuitarPlayer.cs`, `FiveLaneKeysPlayer.cs`, `ProKeysPlayer.cs`, `DrumsPlayer.cs`
  na mesma pasta: construção dos parâmetros com a janela configurada.
- `Assets/Script/Gameplay/HUD/TrackView.cs`: inicialização, projeção e limpeza do feedback.
- `Assets/Prefabs/Gameplay/HUD/TrackView.prefab`: componente e referências reais.
- No submódulo `YARG.Core/YARG.Core/Engine/`: `BaseEngine.cs`, `BaseEngine.Generic.cs`,
  `Guitar/GuitarEngine.cs`, `Drums/DrumsEngine.cs`, `Keys/KeysEngine.cs`,
  `Keys/FiveLaneKeys/FiveLaneKeysEngine.cs`, `Keys/ProKeys/Engines/ProKeysEngine.cs`.

**Transporte do submódulo:** o Core estava vazio e foi inicializado na revisão exigida
`3beb94e526558134145bcd3e409428f759001a40`. As alterações estão no seu diretório de trabalho;
não foram feitos commits. Um commit apenas no repositório principal não inclui arquivos
modificados dentro do submódulo. Para transportar a entrega sem publicar um commit do Core,
o patch completo inclui o código e os testes. Em outro checkout, execute:

```sh
git submodule update --init YARG.Core
python3 scripts/apply-rhythm-core-patch.py
```

O script verifica conflitos antes de aplicar e reconhece quando o patch já está aplicado.
Não é uma etapa de configuração necessária neste workspace, onde as mudanças já existem.

## Verificações executadas

- Suíte completa do Core: **433 aprovados, 2 ignorados, 0 falhas**.
- Dos aprovados, **14 testes novos** cobrem ±100 ms e rejeição em ±101 ms,
  timestamps em 30/60/120/144 FPS, frame atrasado, velocidade musical, nota mais próxima,
  ausência de miss prematuro, acorde com timestamps individuais e sustain sem callbacks repetidos.
- Harness `tools/JudgmentChecks`: **44 verificações aprovadas**, incluindo classificações
  com sinal, limites fracionários, conversão para a janela total, preservação do preset,
  opt-out legado e sintaxe C# 9 dos scripts Unity alterados.
- `git diff --check` nos arquivos alterados e verificação das referências do prefab.
- Patch aplicado em cópias limpas dos arquivos originais: resultado idêntico ao Core modificado.
- Há avisos preexistentes de nulabilidade no Core. A suíte também mantém dois testes de scan ignorados.

Comandos de reprodução:

```sh
dotnet test YARG.Core/YARG.Core.UnitTests/YARG.Core.UnitTests.csproj
dotnet run --project tools/JudgmentChecks/JudgmentChecks.csproj
```

O shim do harness não emula Unity/TMP e não comprova compilação da aplicação Unity.
O Editor ainda precisa compilar/importar os scripts, carregar o prefab e validar o resultado visual,
as outras variantes de instrumento, desempenho no Profiler, pausa, resoluções e multiplayer.

## Teste durante uma música no Editor

1. Abra a gameplay pelo fluxo normal e inicie uma música com notas espaçadas, acordes e sustains.
   Confirme a ausência de erros de compilação e de referências no Console.
2. Com calibração correta, acerte próximo do instante ideal: deve aparecer **PERFEITO!**, dourado,
   com ms e impacto. Desvios reais de ±10 ms continuam nessa faixa.
3. Antecipe/atrase aproximadamente 40–50 ms: **ÓTIMO!**, verde. Confira `-` antecipado e `+` atrasado.
4. Desvie aproximadamente 80–90 ms: **BOM!**, ciano. Acima de 100 ms a nota normal deve ser perdida;
   não pressione nada ou use uma entrada inválida para conferir **ERROU!**, vermelho e sem ms inventados.
5. Para uma checagem determinística das faixas durante gameplay, altere temporariamente no Inspector
   `PerfectMs=100`/`GreatMs=100` para que todo acerto normal seja PERFEITO!;
   `PerfectMs=0`/`GreatMs=100` para que quase todo acerto não exato seja ÓTIMO!;
   `PerfectMs=0`/`GreatMs=0`/`GoodMs=100` para BOM!. Restaure 25/60/100 ao terminar.
6. Toque um acorde: apenas um feedback lógico, atualizado pelo pior desvio das partes; sustente uma
   nota longa: um feedback inicial, sem repetição durante a sustentação. Confira pontos/combo existentes.
7. Toque uma sequência rápida: feedback imediato; no limite do pool, o mais antigo é reutilizado.
   Teste capacidade 1 e 3, e desligue brilho/impacto no Inspector.
8. Repita em 30, 60, 120 e 144 FPS; compare os ms com entradas controladas, sem esperar acertar
   offsets exatos manualmente. Confira também highway mais rápida/lenta e diferentes calibrações.
9. Teste 1280×720, 1920×1080, ultrawide e múltiplas highways; mova/escale a highway pelo HUD existente.
   Ajuste profundidade/deslocamento se a composição específica da câmera exigir.
10. Pause durante um efeito, retome, reinicie prática e encerre a música: nenhuma animação atrasada
    deve reaparecer. Use o Profiler para confirmar ausência de criação/destruição por acerto e avaliar
    a legibilidade/impacto na máquina alvo.


## Diagnóstico do relato de Play no Editor / guitarra All Taps

O relato de feedback ausente e acertos restritivos foi investigado no modo de guitarra com
All Taps. Os cinco testes `AllTapsTimingTests` usam o motor real `YargFiveFretGuitarEngine`,
sem strum, após a primeira nota, com desvios antecipados/atrasados até ±100 ms nos quatro
FPS solicitados e com acordes. Passaram; o sintoma do Editor não foi reproduzido no Core isolado.
Isso não comprova o comportamento do Editor do usuário nem determina sua causa.

Foram gravados explicitamente `UseMillisecondWindow=1` e `25/60/100` nos prefabs
`FiveFretGuitarVisual`, `FiveLaneKeysVisual`, `ProKeysVisual` e `FourLaneDrumsVisual`.
As variantes de bateria herdam esse último prefab. Assim a configuração não depende apenas
dos inicializadores de uma classe serializável recém-adicionada.

A posição do novo feedback agora converte coordenadas de tela para coordenadas locais com
`RectTransformUtility`, considerando o Canvas/câmera. A inicialização informa erro explícito
quando o Canvas ou a fonte TMP estão ausentes, em vez de deixar o HUD indisponível sem explicação.

No Editor, filtre o Console por **[Julgamento]**. Ao iniciar uma música deve aparecer algo como:

```text
[Julgamento] FiveFretGuitarPlayer; motor=YargFiveFretGuitarEngine; janela efetiva=-100,0 a 100,0 ms; ... HUD inicializado=True.
```

No primeiro acerto e na primeira perda é registrada uma mensagem com o resultado real,
o desvio e o estado do HUD. São mensagens limitadas por jogador, somente no Editor,
sem registrar cada nota e sem alocar strings no build final.

- Sem mensagem de inicialização: este caminho/código não chegou a executar; verificar
  erros de compilação, atualização dos fontes e a cena realmente em execução.
- Janela diferente de ±100 ms: verificar `JudgmentSettings` no jogador instanciado e se é replay.
- `HUD inicializado=False`: verificar o primeiro erro de Canvas/fonte no Console.
- Evento real recebido com HUD pronto, mas texto invisível: investigar renderização/posição.

Para separar a renderização da precisão manual, durante uma música selecione
`TrackView(Clone)` na Hierarchy e abra o menu do componente **RhythmJudgmentDisplay**.
Em **Diagnóstico** estão os testes de PERFEITO!, ÓTIMO!, BOM! e ERROU!.
Eles usam o mesmo pool/animação do jogo e não alteram notas, pontuação ou combo.
O teste exige música iniciada e sem pausa.

As novas alterações ainda precisam de verificação no Editor. Não há evidência suficiente
para afirmar que a causa do relato foi eliminada sem observar essas mensagens e o resultado.


Verificação após esta investigação: suíte completa **438 aprovados, 2 ignorados, 0 falhas**;
os cinco testes adicionais são de guitarra All Taps. O harness agora verifica também os
quatro prefabs reais de jogador e a conexão do prefab de HUD à cena Gameplay, além das
classificações e da sintaxe. A validação de renderização Unity continua pendente.
