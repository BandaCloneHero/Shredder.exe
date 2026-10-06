# Proteção de nomes públicos

O servidor consulta `politica-nomes.json` por meio de `protecao-nomes.js`. A mesma validação impede nomes bloqueados no cadastro, na edição de username/apelido pelo operador, nos apelidos enviados com resultados e nos nomes usados para criar/entrar em salas. Salas e bandas nomeadas na criação de sala também passam pelo filtro. A rejeição HTTP usa status 400, antes de persistir a alteração. Nos sockets, a resposta usa `erro` e não adiciona o jogador rejeitado à sala.

O filtro normaliza caixa, acentos, caracteres invisíveis, algumas letras visualmente semelhantes, letras repetidas e substituições comuns de letras por números/símbolos. Também detecta palavras separadas letra por letra e frases bloqueadas. Termos curtos/ambíguos usam palavras completas; termos menos ambíguos podem ser bloqueados dentro do nome. Referências neutras a raça, religião, gênero ou orientação sexual não são incluídas automaticamente na lista.

Para ampliar a proteção, edite as listas `palavras` e `trechos` em `politica-nomes.json` e reinicie o servidor. `palavras` compara termos/frases e `trechos` compara partes de nomes. Tenha cuidado com termos curtos em `trechos`: podem bloquear nomes legítimos. A lista inicial contempla termos ofensivos em português e alguns em inglês, mas uma lista local não reconhece todas as línguas, contextos ou novos disfarces. Casos novos e bloqueios indevidos exigem revisão da política.

A implantação não renomeia ou apaga contas anteriores. Nomes antigos podem ser corrigidos no painel do operador; o login continua disponível para contas existentes. A edição de nomes passa pela política nova. Nenhuma senha, saldo ou conquista é alterada pelo filtro.

Não foram adicionados ou executados testes nesta implementação.
