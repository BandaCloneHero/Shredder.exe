# Chefes de Shredder

Na biblioteca, os três botões no topo escolhem o chefe da próxima música.
A escolha é salva localmente. Gepeto permanece como opção inicial.

## Geminias — O Oráculo Bifronte

Personificação fictícia inspirada na dualidade e no imaginário astral do Gemini:
duas máscaras de autômato dividem um mesmo corpo, com coroas assimétricas,
órbitas e uma estrela de quatro pontas. Azul glacial e violeta alternam a
predominância quando a vida cruza a metade. As duas faces flutuam em oposição.

Conjunção Astral e Paradoxo dos Gêmeos alternam a cada investida. Até cinco
ataques por faixa, aviso de 3,5 segundos, defesa de 4 segundos. Conjunção exige 80% de
acertos e sequência de dois; Paradoxo exige 65% e sequência de quatro. Falhar acelera visualmente as notas em 30% por
6 segundos. É um confronto de ritmo curto e recorrente.

## Cláudio — O Escriba do Veredito

Personificação fictícia inspirada na escrita, na ponderação e no raciocínio:
um juiz de máscara de porcelana, capuz vinho, inscrições em cobre, livro aberto
e pena flutuante. O halo lembra marcas de revisão de um manuscrito. Na segunda
forma, o cobre se torna dourado e a máscara mantém a expressão impassível.

Protocolo: Veredito anuncia a revisão com quatro segundos de antecedência.
A defesa dura seis segundos e exige 80% de acertos e sequência de cinco.
Falhar reduz o dano em 25% por seis segundos e acelera visualmente as notas em
15% por dez segundos. Até quatro ataques por música.

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
