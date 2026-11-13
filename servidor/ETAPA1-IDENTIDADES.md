> Documento histórico da Etapa 1. O login atual usa Google Identity Services; consulte [GOOGLE-AUTH.md](GOOGLE-AUTH.md). O formato Firebase abaixo é preservado apenas como dado legado.

# Identidades — persistência e compatibilidade (Etapa 1)

Esta etapa prepara a persistência; não autentica tokens Firebase e não expõe rotas Google. Os métodos de vínculo são internos. Uma etapa posterior deverá validar o Firebase ID Token e exigir reautenticação local antes de chamá-los.

## Dados e garantias

Cada conta nova recebe `accountId` UUID v4 e `authProviders: {}`. Contas antigas continuam utilizáveis sem esses campos até a migração explícita. Quando houver vínculo, o formato será:

```json
{
  "accountId": "UUID-v4-gerado-pelo-servidor",
  "authProviders": {
    "firebaseGoogle": {
      "projectId": "projeto-firebase",
      "uid": "uid-validado-no-backend",
      "linkedAt": "2026-11-10T00:00:00.000Z"
    }
  }
}
```

O par `projectId`/`uid` só pode pertencer a uma conta. A conta aceita um vínculo Google; repetição do mesmo vínculo é idempotente. Não há transferência, substituição ou desvínculo nesta etapa. Nenhum UID é tratado como `userId` da Feira. Tokens Firebase, emails e credenciais privadas não são armazenados por essas operações.

Os campos de identidade não são editáveis pelo formulário genérico do operador e não integram os perfis públicos. Renomeações mantêm o mesmo objeto de conta, `accountId`, vínculos e histórico. As chaves por username usadas pelo restante da aplicação são preservadas; o ranking não é migrado para UUID.

## API interna

Obtida por `criarPersistenciaPartidas(arquivo)`:

- `lerContas()`: leitura atualizada com validação de unicidade/estrutura.
- `localizarContaPorId(accountId)`: encontra a conta pelo identificador estável.
- `localizarIdentidadeGoogle({ projectId, uid })`: busca vínculo persistido.
- `criarConta({ username, credenciais?, google? })`: perfil novo com método local ou Google; identidade Google já vinculada retorna a conta original. `credenciais` são hashes/salt produzidos pelo backend, nunca dados arbitrários do cliente.
- `vincularIdentidadeGoogle(accountId, { projectId, uid })`: vínculo atômico e idempotente; contas antigas precisam migrar antes.
- `migrarIdentidades({ autorizar: true })`: migração explícita com backup obrigatório.

Os retornos com `account`/`raiz` são privados ao backend: não retornar esses objetos diretamente em endpoints HTTP. As identidades recebidas nesses métodos deverão vir de um verificador confiável na Etapa 2, nunca diretamente de `req.body`.

## Migração: não executada sobre a base real

A inicialização do servidor NÃO chama `migrarIdentidades`. A migração anterior de padrões de perfil continua existente; ela também NÃO atribui IDs automaticamente às contas antigas.

Depois de autorização específica para a base de destino:

1. Parar o servidor e todos os outros escritores, inclusive scripts de senha.
2. Escolher explicitamente o arquivo, conferir permissões/espaço e manter cópia externa privada.
3. Diagnosticar sem alteração:

   ```sh
   node servidor/migrate-identities.js /caminho/accounts.json
   ```

4. Somente quando autorizado, aplicar:

   ```sh
   node servidor/migrate-identities.js /caminho/accounts.json --aplicar
   ```

5. Conferir o caminho de backup informado, o total e a integridade antes de reiniciar.

Antes de qualquer alteração, é criado backup exato em `.backups/accounts-<uuid>.json` (arquivo 0600; novo diretório 0700). Falha no backup impede a publicação. Dados inválidos, IDs repetidos ou vínculos duplicados bloqueiam a migração sem tentar resolver/mesclar contas. Uma segunda aplicação sem mudanças não grava novamente nem cria outro backup.

A migração só acrescenta campos ausentes: não inicializa estatísticas, altera datas antigas, recalcula conquistas, paga créditos ou recria contas. A restauração de backup deve ocorrer com todos os escritores parados e por procedimento autorizado; não foi executada nesta implementação.

## Compatibilidade e segurança de gravação

Gravações de resultados, identidades, cadastro, avatar, loja e sessões usam temporário no mesmo diretório e `renameSync`. Erros são propagados; o servidor não confirma uma gravação que falhou. Cadastro relê a base depois do `scrypt`, impedindo que resultados recebidos nesse intervalo sejam sobrescritos. `saveAccounts` rejeita snapshot antigo com 409 e recarrega o cache em caso de falha.

Login por senha relê a conta após o cálculo e rejeita credenciais alteradas nesse intervalo. Contas sem senha local recebem 401 nesse caminho. A sessão local continua usando token aleatório, hash SHA-256 persistido e validade de sete dias.

Ao alterar senha/username pelo painel, uma `sessionGeneration` nova é gravada atomicamente na conta. Sessões emitidas depois carregam essa geração. Sessões antigas continuam aceitas em contas sem geração; depois da alteração são recusadas mesmo se a regravação de `sessions.json` falhar. Logout e criação de sessão publicam o novo mapa em memória somente depois de persistir.

Nomes listados em `operadores-oficiais.json` ou `SHREDDER_OPERADORES_OFICIAIS` são reservados no cadastro e nas mudanças de username. Operadores oficiais não podem mudar para outro nome pelo editor comum, pois isso poderia retirar autoridade ou liberar um nome privilegiado. Ajustes apenas de caixa mantêm a mesma identidade. Mudança administrativa real requer procedimento separado, não implementado aqui. A autorização continua em `isOfficialOperator`, sem conceder papéis por identidade Google.

## Limites operacionais

- Leitura/validação/escrita são síncronas em um processo Node. Vários processos/containers ou scripts concorrentes exigem lock compartilhado ou banco transacional com unicidade. Não usar cluster nem executar o script de reset em paralelo.
- `reset-password.js` continua sendo uma ferramenta administrativa externa preexistente; não foi executado nem convertido em coordenador de identidades/sessões. Operações administrativas fora do painel devem ser feitas com os escritores parados e com procedimento de invalidação de sessões.
- `renameSync` evita publicação parcial do JSON, mas não constitui transação entre contas e sessões nem garantia de recuperação contra toda falha de energia. Se a conta for criada e a gravação da sessão falhar, a conta permanece válida; o usuário pode entrar por senha. Não se apaga a conta para simular rollback.
- Arquivos de contas e backups contêm dados privados. Manter acesso restrito e cópias fora do conteúdo estático/repositório.

## Validação desta entrega

36 testes novos passaram em bases temporárias, incluindo corrupção, falha de backup/rename, concorrência no mesmo processo, migração parcial, formatos legado/atual, vínculos idempotentes, renomeação, permissões e sessões antigas.

```sh
cd servidor
node --test --test-isolation=none --test-reporter=tap test/identidades.test.js test/persistencia-auth.test.js
```

Também passaram os dois arquivos novos no modo padrão do runner e as verificações `node --check` dos arquivos alterados/criados.

A execução completa com `node --test --test-isolation=none --test-reporter=tap test/*.test.js` resultou em 102 testes: 81 passaram e 21 falharam. Antes das alterações havia 66 testes: 45 passaram e os mesmos 21 falharam. Os nomes das falhas foram comparados; nenhuma falha nova foi introduzida. Há fixtures/expectativas antigas de campanha e harnesses VM sem dependências atuais, entre outras falhas preexistentes. Não foram removidos testes nem alterados seus critérios para ocultá-las.
