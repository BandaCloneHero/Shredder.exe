# Artes das conquistas

Coleção de 29 PNGs criados com a ferramenta integrada `image_gen`, um para cada ID do catálogo de conquistas do Shredder.exe.

Abra `index.html` para ver as imagens com seus nomes, raridades e requisitos. Clique em uma badge para abrir o PNG original. A galeria usa `../../js/achievement-catalog.js`.

Cada arte usa um medalhão metálico com um símbolo relacionado ao requisito da conquista. O fundo externo é transparente. Os nomes não estão gravados nas imagens para permitir seu uso como ícones.

As cores seguem a paleta existente do projeto: comum/prata, incomum/verde, rara/ciano, épica/roxo, lendária/dourado e oculta/coral.

Os arquivos são nomeados pelo ID da conquista: por exemplo, `on_fire.png`, `cirurgico.png` e `mestre_guitarra.png`. O conjunto completo de prompts está em `prompts.json`.

As artes são usadas na galeria de conquistas do perfil, nos destaques do perfil e nas notificações de desbloqueio. Conquistas bloqueadas aparecem em cinza; conquistas desbloqueadas exibem as cores da raridade. A galeria de prévia continua disponível em `index.html`.

A interface usa miniaturas `.webp` de até 256 × 256 pixels, com transparência. Os PNGs originais permanecem disponíveis para download. Para regenerar as miniaturas das conquistas, dos avatares e da moldura, execute `python scripts/optimize-profile-images.py` na raiz do projeto (requer Pillow). Incremente o parâmetro de versão das URLs na interface ao substituir miniaturas publicadas, pois o servidor as mantém em cache por sete dias.
