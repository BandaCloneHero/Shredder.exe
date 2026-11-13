# Julgamentos cyberpunk — segunda edição

As artes ativas usam acabamento metálico chanfrado, faces luminosas, reflexos ciano/magenta,
pequenos circuitos e uma linha de pulso musical integrada à base da palavra.
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

A animação existente continua sendo usada. Bisel, reflexos e linha de pulso estão desenhados
nos próprios PNGs; nenhum shader, material ou pós-processamento adicional foi criado.
O limite de importação continua em 1024 pixels, sem mipmaps, com leitura CPU desativada.
Não foram modificados posição, tamanho configurado, pooling, precisão ou pontuação.

## Versões anteriores

- `Originais/`: as quatro imagens originais fornecidas pelo usuário.
- `Cyberpunk-v1/`: a primeira versão cyberpunk e seu briefing.

Essas pastas ficam fora de `Assets` e não adicionam texturas ao executável Unity.

## Geração e prompts

Foi usada a ferramenta integrada `image_gen.imagegen`, em modo de edição com fundo
transparente, uma chamada por julgamento. A primeira edição serviu como alvo; PERFEITO!
foi redesenhado primeiro e usado como referência de estilo dos outros três.

Os quatro prompts exatos estão em [cyberpunk-v2-prompts.json](cyberpunk-v2-prompts.json).
A direção comum é tipografia industrial angular e condensada, inclinação moderada, faces
limpas e legíveis em 220px, contorno de titânio/gunmetal, reflexos especulares, detalhes
magenta, circuitos discretos e pulso musical ciano/magenta. Um único texto por imagem,
sem números, milissegundos, placas opacas ou elementos de cenário.

## Verificações desta edição

- Inspeção visual das quatro palavras, incluindo o acento de ÓTIMO! e dois Rs de ERROU!.
- PNG RGBA 8 bits, 2172 × 724 pixels, com transparência real nas quatro imagens.
- Decodificação do alpha: fundo com pixels totalmente transparentes, letras opacas e
  conteúdo visível dentro das bordas, incluindo contorno e linha de pulso.
- Comparação byte a byte entre fonte e cópia em `Resources`.
- Hash dos `.meta` conferido antes/depois: nenhuma alteração de importação ou GUID.

Não houve execução do Play da Unity nesta edição. Conferir leitura sobre a highway,
sequências rápidas e imagens menores na tela de resultados. Nenhuma nova suíte de código
foi criada para esta alteração exclusivamente visual.
