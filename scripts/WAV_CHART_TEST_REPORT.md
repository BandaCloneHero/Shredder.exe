# Teste do gerador WAV → YARG

Foi implementado o sistema e testada **uma música real**, Pro Dia Nascer Feliz, de 267,180408 segundos. O lote de 73 músicas não foi iniciado. Revisões intermediárias ficaram preservadas para rastrear as correções.

Chart final desta etapa: `musicas/charts-wav/Pro Dia Nascer Feliz-60189351-db3a5dd045`. Relatórios detalhados: `analysis.json`, `comparison.json`, os quatro `*.analysis.json` e `musicas/charts-wav/test-validation.json`.

## Arquivos e preservação

Criados: `scripts/generate_charts_batch.py`, `scripts/wav_chart_analysis.py`, `scripts/test_wav_charts.py`, `scripts/requirements-charts.txt`, `scripts/WAV_CHARTS.md`, este relatório e a árvore `musicas/charts-wav/`. Nenhum dos três scripts anteriores, chart anterior, arquivo do jogo ou servidor foi modificado. `respota.txt` já havia sido alterado na solicitação anterior e não foi alterado nesta implementação.

Todos os hashes das fontes registrados no relatório anterior continuam iguais, inclusive os MIDIs existentes. Eles foram ignorados para detecção de notas. O chart anterior foi lido apenas para comparação após gerar o novo chart.

SHA-256 do `notes.mid` anterior preservado: `25499f7fc53e5c2b0d702993d68869a27081a7a8c77c4635af622db01d317c9c`.

## Algoritmos

Guitarra: ataques espectrais, estimação de afinação, alturas/acordes por competição entre dicionários harmônicos, sustentações por energia e limites de jogo. Baixo: YIN por FFT, estabilidade de altura, repalhetadas com renovação de amplitude, afinação e releases. Teclado: alturas concorrentes, histerese temporal, duração individual, cromatismos aproximados às sete teclas brancas e limites de teclas sustentadas. Bateria: espectros de ataques aprendidos por gravação, agrupamento, classificação física por corpo/ruído/decaimento, ajuste competitivo e avaliação de ambiguidade por batida. Não há misturas NMF fixas da gravação anterior.

O fluxo é WAV → eventos em memória/JSON → adaptação por dificuldade → `notes.mid` final. A explicação técnica completa e os comandos estão em `scripts/WAV_CHARTS.md`.

## Testes executados

**18 testes passaram**, em 3,732 segundos na última execução da suíte. São sinais sintéticos com ataques/alturas conhecidos e testes de ciclo do lote; esse resultado não equivale a acurácia em músicas reais.

- Silêncio e resíduos numéricos não geram notas nos quatro instrumentos.
- Baixo: alturas, oitavas, repetições da mesma nota e remoção de ataques falsos de fase.
- Guitarra/teclado: acordes, ataques repetidos, sustentações e desvio conhecido de +35 cents.
- Bateria: cinco classes acústicas em sinais de referência, ataques simultâneos de bumbo/caixa/chimbal e dificuldade Easy com alternância rápida de pads.
- Limites de acordes, teclas sustentadas, pareamento MIDI, notas ausentes e sustentações sobre silêncio.
- Descoberta de fontes, rejeição de ambiguidade, MIDIs fonte intencionalmente inválidos que são ignorados, retomada, saída corrompida detectada, revisão imutável e reprocessamento parcial.
- Alterar o WAV selecionado reexporta seu áudio; alterar outra fonte bloqueia reutilização parcial.
- Rejeição de diferenças de comprimento/deslocamento; teste de fluxo com erro em uma música continua até a próxima.

## Resultado da música real

Geração completa final: 114.75 segundos registrados. Estimativa do relógio MIDI: 150.34 BPM; o método também encontrou a alternativa de meio-tempo. O chart anterior usava 146,67 BPM. Os eventos mantêm seus segundos; não foi aplicado snap à grade. O valor do BPM não foi confirmado por anotação musical.

| Instrumento | Easy | Medium | Hard | Expert | Expert anterior |
|---|---:|---:|---:|---:|---:|
| Guitarra | 270 | 318 | 708 | 1087 | 809 |
| Baixo | 415 | 466 | 707 | 786 | 828 |
| Bateria | 681 | 1327 | 1546 | 1555 | 1195 |
| Teclado | 375 | 740 | 1623 | 1995 | 854 |

São contagens de notas individuais, incluindo acordes; quantidade maior não prova melhoria.

- Origem da soma dos stems vs. mix: lag de **0 ms** em três regiões, com correlações 0,819, 0,844 e 0,847. Todos os WAVs têm 11.782.656 amostras estéreo a 44,1 kHz. Essa verificação não prova isoladamente a origem de cada instrumento.
- O MIDI foi salvo, relido e validado. Zero erros estruturais de sobreposição, lanes, limite de mãos/acordes e tempo nos quatro instrumentos. Zero sustentações sinalizadas por silêncio no teste final. Isso não certifica alturas ou durações musicais exatas.
- Todos os cinco OGGs foram decodificados integralmente. Os quatro stems mantêm exatamente a duração; o acompanhamento tem uma amostra extra, equivalente a 0,0227 ms.
- Ganho comum 0,447517; nenhum OGG ultrapassou pico 1 no decode. Erro máximo de reconstrução do residual antes da compressão: 1,1921e-7.
- Zero inversões na checagem de direção entre alturas detectadas e raízes mapeadas em guitarra/baixo. Essa checagem depende da altura detectada estar correta.

Afinações estimadas: guitarra +39,99 cents, baixo +39,08 cents, teclado +30,63 cents. São estimações espectrais e não medições por um afinador humano.

A retomada com os mesmos parâmetros foi executada na revisão final e retornou `skipped_complete`, após verificar hashes. O reprocessamento somente da bateria também foi executado na música real numa revisão anterior desta implementação: os charts dos outros instrumentos e os cinco áudios permaneceram idênticos; o MIDI foi reproduzido byte a byte. Esse teste levou 17,99 segundos e antecedeu o último ajuste de densidade Easy/Medium.

## Problemas encontrados e correções

1. O baixo confundia oscilações de fase com novas palhetadas: no primeiro teste sintético surgiram 15 eventos para quatro notas. O filtro de renovação de amplitude corrigiu esse caso e mantém repalhetadas reais.
2. O teclado cortava sustentações por usar confiança espectral frame a frame; o primeiro chart real perdeu quase todo o teclado, com apenas 31 notas Expert. Removida essa interrupção e ajustados os limiares; a afinação por gravação recuperou evidência de alturas. A densidade final exige revisão de falsos positivos.
3. Templates afinados a A440 falhavam nessa gravação, deslocada cerca de +40 cents. Acrescentada estimação por instrumento, também validada num sinal sintético desafinado.
4. A bateria confundia caixa tonal com tom e chimbal curto com prato. Foram introduzidos decaimento por batida, avaliação do pacote corpo/esteira e deduplicação de explicações correlacionadas. Instrumentos menos fortes continuam disponíveis como exemplares, evitando perdê-los quando só se aprende com ataques altos.
5. Limitar somente notas novas do teclado permitia acumular teclas sustentadas demais. O limite agora inclui teclas já seguradas.
6. A bateria Easy tinha alternância global excessiva mesmo com espaçamento por pad. Easy/Medium agora também reduzem o conjunto global de ataques: na música, Easy passou de 1.238 para 681 notas individuais.

## Limitações e possíveis regressões

**O chart não foi aprovado por escuta nem testado no YARG. A implementação foi testada; fidelidade musical humana não foi demonstrada.**

- Teclado Expert: 854 → 1.995 notas (+134%). A comparação sinaliza explicitamente aumento de densidade e possíveis notas falsas. Uma parte pode representar notas recuperadas, mas não há anotação de referência para confirmar. Vazamento tonal, pedal e voicings continuam difíceis.
- Guitarra tem muitos ataques com altura/acorde pouco explicados pelo modelo harmônico; preservar ritmo não prova que o fret escolhido está correto.
- Bateria ainda tem pacotes ambíguos, especialmente esteira de caixa, pratos e chimbal aberto. Nas marcações técnicas anteriores perto de 0,51/0,90/2,11/3,74 s, a classe principal esperada aparece após as correções, mas há ataques adicionais de pratos/chimbal próximos de alguns desses pontos. Eles não foram confirmados por escuta e podem ser falsos positivos.
- Baixo não cobre todos os transientes espectrais: rejeitar oscilação/ruído evita duplicatas, mas também pode omitir repalhetadas fracas.
- Não há divisão confiável entre tons altos/médios/surdos, Pro Drums, mapa de compasso real ou tempo variável musicalmente validado. O teclado 7K e os cinco botões comprimem a informação musical.

Cobertura do detector de novidades em Expert e regiões audíveis de dois segundos sem ataques:

| Instrumento | Cobertura de novidades | Regiões sem ataque (início em s) |
|---|---:|---|
| Guitarra | 99.6% | 176, 258 |
| Baixo | 57.6% | 148, 208, 258 |
| Bateria | 97.1% | nenhuma sinalizada |
| Teclado | 87.5% | nenhuma sinalizada |

Cobertura não é precisão: o mesmo detector de novidades auxilia a transcrição e pode gerar falsos ataques. Os intervalos sem ataque podem ser sustentações, silêncio mal separado ou notas perdidas. Os timestamps completos estão nos JSONs.

O próximo passo musical é revisar o áudio junto dos eventos do chart e validar no jogo, principalmente teclado, alturas/acordes da guitarra e pratos/esteira da bateria. O lote completo permanece não executado.

## Custos e execução

A execução depende apenas das bibliotecas e do FFmpeg locais. Não usa APIs, Basic Pitch nem chamadas ao Codex. Depois da instalação, rode o comando no terminal e use `--resume`/`--instrument` para evitar trabalho repetido. O processamento pode usar mais de 1 GB de memória em músicas longas. Não extrapole o tempo desta música como benchmark confiável para as outras 72.

Ambiente executado: Python 3.14.2, NumPy 2.5.4, SciPy 1.18.1, Mido 1.3.3, imageio-ffmpeg 0.6.0.
