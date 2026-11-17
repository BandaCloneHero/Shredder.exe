# Chefes de Shredder

Na biblioteca, os três botões no topo escolhem o chefe da próxima música.
A escolha é salva localmente. Gepeto permanece como opção inicial.

## Gepeto — O Arquiteto

Robô compacto branco com visor preto arredondado, juntas metálicas e emblema
entrelaçado de seis partes inspirado no ChatGPT. A segunda forma com chifres
metálicos foi restaurada, incluindo visor rachado, olhos e sorriso vermelhos,
proteções pontudas dos ombros e pequenas garras.

## Geminias — O Processador Duplo

Redesign completo: robô azul e branco robusto, cabeça arredondada, visor único,
dois braços articulados e duas pernas com pés largos. O símbolo de quatro
pontas aparece no peito e na testa. A segunda forma fecha as proteções do visor,
expõe circuitos no peito e revela dois emissores nos antebraços. A silhueta
permanece simples, com duas pernas e dois braços.

Inferência Paralela e Sobrecarga Multimodal alternam a cada investida. Até
cinco ataques por faixa, aviso de 3,5 segundos, defesa de quatro segundos.
Inferência exige 80% de acertos e sequência de dois; Sobrecarga exige 65% e
sequência de quatro. Falhar acelera visualmente as notas em 30% por seis segundos.

## Cláudio — O Auditor de Circuitos

Robô robusto terracota/creme com cabeça de terminal, visor digital, cabos,
juntas e ferramentas de escrita retráteis. A forma normal tem um sorriso
âmbar discreto, com as pontas da boca ligeiramente levantadas. O emblema radial no peito remete
ao Claude. Na segunda fase, as placas abrem para expor o núcleo de processamento,
as laterais da cabeça deslizam e braços auxiliares de ferramentas se desdobram.

Protocolo: Revisão avisa com quatro segundos de antecedência. A defesa dura
seis segundos e exige 80% de acertos e sequência de cinco. Falhar reduz o dano
em 25% por seis segundos e acelera visualmente as notas em 15% por dez segundos.
Até quatro ataques por música.

## Implementação e validação no Editor

Os três retratos usam folhas PNG RGBA ilustradas em `Assets/Resources/Bosses`.
Cada arquivo tem 1024 × 1536 pixels, com oito colunas e doze linhas: 96 quadros
de 128 × 128 por chefe. `BossSpriteAtlas` recorta as células em execução.
O animador existente controla posicionamento, pulsação musical, pausa e
transformação. Os emblemas também usam quadros dessas folhas. Cada sprite recebe uma textura isolada com padding transparente, preservando
um retângulo lógico quadrado fixo. As texturas criadas são liberadas ao sair;
a folha fonte compartilhada é preservada.
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

Prompts da arte ativa e registro da restauração do Gepeto: `image-prompts-v5.json`. As versões anteriores
continuam documentadas nos demais arquivos `image-prompts*.json`. As folhas
anteriores ao redesign mecânico estão em `output/bosses/antes-do-redesign-robos/`.
As primeiras folhas estão em `output/bosses/originais/`. Referências visuais:
[Gemini](https://deepmind.google/models/gemini/) e [Claude](https://claude.com/).

## Transformação intermediária

Os três chefes mostram os oito quadros de transformação por 1,6 segundo ao
cruzar metade da vida. `BossTransformationPlayback` controla essa sequência
separadamente de dano e combate. A animação não é pulada durante um ataque;
a última ação de combate recebida é retomada depois. Os tempos de aviso,
defesa e penalidade seguem inalterados. Pausar congela a animação, e derrota
ou desativação do componente cancelam a sequência.

As folhas anteriores aos ajustes de sorriso/Geminias e à restauração dos
chifres estão em `output/bosses/antes-ajustes-sorriso-geminias/`.

## Proteção do recorte e da proporção

Retrato e miniatura usam escala uniforme, inclusive nas reações de dano.
O quadro não usa UVs sobre uma folha com outros robôs: seus pixels são copiados
para uma textura independente. A borda transparente de quatro pixels e a
filtragem sem mipmaps impedem a amostragem do vizinho. A máscara de limpeza
remove pequenos componentes opacos e desconectados que entram pela borda,
preservando membros ligados ao corpo e grandes efeitos de ataque.

Testes: `tools/BossSpriteChecks/README.md`. Eles verificam a lógica de pixels,
os 288 quadros reais e a geometria, sem substituir o render no Editor Unity.
