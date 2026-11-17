# Poses de bateria: duas baquetas e bumbo

```sh
dotnet run --project tools/CharacterCombinationChecks/CharacterCombinationChecks.csproj
```

Compila os métodos reais `CreateDrumCommandPoses` e `GetDrumCommandMask` com
doubles de Texture2D/Sprite. Verifica geometria, expiração e compatibilidade
6x4/22 ou 8x4/32, mas a máscara visual sempre retém no máximo dois pads mais
bumbo. Todas as 32 entradas possíveis são testadas; sobreposições conservam os
dois pads mais recentes. Entrada e pontuação permanecem independentes disso.

`scripts/check_new_characters.py` confere as 278 poses ativas: 64 de guitarra,
64 de baixo, 22 de bateria e 128 de teclado. Também verifica o ponto médio
geométrico dos acordes, os dedos renderizados, a constância dos comprimentos
do braço e a preservação da carcaça do teclado anterior.

Ainda é necessário conferir o render durante uma partida no Unity.
