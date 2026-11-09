# Verificação de compatibilidade C#

Na raiz, execute `python3 scripts/restore-compatible-core.py`, depois
`dotnet build tools/CompilationChecks/CompilationChecks.csproj` (.NET SDK 10).

Compila todos os arquivos reais de `Assets/Script/Audio/Bass` e `PitchDetection`
contra o Core e ManagedBass 3.1.1. Também verifica as assinaturas usadas pelo jogo
para carregamento, stems, registro de motores e gravação de replays.

`EnvironmentShims.cs` substitui somente serviços do aplicativo/Unity para permitir
essa compilação isolada. Não é importado pelo Unity, não executa áudio e não substitui
uma compilação completa no Editor. Nenhum membro do Core/ManagedBass é simulado.
