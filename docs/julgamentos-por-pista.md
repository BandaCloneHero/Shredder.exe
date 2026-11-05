# Julgamentos por pista

**Apresentação atual:** os julgamentos usam as quatro imagens fornecidas em
`Images/Julgamentos`, importadas como texturas UI em `Assets/Resources/Julgamentos` e ligadas ao
prefab `TrackView`. Não há texto gerado nem valor/sufixo de milissegundos na tela.
Os PNG originais foram preservados byte a byte, incluindo suas cores e transparência.
O cálculo interno da precisão continua inalterado.

O julgamento existente agora recebe a coluna visual da nota. Cada coluna possui seus próprios
slots de feedback; uma nota na pista vermelha não substitui o texto da verde. Esta alteração
usa o cálculo de precisão existente e não modifica o Core, as janelas, combo, multiplicadores
ou pontuação. As animações foram mantidas; os milissegundos continuam disponíveis internamente para o julgamento,
mas não são desenhados no HUD.

## Fluxo e cobertura global

1. `TrackPlayer.OnNoteHit`/`OnNoteMissed` recebe a nota confirmada pelo motor.
2. `GetJudgmentLane` resolve a coluna usando o layout que já posiciona as notas.
3. `TrackView` projeta o centro dessa coluna na linha de acerto com
   `HighwayCameraRendering.GetTrackPositionScreenSpace` (câmera, viewport e deslocamento corretos).
4. `RhythmJudgmentDisplay` converte a posição projetada para coordenadas locais do Canvas
   com `RectTransformUtility.ScreenPointToLocalPointInRectangle`.
5. O pool escolhe um slot exclusivamente naquela coluna. Durante a animação, a posição é
   reprojetada para acompanhar resolução, escala, movimento da highway e range do Pro Keys.

A profundidade padrão é `0`: o mesmo plano da linha de acerto. O deslocamento inicial `(0, 54)`
faz o texto aparecer um pouco acima dela, em unidades locais do Canvas. Não há coordenadas
absolutas por resolução nem escolha aleatória de posições.

| Instrumento disponível | Referência reutilizada |
| --- | --- |
| Guitarra e baixo de 5 trastes, incluindo All Taps | `GetLanePosition`, tabela de ordem dos trastes e modo canhoto |
| Teclas de 5/6 pistas | `IsNormalNote`, `_highwayOrdering` e configuração da pista open |
| Pro Keys, incluindo o layout de sete teclas brancas | `note.Key` e `GetNoteX`, o mesmo X usado na renderização de cada tecla, incluindo range shift |
| Bateria de 4/5 pistas e Pro Drums | `GetHighwayOrderingInfo`, incluindo ordem personalizada, pratos separados, modo canhoto e pista dedicada de pedal duplo |

Open, wildcard e pedal sem coluna dedicada usam a região larga onde essas notas realmente
são desenhadas. Somente essas notas naturalmente largas ficam no meio da própria highway;
notas de colunas normais continuam nas suas posições individuais.

A integração é compartilhada por todos os `TrackPlayer` existentes. O contrato de layout é
abstrato: um futuro instrumento com highway precisa implementar a coluna e sua posição;
não herda silenciosamente um fallback que centraliza todos os textos.

Vocais usam afinação e não possuem essas colunas ou o julgamento temporal de quatro faixas;
seu fluxo existente foi preservado. Guitarra de 6 trastes e Pro Guitar não possuem jogador/prefab
ativo nesta versão da cena Gameplay; não foram anunciados como instrumentos implementados.

## Acordes e sustains

Guitarra confirma um acorde inteiro em um evento. O HUD percorre `note.AllNotes` e distribui
esse resultado real pelas colunas, sem invocar o motor novamente. As partes desse acorde
compartilham o mesmo desvio porque o motor fornece um instante único para o acorde.
Não são inventados timestamps individuais.

Teclas e bateria já podem emitir callbacks por parte; cada nota mantém seu desvio real e seu
slot, permitindo PERFEITO! numa coluna e ÓTIMO! em outra no mesmo instante visual.
A deduplicação considera a identidade da nota e sua coluna, não `ParentOrSelf` globalmente.

Notas perdidas mostram ERROU! em suas colunas. Entradas inválidas com uma pista identificável
usam os trastes/teclas/pads informados pela lógica existente do instrumento. Uma palhetada
inválida sem trastes usa a região de open. A regra que decide acerto/erro permanece no motor.
Sustains só geram feedback nos eventos já existentes, sem texto a cada frame de sustentação.

## Pool e configuração

O pool é construído depois que o jogador termina de montar seu layout. Tem capacidade
independente por pista, sem criação/destruição de objetos durante sequências de notas.
No limite, recicla o feedback mais antigo da mesma pista; as outras pistas não são afetadas.
O empilhamento, quando habilitado, também é calculado somente dentro da mesma pista.

No componente `RhythmJudgmentDisplay` do prefab `TrackView`:

- `Maximum Feedbacks`: agora é o limite **por pista**, inicialmente **1**. Aumentar permite
  sobreposição controlada dentro de cada coluna; custa mais elementos pré-alocados.
- `Highway Depth` e `Position Offset`: profundidade e deslocamento relativos à linha de acerto.
- `Image Size`: área inicial **220 × 96**, preservando a proporção da imagem. `Scale` ajusta o tamanho global.
- `Fit To Lane` vem **desativado**, para que a imagem não seja reduzida à largura de uma coluna.
  Se ativado, `Lane Width Fraction` controla o limite relativo às pistas (inicialmente 2).
  Imagens maiores podem se sobrepor em acordes densos; cada uma continua presa à própria coluna.
- `Overlap Distance`: distância entre feedbacks da mesma pista, quando a capacidade é maior que 1.
- As quatro referências de sprite, cores dos efeitos, durações, escalas de impacto, brilho e flash
  continuam configuráveis. Gradientes e contornos principais vêm dos próprios PNGs.
- `Preview Lane`: coluna usada pelos comandos de diagnóstico do componente durante a música.

**Nenhuma configuração manual de referências é necessária.** O prefab já recebeu os valores
novos, e `TrackPlayer`/`TrackView` fornecem automaticamente layout e câmera. As janelas atuais são 25/60/180 ms; a ampliação do limite BOM! foi autorizada posteriormente
pelo usuário. Os campos de calibração continuam preservados.
Não há nova revisão ou novo patch de Core exigido por esta alteração visual.

## Arquivos desta alteração

Criados:

- `Assets/Script/Gameplay/Judgments/JudgmentLanePool.cs` e seu `.meta`.
- `tools/JudgmentChecks/LaneMappingChecks.cs`.
- Este documento.

Modificados:

- `Assets/Script/Gameplay/Judgments/RhythmJudgmentDisplay.cs`: slots/posição independentes por pista.
- `Assets/Script/Gameplay/HUD/TrackView.cs`: ligação com o layout e projeção de cada coluna.
- `Assets/Script/Gameplay/Player/TrackPlayer.cs`: contrato global de layout e distribuição visual dos acordes.
- `FiveFretGuitarPlayer.cs`, `FiveLaneKeysPlayer.cs`, `ProKeysPlayer.cs` e `DrumsPlayer.cs`
  na mesma pasta: mapeamento para a coluna já existente no instrumento.
- `Assets/Prefabs/Gameplay/HUD/TrackView.prefab`: profundidade na linha, capacidade por pista e ajuste de largura.
- `tools/JudgmentChecks/JudgmentChecks.csproj` e `Program.cs`: testes do código real do pool e dos layouts.
- `docs/julgamento-de-notas.md`: atualização da descrição do posicionamento.

## Verificação

Executado:

- **100 verificações** no harness: classificação preservada, configuração real dos prefabs,
  sintaxe C# 9, cinco colunas simultâneas, deduplicação local, substituição local, ordenação
  das sobreposições, liberação/reset e ausência de alocações no pool em 10 mil operações.
- Os testes de layout extraem e compilam os métodos reais dos quatro jogadores, fornecendo
  apenas suas dependências de cena (tabelas de ordem e X das teclas). Cobrem modo canhoto,
  acorde em três pistas, open dedicado, pratos separados, pedal duplo e range shift.
  Não copiam as fórmulas de produção para uma implementação de teste.
- Regressão do Core: 438 aprovados, 2 ignorados, nenhuma falha.
- `git diff --check`; nenhuma alteração no `YARG.Core` ou no arquivo das janelas de precisão.

```sh
dotnet run --project tools/JudgmentChecks/JudgmentChecks.csproj
dotnet test YARG.Core/YARG.Core.UnitTests/YARG.Core.UnitTests.csproj
```

Esses testes não substituem a compilação/renderização da Unity. O harness usa um shim mínimo
para atributos/Mathf e dependências simuladas dos layouts. O Editor não está disponível neste
ambiente, portanto a posição final, leitura e desempenho visual ainda precisam ser conferidos ali.

No Editor, testar:

1. Guitarra All Taps: verde, vermelho e última pista alternadamente; cada texto na sua coluna.
2. Acorde de três trastes: três feedbacks simultâneos nas pistas envolvidas, um único acerto lógico.
3. Teclas/Pro Keys com partes ligeiramente separadas: cada coluna com seus milissegundos reais.
4. Sequência rápida na mesma pista enquanto outra exibe texto: apenas a primeira recicla seu slot.
5. Sustain, perda de nota, entrada inválida, pausa, reinício e prática: sem repetições por frame
   nem efeitos antigos reaparecendo; confira o combo e a pontuação existentes.
6. Bateria: pads/pratos e pedal duplo dedicado; customização da ordem e modo canhoto.
7. Pro Keys: layout de sete brancas e charts completos com mudança de range.
8. Redimensionar janela, trocar resolução, mover/escalar a highway e usar várias highways:
   os textos devem continuar associados às suas pistas. Ajustar tamanho/offset pelo Inspector
   conforme a composição desejada e conferir o Profiler na máquina alvo.


## Troca dos textos pelas imagens fornecidas

Nesta atualização foram modificados `RhythmJudgmentDisplay.cs`, `TrackView.prefab`,
`tools/JudgmentChecks/Program.cs` e estes documentos. Foram adicionadas as quatro cópias PNG
em `Assets/Resources/Julgamentos`, seus `.meta` de textura RGBA/UI e o `.meta` da pasta.
Não é necessário ligar referências manualmente na Unity.

Cada classificação seleciona sua própria imagem sem tintura sobre a arte:
`perfeito.png`, `otimo.png`, `bom.png`, `errou.png`. As cores dos flashes acompanham os arquivos:
PERFEITO! ciano, ÓTIMO! verde, BOM! amarelo e ERROU! vermelho.
As fases de crescimento, estabilização e fade, o pool por coluna e a integração global
nos instrumentos com highway continuam funcionando pelo mesmo caminho.
A apresentação agora cria dois componentes `RawImage` por slot (principal e brilho), sem TMP,
sem materiais privados de fonte e sem o elemento que desenhava os milissegundos.

Conferência adicional: identidade binária dos quatro PNG, canal RGBA, importação Sprite/UI,
referências de textura por GUID no prefab, preservação de proporção/cor e ausência de texto de precisão.
A importação limita a textura a 1024 px, sem mipmaps, sem leitura de CPU e com alpha preservado;
os arquivos fonte completos continuam intactos no repositório.

Referência localizada: [RoBeats — Dark Sheep, All Perfect](https://www.youtube.com/watch?v=m26MNhHFF8E).
A busca localizou o vídeo, mas sua reprodução foi bloqueada pelo YouTube neste ambiente.
A miniatura acessível era do resultado final; não foi tratada como verificação da animação.
O comportamento implementado segue a posição por coluna solicitada e as imagens do usuário,
sem alegar uma comparação quadro a quadro com o vídeo.

No Editor, confira os quatro resultados, a ausência de números/ms, acordes, sequências rápidas,
redimensionamento e o tamanho desejado na máquina alvo. Aumente `Image Size`/`Scale` se quiser
mais destaque. A execução visual da Unity ainda não foi possível neste ambiente.


Resultado desta atualização de imagens: **119 verificações aprovadas** no harness,
mais a conferência do alpha transparente dos quatro PNGs e `git diff --check` sem erros.
Os jogadores, `RhythmJudgmentSettings` e o submódulo `YARG.Core` não receberam alterações.


## Correção de imagens ausentes e janela mais tolerante

Após o relato de desaparecimento sem erros no Console, a apresentação passou de Sprite/Image
para **Texture2D/RawImage**. As imagens foram movidas, com seus GUIDs preservados, para
`Assets/Resources/Julgamentos`. O prefab aponta para o asset principal da textura (fileID 2800000),
e a inicialização também procura cada textura pelo caminho em Resources quando uma referência
serializada estiver ausente. Isso elimina a dependência de IDs de subassets Sprite.
São quatro texturas RGBA32, com alpha, limite de 1024 px, sem mipmaps nem leitura de CPU.
As imagens grandes, suas cores originais, o pool por coluna e a ausência de ms na tela permanecem.

Foi encontrada uma falha concreta no tempo de vida visual: `Update` somava o delta inteiro
do frame, mesmo quando o julgamento tinha acabado de ser criado naquele frame. Um delta
maior que a duração da animação podia encerrar o feedback antes de sua primeira renderização.
`JudgmentFeedbackClock` agora ignora esse delta inicial. O feedback novo sempre sobrevive
ao frame de criação; sua idade avança a partir dos frames seguintes. Este relógio é apenas
visual e não participa do julgamento musical. A causa exata do desaparecimento no Editor
do usuário não foi reproduzida aqui; não se afirma que era exclusivamente esse problema.

A pedido do usuário, **BOM! foi ampliado de ±100 para ±180 ms**, simetricamente. PERFEITO!
continua até ±25 ms e ÓTIMO! até ±60 ms. Um toque correto a -150 ms é registrado pelo motor
como acerto e classificado BOM!, mesmo antes de a nota chegar à linha. Os novos valores estão
no `RhythmJudgmentSettings` e nos quatro prefabs de jogador; nenhuma alteração adicional do
submódulo Core é necessária. Replays preservam os parâmetros gravados e as regras de instrumento
continuam valendo (traste/pad incorreto não vira acerto apenas por estar na janela).

Arquivos desta correção:

- `RhythmJudgmentDisplay.cs` e `TrackView.prefab`: texturas diretas e fallback de carregamento.
- `JudgmentFeedbackClock.cs` e `.meta`: proteção contra sumiço no frame de criação.
- `RhythmJudgmentSettings.cs`: limite inicial de BOM! em 180 ms.
- Prefabs `FiveFretGuitarVisual`, `FiveLaneKeysVisual`, `ProKeysVisual`, `FourLaneDrumsVisual`: 25/60/180.
- Quatro PNG e metadados realocados de Art/UI para Resources/Julgamentos, preservando a arte.
- Harness: `EarlyHitChecks.cs`, `Program.cs` e projeto de testes.

Verificado: **1254 verificações aprovadas**, incluindo 224 cenários dos motores reais com as
configurações da aplicação: guitarra e baixo All Taps, teclas de cinco pistas, Pro Keys, bateria 4/5 e Pro Drums,
em 30/60/120/144 FPS, com entradas de ±120, ±150, ±170 e ±180 ms. Cada cenário toca três notas
(incluindo após a primeira), confere timestamps, classificação BOM! e combo. Também foi testada
a criação de uma animação num frame de 2,5 segundos, que mantém idade zero nesse frame,
a reutilização rápida do slot e os limites de classificação. As imagens continuam idênticas
aos arquivos fornecidos pelo usuário.

Não há confirmação de renderização no Editor neste ambiente. No próximo teste, reinicie a
música (o motor captura a janela na inicialização) e confira as imagens, entradas antecipadas,
acordes, pausa/retomada e uma sequência rápida. O Console deve registrar janela efetiva de
-180 a +180 ms e HUD inicializado=True. Nenhuma ligação manual de referências é exigida.
