# Roland — guitarrista

Referência original: E:/Users/PC/Downloads/Roland.jpeg, desenho fornecido pelo usuário.
O desenho original permanece nesse caminho externo ao projeto.

Idle: Assets/Sprites/Personagens/Roland_IdleGuitarra.png,
32 recortes Roland_IdleFluido_01–32, com braço, antebraço e mão fazendo palhetadas,
mão dos trastes deslizando ao longo do braço da guitarra e dedos alternando acordes.
Erro: Assets/Sprites/Personagens/Roland_Guitarra.png,
16 recortes Roland_Erro_01–16 mantendo a ameaça de jogar a guitarra.
Idle: 16 FPS, ciclo de 2 segundos; erro: 12 FPS,
com pausa adicional de 0,35 segundo na pose do quadro 6, total de
aproximadamente 1,68 segundo, e 0,5 segundo de descanso antes da próxima reação.
Retrato da guitarra: 350 × 315 unidades de UI, proporção preservada.
Moldura NoteLedGlow desativada no prefab da highway.
Erros durante a reação não a reiniciam; as regras de pontuação continuam normais.

O TrackPlayer seleciona o Roland para guitarra de cinco/seis trastes e guitarra pro.
Cada highway mantém seu próprio estado; outros instrumentos continuam usando os
sprites normalSprite/missSprite. ConfigureForGuitar é o ponto de seleção atual
e pode ser substituído por uma seleção de personagens quando os demais existirem.

Arte colorida criada com a ferramenta integrada image_gen. Direção escolhida:
cabelo castanho escuro, pele morena, roupa técnica preta com LEDs ciano/magenta,
circuitos luminosos nos braços e pulseiras tecnológicas. Guitarra baseada em
docs/images/Guitarra.png: corpo angular sólido de grafite/metal, disco circular
e contornos ciano, sem efeito translúcido. Palhetada e balanço da cabeça mais amplos;
erro mostra raiva: segura e ergue a guitarra com ambas as mãos, ameaça
bater para baixo, se contém e retorna à posição de tocar. O instrumento
permanece inteiro nas mãos durante todos os quadros. Manter coque,
duas hastes, barba e marcas da testa, queixo e pescoço do desenho.
Importação e ligação feitas por arquivos, sem validação de execução na Unity.

## Prompt inicial

Use case: game-asset. Input image is identity reference for original character ROLAND, a MALE guitarist. Create polished colored illustrated 2D portrait sprite sheet for rhythm game UI: exactly8 columns x4 rows =32 isolated WAIST-UP sprites on truly transparent background, generous clear gutters, consistent scale/camera/bottom baseline. Preserve drawing identity: long wavy dark brown hair down shoulders with high topknot and TWO sticks emerging, thick eyebrows, short mustache and beard, distinctive third-eye SYMBOL/TATTOO centered on forehead (vertical pupil eye and diamond below plus small dots above), ornamental curved tattoo on chin, long black neck markings. Adult masculine face with calm focused eyes, medium warm brown skin. Black sleeveless rock shirt with muted violet trim, dark shoulder strap. Holding ONE dark violet solid-body electric guitar across torso, guitar neck extends toward viewer's right, left hand on fretboard, right hand picking strings over body, show enough guitar to read instrument in small UI. Stylized clean strong outlines, expressive face, shaded illustration, NOT photoreal, NOT chibi, NOT pixel art, no cybernetic robot. FIRST TWO ROWS=16 frame looping 'playing idle' animation: small sequential wrist strums, finger shifts, subtle head/body groove and hair sway; stable focused confident face, single quick blink. Last frame loops to first. LAST TWO ROWS=16 frame NON-looping missed-note reaction: starts normal, winces at bad note with lowered eyebrows and small grimace, strumming wrist recoils and glances down at fretting hand, then recovers to playing pose matching idle start. No tears, no giant symbols or text or FX; mild disappointed expression not extreme screaming. Same person, facial tattoos, clothes, guitar geometry and framing in all32 frames. All hair sticks/guitar fit inside each cell, no overlap, no backgrounds or labels. Exact uniform8x4 grid.

## Ajuste de espaçamento e sequência

Edit target: generated Roland sprite sheet. Preserve the exact character identity, male appearance, hairstyle/topknot/two sticks, facial tattoos, clothes, violet guitar, colors and art style. Fix ONLY layout/framing so it can be sliced safely. EXACT8 columns x4 rows with32 sprites. Each character must be MUCH smaller within its own uniform cell, maximum65% of cell width and height, centered, a broad COMPLETELY TRANSPARENT margin on all four sides. NO sprite touches edges, NO hair sticks crosses into another row, NO guitar neck crosses into next cell. Use a compact guitar neck angled diagonally up-right, still clearly show picking wrist and fretting hand; keep all instrument and hair tips fully inside each cell. Waist-up portrait with clean bottom cutoff INCLUDING transparent space below cutoff, not at cell boundary. Same character scale and torso baseline across all32. FIRST16 ordered left-right rows1-2 form calm focused loop playing electric guitar with slight sequential strums, head groove and hair sway, one brief blink. LAST16 rows3-4 form ONE missed-note reaction sequence, only one wince then looking at fretting hand then return to focused normal pose in final frames. Current last rows repeat the wince twice; fix to one gradual reaction and recovery. Maintain continuous small changes, no dramatic new faces. Transparent background no labels no lines.
