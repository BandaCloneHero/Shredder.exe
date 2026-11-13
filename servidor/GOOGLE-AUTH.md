# Entrada Google direta — Google Identity Services

O login agora usa `google.accounts.id`, como o modelo apresentado do Cyberline. O botão é renderizado pelo SDK oficial `https://accounts.google.com/gsi/client?hl=pt-BR`. O backend do Shredder verifica o Google ID Token usando `google-auth-library` 11.3.4 e emite a sessão local existente. Não há Firebase Web SDK, Firebase Admin, ADC, API key Firebase ou chave privada nesse fluxo.

## Configuração necessária

No Google Cloud, selecionar o projeto do Shredder (o projeto existente `shredder-d22a2` pode ser reutilizado) e abrir **APIs e serviços → Credenciais**. Localizar um cliente OAuth 2.0 do tipo **Aplicativo da Web**, ou criá-lo se não existir. Seu ID termina em `.apps.googleusercontent.com`; é público. Não usar o client ID de outro jogo. Não enviar client secret nem gerar chave de conta de serviço.

Nas **Origens JavaScript autorizadas**, cadastrar a origem exata `https://shredder.feira-de-jogos.dev.br` e, se necessário, a origem HTTPS de desenvolvimento autorizada. Não usar caminhos ou curingas. Conferir o público/tela de consentimento e usuários de teste quando o aplicativo estiver em teste; contas institucionais podem ter restrições da organização. Para este fluxo de popup/callback JavaScript, não há callback Firebase `/__/auth/handler` nem callback de redirect do Shredder.

No ambiente do backend, configurar:

```
SHREDDER_GOOGLE_ONLY=true
SHREDDER_GOOGLE_AUTH_ENABLED=true
GOOGLE_CLIENT_ID=<ID público do cliente OAuth Web do Shredder>
SHREDDER_PUBLIC_ORIGIN=https://shredder.feira-de-jogos.dev.br
```

O exemplo `.env.example` deixa a entrada desativada até receber um client ID válido. O Node não carrega `.env.example` automaticamente. Injetar as variáveis pelo gerenciador do serviço. O projeto mantém Node >=22. Instalar dependências com `npm ci`; o comando de início continua `npm start` em `servidor/`. Não foi iniciado nenhum servidor nem feito deploy nesta adaptação.

O site ainda precisa do backend Node já utilizado para contas, ranking e sessões. Retirar Firebase não transforma o Shredder em uma página sem servidor, nem configura automaticamente a infraestrutura da Feira.

## Fluxo e segurança

1. `GET /api/auth/options` anuncia disponibilidade somente se a flag e o client ID forem válidos. Não acessa Google nem credenciais.
2. `POST /api/auth/google/start`, com JSON vazio, cria loginId e nonce aleatórios, válidos por cinco minutos. A origem e a quantidade de tentativas são verificadas. Não cria conta ou sessão.
3. O frontend prepara o SDK e os botões oficiais com o client ID e nonce retornados. O clique no botão oficial inicia o Google; não é usado popup disparado por código próprio nem armazenamento do token.
4. O callback envia `{idToken, loginId}` para `POST /api/auth/google`. Aqui idToken é um **Google ID Token**, não um token Firebase.
5. O backend consome a tentativa antes de validar. A biblioteca oficial confere assinatura, audiência, emissor e validade; o código também exige nonce correto, subject válido, emissão nos últimos cinco minutos e azp compatível quando presente. O subject verificado (`sub`) é a identidade, nunca email/nome/ID enviado separadamente pelo navegador.
6. O vínculo existente recupera a conta. Primeiro acesso sem pendências de transição cria perfil uma vez, com accountId e username técnico, seguido da escolha obrigatória do apelido. Retries não duplicam perfis.
7. A sessão local existente e o progresso continuam no Shredder. O token Google não é aceito como sessão local, não é persistido e não vai em URLs/logs. O SDK não fornece a antiga consulta de revogação do Firebase; a prova é o Google ID Token validado com tentativa curta e nonce, seguido da política de sessões locais do jogo.

`auth-policy.js` mantém origem pública exata, JSON e bloqueio cross-site. Não foram promovidas exceções de proxy/localhost da homologação. Não há pagamentos ou chamadas à Feira.

## Contas anteriormente vinculadas pelo Firebase

`authProviders.firebaseGoogle` permanece intacto, somente para compatibilidade de dados. O novo vínculo é `authProviders.google = {provider: "google", sub, linkedAt}`. Ambos são únicos e imutáveis; nenhum UID Firebase é presumido igual ao subject Google ou ao userId da Feira.

Não é possível descobrir com segurança o subject Google a partir de um UID Firebase sozinho. Por isso, se a base contiver perfis Firebase ainda sem vínculo direto, o cadastro automático de identidades Google desconhecidas é bloqueado com `GOOGLE_TRANSITION_REQUIRED`, evitando criar um segundo perfil por engano. Perfis já vinculados diretamente continuam entrando. As sessões locais existentes continuam válidas.

Resolver a transição exige comprovar a posse do perfil e vincular explicitamente a identidade validada, ou um procedimento administrativo autorizado com backup. Não houve migração, consulta ao Firebase, exclusão de perfis ou conversão por email nesta adaptação. Não remover essa proteção para contornar o erro. Os métodos internos não são endpoints públicos de migração.

No modo exclusivo, senha, cadastro manual Google e vínculo legado por senha continuam bloqueados. Atribuição de operador permanece pela política local, nunca por apelido/claim Google. Desativar o modo exclusivo é compatibilidade administrativa, não uma interface de migração pronta.

## Hospedagem e navegador

Frontend e `/api/` devem estar na origem pública configurada, com HTTPS. Autorizar a mesma origem no OAuth do Google. O proxy precisa preservar Origin; configurações antigas do Codespaces privado não foram copiadas. Se houver CSP, liberar apenas os recursos GIS necessários conforme a documentação; verificar popup/COOP no ambiente publicado. Os testes automatizados simulam a interface, sem comprovar configuração de Console ou navegador real.

Referências oficiais:
- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.google.com/identity/gsi/web/guides/display-button
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token

## Resultado da adaptação (12/11/2026)

Suíte completa offline: **186 testes, 165 aprovados e as mesmas 21 falhas preexistentes**, sem falhas novas em relação à referência anterior. Os testes específicos cobrem certificado/assinatura RSA com a biblioteca oficial sem rede, audiência/emissor/expiração/nonce, tentativa única/replay, bloqueio cross-site, interface GIS simulada, escolha obrigatória do apelido, identidade única, preservação e proteção de permissões.

A contagem mudou porque os testes exclusivos do Firebase foram substituídos pelos do fluxo GIS. Os arquivos accounts.json e sessions.json mantiveram inode, tamanho e data de modificação. Não houve acesso ao ADC, chamada autenticada ao Google/Firebase, migração real, login, início de servidor, deploy, commit ou push. As dependências instaladas foram verificadas por `npm ls --depth=0`.

Pendências: configurar o OAuth client ID público e suas origens; definir transição autorizada se houver vínculos Firebase na base utilizada; publicar sob autorização e testar o navegador real. A remoção da biblioteca não exclui o projeto ou usuários externos do Firebase.

## Client ID público informado pelo responsável

O ID OAuth Web do Shredder foi registrado em `google-config.json`. `GOOGLE_CLIENT_ID` no ambiente pode sobrescrever esse valor; se definido como vazio ou inválido, o login continua bloqueado. A flag `SHREDDER_GOOGLE_AUTH_ENABLED=true` permanece necessária e não foi ativada nesta configuração. A interface e o verificador recebem o mesmo ID configurado. Ainda é necessário confirmar as origens autorizadas desse cliente no Console; não houve consulta ao Console, início de servidor ou autenticação real.

## Servidor normal no Codespaces (porta 3000)

Executar o código atualizado com `npm start` em `servidor/` (ou `node server.js`) dentro de um Codespaces válido configura automaticamente a origem HTTPS correspondente à porta (`3000` por padrão) e habilita Google somente nesse ambiente quando não houver uma flag explícita. `SHREDDER_GOOGLE_AUTH_ENABLED=false` continua sendo respeitada. Uma origem explícita divergente causa interrupção antes de carregar contas. Fora do Codespaces, a habilitação continua dependendo da flag do ambiente e nenhuma exceção de localhost é instalada.

O cliente OAuth precisa autorizar separadamente a origem da porta 3000; a origem da porta 3001 não a substitui. `codespaces-auth.js` trata a reescrita de Origin do encaminhamento privado somente com prova em memória, origem declarada exata, `Sec-Fetch-Site: same-origin`, JSON e localhost da mesma porta. As rotas de autenticação ainda passam pelas verificações normais depois da normalização. O nonce não é gravado no navegador ou em arquivos. Não alterar a porta para pública nem remover essas verificações.

Esta preparação não iniciou ou reiniciou o servidor original e não copiou contas/sessões da base separada da porta 3001. Ao usar uma base diferente, o mesmo Google não transfere automaticamente o perfil de teste entre as bases. Se houver vínculos Firebase pendentes, a proteção de transição continua ativa.
