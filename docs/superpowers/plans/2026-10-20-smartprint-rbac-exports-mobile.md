# SmartPrint RBAC, Exports, and Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the admin/attendant/production access matrix, add period-filtered CSV downloads, and make core workflows usable on mobile/tablet without breaking desktop or Render deep links.

**Architecture:** Add reusable backend role guards and role-aware response shaping, then apply them to API routes before mirroring access in React routes/navigation. Add authenticated CSV endpoints that query all matching records and stream UTF-8-BOM downloads. Finally adapt the shared shell and operational lists at mobile breakpoints, with CSS/browser checks and regression tests.

**Tech Stack:** Express, Mongoose, Node test runner, React 18, React Router, Tailwind CSS, Vite.

**Spec:** `docs/superpowers/specs/2026-10-20-permissoes-exportacoes-mobile-design.md`

## Global Constraints

- Nenhum perfil obtém dados ou executa ações proibidas chamando a API diretamente.
- Custos e DRE só são retornados a administradores.
- A exportação respeita permissões e período, inclui todos os registros filtrados (não apenas a página visível) e gera CSV que abre corretamente no Excel.
- Em larguras mobile/tablet, menu, listas, tabelas, filtros e ações permanecem visíveis e operáveis sem corte horizontal da página inteira.
- O layout desktop, identidade visual, links profundos e atualização por F5 no Render continuam funcionando.
- Login demo permanece ausente em produção.
- Todas as rotas continuam autenticadas; o servidor responde 403 para perfil autenticado sem permissão e não confia em `role` enviado pelo cliente.
- Os filtros de período usam datas civis de São Paulo, com início inclusivo e fim inclusivo; ausente, inválido ou intervalo invertido é rejeitado.
- CSV em UTF-8 com BOM; não instalar dependência para `.xlsx`; não incluir custos nos CSVs de pedidos; apenas admin exporta movimentação financeira.
- PWA/offline, sincronização e rascunhos ficam fora desta fase.

## Review Focus

- Atendente/Produção chamando endpoints administrativos diretamente: teste 403 e assegure que nenhuma mutação acontece.
- Produção acessando detalhes comerciais, PDF/WhatsApp, clientes ou pedidos com valores: teste serialização minimizada e negação em rotas que não são operacionais.
- Datas-limite/virada de dia São Paulo e histórico legado de pagamentos: testar limites inclusivos e recuperar o mesmo total dos registros atuais.
- Conteúdo CSV malformado ou iniciado por `=`, `+`, `-`, `@`: testar quoting, BOM e neutralização de fórmulas sem truncar o período.
- Viewport estreita e drawer aberto durante navegação/teclado: teste de overflow global, fechamento, foco e acesso por papel.

---

### Task 1: Backend role guards and endpoint authorization

**Files:**
- Modify: `backend/middleware/auth.js`
- Modify: `backend/routes/orders.js`
- Modify: `backend/routes/clients.js`
- Modify: `backend/routes/payables.js`
- Modify: `backend/routes/dashboard.js`
- Modify: `backend/routes/cash.js`
- Modify: `backend/routes/products.js`
- Modify: `backend/tests/workflow.test.js`
- Modify: `backend/tests/order-client-routes.test.js`
- Create: `backend/tests/role-access.test.js`

**Interfaces:**
- Produces `allowRoles(...roles)`, an Express middleware that returns 403 `{ message: 'Acesso restrito ao perfil' }` unless `req.user.role` is allowed.
- Existing `protect` continues to own authentication; guards never read role from request body/query.

- [ ] **Step 1: Write failing middleware/route tests** for admin, atendente, and producao. Assert production cannot create/edit/approve/pay orders or access receivables, clients, products, payables, cash, dashboard, PDF, or WhatsApp; atendente cannot access payables or mutate products/delete orders; allowed order, quick-sale, payment, cash, and production-transition operations continue to work.
- [ ] **Step 2: Run focused backend tests** with `node --test backend/tests/role-access.test.js backend/tests/workflow.test.js backend/tests/order-client-routes.test.js`; confirm failures show currently permitted route access.
- [ ] **Step 3: Implement reusable `allowRoles(...roles)` and route restrictions.** Admin and atendente retain commercial order creation/edit/approval and cash/payment operations. Only admin can change costs/catalog, delete orders, access payable CRUD, dashboard, or administrative merges. Production can read the production board and order operational details, and invoke production transitions only.
- [ ] **Step 4: Run the focused tests** and verify allowed workflows still return their existing response contracts.
- [ ] **Step 5: Run `npm --prefix backend test`** and fix regressions introduced by role policy.

### Task 2: Role-safe production reads and frontend route visibility

**Files:**
- Modify: `backend/routes/orders.js`
- Modify: `backend/routes/clients.js`
- Modify: `backend/routes/products.js`
- Modify: `backend/routes/dashboard.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/pages/Orders.jsx`
- Modify: `frontend/src/pages/OrderDetail.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx`
- Modify: `frontend/src/pages/Payables.jsx`
- Modify: `frontend/src/pages/Receivables.jsx`
- Modify: `frontend/src/pages/Products.jsx`
- Modify: `frontend/src/pages/Production.jsx`
- Test: `backend/tests/role-access.test.js`
- Test: `frontend/src/pages/printshop.test.js`

**Interfaces:**
- Produces role-aware order projection in the order API; production receives order number, client/contact needed for work, items/instructions/attachments, promised date and priority, but not totals, discounts, payments or payment state.
- `useAuth().user.role` remains the frontend source for route/menu/action visibility; server authorization remains authoritative.

- [ ] **Step 1: Add failing projection tests** asserting production order board/detail omit totalValue, finalValue, discount, amountPaid, paymentStatus, paymentMethod, installments, payments, costUnitPrice, DRE and client balance/payment preference; admin/attendant payloads preserve current commercial fields, with costs only for admin.
- [ ] **Step 2: Add failing frontend role tests** for protected paths, menu entries, dashboard/payables/receivables/product visibility, order/payment actions and production-stage controls.
- [ ] **Step 3: Implement the production projection and close alternate data paths.** Make detail, client and product reads, PDF and WhatsApp unavailable to production unless specifically limited to the production-safe payload; keep production board and transitions working. Ensure dashboard financial data is admin-only on the server and UI.
- [ ] **Step 4: Implement route/menu/action gating** matching the spec. Direct unauthorized navigation shows a localized access-denied state or redirects to an allowed work screen; it must not render protected data while loading.
- [ ] **Step 5: Run backend role/projection tests and frontend tests** using `npm --prefix backend test -- --test-name-pattern="role|production"` and `npm --prefix frontend test`; then run both complete suites if the targeted selectors are unsupported.

### Task 3: Period-filtered order and finance CSV exports

**Files:**
- Create: `backend/services/csvExport.js`
- Create: `backend/routes/exports.js`
- Modify: `backend/server.js`
- Modify: `backend/models/CashSession.js`
- Modify: `backend/routes/orders.js`
- Modify: `backend/routes/payables.js`
- Modify: `backend/routes/cash.js`
- Create: `backend/tests/exports.test.js`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/pages/Orders.jsx`
- Modify: `frontend/src/pages/Receivables.jsx`
- Modify: `frontend/src/pages/Payables.jsx`

**Interfaces:**
- `parseExportDateRange(query, timeZone = 'America/Sao_Paulo')` returns `{ start, endExclusive }` or a 400-compatible error; requires valid ordered `from` and `to` civil dates.
- `escapeCsvCell(value)` returns a quoted CSV-safe value, prefixes formula-leading untrusted text (`=`, `+`, `-`, `@`, tab, CR) with a single quote, and doubles embedded quotes.
- Authenticated endpoints: `GET /api/exports/orders?from=YYYY-MM-DD&to=YYYY-MM-DD` (admin/atendente) and `GET /api/exports/finance?from=YYYY-MM-DD&to=YYYY-MM-DD` (admin only).
- CSV response starts with UTF-8 BOM and uses `text/csv; charset=utf-8` with a deterministic attachment filename.

- [ ] **Step 1: Write failing CSV utility tests** for BOM, semicolon-delimited Excel output, commas/quotes/newlines/accents, empty values and formula injection.
- [ ] **Step 2: Write failing date range and authorization tests** for inclusive Sao Paulo dates, invalid leap/day values, missing/reversed dates, both endpoints by role and no mutation on denial.
- [ ] **Step 3: Implement CSV/date helpers** with no new dependency.
- [ ] **Step 4: Implement order export** using all matching records, creation-date filter, stable order sorting and columns specified by the spec; exclude all costs/margins for every role.
- [ ] **Step 5: Implement finance export** from payment timestamps plus compatible legacy history, paid payable timestamps, and cash-session withdrawal timestamps; include type/reference/method/date/amount and restrict to admin.
- [ ] **Step 6: Add period controls and download actions** to orders and finance screens. Send current dates to server and save the returned attachment; report 4xx/5xx and network failures visibly. Do not export only loaded pages.
- [ ] **Step 7: Run `node --test backend/tests/exports.test.js` and relevant frontend tests**, then `npm --prefix backend test && npm --prefix frontend test`.

### Task 4: Responsive app shell and operational lists

**Files:**
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/pages/Orders.jsx`
- Modify: `frontend/src/pages/Production.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx`
- Modify: `frontend/src/pages/Receivables.jsx`
- Modify: `frontend/src/pages/Payables.jsx`
- Modify: `frontend/src/pages/CashRegister.jsx`
- Modify: `frontend/src/pages/Clients.jsx`
- Modify: `frontend/src/pages/Products.jsx`
- Modify: `frontend/src/pages/OrderDetail.jsx`
- Create or extend: focused responsive tests under `frontend/src/components/` or `frontend/src/pages/`

**Interfaces:**
- Shared shell provides a mobile header, accessible menu toggle and dismissible drawer below the desktop breakpoint; role-filtered navigation is identical on desktop and mobile.
- Responsive layout preserves page-level width constraints and confines horizontal scrolling to the relevant table/board region.

- [ ] **Step 1: Add failing tests** for menu opening/closing, `aria-expanded`, navigation dismissal, Escape/keyboard access and role-filtered links.
- [ ] **Step 2: Implement responsive shell** with focusable toggle, accessible label, Escape handling, backdrop dismissal and body scroll behavior; leave desktop sidebar unchanged.
- [ ] **Step 3: Add responsive order and production layouts** using compact mobile cards and keep desktop tables/Kanban behavior.
- [ ] **Step 4: Audit remaining named operational pages** and correct overflow/wrapping/scroll containers for filters, cards, tables, detail sections and action buttons without changing business logic.
- [ ] **Step 5: Run frontend tests and production build** with `npm --prefix frontend test` and `npm --prefix frontend run build`.
- [ ] **Step 6: Validate at 375px, 768px and desktop** in browser/devtools: document the viewport check, assert `document.documentElement.scrollWidth <= window.innerWidth`, test menu keyboard interaction, and confirm table horizontal scroll stays inside its own container.

### Task 5: Documentation, Render deep links, and full regression

**Files:**
- Modify: `README.md`
- Modify only if needed: `render.yaml`
- Modify: `backend/tests/role-access.test.js`
- Modify: `backend/tests/exports.test.js`
- Modify relevant frontend tests

**Interfaces:**
- Render static rewrite remains `/*` to `/index.html`; deep links `/pedidos`, `/producao`, and `/pedidos/:id` serve the SPA entry.

- [ ] **Step 1: Add a regression check** for the Render static rewrite configuration and production login (demo access remains absent).
- [ ] **Step 2: Update README** with the finalized role matrix, export endpoints/CSV columns and date rules, and mobile behavior; keep offline PWA identified as future phase.
- [ ] **Step 3: Run final verification:** `npm --prefix backend test`, `npm --prefix frontend test`, `npm --prefix frontend run build`, and `git diff --check`.
- [ ] **Step 4: Inspect `git status --short` and the branch diff** to ensure prior uncommitted feature changes are retained and no unrelated files are included.
- [ ] **Step 5: Commit each completed task** with a scoped message and the repository-required Copilot co-author trailer.
