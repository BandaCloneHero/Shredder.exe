# Verificação de compatibilidade C#

Na raiz, execute `python3 scripts/restore-compatible-core.py`, depois
`dotnet build tools/CompilationChecks/CompilationChecks.csproj` (.NET SDK 10).

Compila todos os arquivos reais de `Assets/Script/Audio/Bass` e `PitchDetection`
contra o Core e ManagedBass 3.1.1. Também verifica as assinaturas usadas pelo jogo
para carregamento, stems, registro de motores e gravação de replays.

A checagem usa sintaxe C# 9 e aceita os caminhos condicionais do Windows:

```sh
dotnet build tools/CompilationChecks/CompilationChecks.csproj -p:BassCheckPlatform=WindowsEditor -p:UseUnityManagedBass=true
dotnet build tools/CompilationChecks/CompilationChecks.csproj -p:BassCheckPlatform=WindowsPlayer -p:UseUnityManagedBass=true
```

`UseUnityManagedBass=true` usa as DLLs reais restauradas em `Assets/Packages`,
incluindo ManagedBass .NET Framework 4.5. Requer restauração prévia com
NuGetForUnity. Sem essa opção, o teste usa as variantes .NET Standard via NuGet.
O padrão é `BassCheckPlatform=LinuxPlayer`.

Para verificar exatamente o Core usado pelo Unity, extraia
`Packages/in.yarg.core-0.13.0-shredder.1.tgz` fora de `Assets` e passe
`-p:CoreProjectPath=/caminho/extraido/package/YARG.Core.csproj` ao comando.
Assim a checagem não depende da revisão atual do submódulo.

`EnvironmentShims.cs` substitui somente serviços do aplicativo/Unity para permitir
essa compilação isolada. Não é importado pelo Unity, não executa áudio e não substitui
uma compilação completa no Editor. Nenhum membro do Core/ManagedBass é simulado.
