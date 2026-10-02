# Baterista

Gerado com a ferramenta integrada image_gen a partir do desenho original do personagem.

## Prompt

Create an animation sprite sheet based on the attached character sketch, preserving facial identity, hair and piercings. Cyberpunk human band member, polished colorful game illustration, black clothing with cyan magenta neon circuitry. Masculine drummer, pointed mohawk, shoulder length side hair, tunnel earrings, angular black cheek markings. Compact futuristic drum kit snare two toms cymbal; alternate stick strokes and rebounds, moving wrists. Error: wrong strike then visibly winces, shoulders tense, angry downward glare, regains rhythm. EXACT 32 frames in uniform 8 columns by 4 rows. First two rows: continuous 16 frame seamless playing idle. Last two rows: sequential 16 frame obvious missed note frustration reaction then recovery, never celebration. Consistent character and instrument proportions, fixed camera front three quarter, same body scale and bottom baseline throughout. Upper body and complete instrument visible in every frame. Motion must be visible in hands arms and instrument actions; small natural head movement. Wide transparent gutters, each character fully contained in its cell with 15 percent empty margin on all sides, no overlap or cropped instruments, no text labels or borders. Transparent background.

## Organização e uso

- Asset: Assets/Sprites/Personagens/Baterista.png.
- 2048 × 1024, oito colunas e quatro linhas, células de 256 × 256.
- Primeiras duas linhas: 16 quadros tocando em loop.
- Últimas duas linhas: 16 quadros de reação ao erro e recuperação.
- Recortes Unity de 208 × 208 com margem transparente de 24 pixels.
- TrackView.prefab contém as referências. ReactionController seleciona pelo instrumento de cada jogador.
- Tocando: 16 FPS; erro: 12 FPS, pausa de 0,35 s no sexto quadro e intervalo de 0,5 s entre reações.
- Integração preparada por arquivos; aparência e execução ainda precisam ser conferidas no editor/jogo.
