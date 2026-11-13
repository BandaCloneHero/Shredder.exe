# Layout do Gepeto — 13/11/2026

O retrato deixou de depender apenas da posição fixa da cena. O layout em `GepetoHudLayout`
usa o Canvas principal e reserva espaço para as informações de porcentagem/precisão
visíveis. Em solo, prefere a lateral esquerda abaixo do HUD; com dois jogadores,
prefere a região central e um retrato maior, sem dividir o tamanho por jogador.
A barra de vida acompanha o retrato, abaixo dos pés, com margem para os textos.

`GepetoVisualAnimator` mantém as animações, o pulso musical, as reações e a normalização
dos sprites. Não foram alterados score, janelas de julgamento ou dano. Os rótulos de
porcentagem são descobertos na inicialização/troca de jogadores e suas posições atuais
são respeitadas pelo layout. A cena Gameplay ativa explicitamente esse comportamento.

Os testes matemáticos exercitam proporções 16:9, 4:3 e ultrawide, um a quatro jogadores,
limites da tela e colisão da área reservada com o HUD. A suíte de julgamentos também
verifica PNGs, transparência, referências do prefab, temporização e sintaxe C#9.
Não houve Play, compilação de executável ou teste de renderização Unity neste ambiente.
Validar em Play com um e dois jogadores, também durante transformação/ataques e com
a porcentagem visível, antes de distribuir uma nova build.
