# Julgamentos cyberpunk — segunda edição

As artes ativas usam acabamento metálico chanfrado, faces luminosas, reflexos ciano/magenta
e pequenos circuitos nas letras. A linha de pulso/onda abaixo das palavras foi removida a pedido do usuário.
O objetivo é uma identidade própria de HUD para o Shredder.exe, com leitura rápida.

| Arquivo | Texto exato | Cor dominante |
| --- | --- | --- |
| `perfeito.png` | PERFEITO! | Ciano elétrico |
| `otimo.png` | ÓTIMO! | Verde neon |
| `bom.png` | BOM! | Amarelo elétrico/âmbar |
| `errou.png` | ERROU! | Vermelho |

## Integração

Os quatro arquivos desta pasta são as fontes atualizadas. Cópias byte a byte ficam em
`Assets/Resources/Julgamentos/{perfeito,otimo,bom,errou}.png`, usadas tanto pela gameplay
quanto pelos contadores da tela final. Os arquivos `.meta`, GUIDs e configurações de importação
foram preservados. Não é necessário arrastar referências na Unity.

A animação existente continua sendo usada. Bisel e reflexos estão desenhados
nos próprios PNGs; nenhum shader, material ou pós-processamento adicional foi criado.
O limite de importação continua em 1024 pixels, sem mipmaps, com leitura CPU desativada.
Não foram modificados posição, tamanho configurado, pooling, precisão ou pontuação.

## Versões anteriores

- `Originais/`: as quatro imagens originais fornecidas pelo usuário.
- `Cyberpunk-v1/`: a primeira versão cyberpunk e seu briefing.
- `Cyberpunk-v2-com-pulso/`: a segunda edição antes da remoção da onda.

Essas pastas ficam fora de `Assets` e não adicionam texturas ao executável Unity.

## Geração e prompts

Foi usada a ferramenta integrada `image_gen.imagegen`, em modo de edição com fundo
transparente, uma chamada por julgamento. A primeira edição serviu como alvo; PERFEITO!
foi redesenhado primeiro e usado como referência de estilo dos outros três.

Os prompts da criação estão em [cyberpunk-v2-prompts.json](cyberpunk-v2-prompts.json).
A edição final foi feita com a ferramenta integrada image_gen, usando os quatro prompts
exatos em [sem-onda-prompts.json](sem-onda-prompts.json): remover somente a onda e a linha
inferior, preservar tipografia, acabamento, cores, dimensões e transparência.
A direção comum é tipografia industrial angular e condensada, inclinação moderada, faces
limpas e legíveis em 220px, contorno de titânio/gunmetal, reflexos especulares, detalhes
magenta e circuitos discretos. A versão ativa não tem onda ou ornamento inferior. Um único texto por imagem,
sem números, milissegundos, placas opacas ou elementos de cenário.

## Verificações desta edição

- Inspeção visual das quatro palavras, incluindo o acento de ÓTIMO! e dois Rs de ERROU!.
- PNG RGBA 8 bits, 2172 × 724 pixels, com transparência real nas quatro imagens.
- Decodificação do alpha: fundo com pixels totalmente transparentes, letras opacas e
  conteúdo visível dentro das bordas, incluindo contorno das letras.
- Comparação byte a byte entre fonte e cópia em `Resources`.
- Hash dos `.meta` conferido antes/depois: nenhuma alteração de importação ou GUID.

Não houve execução do Play da Unity nesta edição. Conferir leitura sobre a highway,
sequências rápidas e imagens menores na tela de resultados. Nenhuma nova suíte de código
foi criada para esta alteração exclusivamente visual.

## Sincronização com a build (13/11/2026)

O menu **Shredder → Atualizar imagens de julgamento** copia estas quatro artes para
Resources e força a reimportação das texturas, preservando os arquivos .meta e os GUIDs.
A mesma sincronização ocorre automaticamente antes de gerar uma build, por
`Assets/Editor/JudgmentArtworkSync.cs`. Os PNGs da fonte e de Resources já estavam
idênticos nesta revisão; uma build antiga não muda ao atualizar arquivos do site.
É necessário abrir o projeto Unity e executar o Play ou gerar um novo executável.
