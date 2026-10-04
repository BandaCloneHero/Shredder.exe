# Personagens por comandos

Atualização da bateria: usa Baterista_Combinacoes22.png, com repouso, quatro pads individuais e seis pares, todos com e sem bumbo. A pose usa no máximo duas baquetas. Consulte Baterista-22-poses.md.

Atualização do baixo: usa Baixista_Combinacoes64.png, uma folha com 64 recortes, luzes gravadas e mão acompanhando a mediana dos botões. Consulte Baixista-folha-unica.md. As quatro folhas anteriores estão arquivadas em BaixistaAnterior.

Atualização da guitarra: a configuração atual usa apenas Roland_Combinacoes64.png, com todas as 32 combinações dos botões nas duas poses de palhetada, totalizando 64 sprites com luzes gravadas. Consulte Roland-folha-unica.md. A descrição de 18 folhas abaixo registra a versão anterior; as quatro folhas antigas do Roland estão arquivadas em RolandAnterior.

As referências estão no componente ReactionController do prefab TrackView. As 18 folhas em Assets/Sprites/Personagens/Comandos já possuem recortes no arquivo .meta; não é necessário recortar manualmente.

| Personagem | Ordem dos bits, do menos significativo ao mais significativo | Poses |
| --- | --- | --- |
| Roland | verde, vermelho, amarelo, azul, laranja | 32 combinações × 2 estados de palhetada = 64 |
| Baixista | verde, vermelho, amarelo, azul, laranja | 32 combinações × 2 estados de palhetada = 64 |
| Baterista | vermelho, amarelo, azul, verde, pedal laranja | 32 |
| Tecladista | verde, vermelho, amarelo, azul, laranja, ciano, violeta | 128 |

Índice = soma dos bits pressionados. Exemplo: verde e amarelo na guitarra = 1 + 4 = 5. A palhetada acrescenta 32. Nenhuma tecla = 0; as sete teclas do teclado = 127.

Cada folha contém 16 poses, da esquerda para a direita, de cima para baixo. O nome indica os índices globais. Para trocar pela arte manual, preserve o layout 1024 × 1024, quatro colunas e quatro linhas de 256 × 256. Os recortes são 208 × 208, com margem de 24 pixels. Preserve os arquivos .meta para manter as referências. Ajuste spriteSizing se o enquadramento da nova arte mudar.

Guitarra, baixo e teclado acompanham pressionar/soltar, inclusive acordes e comandos fora das notas. Palhetada e bateria exibem golpes por 0,12 segundo para não desaparecerem entre quadros. Os comandos usam o relógio da música, param visualmente na pausa e são reiniciados na busca de replay. Erro/defesa usam uma cor temporária sobre a pose atual.

O teclado usa as teclas brancas C, D, E, F, G, A, B (ações 0, 2, 4, 5, 7, 9, 11), apenas no modo 7K. Outros modos mantêm as animações anteriores. As poses foram geradas como arte temporária: a combinação selecionada pelo código é exata, mas a posição dos dedos na ilustração pode exigir refinamento manual. Ainda é necessário validar aparência e execução na Unity, incluindo quatro jogadores, controles reais e replay.

Poses-comandos.json registra os prompts e a ordem das folhas para reprodução da arte. O sistema não modifica pontuação, julgamentos ou áudio.

Revisão de consistência: Baterista_Comandos_000_015 usa a bateria preta com aros coloridos da folha 016_031. As quatro folhas da baixista e as oito do tecladista foram refeitas com uma referência comum por personagem, corrigindo mãos extras/desconectadas e diferenças de instrumento. As três variações do Roland usam a folha 000_015 como referência para manter os botões retangulares. As versões corrigidas preservam os GUIDs e recortes existentes. Poses-comandos-revisao.json registra os prompts da revisão, gerada com a ferramenta integrada de imagens. Revisão visual das folhas e conferência dos recortes realizadas; validação durante a partida na Unity ainda pendente.
