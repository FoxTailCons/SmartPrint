# Product Catalog and Metered Sales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated product catalog with unit, linear-meter, and square-meter pricing, and let orders use server-priced catalog items while preserving item snapshots.

**Architecture:** Add a MongoDB `Product` model and authenticated `/api/products` routes, with admin-only mutations. A pure backend pricing service validates catalog item inputs and calculates order snapshots; existing free-form items remain supported. Add a Products page and navigation entry, then integrate product selection and the existing dimensional calculator with order item creation.

**Tech Stack:** Express, Mongoose, React, React Router, Tailwind CSS, Node.js built-in test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-10-14-product-catalog-meter-pricing-design.md`

## Global Constraints

- Product sale units are `unit`, `linear_meter`, and `square_meter`.
- Product name is required and trimmed; code is optional and unique when provided.
- Product price is finite and non-negative; products are active by default.
- Product mutations require an authenticated administrator; authenticated users may read active products and create orders.
- Product deactivation is logical; never delete product records as part of this feature.
- Catalog order items store the product reference, applied price, name, sale unit, and measurements as a snapshot.
- Catalog item quantities/prices/totals are calculated and validated by the backend, not trusted from browser input.
- Existing free-form order items and legacy orders remain compatible; do not migrate or rewrite existing documents.
- No stock, purchasing, tax, cost, or margin functionality is in scope.

## Review Focus

- Fractional linear-meter measurements and multiple pieces — pin conversion and multiplication in the pricing-service tests.
- Centimeter-to-square-meter conversion and zero/negative dimensions — pin expected area and rejection in the pricing-service tests.
- Invalid, inactive, or missing product IDs — pin explicit API/service errors and ensure no item is accepted.
- Product price changes after an order is saved — pin that editing an existing item retains its saved unit-price snapshot unless the user selects the catalog product again.
- Duplicate/blank product codes and non-admin mutations — pin normalization/uniqueness and admin-only route behavior in product-route tests.

---

### Task 1: Product Model and Catalog Routes

**Files:**
- Create: `backend/models/Product.js`
- Create: `backend/routes/products.js`
- Create: `backend/tests/products.test.js`
- Modify: `backend/server.js`

**Interfaces:**
- `Product` fields: `name`, optional `code`, `saleUnit`, `price`, `active`, timestamps.
- `GET /api/products?q=&includeInactive=` lists active products for ordinary users; only admins may set `includeInactive=true`.
- `GET /api/products/:id` retrieves an active product for ordinary users; admins may retrieve inactive products.
- `POST /api/products` and `PUT /api/products/:id` accept `{ name, code, saleUnit, price, active }`; admin only.
- `PATCH /api/products/:id/deactivate` sets `active=false`; admin only.

- [x] **Step 1: Write failing model and route tests** for valid sale units, trimmed names, optional unique codes (empty code treated as absent), non-finite/negative prices, active-only user listing, admin inactive listing, and admin-only create/update/deactivate.
- [x] **Step 2: Run `npm test -- --test-name-pattern="product"` in `backend/`** and verify the new tests fail before implementation.
- [x] **Step 3: Implement the Product schema and route handlers** following the existing Client routes and `protect`/`adminOnly` middleware. Export a `createProductsRouter({ ProductModel, protectMiddleware, adminMiddleware })` factory so route behavior and authorization can be tested with an in-memory model without a live database.
- [x] **Step 4: Mount `/api/products` in `backend/server.js`** and make the route factory default to the real `Product`, `protect`, and `adminOnly` dependencies.
- [x] **Step 5: Run the focused product tests** and verify all listing, validation, and access-control cases pass.

### Task 2: Server-Side Catalog Pricing and Order Snapshots

**Files:**
- Create: `backend/services/orderItemPricing.js`
- Create: `backend/tests/order-item-pricing.test.js`
- Modify: `backend/models/Order.js`
- Modify: `backend/routes/orders.js`

**Interfaces:**
- `buildCatalogOrderItem({ product, quantity, pieceCount, lengthPerPiece, width, height, dimensionUnit, moldEnabled, moldFactor, pricingSnapshot })` returns `{ productId, productName, saleUnit, description, quantity, unitPrice, total, measurements }`.
- For `unit`, `quantity` is a positive integer count and total is `quantity × product.price`.
- For `linear_meter`, `pieceCount` is a positive integer; `lengthPerPiece` is positive meters; returned quantity is `pieceCount × lengthPerPiece`.
- For `square_meter`, `pieceCount` is a positive integer; width and height are positive and use `dimensionUnit` (`cm` or `m`); returned quantity is the converted area per piece times `pieceCount`, multiplied by `moldFactor` only when `moldEnabled` is true.
- `pricingSnapshot` is supplied only by the order update route from the matching persisted item; it preserves the saved name, sale unit, and unit price when editing a historical catalog item.
- `POST /api/orders` and `PUT /api/orders/:id` resolve active catalog products and use the product's current price for newly selected catalog items; free-form items retain existing behavior.
- An existing catalog item's saved price and snapshot remain in force while editing that item; a new selection uses the current catalog price.

- [x] **Step 1: Write failing pricing tests** for unit quantities, fractional linear meters, centimeter and meter area calculations, multiplication by pieces, mold factor behavior, invalid measures/counts, non-finite totals, and saved price snapshots.
- [x] **Step 2: Run `npm test -- --test-name-pattern="catalog order item"` in `backend/`** and verify failures.
- [x] **Step 3: Implement the pure `buildCatalogOrderItem` service** with finite positive measurement/count validation and price copied from the resolved product unless the route passes a persisted `pricingSnapshot`.
- [x] **Step 4: Add optional catalog reference and snapshot fields** to each Order item subdocument without changing the existing quantity/unitPrice/total calculation or free-form item behavior.
- [x] **Step 5: Update order POST/PUT handlers** to validate product IDs, resolve active products for new selections, recalculate catalog items, and preserve saved unit prices/name/unit for unchanged existing item subdocument IDs (including inactive referenced products). Return explicit 400 errors for invalid or inactive new selections.
- [x] **Step 6: Run pricing tests plus the existing backend tests** and verify legacy free-form orders still calculate as before.

### Task 3: Product Management Page and Navigation

**Files:**
- Create: `frontend/src/pages/Products.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`

**Interfaces:**
- Route: `/produtos`, wrapped by the existing `Protected` route.
- Product page uses `/api/products` for search/list and the documented POST, PUT, and deactivate endpoints.
- Catalog link and mutating controls are visible only to users with `role === 'admin'`.

- [x] **Step 1: Implement the Products page** with a searchable active/inactive product list, create/edit form, sale-unit selector (`unit`, `linear_meter`, `square_meter`), price validation, and logical deactivation.
- [x] **Step 2: Add the protected `/produtos` route** and an admin-only Products navigation entry, following the existing Layout and page patterns.
- [x] **Step 3: Run `npm run build` in `frontend/`** and verify the new page and route compile.

### Task 4: Catalog Selection and Metered Pricing in Orders

**Files:**
- Modify: `frontend/src/pages/OrderForm.jsx`

**Interfaces:**
- OrderForm fetches active products and gathers the count/dimensions required by each product's `saleUnit`.
- Selecting **Adicionar ao pedido** appends an order item draft with product ID, quantity or dimensions, and human-readable description; the backend determines the effective price and total.
- Existing manually entered items and the dimension calculator remain available.

- [x] **Step 1: Add product selection and measurement inputs** to OrderForm: count for units; length per piece and piece count for linear meters; width, height, dimension unit, piece count, and optional mold factor for square meters.
- [x] **Step 2: Show a client-side estimate before adding** using the selected product's displayed price; label it as an estimate and send only catalog ID and measures as pricing inputs.
- [x] **Step 3: Add the catalog-item action to OrderForm** and append the created draft without removing or changing manual item entry.
- [x] **Step 4: Keep existing item editing to preserve its subdocument ID and saved price snapshot;** removing and adding a catalog product again uses the current catalog price.
- [x] **Step 5: Keep dimension calculator results compatible** with existing free-form order entries, and ensure catalog square-meter entries send structured dimensions rather than relying on description parsing.
- [x] **Step 6: Run `npm run build` in `frontend/`** and verify all order-entry routes compile.

### Task 5: Integration Verification and Documentation

**Files:**
- Modify: `README.md`
- Test: `backend/tests/products.test.js`
- Test: `backend/tests/order-item-pricing.test.js`

- [x] **Step 1: Add README guidance** for product units, administrator access, active/inactive products, and catalog item pricing in orders.
- [x] **Step 2: Run the complete backend suite** with `npm test` in `backend/`; verify product routes, price calculations, auth gates, and existing dashboard/PDF tests pass.
- [x] **Step 3: Run `npm run build` in `frontend/`** and verify the production bundle builds successfully.
- [x] **Step 4: Review the diff** to confirm no `.env` or database documents changed and that the implementation introduces no stock behavior or legacy data migration.

## Self-Review

- **Spec coverage:** Catalog model and routes are Task 1; server-validated item pricing and snapshots are Task 2; Products UI/navigation is Task 3; catalog selection and existing dimensional calculation integration are Task 4; tests/build/docs/legacy compatibility are Task 5.
- **Step scan:** Each task uses focused tests before implementation and a directly related verification command; route paths, payloads, units, and snapshot policy are explicit.
- **Type consistency:** Product units and route payloads use the same three enum strings throughout. `buildCatalogOrderItem` returns the snapshot fields consumed by the Order schema and order API.
- **Review Focus:** All five listed input/failure classes are assigned to a specific service or route test. Browser-only presentation is covered by the production build and the stated integration verification.
- **Proportion:** Five independently reviewable tasks cover the database model/API, order pricing, product page, order UI, and final integration without prescribing implementation bodies beyond required interfaces.
