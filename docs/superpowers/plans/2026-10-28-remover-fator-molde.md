# Mold Factor Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a opção e o multiplicador de molde dos novos itens por m², sem alterar itens históricos já salvos.

**Architecture:** O frontend deixa de expor ou enviar o fator e calcula novos itens por m² somente a partir de dimensões e quantidade. O servidor ignora valores enviados pelo cliente em novos itens, mas continua usando valores persistidos em itens legados correspondentes durante edições; os campos do schema permanecem para compatibilidade.

**Tech Stack:** React, Node.js ES modules, Express, Mongoose, `node:test`, Vite.

**Spec:** [2026-10-28-remover-fator-molde-aplicar-logo-design.md](../specs/2026-10-28-remover-fator-molde-aplicar-logo-design.md)

## Global Constraints

- Não adicionar dependências nem trocar o framework de testes; usar `node --test`.
- Preservar dados e cálculos já gravados de pedidos legados; não executar migração.
- Não modificar métodos de venda não relacionados a produtos por m².
- Não fazer deploy; não incluir cópias ou arquivos de backup.
- Regenerar `graphify-out/` ao concluir e não incluir cache de execução.

## Review Focus

- Novo item por m² com `moldEnabled: true` enviado manualmente ao servidor: deve ser calculado sem fator.
- Item histórico correspondente com fator salvo e dimensões inalteradas: deve conservar quantidade/preço calculados anteriormente.
- Item por m² em centímetros e com múltiplas peças: deve converter para m² e multiplicar pela quantidade sem fator.
- Item sem catálogo e itens de venda por unidade, metro linear ou quilômetro: devem manter cálculo e payload atuais.
- Edição de pedido legado sem os campos de molde no formulário: o servidor deve recuperar apenas os valores persistidos do subdocumento correspondente.

---

### Task 1: Remover o fator dos cálculos e formulários do frontend

**Files:**
- Modify: `frontend/src/pages/measurements.js`
- Test: `frontend/src/pages/measurements.test.js`
- Modify: `frontend/src/components/MeasureCalculator.jsx`
- Test: `frontend/src/components/MeasureCalculator.test.js`
- Modify: `frontend/src/pages/OrderForm.jsx`

**Interfaces:**
- Produces: `calculateAreaPerPiece({ width, height, unit })` calcula área sem fator.
- Produces: `buildMeasuredItem(...)` não aceita nem serializa campos de molde em itens novos.
- Consumes: `OrderForm` usa `calculateAreaPerPiece` para estimativa de produto por m².

- [ ] **Step 1: Atualizar os testes de medidas e adicionar teste SSR da calculadora** para verificar área/quantidade por m² sem multiplicador, ausência de campos/controles de molde em novos itens, e preservação da conversão cm/m, quantidade de peças, preço e taxas.
- [ ] **Step 2: Rodar os testes de medidas** em `frontend/` com `node --test src/pages/measurements.test.js` e confirmar que os novos casos falham antes da implementação.
- [ ] **Step 3: Remover parâmetros e campos de molde de `measurements.js`**; manter cálculo da área como dimensão convertida × quantidade de peças.
- [ ] **Step 4: Remover estado, controle e envio de molde de `MeasureCalculator.jsx` e `OrderForm.jsx`**; garantir que a estimativa de m² usa a função sem fator.
- [ ] **Step 5: Reexecutar `node --test src/pages/measurements.test.js` e `npm run build` em `frontend/`**; ambos devem passar.

### Task 2: Bloquear o fator em novos itens no servidor e manter compatibilidade histórica

**Files:**
- Test: `backend/tests/order-item-pricing.test.js`
- Modify: `backend/routes/orders.js`
- Modify: `docs/superpowers/plans/2026-10-14-product-catalog-meter-pricing.md`
- Modify: `docs/superpowers/specs/2026-10-20-printshop-workflow-design.md`

**Interfaces:**
- Consumes: campos `moldEnabled` e `moldFactor` apenas do subdocumento previamente salvo quando a edição corresponde ao mesmo item de catálogo.
- Produces: `buildOrderItems(items, existingItems, ProductModel)` ignora valores de molde do cliente quando o item não corresponde a um item salvo e mantém a compatibilidade ao recalcular itens legados.

- [ ] **Step 1: Adicionar testes em `order-item-pricing.test.js`** para (a) enviar fator em novo item e confirmar quantidade sem fator e (b) editar item existente com fator persistido e confirmar que o fator histórico continua aplicado.
- [ ] **Step 2: Rodar `node --test tests/order-item-pricing.test.js` em `backend/`** e confirmar que os testes de novo item falham antes da implementação.
- [ ] **Step 3: Alterar `buildOrderItems` em `backend/routes/orders.js`** para obter campos de molde exclusivamente do item previamente salvo correspondente; em item novo, chamar o serviço sem fator.
- [ ] **Step 4: Atualizar os documentos existentes** para apontar a decisão nova, sem apagar seu contexto histórico: não oferecer fator em pedidos novos e preservar dados/cálculos legados.
- [ ] **Step 5: Rodar `node --test tests/order-item-pricing.test.js` e `npm test` em `backend/`**; registrar separadamente quaisquer falhas preexistentes.

### Task 3: Verificação integrada

**Files:**
- Test: `frontend/src/pages/measurements.test.js`
- Test: `backend/tests/order-item-pricing.test.js`
- Verify: frontend build, suites e Graphify

**Interfaces:**
- Consumes: cálculo sem fator para novos itens e regra de compatibilidade legada definida nas Tasks 1 e 2.

- [ ] **Step 1: Rodar `npm test` em `frontend/` e `backend/`** e reportar contagens e falhas sem corrigir problemas não relacionados.
- [ ] **Step 2: Rodar `npm run build` em `frontend/` e ESLint focado nos arquivos React alterados**; confirmar que o código compila e não introduz erros de lint.
- [ ] **Step 3: Regenerar o Graphify** usando o comando existente no projeto e confirmar que apenas arquivos de grafo necessários foram atualizados.
