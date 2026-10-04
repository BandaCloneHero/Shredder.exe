# Baterista: duas baquetas e bumbo

Folha ativa: `Assets/Sprites/Personagens/Comandos/Baterista_Combinacoes22.png`.
1536 × 1024 pixels, 6 colunas × 4 linhas, 22 recortes de 256 × 256; as duas células restantes ficam transparentes.

São 11 posições das baquetas (repouso, quatro pads individuais e seis pares), cada uma com e sem bumbo: 22 poses. Os pads permanecem pretos com laterais vermelha, amarela, azul e verde; o pedal é laranja. As poses foram recortadas das duas folhas existentes. Nos oito hits de pad individual (com e sem bumbo), uma camada editada substitui somente o braço em repouso: apenas a baqueta que atinge o pad desce. Hits duplos preservam as duas baquetas originais. A fonte da correção é Baterista_Maos_Individuais.png; prompts em Comandos-maos-prompts.json.

Ordem dos 11 padrões de pads: `0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12`. Bits 0–3 são vermelho, amarelo, azul e verde. Índices 0–10: sem bumbo. Índices 11–21: mesmos padrões com bumbo (bit 4).

O ReactionController usa até duas baquetas, selecionando os dois hits de pad mais recentes dentro da janela de `commandStrikeDuration` (0,12 s). Empates seguem a ordem dos pads. O bumbo é independente. Entradas com três ou quatro pads continuam sendo processadas pelo motor e pela pontuação; somente a pose exibe até dois pads.

Jogadores recebem os hits de pad reconhecidos pelo motor (OnPadHit), já convertidos para DrumsAction. Funciona com Drumkit 4-Lane/Pro e MIDI Drumkit (GameMode.EliteDrums) tocando charts FourLaneDrums/ProDrums. Entradas cruas não alimentam mais a pose: o código 0 significa bumbo no MIDI e pad vermelho no controle comum. Bots recebem hits do motor e eventos de acerto. Pratos amarelo, azul e verde usam a pose do pad da mesma cor. O pedal é independente e usa a pose laranja. O modo de cinco pistas não possui poses próprias nesta folha.

Os 22 recortes e a pose inicial estão ligados ao prefab TrackView. Para reconstruir a folha e referências, executar `tools/art/export-baterista-22.ps1` em PowerShell na raiz do projeto. As folhas originais permanecem como fontes do exportador. A reação de erro continua desativada.

Montagem e referências conferidas nos arquivos; a resposta visual durante a partida precisa ser conferida no jogo.

Os recortes também são criados diretamente da textura em execução, evitando dependência da importação dos IDs dos sprites. Objetos Sprite criados pelo controlador são destruídos com ele.
