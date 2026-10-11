# Charts YARG diretamente de WAVs

O gerador cria charts experimentais dos quatro instrumentos e quatro dificuldades.
Nenhum MIDI musical é lido para obter notas. `notes.mid` é apenas a saída para o
jogo; `--compare` pode ler um chart anterior **depois** da geração para comparar
estatísticas, nunca para alimentar a transcrição.

## Instalação e comandos

Python 3.12 ou superior para as versões fixadas em `requirements-charts.txt`.
O ambiente testado usou Python 3.14. NumPy, SciPy, Mido e imageio-ffmpeg são as
únicas dependências diretas. imageio-ffmpeg fornece o executável do FFmpeg;
também é possível indicar um FFmpeg instalado com `IMAGEIO_FFMPEG_EXE`.

```bash
python3 -m venv .venv-charts
.venv-charts/bin/python -m pip install -r scripts/requirements-charts.txt
```

Gerar somente a música de teste:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas/charts-wav" \
  --song "Pro Dia Nascer Feliz" --artist "Cazuza" --resume \
  --compare "musicas/Cazuza - Pro Dia Nascer Feliz (Stems e MIDI)"
```

Listar pastas sem processar áudio:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas/charts-wav" --list
```

Processar todas as músicas **somente quando o lote for autorizado**:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas/charts-wav" --resume
```

Reanalisar apenas a bateria, preservando os charts dos outros instrumentos e
criando outra pasta de revisão:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas/charts-wav" \
  --song "Pro Dia Nascer Feliz" --artist "Cazuza" --instrument drums
```

`--instrument` precisa de uma geração concluída deste sistema. MIDIs antigos não
servem de base. Se outro WAV ou o código mudar, faça uma revisão completa. Se o
WAV selecionado mudar, todos os áudios de saída são reexportados, pois o ganho e
o acompanhamento residual são compartilhados; a transcrição dos demais
instrumentos continua preservada. `--resume` ignora músicas concluídas somente
quando fontes, código, parâmetros e hashes dos arquivos de saída conferem.

Rodar testes:

```bash
.venv-charts/bin/python scripts/test_wav_charts.py
```

## Organização dos áudios

Uma pasta por música, com um WAV de cada instrumento. Busca recursiva identifica
as pastas que contêm WAVs. Prefixos reconhecidos: guitar/guitarra, bass/baixo,
drum/drums/bateria, keys/piano/keyboard/teclado. Maiúsculas e a extensão `.WAV`
também são aceitas. Arquivos extras ambíguos causam um erro registrado no lote.
MIDIs presentes são ignorados. Fontes não são modificadas.

Para nomes incomuns, identificação ambígua ou metadados, adicione `song.json` na
pasta de entrada (opcional):

```json
{
  "name": "Minha música",
  "artist": "Artista",
  "stems": {
    "guitar": "guitarra.wav",
    "bass": "baixo.wav",
    "drums": "bateria.wav",
    "keys": "teclado.wav"
  },
  "mix": "musica-completa.mp3"
}
```

Sem mix completo, a reprodução contém somente os quatro instrumentos. Com mix,
o acompanhamento é `mix - soma dos stems`, evitando duplicar os instrumentos.
Isso pressupõe stems extraídos da mesma gravação, com ganhos e origem comuns.
Reconstrução por subtração não corrige separações com fase ou ganho alterados.
WAVs devem compartilhar origem e quantidade de amostras; o programa rejeita
durações diferentes e não desloca/padroniza as pistas silenciosamente.

A pasta de saída deve estar **fora da árvore de entrada**. O processamento é
sequencial, com bibliotecas numéricas limitadas a uma thread por padrão, para
reduzir competição por memória. A análise completa usa centenas de MB e pode
passar de 1 GB em arquivos longos; prioriza precisão e não é streaming DSP.

## Algoritmos e reaproveitamento

- Reutilizados de `create_mp3_test_chart.py`: `flux`, constantes de formato,
  `make_track` (ordem segura de note-offs), validação MIDI e pitches 7K. Os três
  scripts anteriores foram preservados. A estratégia de alinhamento,
  acompanhamento residual e ganho comum de `create_stem_midi_chart.py` foi
  adaptada para o novo fluxo. A separação entre ataques e timbres da revisão de
  guitarra/bateria foi reaproveitada como abordagem, sem suas misturas fixas.
- Guitarra: novidade espectral em janela curta, retrocesso ao início do ataque,
  dicionário de fundamentais e quatro harmônicos concorrentes, ajuste espectral
  não negativo com penalização esparsa, afinação estimada por histogramas de
  picos interpolados e sustentações limitadas pela energia/ataque seguinte.
  Acordes exigem suporte espectral; ataques com altura ambígua ficam marcados.
- Baixo: YIN com diferença calculada por autocorrelação FFT, normalização
  cumulativa, interpolação do período, confiança de periodicidade e filtro de
  estabilidade. Ataques de nova amplitude preservam repalhetadas; mudanças
  estáveis de altura preservam legato. Afinação circular estimada evita notas
  falsas nas fronteiras entre semitons.
- Teclado: alturas concorrentes por ajuste espectral, limiares relativos e
  absolutos, estabilidade temporal, início relacionado a transientes, releases
  individuais e repetições com aumento de ativação. Silêncio e resíduos
  numéricos não são normalizados para virarem notas. Vazamento tonal de outros
  instrumentos ainda pode passar: ausência de teclado audível não pode ser
  certificada por esses filtros em stems com separação ruim.
- Bateria: agrupamento dos espectros de ataques reais de cada gravação,
  classificação por corpo tonal, ruído agudo e decaimento, ajuste não negativo
  competitivo e detecção de nova energia por componente. Exemplares mais
  fracos podem preencher classes ausentes. Classes desconhecidas absorvem
  resíduos sem produzir pads. Corpo/esteira da caixa e pratos de decaimento
  semelhante recebem uma segunda avaliação por batida e avisos de ambiguidade.
  Nenhum índice de componente ou mistura NMF da música anterior é utilizado.
- Ritmo: autocorrelação em faixa ampla, alternativas de meio/dobro do BPM e
  estimativas locais. O tempo do MIDI é um relógio constante; os eventos mantêm
  seus segundos originais, sem quantização forçada. A fase dos beats e o
  compasso 4/4 são aproximados. Não há mapa de compassos ou tempo variável
  confiável; o relatório registra estimativas locais e essa limitação.
- Dificuldades: subconjuntos de ataques, preferência por acentos para
  iniciantes, limites de densidade/acordes/sustentações. Guitarra/baixo usam
  ordem de alturas e repetição de posições, com três botões em Easy, quatro em
  Medium e cinco nas demais. Teclado dobra oitavas e aproxima cromatismos às
  sete teclas brancas. Bateria usa quatro pads + bumbo, no máximo duas mãos e
  um bumbo simultâneos. Tons são representados no pad azul; não há classificação
  confiável entre tom alto/médio/surdo nem marcadores Pro Drums.

A redução para cinco botões e sete teclas perde informação de altura/voicing.
Não representa uma transcrição musical completa nem reproduz cada digitação.
Os níveis de dificuldade da seleção do jogo são placeholders, não ratings
calibrados por jogadores.

## Validação e arquivos de saída

Cada revisão contém:

- `notes.mid`, `song.ini`, quatro OGGs e `song.ogg` residual quando houver mix;
- `analysis.json`: charts em segundos, afinação, alinhamento, beats, testes
  estruturais, cobertura de ataques, sustentações suspeitas e trechos sem notas;
- `guitar.analysis.json`, `bass.analysis.json`, `drums.analysis.json`,
  `keys.analysis.json`: eventos musicais antes da adaptação e diagnósticos;
- `comparison.json` quando `--compare` for usado;
- `complete.json`: assinatura dos parâmetros/fontes/código e hashes de saída;
- `LEIA-ME.txt`: limitações básicas.

As validações verificam pareamento MIDI, tempos, lanes, sobreposições, intervalos
mínimos, número de mãos/acordes, amostras, alinhamento com o mix em três regiões,
reconstrução do acompanhamento e decode completo dos OGGs. Evidências musicais
incluem ataques descobertos sem nota correspondente, áudio silencioso sob notas,
sustentações sobre silêncio, distribuição de botões e direção das alturas.

Essas métricas **não são acurácia musical**: o detector de novidades também é
usado na análise, de modo que cobertura alta pode reproduzir seus próprios
falsos ataques. Densidade menor pode ser rejeição correta de vazamento ou perda
de notas verdadeiras. RMS não prova que a altura de uma sustentação está certa.
Uma diferença entre stems pode se ocultar na soma usada para comparar com o mix.
Os resultados sempre marcam `musical_correctness_certified: false`,
`listening_validation: not run` e `in_game_test: not run` até avaliação externa.

O processo publica a pasta somente depois das verificações estruturais. Avisos
musicais ficam no relatório e não são convertidos em aprovação automática.
Revisões existentes nunca são sobrescritas. A cache guarda análises por hash;
relatórios `batch-report-*.json` guardam sucesso/erros por música e permitem que
uma falha não interrompa as próximas. Uma trava impede dois lotes concorrentes
na mesma saída. Se um processo morrer abruptamente, verifique seu PID antes de
remover `.batch.lock`; a próxima execução pode retomar músicas concluídas.

## Custo e execução local

Nenhuma API, modelo remoto ou chamada ao Codex é feita durante o processamento.
Os custos de execução são CPU, memória, armazenamento e eletricidade locais.
Depois de implementar/configurar, execute diretamente no terminal. Use `--song`
para pilotos, `--resume` para retomar e `--instrument` para ajustes isolados.
Guarde os logs completos em arquivo e traga ao Codex somente relatórios e erros
relevantes. Dependências precisam de download na instalação inicial; a execução
posterior usa as bibliotecas e o FFmpeg locais.

Referências técnicas: [problema de mínimos quadrados não negativos no SciPy](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.nnls.html)
e [documentação de métodos de pitch do aubio](https://aubio.org/doc/latest/pitch_8h_source.html).
O código implementa o ajuste esparso e o YIN diretamente com NumPy/SciPy;
não depende do aubio e não chama `scipy.optimize.nnls` por frame.
