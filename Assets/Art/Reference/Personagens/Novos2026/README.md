# Banda — personagens novos e mãos alinhadas

As referências originais estão em `Assets/Sprites/Personagens/personagens novos/`.
A arte foi produzida pela ferramenta integrada `image_gen__imagegen`; os prompts
estão em `prompts.json`, `prompts-maos.json` e `prompts-bracos-naturais.json` e `prompts-instrumentos-refinados.json` e `prompts-xplorer-bumbo.json` e `prompts-xplorer-cyberpunk-completa.json`. Os retratos originais estão intactos.

| Papel | Referência | Fonte atual |
| --- | --- | --- |
| Guitarrista | Retrato Cyberpunk do Guitarrista Neon.png | Guitarrista_XplorerCyberpunk18.png |
| Baixista | 1000147625.jpg | Baixista_EscalaAlinhada18.png |
| Baterista | Retrato Cyberpunk do Baterista Neon.png | Baterista_Bumbo11.png |
| Tecladista | Tecladista Cyberpunk com Halo Neon.png | Tecladista_Base.png + Tecladista_PosesNaturais20.png + Teclado_Anterior.png |

As folhas de fontes são camadas de montagem. As folhas usadas na partida continuam
na mesma pasta `Assets/Sprites/Personagens/Comandos/`:

| Folha ativa | Dimensão | Grade | Poses |
| --- | --- | --- | --- |
| Roland_Combinacoes64.png | 2048 × 2048 | 8 × 8 | 32 máscaras × 2 palhetadas |
| Baixista_Combinacoes64.png | 2048 × 2048 | 8 × 8 | 32 máscaras × 2 palhetadas |
| Baterista_Combinacoes22.png | 1536 × 1024 | 6 × 4 | 11 padrões × com/sem bumbo |
| Tecladista_Combinacoes_000_063.png | 2048 × 2048 | 8 × 8 | Máscaras 0–63 |
| Tecladista_Combinacoes_064_127.png | 2048 × 2048 | 8 × 8 | Máscaras 64–127 |

São 278 poses, com células de 256 × 256, pivot central e oito pixels de margem
transparente. GUIDs, IDs, recortes e a ordem dos subassets foram preservados.
As calibrações dos sprites substituídos usam escala 1 e deslocamento 0.
Repouso/reação/defesa auxiliares também usam a nova arte, sem mudar seus recortes.

## Guitarra e baixo: mão sobre o botão ou no meio do acorde

Com um botão ativo, a mão acompanha esse botão. Com vários, seu ponto de contato
fica no ponto médio geométrico entre o primeiro e o último botão ativo:

- Verde + laranja: mão sobre o amarelo.
- Verde + vermelho + laranja: também sobre o amarelo, e não no vermelho.
- Verde + vermelho: entre os dois.
- Nenhum botão: mão em repouso.

As fontes atuais trazem 18 poses completas por instrumento: nove posições da mão
(cinco botões e os quatro meios) para cada palhetada. O exportador escolhe a pose
pelo primeiro e último botão ativos. Não há mais separação no cotovelo, cinemática
inversa, cisalhamento ou alongamento dos membros. Ombro, manga, cotovelo, punho e
mão vêm desenhados juntos, com volume. O repouso mantém o instrumento novo e a pegada relaxada, com os botões apagados.
A guitarra atual é uma X-plorer cyberpunk completa: placas claras e grafite,
circuitos magenta, bordas em ciano, captadores luminosos e hardware metálico.
A câmera inclui a cintura abaixo do corpo e margem ao redor de todas as pontas;
o instrumento não termina no corte inferior do retrato. As duas palhetadas vêm
de folhas 3×3 (`Guitarrista_XplorerCyberpunk_Up9.png` e `_Down9.png`), montadas
na fonte 3×6 de 18 poses, sem deformar os membros. A cópia para estabilizar o
rosto do Roland termina acima das mãos e preserva sua silhueta nas notas altas. O baixo mantém o modelo anterior, com novas poses
que acompanham os cinco botões da escala. As coordenadas dos botões são calibradas
no próprio instrumento (`NECK_BOARDS`); não são inferidas das posições das mãos.
A largura, altura e inclinação dos botões acompanham a escala de cada instrumento.
A montagem confere as 18 poses para não sobrepor os dedos. As mãos são compostas
em primeiro plano e preservam seus pixels originais. O manifesto registra centros,
dimensões e o afastamento natural de cada mão. Rostos ficam registrados.

## Bateria: postura frontal, duas baquetas e bumbo

O desenho mantém corpo e instrumento alinhados de frente. Há apenas duas baquetas:
repouso, quatro hits individuais e seis pares, com e sem bumbo. A seleção visual
mantém os dois pads mais recentes dentro da janela de hit; bumbo é independente.
Essa limitação é visual e não descarta notas da entrada/pontuação.

O bumbo é um tambor físico frontal, com casco, aro, pele e pedal, visível em todas
as poses. A pele ilumina em laranja quando acionada. A região copiada para registrar
o rosto foi estreitada para excluir as baquetas erguidas da pose de repouso;
a cópia antiga incluía uma ponta de baqueta e produzia o fragmento flutuante.
Os testes comparam as duas regiões ao lado da cabeça com a pose original para
impedir que o fragmento volte a aparecer.

`Baterista_Combinacoes32.png` é uma versão anterior inativa; o prefab não aponta
para ela. Mesmo que uma cena antiga ainda use uma folha 32, o controlador limita
a máscara visual a dois pads mais bumbo. A folha ativa voltou a ser a de 22 poses.

## Tecladista: braços proporcionais e teclado anterior

O novo rosto/roupa foi mantido. Os braços vêm de 20 poses desenhadas inteiras,
selecionadas sem deformação geométrica; as mangas têm cotovelos e volume. O instrumento reutiliza
os pixels do teclado anterior, extraídos de `Tecladista_Base_Comandos.png` para
`Teclado_Anterior.png`; o formato da carcaça não foi redesenhado. Cada tecla branca tem uma máscara que acompanha sua perspectiva e exclui as teclas
pretas e a carcaça. A coloração usa os próprios pixels da tecla, de trás até a ponta,
conservando luz, sombra e chanfros. Não há mais quadrado luminoso sobreposto.
As teclas ficam claras em repouso e recebem sua cor inteira quando acionadas;
as mãos permanecem à frente da superfície colorida.
As duas mãos continuam agrupadas por alcance/equilíbrio e pousam no ponto médio
entre os extremos de cada grupo. As 128 combinações continuam disponíveis.

## Reconstrução e verificações

```sh
python3 -m pip install -r scripts/requirements-character-art.txt
python3 scripts/export_new_characters.py
python3 scripts/check_new_characters.py
dotnet run --project tools/CharacterCombinationChecks/CharacterCombinationChecks.csproj
```

`--only guitar`, `bass`, `drums` ou `keys` reconstrói somente um instrumento.
Os exportadores PowerShell existentes encaminham para este pipeline.
A montagem usa Pillow sem chamadas de API. `check_new_characters.py` verifica
as luzes dos 278 quadros, referências/importação, margens, rosto estável,
contornos e margem da guitarra na própria fonte (antes do padding do atlas),
ausência do antigo código de deformação, contato dos dedos renderizados, ausência
de sobreposição dos botões nas mãos, cor em toda a tecla sem vazamento e
preservação da carcaça do teclado. Os testes C# compilam os métodos reais da
bateria com doubles de Sprite/Texture2D e verificam o limite de duas baquetas
contra todas as 32 entradas possíveis.

Backups e prévias ficam na pasta de saída já existente `output/personagens-novos/`.
O manifesto registra as máscaras e posições das mãos. Ainda é necessário conferir
no Unity: comandos simples/acordes, duas palhetadas, sustains, pads/bumbo,
7K, bots, pausa/replay e quatro jogadores.
