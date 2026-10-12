# Pro Dia Nascer Feliz — revisão de guitarra e bateria

A guitarra e a bateria foram refeitas após o teste no jogo revelar uma guitarra
quase vazia e golpes de caixa convertidos em bumbo + dois pads.

## Carregar a revisão

Esta pasta contém o `notes.mid` revisado. Faça uma **busca completa** no Shredder
para atualizar o cache e selecione **Pro Dia Nascer Feliz (stems e MIDI)**.
São quatro instrumentos e quatro dificuldades. Para teclado, use **Pro Keys**;
o modo 7K mantém Z X C V B N M, salvo bindings personalizados.

## Mudanças

- Guitarra: ataques detectados no WAV separado, incluindo as palhetadas e
  mudanças harmônicas que o MIDI Basic Pitch havia omitido. No Expert,
  passou de **50 para 507 ataques**, com 809 notas individuais.
  As cores seguem formas harmônicas detectadas, com mapeamento estável;
  acordes e sustentações continuam sendo adaptações para jogabilidade.
- Bateria: substituída a classificação por três faixas de frequência por
  uma decomposição espectral com referências de timbre desta gravação.
  O corpo e a esteira de um golpe de caixa são tratados como um instrumento,
  e o clique do bumbo não gera automaticamente uma nota de tom.
  Resíduos agudos logo após a caixa não viram automaticamente um novo prato.
- O baixo, o teclado, o mapa de tempo e os eventos anteriores foram mantidos.
- As cinco pistas de áudio permanecem separadas e alinhadas. `song.ogg`
  contém só o acompanhamento restante, sem duplicar a mixagem completa.

| Instrumento | Fácil | Médio | Difícil | Expert |
|---|---:|---:|---:|---:|
| Guitarra | 191 | 284 | 646 | 809 |
| Baixo | 338 | 443 | 760 | 828 |
| Bateria | 825 | 985 | 1188 | 1195 |
| Pro Keys 7K | 294 | 493 | 750 | 854 |

A tabela conta notas individuais; acordes contam várias notas.
A bateria continua no formato **4 pads + pedal de bumbo**, sem modo 5 lanes.
Não se preenchem os pads apenas para distribuir cores: foram reconhecidos
poucos ataques de tom azul com confiança neste método (um no Expert).

## Verificações e limites

A proporção de ataques com três notas simultâneas no Expert caiu de **64,5% para
0%**, sem uma regra global que proíba golpes simultâneos. Os ataques de caixa
em 0,51 s, 2,11 s e 3,74 s e o bumbo em 0,90 s foram usados como referências
acústicas e conferidos na revisão: cada um resulta em uma nota do instrumento
correspondente, sem as notas adicionais do método anterior.

O MIDI foi relido e verificado quanto a tempos, pares de eventos e notas
sobrepostas. O áudio dura cerca de **4min27s**. A versão anterior foi guardada
em `notes.before-refinement.mid`, com seu relatório em
`analysis.before-refinement.json`.

Essas verificações não equivalem a uma avaliação musical completa. A bateria
é uma classificação aproximada de timbres, calibrada para esta gravação, e
pode omitir golpes ou classificar algum prato incorretamente. A guitarra
não é uma transcrição manual das posições no braço. Ainda falta avaliar
esta revisão tocando e ouvindo no Shredder. A versão anterior havia sido
validada apenas como arquivo de jogo; isso não verificava sua qualidade musical.

`analysis.json` registra a revisão. `drum-timbre-analysis.npz` contém os
perfis e ativações de timbre usados para inspeção técnica.
O ganho comum aplicado ao áudio é cerca de 0,4674; ajuste o volume no jogo
se necessário. Os originais em `audios separados` permanecem intactos.

## Reproduzir

Dependências Python: numpy, scipy, mido e imageio-ffmpeg.
Use o gerador inicial numa pasta de saída nova e aplique a revisão:

```bash
python3 scripts/create_stem_midi_chart.py \
  'musicas/audios separados/Pro Dia Nascer Feliz' \
  'musicas/Pro Dia Nascer Feliz - outra revisao' --artist Cazuza
OPENBLAS_NUM_THREADS=1 python3 scripts/refine_stem_charts.py \
  'musicas/audios separados/Pro Dia Nascer Feliz' \
  'musicas/Pro Dia Nascer Feliz - outra revisao'
```

As referências de timbre do segundo script são específicas desta música.
Para outra gravação, é necessário rever a decomposição e a calibração.
