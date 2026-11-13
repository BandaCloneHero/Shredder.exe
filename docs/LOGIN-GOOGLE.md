# Login Google do Shredder.exe

O jogo usa **Google Identity Services**, o mesmo SDK de login encontrado no Cyberline. O botão oficial é desenhado pelo Google e o backend verifica a identidade antes de abrir a sessão do Shredder. Firebase não participa mais do login.

O jogador clica em Entrar com Google, escolhe a conta e, no primeiro acesso, confirma seu apelido imediatamente. Depois disso, os próximos acessos recuperam o mesmo perfil. Pontuações, conquistas, moedas, sessões e permissões continuam no servidor do Shredder. Apelido não concede permissão de operador.

## Para ativar

É necessário informar ao backend o **ID do cliente Google do Shredder**, um identificador público terminado em `.apps.googleusercontent.com`, e cadastrar o domínio do jogo nas origens autorizadas desse cliente. Não é necessário Firebase Admin, ADC, API key ou chave privada. A configuração detalhada está em [GOOGLE-AUTH.md](../servidor/GOOGLE-AUTH.md).

`google-config.js` contém somente as flags públicas da interface. Client ID, nonce e tentativa são fornecidos por `/api/auth/google/start` depois da consulta de disponibilidade a `/api/auth/options`. Sem configuração válida, o botão fica indisponível. Não há client ID inventado ou reaproveitado de outro jogo.

## Arquivos principais

- `js/google-identity.js`: carrega GIS, prepara o botão oficial e entrega o token somente ao callback da tentativa ativa.
- `js/google-account-ui.js`: troca a prova Google por sessão local e pede o apelido uma vez.
- `js/account.js`: mantém a sessão local existente; o token Google não é salvo.
- `../servidor/google-identity.js`: verifica o token com a biblioteca oficial Google.
- `../servidor/google-auth-routes.js`: controla tentativas de uso único, cadastro e recuperação de conta.

Não há vínculo automático por email. Perfis anteriormente vinculados apenas pelo Firebase são preservados, mas precisam de transição comprovada antes de usar o novo login. O servidor bloqueia criação automática quando isso poderia produzir um perfil duplicado. Não houve migração dos dados reais; detalhes e limitações estão no documento do backend.

O fluxo foi testado offline com SDK/callback simulados e assinatura criptográfica de teste. Nenhum login real, deploy ou configuração externa foi executado nesta adaptação. A publicação ainda requer configurar o cliente Google e o backend. Não há integração de créditos nesta mudança.
