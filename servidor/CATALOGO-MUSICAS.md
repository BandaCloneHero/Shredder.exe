# Catálogo do toque livre

O botão de toque livre em `docs/modos.html` abre `docs/musicas.html`. A página busca
`GET /api/musicas`, permite pesquisar título/artista/álbum e filtrar instrumentos.
Todos podem consultar; somente o dono conectado da sala pode escolher e emitir o ticket.

## Biblioteca

`servidor/catalogo-musicas.js` percorre a pasta `musicas/` relativa à raiz do projeto,
inclusive suas subpastas. Lê `song.ini` para apresentação e identifica partes com
notas jogáveis em `notes.mid`, `notes.midi` ou `notes.chart`. Áudio separado ou
`diff_*` no INI não são prova de uma parte jogável. Os instrumentos considerados
são os quatro suportados pela sala: guitarra, baixo, bateria e teclado.

A biblioteca atual tem **189 músicas**, incluindo arranjos/versões distintos:
49 com um instrumento, 77 com três e 63 com quatro. Arquivos compactados, pacotes
brutos e pastas só com áudio não são músicas prontas para seleção. Charts inválidos
são contados em `indisponiveis`; músicas sem áudio permanecem bloqueadas.

O catálogo é montado em memória na primeira consulta, com cache de 60 segundos.
Adicionar ou remover uma pasta de música não exige editar uma lista no código.
A implantação deve incluir a pasta `musicas/` junto de `docs/` e `servidor/`.
A API retorna metadados e IDs opacos: não expõe caminhos absolutos nem publica áudio.
Links simbólicos não são percorridos.

## Compatibilidade e ticket

`docs/js/music-policy.js` contém a mesma regra usada no navegador e no backend:

- Mais jogadores que instrumentos: bloqueada.
- Instrumento escolhido ausente, repetido ou ainda não selecionado: bloqueada.
- Um subconjunto válido dos instrumentos disponíveis: permitido.

A tela reage a entrada/saída de jogadores, troca de instrumentos, desconexão e ticket
pendente. Há um link para voltar à escolha dos instrumentos. A seleção fica bloqueada
enquanto aguarda a resposta, e o servidor verifica novamente os dados atuais da sala.

`owner_emitir_ticket` exige uma `musicaId` válida para toque livre, busca os metadados
no catálogo do servidor e preserva a autorização do dono e a proteção contra tickets
pendentes. O ticket, o painel do operador e a sala recebem a música escolhida.
O recebimento do resultado do executável rejeita uma música diferente daquela escolhida
antes de anexar o lote à fila. Tickets antigos e campanha mantêm o fluxo anterior.

A seleção web registra a escolha no ticket; **não abre nem controla automaticamente o
executável Unity**. O operador precisa executar a música correspondente na biblioteca
do jogo. Nenhum arquivo Unity ou de música foi modificado nesta implementação.
Nenhuma cobrança, débito ou habilitação de pagamento foi adicionada.

## Verificação

```sh
node --test --test-isolation=none servidor/test/catalogo-musicas.test.js servidor/test/catalogo-musicas-web.test.js
```

Testes offline cobrem MIDI, running status, `.chart`, leitura recursiva, notas versus
marcadores, ausência de áudio, dados corrompidos, symlinks, seleção autorizada, grupos
incompatíveis, metadados canônicos, busca, filtros, mudança de sala, erro/retry e cliques
duplicados. Não iniciam o servidor nem alteram contas reais.

Para conferir visualmente: abrir uma sala, selecionar instrumentos, ir a Toque livre,
buscar uma música e confirmar o ticket; repetir com dois/quatro jogadores e verificar
os bloqueios e o nome da música na fila do operador. A aparência em navegador real
não foi validada por estes testes de DOM em memória.

## Capas e instrumentos nos cartões

O catálogo reconhece `album` ou `cover` nos formatos PNG, JPG, JPEG e WebP.
`capaUrl` aponta para `/api/musicas/:id/capa`; a rota resolve apenas a capa cadastrada
para aquele ID, sem aceitar caminhos fornecidos pelo cliente. O caminho real é
conferido dentro da biblioteca, e arquivos substituídos por links simbólicos são
rejeitados. A resposta usa `nosniff` e cache de cinco minutos.

As capas são imagens decorativas com opacidade de 28%, gradiente escuro e carregamento
sob demanda. Músicas sem capa (ou com falha de carregamento) mantêm o fundo padrão.
Os instrumentos usam as quatro imagens locais já existentes em `docs/images/`, com
nome no texto alternativo e tooltip. Se um ícone falhar, seu nome volta a aparecer.
