# Users and Admin Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add administrator-managed Atendente/Produção accounts and require backend-verified Admin credentials for attendant payment discounts and cancellations.

**Architecture:** Extend the existing User and Order MongoDB models, Express routes, and role-protected React pages. Verify Admin credentials in the same backend request that applies a discount or cancellation; keep discount amounts separate from cash receipts and record all approvals in order history. Cancellation is a soft status transition and is blocked after any payment.

**Tech Stack:** Node.js, Express, Mongoose, bcryptjs, React, React Router, Tailwind CSS, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-21-usuarios-autorizacoes-design.md`

## Global Constraints

- Somente Admin pode criar, listar e desativar usuários. Não há cadastro público.
- A criação requer nome, e-mail único normalizado, papel `atendente` ou `producao` e senha inicial válida.
- A senha de Admin nunca é salva, incluída em logs, no histórico ou reutilizada como credencial de sessão.
- O desconto é um abatimento fixo em reais sobre o saldo pendente e não altera o desconto comercial do orçamento/pedido.
- O pagamento continua registrado somente pelo valor realmente recebido; o desconto é separado e não é entrada de caixa.
- Cancelamento preserva o registro e histórico, exige motivo e é bloqueado se qualquer pagamento já foi registrado.
- Admin opera diretamente; Atendente solicita credenciais Admin; Produção não inicia desconto nem cancelamento.
- Não oferecer exclusão física como fluxo normal de cancelamento.
- Não adicionar dependências; não acessar nem modificar banco de produção durante testes.

## Review Focus

- **Credenciais incorretas, usuário Admin inativo ou não-Admin:** rejeitar sem alteração financeira; coberto em Task 2 e Task 3.
- **Desconto ou pagamento fora do saldo, valor negativo/não finito ou desconto sem motivo:** rejeitar antes de mutação; coberto em Task 3.
- **Duas operações concorrentes no mesmo saldo:** evitar saldo negativo ou desconto duplicado usando atualização condicional/controle de versão no documento; coberto em Task 3.
- **Cancelamento com pagamento e repetição de transição:** rejeitar sem alteração; coberto em Task 4.
- **Pedidos cancelados ou descontos em saldos legados:** excluir cancelados das operações ativas sem alterar recebimentos históricos; subtrair apenas descontos persistidos dos saldos; coberto em Tasks 3–5.

---

### Task 1: Administrator-managed users

**Files:**
- Modify: `backend/routes/auth.js`
- Create: `backend/tests/user-management.test.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/roleAccess.js`
- Create: `frontend/src/pages/Users.jsx`
- Create: `frontend/src/pages/Users.test.js`
- Modify: `README.md`

**Interfaces:**
- `POST /api/auth/users` accepts `{ name, email, password, role }`; permits only `admin` requester and `atendente|producao` target role; returns safe user fields with HTTP 201.
- `GET /api/auth/users` remains Admin-only and returns no password/hash fields.
- `PATCH /api/auth/users/:id/active` accepts `{ active: boolean }`; permits only Admin and returns safe user fields.
- Frontend route `/usuarios` and menu permission `users` are Admin-only.

- [ ] **Step 1: Write failing backend tests** for admin-only list/create/activate/deactivate, allowed roles, invalid email/name/password, duplicate email (409), forbidden `admin` target role, invalid user ID, prevention of self-deactivation and last-Admin lockout, and absence of password/hash in every response.
- [ ] **Step 2: Run `npm --prefix backend test -- --test-name-pattern="user management"`** and verify the new cases fail for missing routes/validation.
- [ ] **Step 3: Implement the three routes in `backend/routes/auth.js`** using existing `protect`, `adminOnly`, and the User bcrypt save hook. Require a 12-character minimum password; normalize/trim name and lowercase/trim email; map duplicate-key errors to 409; prevent self-deactivation and deactivation of the last active Admin.
- [ ] **Step 4: Implement the Admin-only `/usuarios` page** with a create form and active-state toggle; add route, permission, menu item, and a test proving an Admin sees the page while Atendente and Produção do not.
- [ ] **Step 5: Run backend user-management tests and frontend Users/role-access tests**; verify all pass.
- [ ] **Step 6: Update README user-management and initial-password guidance; run `git diff --check`; commit as `feat: adiciona gestao administrativa de usuarios`.**

### Task 2: Server-side Admin credential verification

**Files:**
- Create: `backend/services/adminAuthorization.js`
- Create: `backend/tests/admin-authorization.test.js`
- Modify: `backend/routes/orders.js`

**Interfaces:**
- `verifyAdminCredentials({ email, password }, UserModel = User)` returns an active Admin document on a valid match, or `null` for missing, malformed, inactive, non-admin, or mismatched credentials.
- The service loads `+password` only for the verification query and never logs credentials.
- Order routes use a dedicated 10-attempt-per-15-minute rate limiter for credential-authorized operations, returning 429 after the limit.

- [ ] **Step 1: Write failing service tests** for valid Admin, invalid password, missing input, inactive Admin, Atendente role, and lookup case-insensitivity; assert no credential values are returned.
- [ ] **Step 2: Run `npm --prefix backend test -- --test-name-pattern="Admin credential verification"`** and verify failures identify the missing service.
- [ ] **Step 3: Implement `verifyAdminCredentials`** with normalized email, `select('+password')`, `active === true`, `role === 'admin'`, and `matchPassword`.
- [ ] **Step 4: Add tests for same-request identity behavior** in a helper used by order operations: Admin requester needs no secondary credentials; Atendente must supply valid Admin credentials; Produção is rejected.
- [ ] **Step 5: Implement the order-route authorization helper and rate limiter**; return the authenticated Admin identity for audit and never persist supplied password.
- [ ] **Step 6: Run service, route-role, and auth tests; commit as `feat: valida autorizacao administrativa de operacoes`.**

### Task 3: Authorized discounts at payment

**Files:**
- Modify: `backend/models/Order.js`
- Modify: `backend/routes/orders.js`
- Modify: `backend/services/orderInstallments.js`
- Create: `backend/services/orderBalance.js`
- Create: `backend/tests/payment-discount.test.js`
- Modify: `backend/services/csvExport.js`
- Modify: `backend/routes/clients.js`
- Modify: `backend/routes/dashboard.js`
- Modify: `frontend/src/pages/OrderDetail.jsx`
- Modify: `frontend/src/pages/paymentReceipt.js`
- Modify: `frontend/src/pages/thermalPrint.js`
- Modify: `frontend/src/pages/Receivables.jsx`

**Interfaces:**
- Persist `order.paymentDiscounts[]` with `{ amount, reason, by, authorizedBy, at }`; `by` is the attendant name and `authorizedBy` the Admin user ID/name. Admin direct actions use Admin as both requester and authorizer.
- `getOrderBalance(order)` returns `max(0, finalValue - amountPaid - sum(paymentDiscounts.amount))`.
- `POST /api/orders/:id/payments` additionally accepts `discount` (nonnegative finite number), `discountReason`, and `adminAuthorization: { email, password }` for positive discounts.
- Discount is applied only if `amount + discount <= balance`; amount remains the amount received in cash and is still the only amount added to `payments` and `amountPaid`.

- [ ] **Step 1: Write failing tests** for zero discount preserving legacy payment behavior; valid Admin direct discount; Attendant valid/invalid/inactive Admin credentials; Production denial; missing reason; negative/NaN/over-balance values; payment-plus-discount limit; zero-payment rejection; history/audit entries containing identities and reason but not password; balance and installment recalculation.
- [ ] **Step 2: Run `npm --prefix backend test -- --test-name-pattern="payment discount"`** and verify expected failures.
- [ ] **Step 3: Add `paymentDiscounts` schema and `getOrderBalance(order)`**; update installment recalculation to accept the remaining balance without modifying `amountPaid`.
- [ ] **Step 4: Extend the payment route** to validate roles, Admin authorization, reason, and combined balance; atomically save payment, discount record, balance status, installment changes, and audit history as one Order document update. Use an optimistic version/conditional update so concurrent requests cannot over-apply balance; return 409 on a stale version.
- [ ] **Step 5: Update balance consumers** in client summary, dashboard, CSV order export, receivables, order detail, payment modal, and thermal/receipt output. Keep cash inflows and actual-received totals sourced only from saved payment amounts; show accumulated discounts separately in the order detail/history.
- [ ] **Step 6: Add the Admin authorization fields and discount reason to the receive-payment modal**; request credentials only for positive discount, clear password on success/failure/close, and display backend errors.
- [ ] **Step 7: Run payment, installment, cash, CSV, dashboard, client, receipt, and frontend detail tests; commit as `feat: autoriza descontos no recebimento`.**

### Task 4: Soft cancellation state and backend protections

**Files:**
- Modify: `backend/models/Order.js`
- Modify: `backend/routes/orders.js`
- Modify: `backend/services/orderStatus.js`
- Modify: `backend/services/productionWorkflow.js`
- Modify: `backend/routes/dashboard.js`
- Modify: `backend/routes/exports.js`
- Modify: `backend/services/csvExport.js`
- Modify: `backend/routes/clients.js`
- Modify: `backend/tests/workflow.test.js`
- Create: `backend/tests/order-cancellation.test.js`
- Modify: `backend/tests/role-access.test.js`

**Interfaces:**
- Add status `cancelado` and endpoint `POST /api/orders/:id/cancel` accepting `{ reason, adminAuthorization?: { email, password } }`.
- Admin requester cancels directly; Atendente requires valid Admin credentials; Produção is rejected.
- Cancellation is allowed only when `payments` is empty and `amountPaid === 0`; it sets status to `cancelado` and appends a history event with requester, authorizer, reason, and timestamp.
- Cancelled orders are excluded from active production, urgent work, receivables, financial totals, cash/export calculations, and active order counts; retained in authorized detail/history.

- [ ] **Step 1: Write failing tests** for allowed Admin/authorized Attendant cancellation, invalid authorization, denied Production, missing reason, invalid ID, paid and partially paid rejection, repeated cancellation, and no mutation on any rejection.
- [ ] **Step 2: Run `npm --prefix backend test -- --test-name-pattern="order cancellation"`** and verify failures.
- [ ] **Step 3: Implement the status and `POST /:id/cancel` handler** with same-request authorization and existing authorization rate limiter. Use conditional/optimistic update so concurrent payment or cancellation cannot bypass the no-payment rule.
- [ ] **Step 4: Guard all mutating order routes** so cancelled orders cannot be edited, approved, paid, merged, completed, or advanced in production; preserve read-only detail, PDF, and WhatsApp access so existing records remain reviewable.
- [ ] **Step 5: Update shared order predicates and backend query filters** for production board, dashboard, client balances, receivables, active counts, cash and finance CSV exports. Keep cancellation records queryable for history but out of all financial totals.
- [ ] **Step 6: Test every guarded transition and all affected aggregations**; run backend workflow, dashboard, cash, export, client-history, and role tests; commit as `feat: registra cancelamento seguro de pedidos`.**

### Task 5: Cancellation UI, status visibility, and documentation

**Files:**
- Modify: `frontend/src/pages/OrderDetail.jsx`
- Modify: `frontend/src/pages/Orders.jsx`
- Modify: `frontend/src/pages/Production.jsx`
- Modify: `frontend/src/components/Badges.jsx`
- Modify: `frontend/src/roleAccess.js`
- Modify: `frontend/src/pages/orderPresentation.js`
- Modify: `frontend/src/pages/Orders.test.js`
- Create: `frontend/src/pages/orderCancellation.test.js`
- Modify: `README.md`

**Interfaces:**
- Order detail exposes “Cancelar pedido/orçamento” only to Admin/Atendente for non-cancelled, unpaid records.
- Attendant cancellation prompts for reason and active Admin email/password; Admin supplies reason only.
- Cancelled orders have an explicit badge and are not offered as production work or active list categories.

- [ ] **Step 1: Write failing frontend tests** for role-based cancel controls, hidden cancellation for paid/already-cancelled orders, Admin vs Attendant authorization fields, form reason, success/error behavior, and cancelled badge.
- [ ] **Step 2: Run `npm --prefix frontend test -- --test-name-pattern="order cancellation"`** and verify expected failures.
- [ ] **Step 3: Implement the cancellation modal and status badge** using existing Modal, API, and role patterns; clear password on close/submission and refresh order state after success.
- [ ] **Step 4: Update order list labels/filters and production UI** to ensure cancelled items are not presented as active work while the detail remains accessible from history/search.
- [ ] **Step 5: Update README** with user administration, Admin approval, discount accounting, cancellation restriction, and the fact that initial passwords should be replaced.
- [ ] **Step 6: Run `npm --prefix backend test`, `npm --prefix frontend test`, `npm --prefix frontend run build`, and `git diff --check`; commit as `feat: apresenta autorizacoes e cancelamentos no app`.**

## Self-review

- **Spec coverage:** User management and role security, including last-Admin protection, are Task 1; credential verification and rate limits Task 2; payment discount accounting and downstream balance consumers Task 3; cancellation and backend enforcement/financial exclusions Task 4; cancellation UX, visibility, and documentation Task 5.
- **Step scan:** Each task starts with a named focused failing test, then implementation, verification, and commit. Task interfaces define the exact model properties, HTTP inputs, role rules, and shared balance helper.
- **Type/interface consistency:** `verifyAdminCredentials` returns active Admin identity or `null`; routes store that identity in `paymentDiscounts.authorizedBy` and history. `getOrderBalance` is the single remaining-balance formula across backend consumers.
- **Review focus:** All five high-risk classes are assigned explicit tests in Tasks 2–4.
- **Proportion:** Five tasks map to separately reviewable account management, credential verification, discount accounting, cancellation state, and user-facing/documentation behavior.
