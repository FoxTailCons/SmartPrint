# Paginação e skeletons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consistent pagination and loading skeletons to SmartPrint lists without changing financial totals, Dashboard metrics, or legacy API consumers.

**Architecture:** Keep the current array response for legacy requests and introduce `{ items, page, pageSize, total }` for requests with `page` and/or `pageSize`. Use server pagination for orders, clients, products, and payables; use a dedicated paginated receivables query with full-set summary values, and a shared client-side pagination hook for Dashboard detail lists, plus reusable skeleton and pagination components.

**Tech Stack:** React 18, Vite, Tailwind CSS, Express, Mongoose, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-19-skeleton-pagination-design.md`

## Global Constraints

- Calls without pagination parameters continue to return arrays; paginated calls return an envelope with items and metadata.
- The envelope contains `items`, `page`, `pageSize` and `total`; invalid page parameters must be positive integers and page size is capped by the server.
- Search and filters are applied before counting and slicing.
- Dashboard metrics, counts, analytics, exports, and cross-page order selection must not be limited to the visible page.
- Loading, empty, and error states are distinct; stale requests must not replace newer results.
- Existing filters, authorization, route behavior, and sorting remain consistent in paginated and legacy modes.

## Review Focus

- Invalid, fractional, zero, negative, and excessive page parameters: reject invalid values and cap page size; test in the shared backend pagination helper.
- Filtering/search at page boundaries: compute total and page items from the filtered set; test each paginated route.
- Empty or out-of-range pages: return a consistent empty page with correct metadata; test helper and frontend pagination controls.
- API failure versus empty results, including failed initial load: show an error and retry rather than the empty state; test shared list state and representative screens.
- Dashboard selections and financial totals across page changes: preserve selected order IDs and full-set aggregates; test Dashboard list integration.

---

### Task 1: Shared server pagination contract

**Files:**
- Create: `backend/services/pagination.js`
- Create: `backend/tests/pagination.test.js`

**Interfaces:**
- Produces: `parsePagination(query, { defaultPageSize, maxPageSize })`, returning `null` when neither pagination parameter is supplied, otherwise `{ page, pageSize, skip }`; invalid input returns a structured validation error for the route to respond with HTTP 400.
- Produces: `buildPage(items, page, pageSize, total)`, returning `{ items, page, pageSize, total }`.
- Produces: `getEffectivePage(page, pageSize, total)`, clamping requested pages to the available range (or page 1 for empty results) before fetching page rows.
- Consumes: no other task interfaces.

- [ ] **Step 1: Write tests** for omitted parameters, one supplied parameter, valid integers, zero/negative/fractional/non-numeric values, maximum-size capping, out-of-range pages, and metadata shape.
- [ ] **Step 2: Run** `node --test tests/pagination.test.js` from `backend`; confirm the new tests fail because the helper is not implemented.
- [ ] **Step 3: Implement** the two exported helpers with default page size 20 and maximum page size 100; keep validation explicit and return errors without swallowing them.
- [ ] **Step 4: Run** `node --test tests/pagination.test.js`; confirm all cases pass.

### Task 2: Paginate backend list routes

**Files:**
- Modify: `backend/routes/orders.js`
- Modify: `backend/routes/clients.js`
- Modify: `backend/routes/products.js`
- Modify: `backend/routes/payables.js`
- Create: `backend/tests/list-pagination.test.js`

**Interfaces:**
- Consumes: `parsePagination` and `buildPage` from Task 1.
- Produces: each existing `GET /` route preserves the current array response when pagination parameters are omitted and returns the shared envelope when supplied; paginated Payables includes full-filtered-set financial aggregates; `GET /api/orders/receivables` returns a paginated envelope plus a full-filtered-set summary.

- [ ] **Step 1: Write route tests** using the native `node:test` and local HTTP server pattern in `backend/tests/products.test.js`; cover legacy arrays, paginated envelopes, filter/search before pagination, full-set receivables summary, stable ordering, and HTTP 400 for invalid page values.
- [ ] **Step 2: Run** `node --test tests/list-pagination.test.js`; confirm the new cases fail against the current routes.
- [ ] **Step 3: Implement order query pagination** after all current status/payment/production/client/search filters; retain client population and existing descending creation ordering.
- [ ] **Step 4: Implement client pagination** after name/phone/email search; derive `ordersCount`, `totalSpent`, and `openOrders` for each page's clients without returning partial statistics, and use a separate full filtered count for `total`.
- [ ] **Step 5: Implement product pagination** after active/inactive authorization and escaped search; preserve existing sort and dependency-injected router support.
- [ ] **Step 6: Implement** `GET /api/orders/receivables` before `GET /:id`, with open/paid/all filtering, confirmed-order compatibility (`status` approved/concluded or legacy `amountPaid > 0`), page rows populated with client, and a summary containing full-set `totalOpen`, `totalReceived`, and the next eight unpaid installments.
- [ ] **Step 7: Implement payable pagination** after the `paid` filter; preserve due-date ordering.
- [ ] **Step 8: Run** `node --test tests/list-pagination.test.js tests/products.test.js`; confirm legacy and paginated behavior pass.

### Task 3: Shared frontend pagination and loading primitives

**Files:**
- Create: `frontend/src/components/Pagination.jsx`
- Create: `frontend/src/components/ListSkeleton.jsx`
- Create: `frontend/src/hooks/usePagination.js`
- Create: `frontend/src/hooks/usePagination.test.js`
- Create: `frontend/src/hooks/listState.js`
- Create: `frontend/src/hooks/listState.test.js`

**Interfaces:**
- Consumes: no other task interfaces.
- Produces: `Pagination({ page, pageSize, total, onPageChange })`, accessible previous/next controls and page summary; `ListSkeleton({ variant, rows })` supporting table/list placeholders; `usePagination(items, pageSize)` returning `{ page, setPage, total, items }`; pure `getPageItems(items, page, pageSize)`; and `getListState({ loading, error, items })` returning `loading`, `error`, `empty`, or `ready` in that priority.
- Produces: `getPaginationState(page, pageSize, total)` with clamped page, item range, and previous/next bounds for controls.

- [ ] **Step 1: Write pure helper tests** for slicing, empty inputs, last-page clamping, page size bounds, and distinct loading/error/empty/ready states.
- [ ] **Step 2: Run** `node --test src/hooks/usePagination.test.js src/hooks/listState.test.js` from `frontend`; confirm the new tests fail before implementation.
- [ ] **Step 3: Implement** `getPageItems` and `usePagination`; callers reset to page 1 in filter/search handlers.
- [ ] **Step 4: Implement** the accessible `Pagination` and shape-appropriate `ListSkeleton` components, respecting reduced-motion preferences.
- [ ] **Step 5: Implement** `getListState` and use it as the shared state precedence for list loading/error/empty/ready rendering.
- [ ] **Step 6: Run** the two focused `node --test` files and `npm run build` from `frontend`; confirm the shared interfaces compile and pass.

### Task 4: Paginate frontend API-backed lists

**Files:**
- Modify: `frontend/src/pages/Orders.jsx`
- Modify: `frontend/src/pages/Clients.jsx`
- Modify: `frontend/src/pages/Products.jsx`
- Modify: `frontend/src/pages/Receivables.jsx`
- Modify: `frontend/src/pages/Payables.jsx`
- Create: `frontend/src/hooks/useServerPagination.js`
- Create: `frontend/src/hooks/serverPagination.js`
- Create: `frontend/src/hooks/useServerPagination.test.js`

**Interfaces:**
- Consumes: `Pagination`, `ListSkeleton`, and `getListState` from Task 3; `useServerPagination` and response normalization in this task; paginated envelopes from Task 2 via `page`/`pageSize`; receivables response includes its full-set `summary`.
- Produces: list screens that display only the current server page and show the total filtered count; all existing filters/actions remain functional.

- [ ] **Step 1: Update Orders and Products** to request server pages with existing filters/search; preserve immediate query behavior and reset page to 1 on each search/filter change.
- [ ] **Step 2: Update Clients** to request paginated client rows while preserving on-demand per-client order detail loading.
- [ ] **Step 3: Update Payables** to use server pages; update Receivables to use its paginated endpoint and full-set summary, not page rows, for totals and upcoming installments.
- [ ] **Step 4: Add request IDs or equivalent cleanup** in each page so a stale response cannot replace a newer page/filter result; show explicit retryable errors.
- [ ] **Step 5: Integrate** the shared skeleton, list-state, and pagination components in each screen; preserve existing empty messages and actions.
- [ ] **Step 6: Run** `npm run build` and `node --test src/pages/paymentReceipt.test.js src/pages/orderPresentation.test.js src/pages/installmentMath.test.js` from `frontend`; verify filters and existing actions remain functional with paginated envelopes.

### Task 5: Integrate shared UI into Dashboard and list screens

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Create: `frontend/src/pages/listPagination.js`
- Create: `frontend/src/pages/listPagination.test.js`

**Interfaces:**
- Consumes: `Pagination`, `ListSkeleton`, and `usePagination` from Task 3.
- Produces: locally paginated Dashboard detail lists and explicit initial dashboard loading/error states without changing metrics or recent orders.

- [ ] **Step 1: Add testable pure helpers** in `frontend/src/pages/listPagination.js` for page slicing and selected-ID toggling; test that paging does not change full-list counts and selected IDs persist across pages.
- [ ] **Step 2: Run** `node --test src/pages/listPagination.test.js` from `frontend`; confirm new cases fail before implementation.
- [ ] **Step 3: Add Dashboard loading and error states** using the shared list skeleton/state, with a retry action rather than an alert-only failure.
- [ ] **Step 4: Integrate local pagination** into Dashboard detail lists (orders, pending, production, paused, completed, receivables, payables, and clients); maintain the selected order-ID set across page changes and keep all card metrics and recent orders unchanged.
- [ ] **Step 5: Run** `node --test src/hooks/usePagination.test.js src/hooks/listState.test.js src/pages/listPagination.test.js src/pages/paymentReceipt.test.js src/pages/orderPresentation.test.js src/pages/installmentMath.test.js` and `npm run build` from `frontend`; manually inspect Dashboard initial loading, a detail list, and cross-page order selection.

### Task 6: Full focused regression and documentation check

**Files:**
- Modify only files required by failures from Tasks 1–5.

**Interfaces:**
- Consumes: all completed pagination and skeleton interfaces.
- Produces: verified implementation with legacy API compatibility and existing business behavior intact.

- [ ] **Step 1: Run backend tests** with `npm test` from `backend`; resolve only regressions introduced by this feature.
- [ ] **Step 2: Run** `npm run build` and `node --test src/hooks/usePagination.test.js src/hooks/listState.test.js src/pages/listPagination.test.js src/pages/paymentReceipt.test.js src/pages/orderPresentation.test.js src/pages/installmentMath.test.js` from `frontend`; confirm no build errors and all tests pass.
- [ ] **Step 3: Run** `git diff --check`; confirm whitespace and patch integrity.
- [ ] **Step 4: Review the final diff** against `docs/superpowers/specs/2026-10-19-skeleton-pagination-design.md`; verify every in-scope list, API contract, error state, and metrics-preservation requirement is covered.
