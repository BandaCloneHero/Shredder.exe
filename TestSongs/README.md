# Teclado ProKeys 7K

Música: **ProKeys 7K - Teste de 30 segundos**.
Áudio original de teste gerado por síntese, sem músicas de terceiros.
Contém `song.ini`, `notes.mid` e `song.wav`, com 30 segundos e 49 notas
em todas as quatro dificuldades. O MIDI tem tempo 120 BPM, resolução 480 PPQ,
eventos de seção e pistas `PART REAL_KEYS_E/M/H/X`.

Na Unity, a pasta TestSongs é incluída na busca de músicas do projeto.
Recarregue a biblioteca/execute uma busca completa e selecione **Pro Keys**.
Em um executável, adicione a pasta TestSongs nas pastas de músicas e faça a busca.
O teclado usa os modelos, shaders, geometria e animações existentes do YARG.

## Sete posições fixas

| Posição | Tecla branca | Índice ProKeys | Nota do MIDI do chart | Ação | PC padrão | Cor |
|---|---|---:|---:|---|---|---|
| 1 | Dó | 0 | 48 | Key1 | Z | Verde |
| 2 | Ré | 2 | 50 | Key3 | X | Vermelho |
| 3 | Mi | 4 | 52 | Key5 | C | Amarelo |
| 4 | Fá | 5 | 53 | Key6 | V | Azul |
| 5 | Sol | 7 | 55 | Key8 | B | Laranja |
| 6 | Lá | 9 | 57 | Key10 | N | Ciano |
| 7 | Si | 11 | 59 | Key12 | M | Violeta |

Bindings já personalizados permanecem válidos: configure essas ações no perfil
para os sete botões físicos desejados. No modo 7K aparecem apenas as sete brancas
de dó a si e as cinco pretas entre elas. Teclas de outras oitavas ficam ocultas.
As pretas são decorativas; seus comandos não causam erros.
Notas, sustentações e destaque de tecla usam a mesma cor da posição, inclusive
durante star power. As faixas agrupadas são substituídas por cores individuais.
Não foram adicionados números ou etiquetas aos modelos para preservar a estética.

## Compatibilidade e limites

O modo 7K é ativado somente quando a dificuldade inteira contém exclusivamente
os sete índices acima, incluindo todas as notas dos acordes. A janela do teclado
fica na primeira oitava, sem mudanças de região. Charts com outras notas usam
o ProKeys completo, com as cores e mudanças de região originais. Não há conversão
automática de charts externos nem alteração das notas/pontuação do chart.
Os 25 índices internos do ProKeys são preservados, com as teclas extras ocultas.
Os modelos, tamanhos e espaçamento das sete brancas e cinco pretas permanecem
os do YARG; não há mudanças de geometria nem de enquadramento da highway.

Os controles e a engine continuam sendo os de ProKeys; isto não cria um novo
instrumento no seletor. A opção `_enableSevenWhiteKeys` no ProKeysVisual permite
desativar a adaptação. A paleta está em SevenKeyProKeysLayout.cs.
Nos replays, entradas já gravadas não são filtradas novamente.

## Trechos da música

- 0–2 s: contagem de entrada.
- 2–9 s: notas individuais, subindo e descendo pelas sete teclas.
- 10–18 s: acordes de duas teclas.
- 18–22 s: sequência de notas.
- 22–28 s: sustentações em pares.
- 28,5 s: acorde final; fim do áudio aos 30 s.

Gerador reproduzível: tmp/prokeys7/create-test-song.ps1.
Os arquivos foram preparados por código. Falta validar compilação, enquadramento,
cores, biblioteca e execução dentro da Unity/jogo e depois no teclado físico.
