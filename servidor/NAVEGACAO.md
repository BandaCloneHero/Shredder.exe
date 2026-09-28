# Navegação e conquistas persistentes

O servidor entrega `docs/site.html` como documento principal. As telas existentes
abrem no iframe desse documento. A conexão de conquistas, a fila, os elementos
visuais e seus temporizadores pertencem ao documento principal e continuam vivos
quando o iframe navega. Não há restauração da animação entre páginas.

O catálogo compartilhado fica em `docs/js/achievement-catalog.js`. A apresentação
fica em `achievement-notifications.js`, a estrutura do site em `site-shell.js` e a
comunicação da sessão das telas com essa estrutura em `achievement-live.js`.
`servidor/site-navigation.js` distingue navegações da aba e do iframe. O histórico
do iframe mantém Voltar/Avançar; o endereço e o título da aba acompanham a tela.

## Publicação

Publique os arquivos de código atualizados de `docs/`, incluindo os novos scripts
e `site.html`, além de `servidor/server.js` e `servidor/site-navigation.js`.
Preserve os arquivos de contas e sessões existentes no servidor remoto. Depois de
atualizar o código, reinicie a aplicação com `pm2 restart shredder`.

A navegação persistente exige abrir o site pelo servidor Node atualizado. O
recarregamento completo da aba (F5) reinicia o documento principal; a continuidade
se aplica à navegação entre as telas do site.

## Conferência manual

1. Entre com uma conta de teste. Em outra aba, use uma conta oficial no operador
   para conceder uma conquista que a conta de teste ainda não possui.
2. Durante a entrada da notificação, navegue entre as telas pelos links do site.
   Ela deve continuar no canto, sem desaparecer nem reiniciar a animação.
3. Repita usando Voltar e Avançar. Confira também o endereço exibido na barra.
4. Conceda duas conquistas juntas e navegue durante a primeira. A segunda deve
   aparecer depois dela, uma única vez. A notificação termina no tempo normal.
5. Clique na notificação: a galeria deve abrir na conquista selecionada.
6. Saia da conta durante uma notificação e entre com outra. A notificação e a
   fila da conta anterior devem desaparecer.
7. Abra diretamente um endereço de perfil ou ranking em outra aba e confira o
   login, a consulta do perfil e a navegação.

Os testes de navegador não foram executados: a validação visual será feita pelo
usuário. A preparação do Playwright foi interrompida antes da instalação das
bibliotecas de sistema; nenhuma dependência de teste foi adicionada ao projeto.
