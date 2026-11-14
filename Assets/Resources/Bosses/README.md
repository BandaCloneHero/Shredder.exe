# Geminias e Cláudio — sprite sheets

Arte gerada com a ferramenta integrada de imagens: personificações modernas
das IAs, com cabeça de estrela azul/violeta para Geminias e cabeça radial
terracota para Cláudio. Painéis digitais, corpo de assistente e efeitos de dados. PNG RGBA, 1024 × 1536; grade 8 × 12; células de
128 × 128. Leitura da esquerda para a direita, começando no topo.

| Linha | Animação | Quadros |
| --- | --- | --- |
| 1 | Idle normal | 8 |
| 2 | Dano normal | 8 |
| 3 | Transformação | 8 |
| 4 | Idle segunda forma | 8 |
| 5 | Dano segunda forma | 8 |
| 6 | Preparação normal | 8 |
| 7 | Ataque normal | 8 |
| 8 | Ataque bloqueado normal | 8 |
| 9 | Preparação segunda forma | 8 |
| 10 | Ataque segunda forma | 8 |
| 11 | Ataque bloqueado segunda forma | 8 |
| 12 | Derrota e dissolução | 8 |

`BossSpriteAtlas` carrega as texturas por Resources e recorta cada célula com
pivot central. Não é necessário recortar manualmente no Sprite Editor.
Os dois últimos quadros de preparação sustentam a carga até o disparo.
Os efeitos luminosos conservam transparência parcial.

Prompts: `docs/bosses/image-prompts-v2.json`.
Validação de dimensões, alpha e preenchimento: `python3 scripts/check_boss_atlases.py`.
A aparência e o ritmo das animações ainda precisam ser conferidos no Unity.
