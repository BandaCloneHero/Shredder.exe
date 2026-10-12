# Organização da biblioteca de charts

Use `musicas/charts-wav/library/Cazuza - Pro Dia Nascer Feliz`. Essa pasta é uma cópia byte a byte da revisão mais recente válida, `Pro Dia Nascer Feliz-60189351-db3a5dd045`, concluída em 11/10/2026 às 18:46:58 UTC. Não houve nova transcrição, alteração de notas ou conversão de áudios.

**Cadastre somente `musicas/charts-wav/library` no YARG para estes charts.** Não cadastre o pai `musicas/charts-wav`, nem outro pai que também inclua os charts antigos/backups: a busca recursiva voltaria a encontrar todas as versões. As sete pastas antigas permaneceram onde estavam, conforme a restrição de preservação. Nenhuma foi apagada, renomeada ou sobrescrita.

Inventário das sete versões originais (prefixo comum `Pro Dia Nascer Feliz-60189351-`):

| Sufixo | Conclusão UTC | Classificação | Notas Expert: guitarra / baixo / bateria / teclado |
|---|---|---|---|
| `5c3a89c345` | 18:29:41 | Revisão antiga de teste | 788 / 1377 / 2072 / 31 |
| `110d430927` | 18:33:29 | Revisão antiga de teste | 788 / 866 / 2072 / 1681 |
| `6fcd6703f4` | 18:37:10 | Revisão antiga de teste | 1087 / 786 / 1874 / 1995 |
| `1ea6dfe0a9` | 18:40:51 | Revisão antiga de teste | 1087 / 786 / 1555 / 1995 |
| `f965746f8a` | 18:43:58 | Revisão antiga de teste | 1087 / 786 / 1555 / 1995 |
| `f965746f8a-r2` | 18:44:30 | Duplicata de MIDI, song.ini e OGGs de `f965746f8a`; reprocessamento da bateria | 1087 / 786 / 1555 / 1995 |
| `db3a5dd045` | 18:46:58 | Mais recente válida; origem da pasta principal | 1087 / 786 / 1555 / 1995 |

Os oito `batch-report-*.json` originais registravam sete gerações e uma retomada que já retornara `skipped_complete` para `db3a5dd045`. Contagens iguais de notas não tornam dois charts duplicatas: `1ea6dfe0a9`, `f965746f8a` e `db3a5dd045` têm contagens Expert iguais, mas seus MIDIs diferem. A dupla `f965746f8a`/`f965746f8a-r2` tem os arquivos de reprodução idênticos; seus relatórios registram execuções diferentes.

O inventário completo, incluindo nomes/datas, hashes, associação aos relatórios e validação, está nos arquivos `organization-audit-*.json` e `organization-validation.json`. Os relatórios históricos não foram reescritos.

O nome anterior misturava a identidade da origem (`60189351`) com a assinatura de código, fontes e parâmetros. Cada ajuste de código alterava a assinatura, e uma geração sem retomada ou com `--instrument` acrescentava `-r2` quando o caminho já existia. Isso preservava versões, mas publicava todas juntas.

Agora o caminho principal é legível e estável, por exemplo `library/RPM - Olhar 43`. O índice identifica cada pasta de origem por seu SHA-256 completo, separado da assinatura da análise. Origens distintas com nomes iguais recebem entradas separadas e um sufixo só em colisão; nomes não são usados para decidir que duas gravações são a mesma música. O caminho da origem deve permanecer estável; mover/copiar a origem produz outra identidade.

`--resume` confere fontes, assinatura da análise, parâmetros e arquivos da pasta principal e reutiliza o resultado. O artista omitido é herdado do chart existente. Mudanças apenas no organizador não invalidam a assinatura dos algoritmos; a compatibilidade com a análise da última revisão antiga foi mantida por comparação exata do código de DSP/exportação.

Se uma revisão for realmente gerada, a pasta principal anterior será movida inteira para `musicas/charts-wav/backups/<música-identidade>/<data-identificador>`, fora de `library`, antes de ativar a nova no mesmo caminho principal. O relatório registra `previous_backup`. Esses backups não devem ser cadastrados no YARG. Na organização realizada agora nenhum chart existente foi movido: apenas a cópia nova foi criada.

Arquivos de código alterados: `scripts/generate_charts_batch.py`, `scripts/test_wav_charts.py`, `scripts/WAV_CHARTS.md`. Criados: `scripts/chart_library.py`, `scripts/test_chart_library.py`, este relatório, `library-index.json`, a pasta principal, o inventário de organização e novos relatórios de execução. Os algoritmos em `wav_chart_analysis.py`, os três geradores anteriores, o jogo e o servidor foram preservados.

Verificações executadas:

- 6 testes de organização passaram: nomes iguais/case, identidade correta, retomada sem análise/decodificação, seleção da versão por data de conclusão, cópia sem alteração, backup externo e restauração se a publicação falhar.
- Os 18 testes anteriores passaram após a adaptação para a pasta principal estável e backups.
- Todos os sete MIDIs foram relidos e validados em tempos, pareamento, tracks e pitches esperados para o formato de charts.
- Os cinco OGGs da pasta principal foram decodificados integralmente com FFmpeg, sem erro. Todos os arquivos da cópia, inclusive MIDI/metadados/relatórios, são idênticos aos originais de `db3a5dd045`.
- Os hashes de todos os 138 arquivos preexistentes em `charts-wav` permaneceram iguais. Isso inclui `.analysis-cache`, as sete pastas e os oito relatórios originais.
- Retomada real da música executada após organizar: `skipped_complete`, mantendo exatamente uma pasta com `notes.mid` em `library`.
- Não foi executado o lote de 73 músicas, nem reanalisado o áudio da música real.

A validação é de integridade e formato. Não foi iniciado o jogo, e as limitações musicais anteriores (especialmente teclado e classificação de pratos/esteira) continuam presentes. Organização correta não certifica qualidade musical.

Comando de retomada, depois de instalar o ambiente descrito em `WAV_CHARTS.md`:

```bash
.venv-charts/bin/python scripts/generate_charts_batch.py \
  "musicas/audios separados" --output "musicas/charts-wav" \
  --song "Pro Dia Nascer Feliz" --resume
```
