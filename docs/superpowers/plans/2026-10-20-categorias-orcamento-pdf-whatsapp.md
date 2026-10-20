# Categorias, documentos comerciais e validação de cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar categorias no catálogo, validação de clientes em orçamentos relevantes e documentos PDF/WhatsApp baseados nos dados reais do pedido.

**Architecture:** Manter os documentos Mongo atuais e validar preços, categorias e cliente no backend. Reutilizar filtros/paginação e formulário atuais; centralizar configurações comerciais no backend, sem criar serviço de envio ou cadastro independente de categorias.

**Tech Stack:** Node.js 18+, Express, Mongoose, PDFKit, React 18, Vite, Node Test Runner.

**Spec:** `docs/superpowers/specs/2026-10-20-categorias-orcamento-pdf-whatsapp-design.md`

## Global Constraints

- Categorias fixas: `xerox_impressao`, `adesivos`, `grande_formato`, `fachada`, `veiculos`, `papelaria`, `servicos_instalacao`.
- Produtos legados sem categoria permanecem válidos e são exibidos como “Sem categoria”; não inferir classificação.
- `ORDER_CLIENT_REQUIRED_THRESHOLD` default `100`; cliente existente com nome e telefone é obrigatório somente quando o total final após desconto/arredondamento exceder o limite ou houver item de Fachada/Veículos.
- Somente `POST /api/orders/quick-sale` (fluxo especializado) é isento de cliente; o POST genérico rejeita `quickOrder: true`.
- `QUOTE_VALIDITY_DAYS` default `7`, inteiro positivo; Instagram default `@smartprint.lindoia`; dados comerciais ausentes são omitidos.
- Preparar mensagem/link não é confirmação de envio; a rota não atualiza `whatsappSentAt`.
- Não adicionar dependências, nem inventar endereço, telefone ou chave PIX.

## Review Focus

- Categoria inválida e categoria histórica ausente: rejeitar valor inválido, mas continuar lendo e editando legado sem categoria.
- Categoria enviada pelo cliente em item de catálogo: ignorar classificação adulterada e usar categoria persistida no produto.
- Total exatamente no limite e valores que arredondam para cruzá-lo: somente total final estritamente maior exige cliente.
- Cliente removido, sem nome ou sem telefone e orçamento categorizado como Fachada/Veículos: erro explícito sem gravar pedido.
- Orçamento pendente com pagamentos históricos, telefone temporário malformado e configurações numéricas inválidas: preservar rótulo de Pedido, rejeitar entrada inválida e nunca persistir destino temporário.

---

### Task 1: Categorias e filtragem do catálogo

**Files:**
- Modify: `backend/models/Product.js`
- Modify: `backend/routes/products.js`
- Test: `backend/tests/products.test.js`
- Modify: `frontend/src/pages/Products.jsx`
- Modify: `frontend/src/pages/OrderForm.jsx`
- Test: `frontend/src/pages/printshop.test.js` ou teste focado novo para categoria

**Interfaces:**
- Produces: `productCategories` e `productCategoryLabels` como enum/labels compartilháveis conforme padrão local; `category` opcional nos produtos e itens livres.
- GET `/api/products?category=<enum>` combina categoria com busca, estado ativo e paginação; categoria `sem_categoria` filtra campo ausente/nulo.

- [ ] Testar persistência e filtragem de categorias, inclusive categoria ausente, inválida e filtro combinado com busca/paginação.
- [ ] Implementar validação no schema/normalização e predicado Mongo para `sem_categoria`.
- [ ] Incluir seletor, filtro e rótulo de categoria no CRUD/lista e seletor do orçamento.
- [ ] Garantir que item livre aceita categoria e produto legado sem categoria continua editável.
- [ ] Executar `node --test tests/products.test.js` e `npm test -- --test-name-pattern=category` no frontend (ou os testes focados equivalentes).

### Task 2: Regra de cliente e classificação confiável no backend

**Files:**
- Create: `backend/config/orderSettings.js`
- Modify: `backend/models/Order.js`
- Modify: `backend/routes/orders.js`
- Test: `backend/tests/order-model.test.js`
- Test: `backend/tests/workflow.test.js`

**Interfaces:**
- `getOrderSettings(env = process.env)` retorna `{ quoteValidityDays, clientRequiredThreshold, businessAddress, businessPhone, businessPixKey, businessInstagram }` e lança erro explícito para configuração numérica inválida.
- `requiresRegisteredClient({ finalValue, items, clientRequiredThreshold })` retorna boolean; ao criar/editar item de catálogo, `buildOrderItems` copia categoria do produto persistido.

- [ ] Testar defaults, valores válidos/inválidos das configurações e predicado do limite/categorias.
- [ ] Adicionar enum opcional `category` no item de pedido para manter dados históricos compatíveis.
- [ ] Derivar categoria de produto de catálogo no servidor; validar categoria de item livre.
- [ ] Validar cliente com nome e telefone em POST/PUT após recomputar itens e total; responder 400 antes de gravar quando obrigatório.
- [ ] Confirmar isenção do endpoint especializado de venda rápida e rejeição do bypass `quickOrder` no POST genérico; testar total igual/acima do limite e categoria Fachada/Veículos.
- [ ] Executar testes backend direcionados.

### Task 3: Categorias e exigência visual no formulário

**Files:**
- Modify: `frontend/src/pages/OrderForm.jsx`
- Modify: `frontend/src/components/GraphicItemFields.jsx` (somente se necessário para manter layout/serialização)
- Test: `frontend/src/pages/printshop.test.js` ou novo teste do formulário

**Interfaces:**
- O formulário usa os mesmos valores/labels da enumeração fixa do catálogo; a exigência considera `roundOrderTotalUp(itemsTotal, discount)` e categorias de itens livres/catálogo.

- [ ] Adicionar teste que verifica que categoria especial ou total final > R$ 100 informa a exigência; total igual a R$ 100 e item comum não exige.
- [ ] Adicionar seletor de categoria aos itens livres e filtro de categoria antes da seleção de produto.
- [ ] Mostrar cliente obrigatório no fluxo do formulário e preservar o cadastro rápido; API segue autoridade final.
- [ ] Executar os testes direcionados e build do frontend.

### Task 4: PDF e validade configuráveis

**Files:**
- Modify: `backend/routes/orders.js`
- Modify: `backend/tests/orders-pdf.test.js`
- Modify: `README.md`

**Interfaces:**
- `buildOrderPdfBuffer(order, settings = getOrderSettings())` utiliza validade apenas quando `buildOrderDocumentLabel(order) === 'Orçamento'`.

- [ ] Testar extração do texto PDF para validade de sete dias, contato configurado, Instagram default e PIX condicionado a pagamento PIX.
- [ ] Implementar data civil de validade, dados comerciais opcionais e PIX condicionado no cabeçalho/rodapé/resumo de pagamento.
- [ ] Preservar paginação, metadados e a distinção de pedidos aprovados e legados pagos.
- [ ] Documentar variáveis e defaults no README sem valores comerciais reais.
- [ ] Executar `node --test tests/orders-pdf.test.js`.

### Task 5: WhatsApp com dados reais e destino temporário

**Files:**
- Modify: `backend/routes/orders.js`
- Modify: `backend/tests/workflow.test.js`
- Modify: `frontend/src/components/WhatsAppButton.jsx`

**Interfaces:**
- GET `/api/orders/:id/whatsapp?phone=<digits>` usa telefone do cliente vinculado ou, quando ausente, telefone temporário validado; responde `{ text, phone, documentLabel, link }` sem salvar telefone ou alterar `whatsappSentAt`.
- `buildWhatsappText(order, client, settings)` acrescenta validade somente para orçamento e dados comerciais/PIX quando aplicáveis.

- [ ] Testar itens/total persistidos, validade, PIX e omissão de dados ausentes no template.
- [ ] Testar telefone salvo, destino temporário válido, inválido, ausência de destino e ausência de mutação de pedido.
- [ ] Atualizar botão para solicitar destino quando necessário e abrir o link usando resposta do servidor.
- [ ] Executar testes backend e teste/build frontend direcionados.

### Task 6: Verificação integrada e documentação final

**Files:**
- Modify: `README.md` se algum comportamento implementado precisar de instrução operacional adicional.

- [ ] Executar `npm test` no backend.
- [ ] Executar `npm test` e `npm run build` no frontend.
- [ ] Executar `git diff --check` e revisar o diff contra cada critério de aceite do spec.
- [ ] Corrigir falhas introduzidas e repetir os comandos direcionados.
