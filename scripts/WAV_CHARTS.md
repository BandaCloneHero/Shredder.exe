## Perfil realista de dificuldade única

O padrão agora é `--playability-profile realistic`: conserva o conjunto mais
completo de ataques detectados nos WAVs, sem o espaçamento ou a simplificação
para iniciantes. Publica apenas Medium, usado como opção de seleção no YARG.
Guitarra mantém cinco botões e até três notas por acorde; baixo é monofônico;
Pro Keys mantém sete teclas brancas e até quatro teclas simultâneas.
Bateria mantém quatro pads e bumbo, com no máximo duas batidas simultâneas
contando o bumbo. Combinações excedentes priorizam bumbo e caixa e são relatadas.

O perfil desativa preenchimento artificial de teclado e pulsos de groove
padronizados. A recuperação de transientes de pratos e a classificação adaptativa
da caixa continuam apoiadas no WAV. Não há garantia de transcrever todas as
notas audíveis: os limites e incertezas do detector constam em `analysis.json`.
As validações musicais usam limites deste perfil, independentemente do nome do
nível MIDI. Áudio original e versões anteriores continuam preservados.

Exemplo para uma das duas músicas disponíveis com stems:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --song Exagerado --playability-profile realistic --resume
```

Os perfis `easy` e `easy-medium` permanecem opcionais. As músicas disponíveis
apenas em MP3 não são regeneradas como se houvesse WAVs individuais.

# Charts YARG diretamente de WAVs

O gerador cria charts experimentais dos quatro instrumentos. O padrão agora é
uma dificuldade única **Medium (Médio)** no perfil realista, sem redução para iniciantes.
Cada origem tem uma única pasta principal em `OUTPUT/Artista - Música`.
`--output` é a pasta jogável e usa `musicas` por padrão. Cadastre `musicas` no YARG.
Cache, índice, relatórios e revisões ficam em `chart-backups/musicas-state`, fora
da biblioteca. Para outro OUTPUT, o estado fica em `OUTPUT.parent/chart-backups/OUTPUT.name-state`.
`--state-dir` permite escolher outro diretório externo para esse estado.
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

Para “Exagerado”, gerar apenas Easy (Fácil) com o perfil entre Easy e Medium com os quatro pads na ordem
chimbal, caixa, tom e crash (bumbo separado):

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas" --song "Exagerado" \
  --artist "Cazuza" --playability-profile easy --drum-order hihat,snare,tom,crash --resume
```

As preferências ficam em `analysis.json`. Ao retomar sem essas opções, o
gerador mantém a dificuldade e a ordem de pads existentes. Os WAVs e o cache
permanecem como fontes de análise; o MIDI musical intermediário não é utilizado.

Exemplo com a configuração de quatro dificuldades:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas" \
  --song "Pro Dia Nascer Feliz" --artist "Cazuza" --playability-profile standard --difficulty all --resume \
  --compare "chart-backups/Pro Dia Nascer Feliz/Cazuza - Pro Dia Nascer Feliz (Stems e MIDI)"
```

Listar pastas sem processar áudio:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas" --list
```

Processar todas as músicas **somente quando o lote for autorizado**:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas" --resume
```

Reanalisar apenas a bateria, preservando os charts dos outros instrumentos e
arquivando a revisão anterior fora da biblioteca principal:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas" \
  --song "Pro Dia Nascer Feliz" --artist "Cazuza" --instrument drums
```

`--instrument` precisa de uma geração concluída deste sistema. MIDIs antigos não
servem de base. Se outro WAV ou o código mudar, faça uma revisão completa. Se o
WAV selecionado mudar, todos os áudios de saída são reexportados, pois o ganho e
o acompanhamento residual são compartilhados; a transcrição dos demais
instrumentos continua preservada. `--resume` ignora músicas concluídas somente
quando fontes, código, parâmetros e hashes dos arquivos de saída conferem.

Organizar um chart já gerado pelo sistema antigo, sem transcrever ou converter áudio:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas" \
  --song "Pro Dia Nascer Feliz" --organize-existing --resume
```

Esse modo copia a versão válida mais recente para a pasta de músicas e mantém todas as
pastas antigas intactas. Repeti-lo retorna `already_organized`. Uma retomada
normal também pode adotar o resultado antigo quando ainda não existe pasta
principal. As fontes precisam coincidir com o chart; o modo de organização não
reprocessa áudios alterados. O artista omitido é herdado do chart existente,
evitando uma revisão causada apenas pelo antigo fallback `Unknown`.

## Organização, identidade e revisões

```text
musicas/                         ← biblioteca jogável
  Cazuza - Pro Dia Nascer Feliz/
  Bon Jovi - Livin on a Prayer (Teste MP3)/
  Van Halen - Jump (Teste MP3)/
  Chaosbay - 2 Billion/
  audios separados/              ← fontes WAV, não mover entre execuções
chart-backups/                   ← fora da biblioteca
  musicas-state/
    .analysis-cache/
    library-index.json
    batch-report-*.json
    backups/                     ← revisões futuras
  source-mp3/                    ← MP3s de entrada arquivados
  Pro Dia Nascer Feliz/          ← versões antigas preservadas
  batch-reports/                 ← relatórios antigos preservados
```

A identidade interna usa o caminho absoluto da pasta de origem completo,
independentemente de título, artista, WAV, código ou data. Origens diferentes
com nomes iguais recebem pastas diferentes; um sufixo curto é usado apenas em
colisão de nomes, com verificação da identidade completa no índice. Use o
caminho em `--song` para selecionar entre subpastas homônimas. Mover/copiar uma
pasta de origem cria outra identidade; não mova as entradas entre execuções
esperando que sejam automaticamente reconhecidas como a mesma origem.

O nome da pasta principal permanece estável para aquela origem. Uma revisão é
preparada e validada fora da pasta de músicas. Depois, a pasta principal anterior é
renomeada para `backups/<música-identidade>/<data-identificador>` antes de ativar
a nova no mesmo caminho principal. Nenhum arquivo do chart anterior é
sobrescrito. Falha ao ativar a nova pasta restaura a anterior. A trava de lote
impede publicação concorrente. O relatório da execução registra `previous_backup`.

Mudanças só na organização/CLI/logs não invalidam o cache musical. Mudanças nos
algoritmos, política de charts, decodificação ou exportação continuam exigindo
revisão. A compatibilidade com o último chart legado é verificada por uma
assinatura exata da análise, sem aceitar charts apenas pelo nome da música.

Rodar testes:

```bash
.venv-charts/bin/python scripts/test_wav_charts.py
.venv-charts/bin/python scripts/test_chart_library.py
.venv-charts/bin/python scripts/test_chart_playability.py
.venv-charts/bin/python scripts/test_chart_difficulty_profile.py
```

## Perfil leve opcional entre Easy e Medium

O perfil opcional `easy` coloca as notas em **Easy (Fácil)**. Os outros três níveis
não recebem notas jogáveis. O perfil opcional `easy-medium` continua disponível
para publicar a mesma política leve em Medium.

- Bateria: no máximo duas batidas simultâneas **incluindo bumbo**; prioriza
  bumbo/caixa, reduz ornamentos e viradas rápidas; ataques separados por
  aproximadamente 280–380 ms, sem deslocar para uma grade nova.
- Guitarra/baixo: uma nota por vez, quatro botões e sustentações menores.
- Teclado: uma tecla por vez, sete teclas brancas e sem sustentações sobrepostas.
- Áudio e sincronização da versão anterior preservados; anteriores em backups.

O perfil leve pode ser escolhido com `--playability-profile easy`.
Para usar a política antiga, indique `--playability-profile standard` e escolha
`--difficulty Expert`, `Medium`, `Easy`, `Hard` ou `all`.

Charts existentes que não vieram do gerador WAV podem ser simplificados lendo
somente o **MIDI final de jogo**, sem transcrição musical intermediária:

```bash
.venv-charts/bin/python scripts/revise_chart_difficulty.py \
  --song "Van Halen - Jump (Teste MP3)"
```

O script preserva áudios, mapa de tempo, vocais e eventos de palco, arquiva a
pasta anterior fora de `musicas` e reutiliza a revisão ao repetir o comando.
Charts gerenciados por `complete.json` devem passar pelo gerador WAV.

## Gravação original, acompanhamento e groove

Para as duas músicas do Cazuza, gerar o perfil atual com áudio original e acompanhamento:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas" --song "Exagerado" \
  --playability-profile easy --drum-order hihat,snare,tom,crash \
  --original-audio --keys-accompaniment --drum-groove --resume
```

Troque `Exagerado` por `Pro Dia Nascer Feliz` para a outra música. Esses comandos
selecionam uma música; não disparam o lote completo. Retomadas herdam as opções.
`--no-original-audio`, `--no-keys-accompaniment` e `--no-drum-groove` desativam
as adaptações explicitamente numa revisão.

O MP3 original deve ficar na mesma pasta dos quatro WAVs. `song.json` pode
escolher `mix` quando houver vários candidatos. O jogo usa somente `song.ogg`,
convertido da gravação completa. Os stems não são exportados nesse modo e não
há reprodução duplicada. A correlação entre a soma dos stems e a gravação
original verifica um deslocamento comum em três regiões; diferenças pequenas
de duração/atraso do MP3 são compensadas. Gravações diferentes e deriva de
sincronização são recusadas. O sistema não comprova atrasos individuais de stems.

O teclado recebe acompanhamento em pausas de pelo menos quatro segundos,
baseado no pulso, nos ataques e nas alturas de guitarra/baixo. Essas notas são
uma adaptação de jogabilidade autorizada, não transcrição de piano audível.
Notas/sustentações detectadas são mantidas e o silêncio da gravação completa
não recebe notas extras. `keyboard_accompaniment` lista cada adição.

A bateria recupera transientes de alta frequência e usa a fase da caixa
aprendida na gravação para resolver alguns tons com ruído de caixa. Também acrescenta pulsos regulares de chimbal em trechos com bumbo/caixa
periódicos e energia de pratos, evitando silêncio e viradas densas de tons.
Esses pulsos são adaptações de jogabilidade, separados dos ataques detectados
em `standard_groove_hat_pulses`. O restante das batidas e viradas é preservado.
`groove_refinement` registra cada adição/reclassificação. O cache de detecções
brutas tem assinatura própria e é reaproveitado quando só essas adaptações mudam. Timbres ambíguos ainda
precisam de revisão por escuta e no jogo.

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
Revisões existentes são arquivadas, nunca sobrescritas. A cache guarda análises por hash;
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
