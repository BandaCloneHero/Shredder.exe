# Chefes de Shredder

Na biblioteca, os três botões no topo escolhem o chefe da próxima música.
A escolha é salva localmente. Gepeto permanece como opção inicial.

## Geminias — O Núcleo Multimodal

Assistente digital de corpo branco com cabeça em forma de estrela de quatro
pontas azul/violeta, rosto expressivo e painéis holográficos de imagem e vídeo.
A segunda forma intensifica o violeta e os circuitos luminosos.

Inferência Paralela e Torrente Multimodal alternam a cada investida. Até cinco
ataques por faixa, aviso de 3,5 segundos, defesa de quatro segundos. Inferência
exige 80% de acertos e sequência de dois; Torrente exige 65% e sequência de
quatro. Falhar acelera visualmente as notas em 30% por seis segundos.

## Cláudio — O Assistente Inflexível

Mascote com cabeça radial terracota, rosto simples e expressivo, corpo creme,
emblema radial no peito, painéis digitais de documentos e caneta de tablet.
A segunda forma intensifica a cor para coral. Sua identidade remete a um
assistente de escrita e raciocínio, sem roupas ou acessórios medievais.

Revisão de Contexto avisa com quatro segundos de antecedência. A defesa dura
seis segundos e exige 80% de acertos e sequência de cinco. Falhar reduz o dano
em 25% por seis segundos e acelera visualmente as notas em 15% por dez segundos.
Até quatro ataques por música.

## Implementação e validação no Editor

Os dois retratos usam folhas PNG RGBA ilustradas em `Assets/Resources/Bosses`.
Cada arquivo tem 1024 × 1536 pixels, com oito colunas e doze linhas: 96 quadros
de 128 × 128 por chefe. `BossSpriteAtlas` recorta as células em execução.
O animador existente controla posicionamento, pulsação musical, pausa e
transformação. Os emblemas também usam quadros dessas folhas. Os sprites
criados em execução são liberados ao sair, preservando a textura compartilhada.
A arte procedural anterior permanece apenas como fallback para arquivo ausente.

A recuperação limitada de vida, o bônus por bloqueio e o cálculo proporcional
às notas usam as regras existentes. Nenhum ataque muda o tempo de acerto.

Verificar no Unity: escolher cada chefe na biblioteca, iniciar uma música,
bloquear e falhar uma defesa, atravessar 50% de vida, pausar durante ataque,
derrotar o chefe e conferir o nome nos resultados. Repetir com Gepeto e com
dois jogadores. Prática e busca de replay mantêm os ataques desativados.

O ambiente de desenvolvimento sem Unity não permite confirmar a composição
visual da biblioteca nem executar o combate; os botões superiores precisam de
uma revisão visual em diferentes resoluções no Editor.

## Retrato dentro do painel com recorte

Quando o retrato está dentro de `BossResponsiveLayout`, esse componente move o
painel na tela e `CalculateWithinDock` posiciona o personagem nas coordenadas
locais do painel. O layout antigo da tela inteira só é usado fora desse painel.
Isso evita deslocar o personagem para fora de `RectMask2D` enquanto a barra e
seu emblema continuam visíveis. A reserva inclui margem de escala e brilho.

Prompts atuais: `image-prompts-v2.json`. Referências visuais:
[Gemini](https://deepmind.google/models/gemini/) e [Claude](https://claude.com/).
