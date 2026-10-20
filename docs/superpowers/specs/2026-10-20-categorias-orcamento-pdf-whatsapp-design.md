# Categorias, documentos comerciais e validação de cliente

## Objetivo

Concluir os requisitos 11–14 do SmartPrint: categorizar produtos e filtrar o catálogo, melhorar o PDF e a mensagem de orçamento, e exigir identificação de cliente nos orçamentos de valor ou tipo relevante sem atrapalhar vendas rápidas de balcão.

O mesmo modelo atual de produtos, pedidos e clientes será mantido. Não haverá nova integração de envio automático, serviço de armazenamento de arquivos nem migração destrutiva. As mensagens continuam sendo abertas no WhatsApp para revisão e envio pelo usuário.

## Estado atual relevante

- Produtos têm preço base e faixas por quantidade; não têm categoria.
- A listagem do catálogo e o seletor de produto não filtram por categoria.
- Orçamentos e pedidos já suportam itens com descrições, medidas, material, acabamento, local, prazo, link de arte, observações de instalação e valores de instalação/deslocamento.
- O detalhe apresenta esses metadados; o PDF e o texto do WhatsApp já incluem dados de item, total, prazo, forma de pagamento e observações.
- O PDF já usa PDFKit e tem um logotipo desenhado, mas não informa validade do orçamento nem contato comercial configurável.
- A mensagem WhatsApp exige cliente cadastrado com telefone, apesar de orçamento de baixo valor poder não ter cliente.
- O cadastro rápido de cliente já existe no formulário e pode ser reutilizado.
- A venda rápida de balcão é uma rota e tela independentes, sem cliente obrigatório e com recibo individual.

## Categorias e filtros

O produto terá uma categoria dentre:

| Valor persistido | Rótulo |
| --- | --- |
| `xerox_impressao` | Xerox/Impressão |
| `adesivos` | Adesivos |
| `grande_formato` | Grande formato |
| `fachada` | Fachada |
| `veiculos` | Veículos |
| `papelaria` | Papelaria |
| `servicos_instalacao` | Serviços (instalação) |

O campo será mantido no mesmo documento de produto, validado no backend e editável pelo administrador. A listagem de produtos aceitará um filtro opcional por categoria; omitir o filtro preserva a consulta atual. O formulário de orçamento mostrará filtro equivalente antes do seletor de produtos. Paginação e busca existentes continuam combinadas com a categoria.

Produtos anteriores sem categoria permanecem válidos e aparecem no catálogo como **Sem categoria** até classificação explícita. Não será inferida categoria pelo nome, pois isso pode classificar incorretamente itens e ativar uma exigência de contato inesperada.

Cada item livre do orçamento também oferecerá categoria. Isso permite que a regra de identificação de cliente seja aplicada quando um serviço relevante ainda não tiver sido cadastrado no catálogo. A categoria do item de catálogo é obtida do produto no servidor; o cliente não pode alterar essa classificação enviando outro valor.

## Cliente em orçamentos

Será configurado `ORDER_CLIENT_REQUIRED_THRESHOLD`, em reais, com valor padrão `100`. A regra vale para orçamentos comuns, na criação e edição:

- Exigir cliente cadastrado com nome e telefone quando o total final após desconto e arredondamento vigente for **maior que** o limite; exatamente R$ 100,00 não excede o padrão.
- Exigir cliente, independentemente do valor, se qualquer item pertencer a **Fachada** ou **Veículos**.
- Se as condições não forem satisfeitas, aceitar cliente ausente. A interface oferece a opção **Sem cliente cadastrado**.
- Pedidos rápidos/vendas de balcão permanecem isentos, inclusive acima do limite. Essa rota é explicitamente identificada e não pode ser tratada como criação genérica de orçamento.

O formulário calcula e informa a exigência antes de salvar e bloqueia a submissão com mensagem acessível quando o cliente não foi selecionado. O backend repete a validação usando itens e total recalculados no servidor e consulta o cadastro de cliente associado; a validação da interface não é uma fronteira de segurança.

O botão **Novo** existente continua abrindo o cadastro rápido sem abandonar o orçamento. Para a exigência automática, nome e telefone vêm do registro de cliente validado; não serão aceitos valores livres no pedido como substituto do cadastro.

## PDF profissional e validade

O PDF atual será aprimorado, sem substituir o fluxo de download/impressão:

- Usar o logo SmartPrint já existente no projeto.
- Incluir endereço, telefone e Instagram no cabeçalho ou rodapé. O Instagram padrão é `@smartprint.lindoia`; o endereço completo e telefone comercial são configurações de implantação, não valores inventados.
- Manter tabela com descrição, quantidade, preço unitário e total; incluir metadados preenchidos do item, observações e prazo previsto.
- Registros identificados pelo fluxo atual como orçamento (pendente sem pagamentos históricos) mostram **Válido até**, calculado como a data de emissão mais `QUOTE_VALIDITY_DAYS` dias corridos, cujo padrão é `7`. Pedidos aprovados/concluídos e registros legados pendentes com pagamentos não são apresentados como orçamento nem recebem prazo de validade de orçamento.
- A chave PIX aparece somente se configurada e quando a forma de pagamento for PIX. O documento não cria QR code nem afirma confirmação de pagamento.
- A paginação existente deve preservar itens, metadados e observações longas.

Configurações do servidor:

| Variável | Default | Uso |
| --- | --- | --- |
| `QUOTE_VALIDITY_DAYS` | `7` | Dias corridos de validade do orçamento; deve ser inteiro positivo |
| `ORDER_CLIENT_REQUIRED_THRESHOLD` | `100` | Limite em reais para exigir cliente |
| `BUSINESS_ADDRESS` | vazio | Endereço comercial exibido quando configurado |
| `BUSINESS_PHONE` | vazio | Telefone comercial exibido quando configurado |
| `BUSINESS_PIX_KEY` | vazio | Chave PIX exibida apenas em pagamento PIX |
| `BUSINESS_INSTAGRAM` | `@smartprint.lindoia` | Identificação de Instagram exibida |

Valores inválidos para os dois parâmetros numéricos devem ser identificados na inicialização/configuração, não silenciosamente substituídos.

## WhatsApp com mensagem rica

O template usa o pedido real: número e rótulo do documento, resumo de itens com quantidades e valores, total após desconto, prazo, forma de pagamento, observações e validade apenas para orçamento. Se o pagamento for PIX e houver chave configurada, inclui essa chave. Não deve produzir mensagem genérica vazia quando faltarem dados: itens e total são dados obrigatórios do pedido e são validados antes da geração.

Com cliente vinculado e telefone válido, o comportamento atual é preservado. Se o orçamento não tiver cliente vinculado, o botão solicita um número WhatsApp de destino para aquela abertura, valida o número e prepara o link `wa.me`. Esse número temporário não é salvo no pedido nem cria cliente. O envio continua explícito e manual pelo WhatsApp. Preparar o texto/link não é um envio confirmado: a rota não atualiza `whatsappSentAt`; valores históricos existentes permanecem intactos.

O endpoint não deve confiar em categoria, total, validade ou preço enviados pelo navegador. Ele lê o pedido persistido e a configuração do servidor. Mensagens mantêm codificação segura da URL e os controles de autenticação existentes.

## Compatibilidade e erros

- Pedidos históricos e produtos sem categoria continuam carregando e sendo editáveis; o campo ausente é tratado como **Sem categoria**.
- Não há migração automática, classificação inferida ou alteração dos preços/itens históricos.
- A regra de cliente se aplica a orçamentos comuns em POST e PUT; pedido rápido permanece sob seu fluxo especializado e recibo idempotente.
- A tentativa de salvar orçamento sem cliente quando este é obrigatório retorna erro de validação explícito e não grava pedido.
- O PDF e a mensagem omitem campos comerciais não configurados, exceto validade padrão e Instagram padrão.
- Telefones de destinatário temporários são usados somente para criar o link e não são persistidos.

## Superfícies de implementação

- **Backend:** esquema e validação de categoria do produto, filtro da rota de listagem, validação compartilhada de cliente para criação/edição de orçamento, configuração de ambiente, PDF e template WhatsApp.
- **Frontend:** categoria no CRUD de produtos, filtro na listagem e seletor do orçamento, categoria em itens livres, validação visual de cliente, validade/dados comerciais nos documentos e telefone temporário para WhatsApp sem cadastro.
- **Testes:** modelo/rotas de produtos e filtros combinados; regra de limite e categoria nas rotas de pedido; compatibilidade sem categoria; validade de PDF/texto; omissão de dados não configurados; destino de WhatsApp sem persistência; pedido rápido isento.
- **Documentação/deploy:** documentar as variáveis de ambiente e defaults em README e exemplo de configuração pertinente, sem incluir números ou chaves reais.

## Critérios de aceite

1. Administrador pode atribuir uma das sete categorias; dados legados sem categoria não falham validação.
2. Catálogo e seletor do orçamento filtram por categoria, mantendo busca, paginação e ausência de filtro.
3. Item livre pode ser categorizado e seleciona/indica a categoria Fachada ou Veículos para a regra de contato.
4. Em POST e PUT de orçamento, total final após desconto e arredondamento acima do limite padrão ou item de Fachada/Veículos exige cliente existente com nome e telefone.
5. Total igual ao limite padrão não exige cliente por valor; pedido rápido não exige cliente sob nenhuma dessas condições.
6. Falha de validação do cliente não cria/atualiza o pedido e retorna erro explícito.
7. PDF de orçamento mostra logo, validade padrão de sete dias, valores, dados de item, prazo e dados comerciais disponíveis; pedido aprovado ou legado com pagamentos não é apresentado como orçamento válido.
8. Endereço, telefone e PIX ausentes não são inventados nem exibidos como conteúdo vazio; Instagram aparece com seu valor padrão.
9. WhatsApp inclui dados reais do pedido e validade apropriada; sem cliente vinculado, permite informar telefone temporário, sem persistir cadastro ou telefone.
10. Abrir o WhatsApp não envia automaticamente nem altera estado comercial ou financeiro.
11. Testes direcionados e build do frontend passam; a suíte backend cobre validação de confiança e compatibilidade histórica.

## Decisões aprovadas

- Categorias são uma enumeração fixa no catálogo, não um cadastro de categorias administrável em separado.
- Produtos legados não são classificados automaticamente.
- O limite padrão de cliente é R$ 100 e só é excedido quando o total for estritamente maior que o limite.
- Fachada e Veículos sempre exigem cliente em orçamento comum, sem depender do total.
- Pedido rápido/venda de balcão permanece sem exigência de cliente.
- Validade padrão do orçamento é sete dias corridos.
- Dados oficiais de endereço, telefone e PIX são configurados no ambiente; nunca são inventados.
- O envio pelo WhatsApp permanece uma confirmação manual no aplicativo.
