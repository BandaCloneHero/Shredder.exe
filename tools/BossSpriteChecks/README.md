# Recorte e proporção dos chefes

Execute da raiz:

```sh
python3 scripts/check_boss_atlases.py --export-rgba /tmp/boss-rgba
dotnet run --project tools/BossSpriteChecks/BossSpriteChecks.csproj -- /tmp/boss-rgba
```

O projeto compila os arquivos reais `BossSpriteAtlas`, `BossFrameIsolation` e
`CharacterSpriteSizing` contra uma API de pixels em memória. Verifica os 96
endereços da grade com cores sentinelas, ordem das linhas, textura independente
por quadro, padding transparente, tamanho/pivot constante, remoção de pequenos
fragmentos de borda, preservação de braços conectados/projéteis e escala uniforme.
Com os arquivos exportados, também aplica o recorte aos 288 quadros reais.
Os arquivos de animação e miniatura passam por análise de sintaxe C# 9.

`UnityShims.cs` não simula a GPU nem substitui um teste no Unity. Conferir no
Editor: todos os chefes, duas fases, ataque/bloqueio/derrota, pausa, janela
redimensionada e múltiplos jogadores. Comparar tanto retrato quanto miniatura.

A limpeza considera apenas componentes opacos pequenos e desconectados que
encostam na borda. Efeitos maiores e partes ligadas ao corpo são preservados.
A textura independente impede acesso ao quadro vizinho por filtragem, inclusive
quando o desenho do próprio quadro chega ao limite. O padding não é incluído no
retângulo lógico do sprite, portanto não altera sua escala ou o centro.
