# Bon Jovi — Livin’ on a Prayer (teste MP3)

Charts automáticos experimentais para guitarra, baixo, bateria e Pro Keys 7K,
cada um com Easy, Medium, Hard e Expert. A geração cobre o MP3 fornecido,
com cerca de **4 minutos e 10 segundos**. Andamento estimado: **122,73 BPM**.

## Como testar

1. Adicione esta pasta às pastas de músicas do Shredder.
2. Faça uma busca completa e procure **Livin' on a Prayer (teste MP3)**.
3. Escolha o instrumento e a dificuldade. Para teclado, selecione **Pro Keys**.

O teclado usa somente MIDI 48, 50, 52, 53, 55, 57 e 59, correspondentes às sete
teclas brancas do projeto. Controles padrão: **Z X C V B N M**; bindings
personalizados continuam valendo.

## Arquivos

- `notes.mid`: os 16 charts, mapa de tempo e eventos de seção.
- `song.ogg`: mixagem estéreo completa, convertida do MP3 sem recorte.
- `song.ini`: nome, artista, duração e configuração dos instrumentos.
- `album.png`: capa extraída do MP3 fornecido.
- `analysis.json`: análise, contagens e verificações dos arquivos.

O MP3 original foi preservado. A análise estima ataques e alturas a partir do
áudio mixado; não é uma transcrição fiel de cada instrumento. O teclado foi
adaptado para sete teclas, e as sustentações são aproximações para jogabilidade.
Não existem stems isolados para silenciar um instrumento quando o jogador erra.

| Instrumento | Fácil | Médio | Difícil | Expert |
|---|---:|---:|---:|---:|
| Guitarra | 406 | 523 | 1077 | 1331 |
| Baixo | 341 | 479 | 891 | 961 |
| Bateria | 839 | 1215 | 2434 | 2581 |
| Pro Keys 7K | 412 | 900 | 1451 | 2219 |

Contagens de notas individuais; acordes contam várias notas.
A integridade do MIDI, os limites de duração, as quatro dificuldades por
instrumento, as sete teclas brancas e a decodificação completa do áudio foram
verificados. Ainda falta conferir sincronização percebida, carregamento e
jogabilidade na Unity ou no executável do Shredder.

Gerador: `scripts/create_mp3_test_chart.py` na raiz do projeto.
Dependências Python: `numpy`, `scipy`, `mido`, `imageio-ffmpeg`.
