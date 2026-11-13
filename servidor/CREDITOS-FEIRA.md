# Créditos da Feira — preparação desativada

Produto do Shredder: **87**. Contrato fornecido pelo responsável: `POST https://feira-de-jogos.dev.br/api/v2/credit`, `Authorization: Bearer <Google ID Token>`, JSON `{product:87,value:<inteiro>}`. A rota fornecida valida o Google ID Token contra os client IDs de jogos cadastrados e identifica a pessoa pelo email no cadastro da Feira. Não há troca por JWT próprio da Feira nesse código.

Esta implementação não usa `/adminCredit`, não usa token administrativo, não pede userId ao jogador, não implementa `/debit` e não executou chamadas reais. O login existente Google Identity Services foi preservado.

## Estado e ativação futura

A integração está desativada. O valor oficial ainda não foi informado. Não há quantidade padrão, nem inferência a partir da pontuação.

Somente depois de definir a regra oficial e autorizar o teste real, configurar no backend:

- `SHREDDER_FEIRA_CREDITS_ENABLED=true`.
- `SHREDDER_FEIRA_CREDIT_VALUE`: inteiro fixo entre 1 e 3000, sem espaços. Ausente/inválido mantém tudo desativado, mesmo com a flag true.

O valor vem exclusivamente do ambiente do servidor. Produto 87 e URL são fixos; o navegador/operador não escolhem quantidade ou destino. A preparação atual é por resultado individual concluído e confirmado, não por pontuação, banda ou edição manual. Se a regra oficial for diferente, adaptá-la antes de ativar. Não há pagamento retroativo automático de testes antigos.

A API fornecida ignora `value` e usa o preço do produto quando o cadastro do produto tem preço positivo. Confirmar esse cadastro para evitar anunciar uma quantidade incorreta. O jogador precisa estar cadastrado na Feira com o email do Google utilizado. O código não consulta nem modifica esse cadastro.

## Fluxo implementado

1. Após validação completa do login Google pelo backend, uma cópia temporária da prova pode ser guardada em memória, somente se créditos estiverem habilitados e configurados. A prova tem a expiração verificada do token e é descartada automaticamente. Não vai para arquivos, logs, sessões ou respostas.
2. O operador oficial confirma o ticket pelo fluxo existente. Os resultados continuam sendo persistidos como antes.
3. Depois de todos os resultados serem salvos, o backend registra os pedidos de crédito dos jogadores com identidade Google direta e resultado individual concluído. Não credita resultados não salvos, banda, jogador desconhecido ou partida incompleta.
4. O serviço processa os pedidos fora da confirmação do operador, usando `{product:87,value}`. A identidade vem do vínculo imutável da conta, não do payload do navegador.
5. O token precisa continuar válido. Se não houver prova em memória (por exemplo, após reinício ou com sessão local antiga), o pedido aguarda o jogador entrar novamente com Google. Não basta restaurar a sessão local: sair e entrar com Google fornece uma nova prova.
6. O sucesso exige HTTP 201 e `operation` inteiro positivo. A operação da Feira é registrada no controle privado. Nenhum erro bruto remoto é exposto.

Os perfis, sessões, permissões, ranking e moedas locais não são substituídos pelo controle de créditos da Feira. Um erro de crédito não apaga nem desfaz o resultado confirmado. Falha ao registrar o pedido local é indicada como pendência de revisão ao operador, sem enviar transferência.

## Persistência e duplicação

`feira-creditos.js` grava `servidor/creditos-feira.json` atomicamente, com permissão 0600. O arquivo fica fora de docs e está ignorado no Git. Contém accountId interno, partidaId, quantidade solicitada, estado e operação retornada; não contém tokens, emails ou credenciais. O identificador local deriva de accountId + partidaId.

Estados:

- `pending`: pedido registrado, sem envio.
- `awaiting_login`: aguarda nova prova Google válida.
- `sending`: estado persistido **antes** de iniciar a chamada.
- `paid`: HTTP 201 e operação válida, sem novos envios.
- `rejected`: HTTP 4xx, incluindo 401/403/429; revisão necessária.
- `unknown`: timeout, falha de rede, resposta ambígua ou envio interrompido; revisão necessária.

Repetir a confirmação não duplica o pedido. Envios concorrentes no mesmo processo são coordenados. O controle foi projetado para o mesmo modelo de **um processo Node** usado pelas contas JSON do projeto. Não executar duas instâncias compartilhando o arquivo; para múltiplas instâncias é necessário armazenamento transacional com unicidade e locks.

O contrato da Feira fornecido não aceita chave de idempotência. Logo, não é possível garantir automaticamente “exatamente uma vez” entre os dois servidores. Em dúvida sobre o resultado remoto, o serviço **não reenvia**. Se o envio foi registrado como `sending` e o servidor reiniciou, ele vira `unknown`; não se presume falha para tentar de novo. Uma falha de disco depois de HTTP 201 também não ocasiona reenvio automático.

Antes de reprocessar manualmente um caso desconhecido, verificar a operação na Feira com o responsável. Não apagar o registro para forçar uma nova chamada.

O exemplo de API consulta operações apenas no último minuto, mas calcula Retry-After com quatro horas; não se assume uma frequência oficial a partir dessa inconsistência. Respostas 429 são preservadas para revisão, não agendadas automaticamente.

## Consulta de estado

`GET /api/feira/creditos` exige a sessão local e devolve somente os estados e operações da própria conta. Não aceita accountId do navegador para consultar outro jogador e nunca devolve prova Google. Com a integração desligada, responde desabilitada sem criar arquivo ou consultar a Feira.

A confirmação do operador informa separadamente que o pedido foi registrado; isso não é tratado como confirmação de pagamento. A mensagem só aparece quando a integração estiver habilitada.

## Validação realizada

Testes offline com HTTP simulado cobrem produto/quantidade, ausência de valor, repetição, autorização do operador, confirmação antes do pagamento, proteção do estado privado, expiração do token, HTTP 400/401/403/429/500, respostas inválidas, timeout/rede, reinício e falha de disco antes/depois da resposta remota. Nenhum teste inicia servidor, consulta usuários ou executa crédito real.

Antes de ativar: receber a regra oficial de quantidade/frequência, confirmar o cadastro do produto 87 e da pessoa de teste na Feira, revisar pendências e autorizar explicitamente um teste real. Não usar essa ativação como parte automática de deploy ou reinício do servidor.
