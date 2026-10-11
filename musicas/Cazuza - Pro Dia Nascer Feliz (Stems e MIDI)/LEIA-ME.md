# Pro Dia Nascer Feliz — stems e MIDI

Charts para guitarra, baixo, bateria e teclado Pro Keys 7K, nas quatro
dificuldades. Duração: **4min27s**. Os arquivos originais foram preservados.

## Usar no Shredder

Adicione esta pasta às pastas de músicas e faça uma busca completa.
Selecione **Pro Dia Nascer Feliz (stems e MIDI)**, artista **Cazuza**
(nome usado no arquivo fornecido). Para teclado, selecione **Pro Keys**.
O modo 7K usa MIDI 48, 50, 52, 53, 55, 57 e 59, e os bindings padrão
**Z X C V B N M**, salvo personalizações do perfil.

## Origem das notas

Guitarra, baixo e teclado foram adaptados dos arquivos fornecidos
`guitar_basic_pitch_transcription.mid`, `bass_basic_pitch_transcription.mid`
e `keys_basic_pitch_transcription.mid`. A leitura respeita o mapa de tempo
original. Notas são agrupadas em acordes com tolerância de 35 ms, reduzidas
conforme a dificuldade e mapeadas para os botões do jogo. O teclado tem suas
alturas e oitavas adaptadas às sete teclas brancas. Sustentações que colidem
na mesma tecla são encurtadas até o próximo ataque.

O `drum_basic_pitch_transcription.mid` contém alturas musicais, sem identificar
bumbo, caixa ou pratos. Por isso, a bateria foi gerada a partir de ataques
em faixas graves, médias e agudas do WAV **da bateria separado**. Essa
classificação é aproximada, e não corresponde a uma bateria transcrita à mão.

O MIDI original de guitarra contém **54 notas** em toda a música; o chart
continua esparso porque usa essa transcrição, sem inventar notas para preenchê-la.
MIDIs automáticos e stems de separação automática ainda podem conter erros
ou vazamentos. Eles reduzem a interferência da mixagem, mas não garantem
uma transcrição perfeita.

| Instrumento | Fácil | Médio | Difícil | Expert |
|---|---:|---:|---:|---:|
| Guitarra | 45 | 47 | 51 | 53 |
| Baixo | 338 | 443 | 760 | 828 |
| Bateria | 640 | 1486 | 2651 | 2956 |
| Pro Keys 7K | 294 | 493 | 750 | 854 |

Contagens de notas individuais: acordes contam várias notas.

## Áudio e verificações

- `guitar.ogg`, `bass.ogg`, `drums.ogg`, `keys.ogg`: instrumentos separados.
- `song.ogg`: voz e acompanhamento restante, calculado pela subtração dos
  quatro stems da mixagem original. **Não é a música completa duplicada**.
- `notes.mid`: pistas e quatro dificuldades em formato compatível com o jogo.
- `song.ini`: metadados e opções dos instrumentos.
- `analysis.json`: origens, hashes, contagens e verificações.

Todos os arquivos de entrada têm **11782656 amostras
estéreo a 44,1 kHz**, com diferença de alinhamento detectada de zero. Antes da
compressão, os quatro stems mais o acompanhamento recompõem a mixagem
original, com erro máximo de 1.2e-07.

Um ganho comum de **0.4674** foi aplicado às cinco pistas
para evitar clipping nos stems; as proporções de volume foram preservadas.
Isso pode deixar a reprodução mais baixa que o MP3 original.
As pistas OGG foram decodificadas integralmente; suas durações diferem
em no máximo uma amostra (menos de 0,023 ms).
O MIDI foi relido e verificado, sem notas sobrepostas na mesma tecla ou
notas sem término. Andamento estimado do WAV da bateria: **146.67 BPM**;
converter o tempo do arquivo preserva os instantes das notas em segundos.

Ainda falta testar carregamento, sincronização percebida e jogabilidade
na Unity ou no executável do Shredder.

Gerador: `scripts/create_stem_midi_chart.py` na raiz do projeto.
Dependências: `numpy`, `scipy`, `mido`, `imageio-ffmpeg`.

```bash
python3 scripts/create_stem_midi_chart.py \
  'musicas/audios separados/Pro Dia Nascer Feliz' \
  'musicas/Pro Dia Nascer Feliz - outro teste' --artist Cazuza
```

Escolha uma pasta de saída nova para preservar os charts já existentes.
