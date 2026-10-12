# Jump — teste a partir de MP3

Áudio fornecido: `Van Halen - Jump (Official Music Video)_SwYN7mTi6HM.mp3`.
O arquivo contém **87 segundos**, e o chart cobre somente esse trecho.
O MP3 original foi preservado. `song.ogg` contém a mixagem estéreo completa.

## Como testar

1. Adicione esta pasta nas pastas de músicas do Shredder.
2. Faça uma busca completa na biblioteca.
3. Procure **Jump (teste MP3)**, artista **Van Halen**.
4. Selecione guitarra, baixo, bateria ou **Pro Keys**, e a dificuldade desejada.

Os quatro instrumentos têm Easy, Medium, Hard e Expert. O teclado usa as sete
teclas brancas fixas, com MIDI 48, 50, 52, 53, 55, 57 e 59. Os controles padrão
do projeto são **Z X C V B N M**, salvo personalizações do perfil.
Para tocar o teclado, selecione **Pro Keys**, não o teclado de cinco botões.

## O que foi gerado

Charts automáticos experimentais: ataques detectados em diferentes faixas
do espectro, altura aproximada para guitarra/baixo/teclado e ataques graves,
médios e agudos para bateria. As dificuldades inferiores têm menos ataques e
acordes. O andamento estimado é **130,73 BPM**; os tempos das notas mantêm os
ataques detectados, sem forçá-los a uma grade fixa.

O áudio mixado não permite identificar cada instrumento com precisão. Algumas
notas podem seguir outro instrumento, e a adaptação do teclado para sete teclas
não é uma transcrição fiel das alturas originais. Não há pistas de áudio isoladas
para silenciar um instrumento ao errar. As sustentações são aproximações para
jogabilidade. Este resultado serve para testar a geração e ajustar no jogo.

| Instrumento | Fácil | Médio | Difícil | Expert |
|---|---:|---:|---:|---:|
| Guitarra | 137 | 184 | 435 | 552 |
| Baixo | 109 | 177 | 326 | 360 |
| Bateria | 270 | 395 | 870 | 925 |
| Teclado Pro Keys 7K | 137 | 329 | 472 | 733 |

Os valores são notas individuais: um acorde pode contar mais de uma nota.
`analysis.json` registra a análise, o hash do MP3 e as verificações.
Ainda falta testar carregamento, sincronização percebida e jogabilidade na Unity
ou no executável do Shredder.

## Reproduzir a geração

Gerador: `scripts/create_mp3_test_chart.py`, na raiz do projeto.
Dependências Python: `numpy`, `scipy`, `mido` e `imageio-ffmpeg`.
Escolha uma pasta de saída nova; o script preserva pastas já existentes.

```bash
python3 scripts/create_mp3_test_chart.py \
  'musicas/Van Halen - Jump (Official Music Video)_SwYN7mTi6HM.mp3' \
  'musicas/Jump - outro teste' --name Jump --artist 'Van Halen'
```
