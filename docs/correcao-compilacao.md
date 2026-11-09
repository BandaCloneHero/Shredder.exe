# Correção de compatibilidade C# — Shredder.exe

## Diagnóstico

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
e permite repetição sem duplicá-lo. Recusa um checkout de outra revisão sem
sobrescrever os arquivos existentes. Não use `git submodule update --remote`.
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
