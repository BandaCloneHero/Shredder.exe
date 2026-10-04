# Roland: folha única e botões por comando

Imagem usada na partida: Assets/Sprites/Personagens/Comandos/Roland_Combinacoes64.png. Uma folha de 2048 × 2048, com 8 colunas × 8 linhas e 64 recortes de 256 × 256. A mão da palhetada fica sobre o corpo da guitarra e alterna entre cima/baixo; rosto, instrumento e braço mantêm o mesmo enquadramento.

Os cinco botões estão sempre desenhados, com cores escuras, na ordem verde, vermelho, amarelo, azul, laranja, do corpo para a ponta da guitarra. As luzes já estão gravadas nos pixels de cada sprite. As 32 combinações dos botões são repetidas nas duas posições de palhetada, totalizando 64 quadros. A mão do braço da guitarra acompanha a mediana dos botões pressionados: com um botão, vai até ele; com quantidade ímpar, ao botão central; com quantidade par, ao ponto entre os dois centrais. Sem botões, usa a pose de repouso aprovada. O overlay GuitarButtonLights é desativado nessa configuração de 64 sprites.

As nove posições (cinco botões e quatro intervalos) estão em RolandMediana. As mãos/antebraços foram editados com a ferramenta integrada de imagens; os prompts estão em Roland-mediana.json. O exportador aplica somente a região da mão/antebraço à base aprovada, mantendo os demais pixels, e recompõe a superfície dos cinco botões para que continuem visíveis mesmo sob os dedos. As duas poses da palhetada são preservadas.

O componente ReactionController do TrackView referencia os 64 sprites na ordem binária: índice = máscara dos botões + 32 quando há palhetada. Bits 0 a 4 representam verde, vermelho, amarelo, azul e laranja. Índice 0: tudo apagado, mão cima. Índice 31: tudo aceso, mão cima. Índice 32: tudo apagado, mão baixo. Índice 63: tudo aceso, mão baixo. A leitura da folha é da esquerda para a direita, de cima para baixo. As quatro folhas anteriores estão em Assets/Art/Reference/Personagens/RolandAnterior.

A base aprovada de duas poses está em Assets/Art/Reference/Personagens/Roland_Palhetada_Base.png. Para reconstruir a folha, execute tools/art/export-roland-64.ps1 em PowerShell, a partir da raiz do projeto. O exportador calcula a mediana, escolhe a mão correspondente e aplica o desenho de luzes. O GUID e a ordem dos recortes são preservados ao reconstruir.

Arte gerada e corrigida com a ferramenta integrada de imagens; prompts em Roland-folha-unica.json. Recortes, referências e posições das luzes conferidos nos arquivos. A compilação e a exibição durante a partida ainda precisam de validação na Unity.
