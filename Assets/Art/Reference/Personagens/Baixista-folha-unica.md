# Baixista: 64 poses por comando

O prefab também referencia a textura completa em `bassCommandTexture`. O ReactionController monta os 64 sprites diretamente dessa textura ao carregar, mantendo a ordem binária e evitando depender dos IDs dos subassets importados. Os botões do jogador acompanham o estado reconhecido pelo motor da highway; bots usam os eventos de acerto. Não é necessário um chart especial para as poses responderem.

O baixo também pode ser jogado pelo `FiveLaneKeysPlayer`, cujo perfil usa `GameMode.ProKeys` mesmo ao tocar uma faixa `FiveFretBass`. Esse caminho usa a folha de cinco botões da baixista, mapeia os comandos `ProKeysAction.GreenKey` até `OrangeKey` (28–32) para bits 0–4 e sincroniza a pose com `Engine.IsKeyHeld`. Nos bots desse modo, cada membro do acorde chega separadamente e é acumulado sem apagar os outros membros. O ProKeys real de sete teclas continua com seu mapeamento próprio.

Folha usada na partida: `Assets/Sprites/Personagens/Comandos/Baixista_Combinacoes64.png`.
2048 × 2048 pixels, 8 colunas × 8 linhas, 64 recortes de 256 × 256 com fundo transparente.

Os cinco botões ficam sempre visíveis na ordem verde, vermelho, amarelo, azul e laranja, do corpo para a ponta do baixo. As luzes estão gravadas nas imagens: 32 combinações dos botões em duas posições da mão que toca as cordas. A mão do braço acompanha a mediana dos botões pressionados. Uma quantidade par usa o ponto entre os dois botões centrais; nenhuma tecla usa a pose de repouso.

O índice é `máscara + 32 × posição da palhetada`. Bits 0–4 correspondem às cinco cores. A folha é lida da esquerda para a direita e de cima para baixo. `bassCommandPoses` no prefab `Assets/Prefabs/Gameplay/HUD/TrackView.prefab` já referencia os 64 recortes. O ReactionController existente lê os comandos de baixo e seleciona essas poses.

As duas poses de base estão em `Baixista_Palhetada_Base.png`. As nove posições de mão ficam em `BaixistaMediana`. Arte editada com a ferramenta integrada `image_gen`; prompts e correções em `Baixista-mediana.json`. O exportador compõe somente a região da mão e antebraço sobre a base, restaura a superfície dos botões e desenha as luzes. Rosto, cabelo, corpo e enquadramento permanecem iguais em todas as combinações de cada posição de palhetada.

Para reconstruir, executar `tools/art/export-baixista-64.ps1` em PowerShell na raiz do projeto. O GUID da folha e os IDs dos recortes são preservados. As quatro folhas anteriores foram guardadas em `BaixistaAnterior` com seus metadados originais.

Os recortes e referências foram preparados nos arquivos. A exibição e a resposta aos comandos durante uma partida ainda precisam ser conferidas na Unity.
