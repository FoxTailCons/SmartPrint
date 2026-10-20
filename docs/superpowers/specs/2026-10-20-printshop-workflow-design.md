# Atendimento e produção SmartPrint

Desenho aprovado em conversa em 20/10/2026: itens 5–10; execução autorizada por “pode implementar”.

## Objetivo e limites

Atender fotocópias em uma tela, aplicar faixas automaticamente, registrar especificações da gráfica e operar produção por etapas/Kanban. Reutilizar MERN, componentes e recibos existentes, sem novas dependências. Não alterar senhas, publicar, enviar mensagens nem migrar/mesclar SKUs automaticamente. Arte por link HTTP(S), sem upload nesta entrega. Preservar alterações locais anteriores de login e Render.

## Contratos

- `Product.priceTiers`: array de `{ minQuantity: number, price: number }`, mínimo positivo inclusivo, preço finito não negativo, limites distintos. Maior mínimo menor ou igual à quantidade vendida define o preço; caso contrário usa `price`. Ex.: acima de 20 unidades = mínimo 21. Administração edita tabela no produto.
- O preço é validado no servidor. Novos itens guardam `pricingBasis: { basePrice, priceTiers }` para recalcular quantidades sem usar futuros preços do catálogo. Itens legados sem essa base mantêm preço salvo.
- Campos opcionais no item: `serviceName`, `material`, `finishing`, `applicationLocation`, `promisedDate` (YYYY-MM-DD), `artworkUrl` (HTTP/S), `installationNotes`, `installationFee` e `travelFee` (não negativos). Total do item = quantidade × preço + instalação + deslocamento. Snapshot não confia no preço enviado pelo cliente.
- Metadados devem sobreviver criação, edição, mesclagem e aparecer em detalhe/PDF/WhatsApp quando preenchidos. Descrição calculada usa serviço, medidas e material; usuário pode preencher serviço na calculadora.
- `Order.priority`: `normal|alta|urgente`, padrão normal. `productionStage`: `arte|aprovacao_cliente|impressao|instalacao|entregue`, opcional nos legados. `skippedStages`: array de etapas dispensadas. Prazos reutilizam `deliveryDate`; datas civis não devem mudar pelo fuso.
- Etapa legada: concluído → entregue; em produção/pausado → impressão; demais → arte. Status comercial e pagamento permanecem separados da etapa.
- `POST /api/orders/:id/production/advance`: `{ expectedStage, skip?: boolean }`, exige autenticação, pedido aprovado e não pausado. Valida etapa atual para impedir avanço duplicado; registra responsável, origem/destino e dispensas no histórico. Ao entregar sincroniza `production=concluido`, `status=concluido`, `completedAt`. As ações antigas permanecem coerentes.
- `GET /api/orders/production-board`: lista de pedidos aprovados/concluídos, cliente populado, prazo/prioridade/etapa; filtros `deadline=all|today|overdue|upcoming` e `priority`. Ordena prioridade, prazo e criação; inclui entregues recentes (últimos 7 dias), exclui vendas rápidas de balcão.
- `POST /api/orders/quick-sale`: `{ items: [{ productId, quantity }], paymentMethod, requestId }`. Apenas produtos por unidade, cliente dispensável e total calculado no servidor, pagamento integral e entrega imediata. Salvar pedido e pagamento juntos; chave única por usuário e requestId impede recebimento duplicado em retry. Formas: pix/dinheiro/debito/credito. Response contém pedido e pagamentos para recibo existente.
- Frontend `catalogPricing.js`: exporta `getQuantityPrice(product, quantity)` → `{ unitPrice, minQuantity, total }`. Usado em Produtos, Pedido rápido, OrderForm e calculadora.
- Tela `/pedido-rapido`, atalho F2 global na área autenticada, formulário compacto sem seções do orçamento. Mostra faixa/preço/total e recibo após sucesso; impede cliques duplicados e preserva requestId em retry.
- Calculadora existente recebe `products`, padrão metros, permite material m² do catálogo ou item livre, acréscimos e descrição clara. Não remover funções de cm, peças ou fator de molde.
- Tela `/producao` com colunas e botão avançar/dispensar, link ao detalhe, filtros e erros/retry. Operável por teclado e perfil Produção; sem arrastar como requisito.

## Critérios de aceitação e verificação

Testes de limites 20/21/300/301, preços inválidos e snapshots; extras de item e link seguro; quick sale integral, falhas e retry; transições, etapa dispensada, conflitos, datas e filtros; metadados em documentos. Executar suítes backend/frontend e build. Não usar banco de produção nos testes.

## Rulings

- Trabalhar em branch local preservando alterações anteriores, sem criar outro checkout e perder contexto compartilhado.
- A autorização explícita de implementação vale para execução deste desenho e plano; não solicitar nova autorização para etapas reversíveis.
- Não inferir tabelas comerciais de nomes dos SKUs: administrador cadastra os mínimos/preços reais.
