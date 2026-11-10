# Correção de compatibilidade C# — Shredder.exe

## Correção do restaurador no Windows

A mensagem `YARG.Core is not an initialized Git checkout`, mesmo com
`git -C YARG.Core status` funcionando, era causada por uma comparação textual
entre o caminho retornado pelo Git e o caminho do Python. Git for Windows pode
usar barras `/` e outra capitalização da unidade. A validação agora usa
`os.path.samefile`, que compara a identidade no sistema de arquivos e aceita
submódulos cujo `.git` é um arquivo.

O restaurador também recupera agora um checkout **limpo** da master, inclusive
`2f3900cf91aa141149d60cb122e88876e1709abb`, sem exigir igualdade com a árvore do
patch. Antes da troca, verifica a ausência de alterações e arquivos não rastreados,
busca somente a revisão pública fixada se ela estiver ausente, valida o patch
num índice temporário e salva o HEAD atual em um bundle. O checkout usa
`--no-overwrite-ignore` para não sobrescrever arquivos ignorados em conflito.
As descrições históricas abaixo de recusa de qualquer master limpa foram
substituídas por esse comportamento.

Com o script atualizado, execute na raiz no Windows:

```bat
py scripts\restore-compatible-core.py
git -C YARG.Core rev-parse HEAD
```

A revisão final deve ser `3beb94e526558134145bcd3e409428f759001a40`, com o patch
de julgamentos aplicado. `git submodule update --init --no-fetch` não resolve um
gitlink que ainda aponta para um commit local indisponível como `fb7be371`;
ele tenta justamente esse commit, sem buscar objetos. O restaurador usa a revisão
pública diretamente e não precisa desse comando.

Verificação: cinco testes em `scripts/test_restore_compatible_core.py` passaram.
Também foi restaurado um checkout temporário real da master indicada, com `.git`
em formato de arquivo; o patch foi validado e a segunda execução foi bem-sucedida.
Essa integração foi executada no Linux; a comparação de caminhos Windows foi
coberta por teste com o retorno do Git simulado.

## Reincidência investigada em 10/11/2026

O commit principal `f816604` voltou a fixar um commit local de Core,
`db5dc09f5a55dc294d0dd68dc92d0e6a3153bdcc`. Esse objeto existe neste ambiente,
mas não pode ser recuperado do remoto oficial informado no erro `not our ref`.
Ele é filho direto de `3beb94e5` e contém exatamente o patch de julgamentos já
versionado: nove arquivos, sem mudanças nos contratos de áudio.

Neste checkout, o Core estava em `db5dc09` e sem alterações locais, portanto
já continha contratos compatíveis. A comparação com `origin/master` confirmou
todos os grupos de incompatibilidades relatados: `InputDeviceInfo` substitui
tuplas e argumentos separados, surgem push streams/amostras de venue,
microfone multicanal/reverb, fábricas de streams e canais tone/one-shot,
e `SetPlaybackSpeed_Internal` substitui `SetSpeed_Internal`.
Baixar a master para contornar o commit indisponível introduz esses erros;
não há indicação de que as implementações BASS do jogo precisem dessa migração.

O caminho efetivo é **`YARG.Core` na raiz** (`path = YARG.Core` em `.gitmodules`).
`Assets/Plugins/YARG.Core` é apenas o nome histórico da seção de configuração.
Manifesto e lock UPM já apontam para a pasta correta; não há outro Core em
`Assets/Plugins/YARG.Core` neste checkout.

Nesta revisão, foram modificados:

- Gitlink `YARG.Core`: novamente fixado na revisão pública `3beb94e5`, no índice,
  sem commit ou push.
- `scripts/restore-compatible-core.py`: recupera automaticamente um commit local
  somente se seu checkout estiver limpo e sua árvore inteira for exatamente igual
  à base pública com o patch. Calcula essa árvore com índice Git temporário,
  preserva o commit em um bundle e faz checkout da base antes de reaplicar o patch.
  Qualquer conteúdo adicional, inclusive arquivos não rastreados, impede a troca.
- `README.md` e este relatório: instruções e diagnóstico atualizados.

Os sete fontes e dois testes de Core do patch foram restaurados como alterações
locais, mantendo os mesmos bytes do commit `db5dc09`. Nenhum arquivo BASS,
referência de áudio ou arquivo `.meta` foi alterado nesta revisão. As versões
ManagedBass/Fx/Mix 3.1.1 e demais dependências foram mantidas.

Backups desta revisão: `/tmp/shredder-core-recovery-20261110/local-core.bundle`
(histórico Git completo de `db5dc09`, verificado com `git bundle verify`) e
`/tmp/shredder-core-recovery-20261110/source-before.tar.gz` (fontes e configurações
antes das mudanças). O restaurador também salvou seu próprio bundle, com o
caminho impresso durante a execução. Não foi usado `git reset --hard`.

Os comandos de verificação e suas limitações estão descritos abaixo. Os testes
do restaurador incluíram checkout vazio, repetição, recuperação do commit local,
preservação de arquivo não rastreado e recusa da master incompatível. A compilação
isolada dos fontes BASS reais e contratos passou com **zero erros**, com os oito
avisos preexistentes de nullable/análise estática em uma compilação inicial.
Foram reexecutadas e aprovadas as **6.632 verificações de gameplay/replays** e
os testes do Core: **438 aprovados, 2 ignorados, nenhuma falha**. Uma comparação
byte a byte confirmou que os nove arquivos restaurados do Core são idênticos
aos do commit local preservado. A validação completa no Unity continua pendente
por ausência do Editor neste ambiente.

## Diagnóstico original de 09/11/2026

O checkout recebido tinha `YARG.Core/` vazio. O pacote local
`in.yarg.core` em `Packages/manifest.json` aponta para `../YARG.Core/YARG.Core`.
O gitlink apontava para `848add039e761a74c6e807fa5713cdd41fea5c38`, ausente
do histórico público de `YARC-Official/YARG.Core`. A revisão privada anterior
`55b7c62` também já era mencionada na documentação como indisponível.

A base pública original registrada no histórico deste jogo é
`3beb94e526558134145bcd3e409428f759001a40` (pacote 0.13.0). Ela foi
restaurada junto com o patch já versionado em `docs/patches/rhythm-judgments-core.patch`.
O ponteiro Git foi corrigido para essa base pública. Essa alteração do gitlink está
no índice; nenhum commit foi criado. O patch permanece como alterações locais no
submódulo, reproduzíveis pelo script de restauração. Deve ser reaplicado depois
de operações que limpem/recriem o submódulo.

As APIs do Core oficial mais recente explicam os erros relatados:

| Uso no jogo/base compatível | Mudança encontrada no Core recente |
| --- | --- |
| `LoadBackground(bool excludeYarground = false)` | Acrescentou `enableCensoring` obrigatório |
| `LoadAudio(float, double, params SongStem[])` | Acrescentou `enableCensoring` obrigatório |
| `Instrument.ToSongStem()` | Passou a `ToSongStems()`, com múltiplos stems |
| `SongStem.Drums` | Bateria passou a stems separados, com muting individual |
| `EngineManager.Register(engine, Instrument, ...)` | Passou a receber `InstrumentDifficulty<TNote>` |
| `ReplayData(colors, cameras, frames, frameTimes)` | Acrescentou presets de rock meter e `noFail` |
| `ReplayIO.TrySerialize(..., pauses, stats, data)` | Acrescentou `censorshipEnabled` |
| Overrides BASS do jogo | Contratos mudaram com sincronização, microfone multicanal, ASIO e push streams |
| `PreferClosestNote` e `NoteHitTime` | São extensões do patch do Shredder; não existem na base oficial sem patch |

Não foi feita uma migração parcial do jogo para essas APIs novas. Restaurar sua
dependência compatível mantém os contratos de áudio, instrumentos e replays.

## Áudio e dependências

`Assets/Script/Audio/Bass` e o `using YARG.Audio.BASS` já estavam presentes
neste checkout. `GlobalVariables` inicializa `BassAudioManager`; remover a pasta
impede o backend de áudio de funcionar. Bibliotecas nativas reais existem em
`Assets/Plugins/BassNative` para Windows, Linux e macOS.

Os pacotes declarados em `Assets/packages.config` foram restaurados para
`Assets/Packages` usando NuGetForUnity.Cli 4.5.0. Foram preservadas as versões:
ManagedBass/Fx/Mix 3.1.1, DryWetMidi.Nativeless 7.0.0, ZString 2.5.1 e Unsafe 6.0.0,
entre as demais dependências já declaradas. Newtonsoft.Json permanece gerenciado
pelo pacote Unity; o projeto .NET do Core usa 13.0.3.

`BassAudioManager.cs` usa agora `Bass.Configure(Configuration.UnicodeDeviceInformation, true)`
e `Bass.Configure(Configuration.TruePlayPosition, false)`. Mantêm as opções originais,
permitindo compilar também contra a variante .NET Standard do ManagedBass 3.1.1,
que não contém as duas propriedades de conveniência presentes na variante .NET Framework.

## Reprodução

Na raiz do projeto, com Git e Python 3 disponíveis:

```sh
python3 scripts/restore-compatible-core.py
```

O restaurador baixa a revisão fixada quando a pasta está vazia, aplica o patch
e permite repetição sem duplicá-lo. Também recupera um commit local com conteúdo
exatamente igual à base pública com o patch, preservando-o em backup. Recusa
outros conteúdos/revisões sem sobrescrevê-los. Não use `git submodule update --remote`.
O aplicador de patch também verifica a revisão antes de modificar uma base nova.

Restaure os pacotes com NuGetForUnity no Editor, ou com sua CLI:

```sh
nugetforunity restore .
```

Abra no Unity **6000.3.5f2**, conforme `ProjectSettings/ProjectVersion.txt`.

## Verificação executada

```sh
dotnet build tools/CompilationChecks/CompilationChecks.csproj
dotnet run --project tools/JudgmentChecks/JudgmentChecks.csproj
dotnet test YARG.Core/YARG.Core.UnitTests/YARG.Core.UnitTests.csproj
```

- Compilação isolada: **zero erros**, incluindo todos os arquivos BASS e
  PitchDetection reais e os contratos de API da tabela acima.
- Harness do jogo: **6.632 verificações aprovadas** de gameplay, julgamentos,
  instrumentos, replays, pools e sintaxe C# 9.
- Core: **438 testes aprovados, 2 ignorados, zero falhas**. Inclui os testes
  adicionais distribuídos no patch de julgamentos.
- Restaurador: testados checkout vazio, segunda execução e recusa de revisão
  incompatível com preservação dos arquivos.
- Permanecem avisos preexistentes de nullable no Core e CA2265 no PitchTracker
  na compilação .NET 10; nenhum deles é erro de compilação.

Não há Unity Editor nem Library/projetos C# gerados pelo Unity neste ambiente.
Portanto, a compilação completa de Assets, pacotes UPM, scripts de Editor e
importações nativas ainda precisa ser confirmada no Editor. A checagem isolada
usa substitutos somente para serviços do Unity/aplicativo, sem simular Core ou
ManagedBass. Não comprova reprodução sonora, renderização ou ausência de outros
erros exclusivos do Unity; não há um Console atualizado disponível para listá-los.

## Preservação e arquivos

Backup anterior às mudanças: `/tmp/shredder-before-compilation-fix.tar.gz`
(scripts do jogo, configuração de pacotes, aplicador/patch e harness existentes).
Referência Git original registrada em `/tmp/shredder-original-core-reference.txt`.
Não foram removidos recursos, criadas implementações vazias no jogo nem feitas
alterações nos jogadores para esconder incompatibilidades.

Alterados: gitlink `YARG.Core`, `Assets/Script/Audio/Bass/BassAudioManager.cs`,
`scripts/apply-rhythm-core-patch.py`, `README.md` e `docs/julgamento-de-notas.md`.
Adicionados: `scripts/restore-compatible-core.py`, este relatório e os arquivos
de `tools/CompilationChecks`.

O patch existente restaura sete fontes do Core: `BaseEngine.cs`,
`BaseEngine.Generic.cs`, `DrumsEngine.cs`, `GuitarEngine.cs`, `KeysEngine.cs`,
`FiveLaneKeysEngine.cs` e `ProKeysEngine.cs`, além dos testes
`AllTapsTimingTests.cs` e `MillisecondJudgmentTests.cs`.
