# Otimização da gameplay — primeira etapa

## Contexto e limites

O usuário relatou travadas durante a música no executável, num PC com i7 de 13ª geração,
16 GB de RAM e GPU ainda desconhecida, incluindo um congelamento que exigiu reinício.
Esta entrega corrige desperdícios identificados no código. Não houve execução da Unity,
medição de FPS/GPU/VRAM nem reprodução desse congelamento neste ambiente. Não foi determinada
a causa do travamento do computador inteiro, e não é possível prometer que ele foi eliminado.

## Alterações aplicadas

| Local | Antes | Agora |
| --- | --- | --- |
| `TrackPlayer.BossEventCount` | Percorria todas as notas sempre que o boss consultava o total, a cada frame | Reutiliza `TotalNotes`, calculado na inicialização/reinício/seleção do trecho de prática |
| `JudgmentLanePool.HasActiveLane` | Procurava pela reserva inteira | Consulta um contador por coluna, sem percorrer slots |
| `JudgmentLanePool.Acquire` | Percorria slots de todas as colunas | Percorre somente a reserva da coluna solicitada |
| Animação do julgamento | Percorria todos os objetos reservados, inclusive imagens inativas | Lista compacta contém apenas os slots ativos; remoção não deixa buracos |
| Posição dos julgamentos | Cada atualização de uma coluna reposicionava todas as imagens, além de novas passagens por frame | Atualiza o cache de cada coluna e anima/posiciona cada imagem ativa uma vez em `LateUpdate`; novas imagens ainda recebem atualização imediata |
| Projeção do HUD | Calculava a borda direita da coluna mesmo com ajuste de largura desativado | Projeta a borda somente quando `Fit To Lane` está habilitado |
| Recursos do cenário/highway | Ao recriar, liberava buffers, mas deixava objetos antigos de RenderTexture sem destruição explícita | Libera handles/buffers e destrói os objetos substituídos usando `CoreUtils.Destroy`, compatível com execução e Editor |
| Cenário sem `Venue Output` | Podia recriar a textura de trails a cada frame e repetir buscas da UI | Aguarda a saída existir sem criar texturas; busca no máximo uma vez a cada 0,5 segundo |

O caminho de renderização do cenário também verifica a dimensão efetiva de suas texturas,
incluindo alterações de `renderScale`. A limpeza é compartilhada por recriação, destruição
e descarregamento da cena. A câmera e a imagem deixam de apontar para os recursos liberados
nos caminhos de encerramento. Na highway, as texturas de saída e máscara também são destruídas
quando substituídas e ao desativar o renderizador.

`RenderTexture.Release` libera os buffers, mas o objeto Unity ainda precisa de destruição.
A correção evita objetos órfãos e recriações desnecessárias; não mede nem prova um vazamento
específico de VRAM no PC do usuário.

## Comportamento preservado

- Uma imagem por nota/coluna, com sobreposição livre e sem reiniciar imagens antigas.
- Pool expansível, sem limite novo de feedbacks nem destruição por acerto.
- Arte, tamanho, brilho, impacto, subida, opacidade e durações existentes.
- Pausa preserva a idade da animação; `Show` continua preparando a imagem no próprio evento.
- Tempo de entrada, calibração, janelas em ms, pontuação, combo, sustains e dano não foram alterados.
- Resolução, formatos de textura, antialiasing, limites de FPS e qualidade visual configurados
  pelo jogador não foram reduzidos para mascarar o problema.

## Arquivos

Modificados:

- `Assets/Script/Gameplay/Player/TrackPlayer.cs`
- `Assets/Script/Gameplay/HUD/TrackView.cs`
- `Assets/Script/Gameplay/Judgments/JudgmentLanePool.cs`
- `Assets/Script/Gameplay/Judgments/RhythmJudgmentDisplay.cs`
- `Assets/Script/Gameplay/VenueCameraRenderer.cs`
- `Assets/Script/Gameplay/Visuals/HighwayCameraRendering.cs`
- `tools/JudgmentChecks/Program.cs`

Criados:

- `tools/JudgmentChecks/OptimizationChecks.cs`
- `tools/JudgmentChecks/RenderTextureLifetimeChecks.cs`
- Este documento.

## Verificações realmente executadas

Comando: `dotnet run --project tools/JudgmentChecks/JudgmentChecks.csproj --no-restore`.

Resultado: **6.565 verificações aprovadas**, incluindo a suíte anterior de motores reais,
FPS de entrada, pesos de score, acordes, sustains, replays, imagens e referências dos prefabs.

Os testes novos cobrem operações aleatórias de aquisição/duplicação/liberação/limpeza do pool,
contadores por coluna, slots trocados durante expiração e reutilização após uma reserva de 512
imagens. Com uma única imagem ativa após esse pico, a iteração passa por uma imagem, em vez de
percorrer a reserva inteira. O teste de alocação gerenciada existente também continua passando.

Para recursos gráficos, o harness extrai os métodos reais de criação/limpeza/busca do cenário
e os executa com substitutos que contam objetos e handles. Em 1.000 chamadas sem UI não há
criação de texturas; 200 recriações mantêm somente dois objetos e um handle ativos; a limpeza
repetida chega a zero. Isso verifica o código de propriedade/limpeza, **não o driver nem a GPU**.
Os scripts modificados também passaram pela análise de sintaxe C# 9 e `git diff --check`.
Não houve compilação completa do projeto Unity ou teste visual nesta etapa.

## Validação no executável

1. Gerar uma nova build a partir destas alterações. Um executável já gerado não muda com `git pull`.
2. Comparar a mesma música, quantidade de jogadores, resolução e configurações gráficas entre
   a build anterior e a nova; anotar o limite de FPS e o estado do VSync.
3. Ativar o contador de FPS existente e observar os trechos de maior densidade, acordes,
   ataques do boss e sobreposição de julgamentos. Conferir também pontuação e tela final.
4. Jogar várias músicas, repetir uma música e voltar ao menu. Acompanhar RAM e memória da GPU
   no Gerenciador de Tarefas para procurar crescimento contínuo, distinguindo do carregamento inicial.
5. Testar mudança de resolução, pausa/retomada, prática e reentrada na gameplay.
6. Em uma Development Build, conectar o Unity Profiler para medir CPU, GC Alloc, UI/Canvas,
   renderização e memória durante o trecho que trava. Comparar também uma build normal.

## Logs para investigar o congelamento

O projeto já registra CPU, RAM, GPU, VRAM e versão do driver no início de cada log
(`Assets/Script/Persistent/Logging/LogHandler.cs`). Com o Company/Product atuais do projeto
(`YARC`/`YARG`) e sem override de diretório, os logs Windows ficam em:

- Executável normal: `%USERPROFILE%\AppData\LocalLow\YARC\YARG\release\logs`
- Test Build/Editor: `%USERPROFILE%\AppData\LocalLow\YARC\YARG\dev\logs`
- Nightly: `%USERPROFILE%\AppData\LocalLow\YARC\YARG\nightly\logs`

Guardar o log da sessão que apresentou o problema e a hora aproximada do congelamento.
Um encerramento forçado pode deixar o final incompleto. O log e a medição no PC do evento
são necessários para distinguir gargalos restantes de CPU/GPU/memória e problemas externos.

## Segunda etapa — áudio visual, materiais e previews

Esta etapa preserva as funcionalidades existentes e acrescenta:

- `TextureManager`: o worker de FFT opera apenas em arrays gerenciados previamente alocados.
  As duas leituras do mixer acontecem no thread principal, antes do processamento. Assim,
  um trabalho pendente não consulta handles de áudio após o descarregamento da cena.
  O upload da textura também permanece no thread principal, e cada UniTask é consumida uma vez.
- Foi removido o armazenamento assíncrono do `NativeArray` retornado por `GetPixelData`,
  incluindo seu `Dispose`. Essa API retorna uma visão direta do buffer da textura, que pode
  se invalidar após atualizações; consulte a [documentação oficial da Unity](https://docs.unity.com/en-us/engine/6000.0/script-reference/unityengine/texture2d/getpixeldata).
  Agora a tarefa preenche um buffer próprio de 1.024 bytes, reutilizado. A cópia de 1 KB no
  upload é uma escolha de segurança; seu custo e o das leituras de áudio no main thread
  ainda precisam ser medidos no Unity Profiler.
- Durante a pausa, o visualizador não inicia novos trabalhos nem uploads. No encerramento,
  ele impede novo processamento e libera sua textura de vídeo, espectro e capa carregada.
  Capas padrão e ícones compartilhados permanecem intactos. O worker termina antes da
  limpeza final do espectro e da capa; ele não depende de objetos Unity para calcular os pixels.
- Uma textura de vídeo já criada é liberada antes de aumentar suas dimensões, mantendo a mesma
  referência para os consumidores e recriando o buffer quando necessário.
- `TrackMaterial`: materiais privados criados por `Renderer.material` e texturas customizadas
  são destruídos ao encerrar a highway. Recarregar o tema libera as texturas anteriores;
  falhas de carregamento também liberam temporários e restauram as texturas padrão compartilhadas.
- `JudgmentImpactGraphic`: a forma do anel e dos quatro raios é compartilhada entre instâncias.
  As reconstruções do mesh mantêm dimensões, cores e transparência, sem repetir seno/cosseno.
  Permanecem os mesmos 144 vértices e 72 triângulos. A trigonometria ocorre somente na criação
  da geometria compartilhada, em vez de 288 chamadas em cada reconstrução.
- `CameraPreviewTexture`: previews na mesma resolução reutilizam a textura compartilhada.
  Redimensionar destrói a textura substituída; fechar a última câmera libera a textura runtime.

Não foram alterados os julgamentos atuais (PERFEITO 32/30 ms), scores, dano, combo,
sustains, música, assets de personagens, resolução, antialiasing ou limite de FPS.
Nenhuma configuração manual adicional é necessária.

### Verificações da segunda etapa

`dotnet run --project tools/JudgmentChecks/JudgmentChecks.csproj --no-restore`:
**6.632 verificações aprovadas**, incluindo as anteriores.

- O `TextureManager` completo é compilado no harness contra substitutos de áudio, textura e
  agendamento. O retorno de limpeza `UniTaskVoid` é adaptado para `Task` apenas no harness.
  O teste verifica thread de acesso, tarefa única, pausa, pixels de FFT/waveform, resize de vídeo,
  término de trabalho após o mixer ser marcado como encerrado, limpeza e assets compartilhados.
- A implementação real do impacto foi compilada contra substitutos de UI. Os vértices foram
  comparados à fórmula anterior em três dimensões, junto de topologia, cor e ausência de
  nova trigonometria em 100 reconstruções.
- Métodos reais de carregamento/limpeza da highway foram exercitados com recursos contados:
  20 recargas mantêm somente três materiais privados e duas texturas customizadas; falhas
  retornam aos assets padrão; encerrar libera os objetos próprios.
- O preview completo foi compilado com substitutos: 100 atualizações na mesma resolução
  não criam novas texturas; resize mantém uma textura; a última câmera libera o recurso.
- Sintaxe C# 9 dos arquivos modificados e `git diff --check` passaram.

Esses substitutos não executam a GPU, o mixer BASS nem o runtime UniTask/Unity reais. Ainda
não houve compilação completa no Editor, medição de FPS/VRAM ou reprodução do congelamento.

### Preparação para a feira

Validar primeiro no Play, incluindo música com cenário reativo, vídeo, pausa, mudança de tema,
previews e saída durante a música. Depois gerar e testar o executável no PC da feira, com a
mesma resolução, quantidade de jogadores, músicas e dispositivos que serão usados no evento.
Fazer uma sessão de pelo menos uma hora, passando por várias músicas e voltando ao menu,
registrando FPS, RAM, GPU e os logs. Esse tempo é uma sugestão de validação, não garantia.

Manter uma cópia da última build validada e dos dados necessários para executar as músicas
no computador do evento. Alterações de última hora precisam de novo teste. Se o computador
inteiro voltar a congelar, guardar o horário e os logs para continuar a investigação;
as alterações de código não provam que a causa externa ou interna foi eliminada.

Arquivos desta etapa: `TextureManager.cs`, `TrackMaterial.cs`, `JudgmentImpactGraphic.cs`,
`CameraPreviewTexture.cs` e `tools/JudgmentChecks/Program.cs`. Testes novos:
`TextureManagerLifetimeChecks.cs` e `UiResourceOptimizationChecks.cs`.
