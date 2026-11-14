# Gepeto, Geminias e Cláudio — sprite sheets

Gepeto.png, Geminias.png e Claudio.png são as folhas carregadas pelo jogo.
Gepeto mantém o robô branco com visor preto, agora com emblema entrelaçado de
seis partes inspirado no ChatGPT. A forma maligna tem chifres metálicos,
visor rachado, olhos e sorriso vermelhos, ombreiras pontudas e pequenas garras.

Desenhos originais preservados e enriquecidos com as identidades das IAs.
Geminias usa o símbolo de quatro pontas azul/violeta e painéis multimodais;
sua segunda forma tem coroa partida, pontas escuras e sorriso digital maligno.
Cláudio usa o símbolo radial terracota no traje/livro e no halo; a máscara
se abre na segunda forma, revelando rosto escuro com olhos e sorriso luminosos,
capuz pontudo, halo quebrado e livro com olho. PNG RGBA, 1024 × 1536; grade 8 × 12; células de
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

Prompts: `docs/bosses/image-prompts-v3.json`.
Validação de dimensões, alpha e preenchimento: `python3 scripts/check_boss_atlases.py`.
A aparência e o ritmo das animações ainda precisam ser conferidos no Unity.

As primeiras versões sem alterações estão em `output/bosses/originais/`.
A transformação ocupa a terceira linha; a quarta linha inicia o idle maligno.
As reações, preparação, ataque e bloqueio da fase dois usam as linhas próprias
indicadas acima. A troca continua acontecendo ao cruzar 50% de vida.

## Transição normal → maligna

Ao cruzar 50% de vida, os oito quadros intermediários da terceira linha são
exibidos ao longo de 1,6 segundo (`phaseTransformationSeconds` no animador).
A animação tem prioridade visual sobre dano e combate: se houver um ataque,
o aviso e a defesa continuam com os mesmos tempos e a última ação visual é
retomada quando a transformação termina. A pausa também pausa a transição;
derrota e desativação a cancelam. A música e o tempo de acerto não mudam.

Prompt do Gepeto: `docs/bosses/image-prompts-gepeto-v3.json`.
