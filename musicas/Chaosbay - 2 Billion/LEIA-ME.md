# Chaosbay — 2 Billion

Conversão do pacote `../2Billion1x_rb3con` para uma pasta com `song.ini`,
`notes.mid`, capa `album.png` e áudio OGG estéreo por instrumento.
Chart original de **BS_to_RB**, preservado sem alterar notas ou tempos.
Álbum: **2222** (2022). Duração: aproximadamente **3 min 51 s**.

## Usar no Shredder

Nas configurações de músicas, adicione **esta pasta** à lista de pastas da
biblioteca e execute uma busca completa. Procure por **2 Billion — Chaosbay**.
Essa pasta não é adicionada automaticamente pelo projeto.

O chart inclui guitarra, baixo, bateria, vocais, harmonias, teclado de cinco
teclas e Pro Keys. Os instrumentos com dificuldades têm Easy, Medium, Hard e
Expert. O Pro Keys original inclui teclas pretas e mudanças de região;
portanto, usa o modo completo, sem adaptação automática para sete teclas brancas.

## Arquivos e validação

- `notes.mid`: cópia byte a byte do MIDI existente no pacote.
- `drums.ogg`, `bass.ogg`, `guitar.ogg`, `vocals.ogg`, `keys.ogg`:
  pares de canais 0–9 conforme `songs.dta`.
- `song.ogg`: acompanhamento, canais 10–11; não é a mixagem completa.
  O jogo toca esses seis arquivos em conjunto.
- Áudio convertido para Vorbis qualidade 7, a 44,1 kHz, com timestamps
  contínuos calculados a partir das amostras e sem recortar a introdução.
- `original-songs.dta`: metadados originais para referência.
- `conversion-report.json`: integridade do MIDI, contagens de notas,
  duração e validação da decodificação de cada pista.

O arquivo CON original foi mantido. A extração foi conferida com os hashes SHA-1
dos 5.694 blocos de dados do pacote. A capa também foi convertida e inspecionada.
Ainda falta testar o carregamento e a reprodução dentro da Unity/Shredder.

Referências técnicas usadas:
[extrator STFS](https://github.com/ryzendew/XBLA-Extract/blob/main/stfs_extract.py),
[leitor de pastas do YARG.Core](https://github.com/YARC-Official/YARG.Core/blob/master/YARG.Core/Song/Entries/Ini/SongEntry.IniBase.cs)
e [metadados Rock Band](https://github.com/YARC-Official/YARG.Core/blob/master/YARG.Core/Song/Entries/RBCON/SongEntry.RBCON.cs).
