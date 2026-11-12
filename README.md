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

Abra no Unity **6000.3.5f2** com `Packages/manifest.json` e
`Packages/in.yarg.core-0.13.0-shredder.1.tgz` desta versão do projeto.
O Unity usa esse pacote local fixado, contendo YARG.Core `3beb94e5` mais o
patch de julgamentos. Isso impede que uma `master` incompatível no submódulo
volte a causar os erros de override nos arquivos BASS. Não é necessário executar
Python para carregar esse Core no Unity.

Para trabalhar nos fontes do submódulo ou executar os testes .NET:

```sh
python3 scripts/restore-compatible-core.py
```

O restaurador recupera também uma `master`
limpa ou um commit local indisponível no remoto: salva um backup Git e volta à
base pública com o patch. Alterações locais não commitadas e arquivos não
rastreados impedem a troca e são preservados. O comando pode ser executado novamente.
Não substitua pelo Core mais recente nem remova `Assets/Script/Audio/Bass`.
O pacote foi exportado por `scripts/package-compatible-core.py`, com licença,
proveniência e metadados Unity. Edições no submódulo não alteram automaticamente
o pacote usado pelo Unity: uma mudança de Core exige gerar uma nova versão dele.
Restaure também os pacotes de `Assets/packages.config` com NuGetForUnity.
Veja [o diagnóstico de compilação](docs/correcao-compilacao.md).
