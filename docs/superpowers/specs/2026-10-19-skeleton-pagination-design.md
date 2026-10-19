# Paginação e skeletons no SmartPrint

## Objetivo

Aplicar ao SmartPrint os padrões registrados no PDV-Cafe para navegação de listas e estados de carregamento, mantendo dados completos para métricas e operações e evitando que falhas de API sejam apresentadas como listas vazias.

## Escopo

- Listas de Pedidos/Orçamentos, Clientes, Produtos, Contas a Receber e Contas a Pagar.
- Listas de detalhes abertas pelos cards do Dashboard, além da lista de pedidos recentes.
- Estados de carregamento, vazio e erro para essas listas.
- Compatibilidade das rotas atuais: chamadas sem parâmetros de paginação continuam retornando arrays; chamadas paginadas retornam um envelope com itens e metadados.

Não inclui paginação de relatórios/exportações, telas de detalhe individual, formulários, nem alterações de regra financeira ou de negócio.

## Arquitetura e comportamento

O frontend terá componentes reutilizáveis de paginação e skeleton e um hook para listas locais. A paginação local será usada somente quando a tela já carregar a coleção completa e seu volume for limitado. Filtros e busca são aplicados antes de calcular a página. Mudanças nos filtros reiniciam a página atual para a primeira.

Listas potencialmente extensas usarão paginação server-side, aplicando busca e filtros na consulta antes de ordenar, contar e recortar os resultados. O envelope paginado conterá `items`, `page`, `pageSize` e `total`; a página efetiva será limitada ao intervalo válido. Parâmetros de página precisam ser inteiros positivos e o tamanho máximo será limitado no servidor. Respostas sem os parâmetros de paginação permanecem no formato legado de array.

Clientes terão busca, totais e ordenação calculados sobre o conjunto filtrado completo, mas somente a página atual será buscada e exibida. O carregamento de detalhes de pedidos de um cliente continuará sob demanda e separado da paginação da lista de clientes.

Pedidos, Produtos e Contas a Pagar passam a solicitar páginas ao servidor. Pedidos mantêm os filtros atuais e a busca por número/cliente; Produtos mantêm busca e filtro de inativos com autorização; Contas a Pagar mantém o filtro de status. Contas a Receber usará uma consulta paginada dedicada que retorna os registros da página e um resumo calculado no servidor (totais e próximos vencimentos) para o conjunto completo filtrado, sem limitar métricas à página visível.

O Dashboard preservará integralmente seu contrato de métricas, contagens, análises e exportação implícita. Suas listas de detalhes usarão paginação local, sem alterar totais, seleção de pedidos entre páginas ou a quantidade de pedidos recentes. A lista de clientes e pagáveis do Dashboard continua derivada do payload existente. Se o payload crescer excessivamente, uma API dedicada poderá ser considerada separadamente, mas não faz parte desta mudança.

Skeletons reutilizáveis representarão a forma aproximada da lista (linhas de tabela ou cartões) durante a carga inicial e durante a troca de página. O estado de erro é distinto dos estados de carregamento e vazio, inclui mensagem recuperável e não descarta silenciosamente os dados. Respostas antigas não podem sobrescrever o resultado de uma busca ou página mais recente.

## Compatibilidade

Rotas existentes sem `page`/`pageSize` mantêm arrays e ordenação atual. A rota de pedidos já limita implicitamente resultados a 500; a chamada paginada usará metadados explícitos, enquanto o uso legado permanece compatível. Os filtros e permissões atuais serão aplicados igualmente nos modos paginado e legado.

## Verificação

- Testes backend cobrem paginação, metadados, limites e formato legado para rotas alteradas, além da aplicação de filtros antes do recorte.
- Testes frontend cobrem hook, navegação e reset de página ao mudar filtros, além dos estados loading/vazio/erro e consistência de métricas/seleção do Dashboard.
- Executar os testes direcionados dos pacotes backend e frontend e o build do frontend.
