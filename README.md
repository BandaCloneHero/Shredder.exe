# Shredder.exe 

## Premissa
Jogo de ritmo estilo Guitar Hero com até 4 jogadores, incluindo controles de guitarra, baixo, teclado e bateria. Se possível, ter um sistema de pontuação mínima para derrotar a banda de I.A. inimiga.
No site da feira, o jogador escolhe uma das músicas originais, o instrumento e se quer jogar solo, em dupla, trio ou quarteto, o que o leva a uma fila de espera para pareá-lo com outros jogadores interessados.

## Universo do Jogo
No ano de 2167, quase todas as músicas são feitas por grandes corporações de I.A. 
O jogador é parte de uma das poucas bandas humanas que quer se manter relevante, mas para isso, deve provar sua habilidade em um contesto de bandas.

## Referências

- Jogos
  - Guitar Hero
  - Clone Hero
  - Osu Mania
  - Rock & Roll Racing

- Música
  - Nine Inch Nails: Downward Spiral
  - TesseracT: Altered State
  - The Contortionist: Language I & II
  - Tool - Fear Inocolum
  - DOOM Eternal Soundtrack

- ## Menção honrosa
- Marcão Davi Correia

- ## Menção muito honrosa
- Vinícius Anjos - Apoio na programação

- Larissa Mello Laurindo - Artes Visuais
# Dependência C# do Shredder.exe

Antes de abrir no Unity **6000.3.5f2**, execute na raiz:

```sh
python3 scripts/restore-compatible-core.py
```

O projeto usa YARG.Core `3beb94e526558134145bcd3e409428f759001a40`
mais o patch versionado de julgamentos. O restaurador preserva checkouts existentes
de outra versão e pode ser executado novamente sem reaplicar o patch.
Não substitua pelo Core mais recente nem remova `Assets/Script/Audio/Bass`.
Restaure também os pacotes de `Assets/packages.config` com NuGetForUnity.
Veja [o diagnóstico de compilação](docs/correcao-compilacao.md).
