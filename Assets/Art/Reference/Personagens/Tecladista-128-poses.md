# Tecladista: sete teclas, duas mãos

128 máscaras binárias (incluindo repouso), divididas em duas folhas de 64 poses, 2048 × 2048 pixels, com recortes de 256 × 256.

Folhas ativas em `Assets/Sprites/Personagens/Comandos/Tecladista_Combinacoes_000_063.png` e `Tecladista_Combinacoes_064_127.png`. Já vinculadas ao `TrackView.prefab`, junto com a pose de repouso.

Bits 0–6 correspondem às teclas brancas 0, 2, 4, 5, 7, 9, 11 do ProKeys 7K. Cores: verde, vermelho, amarelo, azul, laranja, ciano e violeta. As sete luzes ficam visíveis: apagadas em repouso, acesas quando pressionadas.

Uma ou duas notas dentro de três teclas consecutivas usam uma mão, escolhida pelo lado do teclado; a outra fica suspensa em repouso. Duas notas distantes e acordes com três ou mais notas usam as duas mãos. O exportador divide as notas ordenadas em dois grupos, minimizando o maior alcance de cada mão e favorecendo equilíbrio entre os grupos. Cada mão se posiciona na mediana do seu grupo. Sete teclas: três na mão esquerda e quatro na direita.

Corpo, rosto, cabelo e instrumento são a mesma base em todos os quadros. Cada quadro recebe exatamente dois braços isolados, produzidos com a ferramenta de imagens; os movimentos e luzes são compostos pelo exportador. A posição representa o grupo de teclas, sem simulação individual de cada articulação dos dedos.

Jogadores: estado reconhecido pelo motor, incluindo soltura e sustains. Bots: eventos de notas existentes no ReactionController, com sobreposição para acordes e sustentação. A reação de erro permanece desativada.

Reconstruir na raiz do projeto: `tools/art/export-tecladista-128.ps1`. Fontes e prompts em `Assets/Art/Reference/Personagens/`. Recortes e referências preparados por arquivo; validar a aparência e resposta durante a partida na Unity.
