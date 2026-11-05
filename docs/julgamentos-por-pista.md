# Julgamentos por pista

O julgamento existente agora recebe a coluna visual da nota. Cada coluna possui seus próprios
slots de feedback; uma nota na pista vermelha não substitui o texto da verde. Esta alteração
usa o cálculo de precisão existente e não modifica o Core, as janelas, combo, multiplicadores
ou pontuação. Os milissegundos e as animações anteriores foram mantidos.

## Fluxo e cobertura global

1. `TrackPlayer.OnNoteHit`/`OnNoteMissed` recebe a nota confirmada pelo motor.
2. `GetJudgmentLane` resolve a coluna usando o layout que já posiciona as notas.
3. `TrackView` projeta o centro dessa coluna na linha de acerto com
   `HighwayCameraRendering.GetTrackPositionScreenSpace` (câmera, viewport e deslocamento corretos).
4. `RhythmJudgmentDisplay` converte a posição projetada para coordenadas locais do Canvas
   com `RectTransformUtility.ScreenPointToLocalPointInRectangle`.
5. O pool escolhe um slot exclusivamente naquela coluna. Durante a animação, a posição é
   reprojetada para acompanhar resolução, escala, movimento da highway e range do Pro Keys.

A profundidade padrão é `0`: o mesmo plano da linha de acerto. O deslocamento inicial `(0, 28)`
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
- `Scale`, `Fit To Lane` e `Lane Width Fraction`: tamanho e ajuste à largura projetada da pista.
  O ajuste vem habilitado para evitar que os textos de um acorde se cubram mutuamente.
- `Overlap Distance`: distância entre feedbacks da mesma pista, quando a capacidade é maior que 1.
- Fonte, cores, contorno, durações, escalas de impacto, brilho e flash continuam configuráveis.
- `Preview Lane`: coluna usada pelos comandos de diagnóstico do componente durante a música.

**Nenhuma configuração manual de referências é necessária.** O prefab já recebeu os valores
novos, e `TrackPlayer`/`TrackView` fornecem automaticamente layout e câmera. As janelas
25/60/100 ms e os campos de calibração não foram alterados nesta tarefa.
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
