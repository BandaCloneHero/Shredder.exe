# Gepeto, Geminias e Cláudio — robôs

`Gepeto.png`, `Geminias.png` e `Claudio.png` são as folhas carregadas pelo jogo.
Todos têm carcaças, juntas articuladas, sensores, pistões e interfaces digitais.
Cada IA é identificada pelo emblema no chassi e por características mecânicas.

- **Gepeto — O Arquiteto:** robô compacto branco com visor arredondado e emblema
  entrelaçado de seis partes. A versão com chifres metálicos foi restaurada:
  visor rachado, olhos e sorriso vermelhos, ombreiras pontudas e pequenas garras.
- **Geminias — O Processador Duplo:** redesign completo, agora com corpo azul e
  branco, cabeça arredondada, um visor, dois braços e duas pernas robustas.
  O símbolo Gemini aparece no peito e na testa. Na fase dois, as proteções do
  visor se fecham e as carcaças dos antebraços revelam emissores violeta.
- **Cláudio — O Auditor de Circuitos:** o robô terracota/creme mantém carcaça,
  hardware e animações, com um pequeno sorriso curvo âmbar na forma normal.
  A expressão hostil e os mecanismos da segunda forma permanecem.

As versões anteriores a esses ajustes estão preservadas em
`output/bosses/antes-ajustes-sorriso-geminias/`.

PNG RGBA, 1024 × 1536; grade 8 × 12; células de 128 × 128. Leitura da esquerda
para a direita, começando no topo. Cada folha contém 96 quadros.

| Linha | Animação | Quadros |
| --- | --- | --- |
| 1 | Idle normal | 8 |
| 2 | Dano normal | 8 |
| 3 | Transformação mecânica | 8 |
| 4 | Idle segunda forma | 8 |
| 5 | Dano segunda forma | 8 |
| 6 | Preparação normal | 8 |
| 7 | Ataque normal | 8 |
| 8 | Ataque bloqueado normal | 8 |
| 9 | Preparação segunda forma | 8 |
| 10 | Ataque segunda forma | 8 |
| 11 | Ataque bloqueado segunda forma | 8 |
| 12 | Derrota e desligamento | 8 |

`BossSpriteAtlas` carrega as texturas por Resources e copia cada célula para
uma textura própria, sem mipmaps, com clamp e quatro pixels transparentes de
padding. O retângulo lógico continua quadrado, sem trimming, com pivot central.
Pequenos fragmentos desconectados que entram pela borda são removidos; braços
ligados ao corpo e efeitos maiores permanecem. Não é necessário recortar
manualmente no Sprite Editor. Retrato e miniatura mantêm escala uniforme e
preservação de proporção, incluindo as reações de dano.
Os dois últimos quadros de preparação sustentam a carga até o disparo.
Os efeitos luminosos conservam transparência parcial.

## Transição normal → corrompida

Ao cruzar 50% de vida, os oito quadros intermediários da terceira linha são
exibidos ao longo de 1,6 segundo (`phaseTransformationSeconds` no animador).
A animação tem prioridade visual sobre dano e combate: se houver um ataque,
o aviso e a defesa continuam com os mesmos tempos e a última ação visual é
retomada quando a transformação termina. A pausa também pausa a transição;
derrota e desativação a cancelam. A música e o tempo de acerto não mudam.

Prompts: `docs/bosses/image-prompts-v5.json`.
Validação de dimensões, alpha e preenchimento: `python3 scripts/check_boss_atlases.py`.
A aparência e o ritmo das animações ainda precisam ser conferidos no Unity.

## Verificar isolamento e proporção

As folhas são importadas sem compressão/mipmaps, com leitura de pixels
habilitada para a separação dos quadros. Cada quadro é preparado apenas ao
carregar a cena; as texturas criadas são liberadas junto com o personagem.

```sh
python3 scripts/check_boss_atlases.py --export-rgba /tmp/boss-rgba
dotnet run --project tools/BossSpriteChecks/BossSpriteChecks.csproj -- /tmp/boss-rgba
```

A checagem cobre os 288 quadros reais e casos sintéticos com vizinhos de cores
contrastantes. A validação visual no Unity continua necessária.
