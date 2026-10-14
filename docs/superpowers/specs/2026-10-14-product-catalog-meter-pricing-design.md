# Catálogo de produtos e venda por medida

## Objetivo e escopo

Adicionar ao SmartPrint um catálogo persistido de produtos com preços por unidade, metro linear ou metro quadrado, permitir que usuários selecionem esses produtos ao criar ou editar um orçamento/pedido e integrar o cálculo dimensional que já existe ao catálogo.

O sistema deve continuar compatível com os itens livres e pedidos existentes. Cada item de pedido deve preservar os dados comerciais usados no momento da venda, mesmo se o produto for posteriormente editado ou desativado.

Fora do escopo: estoque, movimentação de inventário, compras, impostos, custos/margens e migração ou alteração de pedidos existentes.

## Abordagens consideradas

1. **Catálogo integrado aos pedidos (escolhida):** cadastro persistido, seleção no pedido, cálculo por unidade de venda e snapshot no pedido. Atende à solicitação e mantém o histórico comercial.
2. **Cadastro sem integração:** cria produtos consultáveis, mas mantém preço e descrição digitados manualmente em cada pedido. Não entrega o fluxo de venda por metro.
3. **Somente extensão do calculador:** armazena dimensões como texto e não mantém catálogo de preços. Repete entrada e torna os preços difíceis de reutilizar.

## Modelo e API

### Produto

Criar um modelo MongoDB `Product`, armazenado na coleção `products`, com:

- `name` obrigatório, aparado e pesquisável;
- `code` opcional, único quando informado;
- `saleUnit` com valores `unit`, `linear_meter` e `square_meter`;
- `price` numérico, finito e não negativo, representando o preço por unidade de venda;
- `active` booleano, verdadeiro por padrão;
- timestamps do Mongoose.

Criar rotas autenticadas para listar e consultar produtos ativos e, somente para administradores, criar, editar e desativar produtos. A desativação é lógica: produtos referenciados por pedidos antigos não serão removidos fisicamente.

### Item de pedido

Estender o item do pedido para aceitar, opcionalmente, uma referência ao produto e um snapshot de nome, unidade, preço e medidas. `quantity`, `unitPrice` e `total` continuam sendo a base financeira existente:

- `unit`: quantidade de unidades × preço por unidade;
- `linear_meter`: comprimento total em metros × preço por metro linear;
- `square_meter`: área total em m² × preço por m²; dimensões de entrada em centímetros são convertidas antes do cálculo.

O backend deve resolver produto ativo e preço corrente ao receber um item de catálogo, validar medidas e quantidade e calcular a quantidade/total, sem confiar no preço enviado pelo navegador. Para pedidos legados ou itens sem `productId`, preservar o comportamento existente de item livre. O pedido guarda o preço e a descrição aplicados para que futuras alterações no catálogo não reprecifiquem pedidos já salvos.

## Interface e fluxo

- Adicionar uma tela de Produtos à navegação existente.
- Administradores podem listar, buscar, cadastrar, editar e desativar produtos, definindo nome, código opcional, unidade de venda e preço.
- No formulário de pedido, manter a inclusão manual existente e adicionar a seleção de produtos ativos do catálogo.
- Para produtos por unidade, informar quantidade. Para metro linear, informar comprimento por peça e quantidade de peças. Para m², usar largura, altura, unidade de medida (cm ou m) e quantidade de peças, reaproveitando o calculador dimensional existente.
- Mostrar preço aplicado, quantidade calculada e total do item antes de adicioná-lo ao pedido.
- Incluir nome, dimensões e unidade na descrição/snapshot do item para que as telas atuais de detalhes, impressão/PDF e WhatsApp possam continuar apresentando itens sem depender de consultar o catálogo.

## Validação, erros e compatibilidade

- Rejeitar produto inexistente/inativo, dimensões não positivas, quantidade inválida, preço inválido e valores que resultem em `NaN` ou infinito.
- Erros de API devem ser exibidos pelo padrão de erro existente; não adicionar fallback para preço ou produto ausente.
- Não alterar nem remover documentos existentes. Campos novos de item são opcionais para compatibilidade com dados legados.
- Controle de acesso: leitura e venda de produto para usuários autenticados existentes; mutações do catálogo para administradores.

## Testes e critérios de aceite

- Testes do backend cobrem criação/listagem/edição/desativação e autorização do catálogo, validação de unidades e cálculo correto do snapshot do item de pedido, inclusive conversão cm → m² e rejeição de produto inativo.
- Build do frontend conclui sem erros.
- Verificação manual do fluxo confirma cadastro, seleção, cálculo para metro linear e m², inclusão no pedido, edição compatível e exibição do item salvo nas superfícies existentes.
- Pedidos e itens anteriores continuam carregando sem migração.

## Decisões e premissas

- “Preço por metro” contempla metro linear e m², pois são conceitos distintos e o projeto já tem calculadora de área.
- Catálogo não controla estoque nesta etapa.
- Produtos são desativados logicamente para preservar referências históricas.
- Itens livres atuais continuam disponíveis para serviços ou produtos fora do catálogo.
