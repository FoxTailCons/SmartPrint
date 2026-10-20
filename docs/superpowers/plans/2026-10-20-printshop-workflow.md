# SmartPrint Printshop Workflow Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent backend/frontend tasks, then review the complete change.

**Goal:** Implement approved items 5–10 without losing existing orders or financial behavior.

**Architecture:** Extend existing Product/Order schemas and pricing. Dedicated quick-sale endpoint records a complete sale atomically. Existing React forms and documents consume optional metadata and a production-stage API.

**Tech Stack:** Existing Node/Express/Mongoose, React/Vite/Tailwind, node:test; no added dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-printshop-workflow-design.md` (contains exact interfaces).

## Global Constraints

- No production database, deploy, automatic SKU migration or real WhatsApp messages.
- Preserve existing changes; code remains in the current feature branch.
- Tests before nontrivial logic; verify each subsystem and the full suites/build.

## Review Focus

- Threshold boundaries and historical repricing must not change old orders.
- Payment failure/retry must not create two receipts or partial sales.
- Optional metadata and fees must survive editing and documents.
- Concurrent stage advances must change only one stage, not skip work.
- Date-only deadlines must retain São Paulo calendar dates.

## Task 1 — Backend contracts

Files: backend/models/{Product,Order}.js, backend/services/orderItemPricing.js, backend/routes/{products,orders}.js; focused pricing, quick-sale, production and document tests.

- [x] Add failing tests for the contracts in the spec, including thresholds, stored pricing, fee totals, payment retry and transition conflicts.
- [x] Implement validated schemas, central pricing and metadata, atomic quick sale and production handlers before `/:id` routes.
- [x] Extend PDF/WhatsApp and compatibility behavior; run backend `npm test`.

## Task 2 — Catalog and compact checkout

Files: frontend/src/pages/{Products,QuickOrder}.jsx and catalogPricing.js; tests for pricing and quick-sale payload/success rendering where feasible.

- [x] Write failing tests for automatic tiers and invalid quantity, preserving stored pricing.
- [x] Add tier administration, getQuantityPrice helper, compact quick sale with requestId/retry and receipt.
- [x] Run frontend tests. Root integrates routes/navigation/F2.

## Task 3 — Form, calculator and production UI

Files: OrderForm.jsx, OrderDetail.jsx, MeasureCalculator.jsx, new item metadata fields/display and production helpers/board, App.jsx, Layout.jsx, Orders.jsx.

- [x] Add tests for totals, date-only deadlines and legacy stage mapping.
- [x] Integrate tier previews, metadata serialization, fee totals, calculator material selection and optional fees.
- [x] Add board/filter/actions, detail stage controls, priorities/deadlines, quick-sale routes/F2.
- [x] Run frontend suite and production build.

## Task 4 — Integration and review

- [x] Inspect all callers and contracts, run complete backend/frontend suites and build, `git diff --check`.
- [x] Independent review of connected code, fix material findings and repeat only affected checks.
- [x] Update README and this execution ledger; record verified outcome and limitations in Brain.

## Execution ledger

- Initial state: previous login/fallback edits preserved. Branch `feat/printshop-workflow`.
- User authorized implementation of the presented design. Parallel work restricted to separate files and fixed interfaces above.
- Completed: backend pricing/metadata/checkout/stages, catalog and checkout UI, calculator/form/details/Kanban/navigation. All task checks completed.
- Independent review resolved PDF overflow, lost retry key after refresh, HTTP 500 persistence contract, merge workflow loss and legacy production action races.
- Verified: backend 70/70 tests; frontend 44/44 tests; production build; browser smoke with mock API covers checkout/tier/receipt, HTTP 500 + refresh + retry, calculator save, Kanban advancement/overdue and F2. No real MongoDB or production deployment.
- Ruling: completed quick sales cannot be edited, merged or deleted because their stored request key protects retries from duplicate receipts. No cancellation/refund workflow added.
- Ruling: keep pending attempts in user-scoped sessionStorage; recovery covers same-tab refresh/navigation, not closing the tab or clearing browser data.

