import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderCreateHandler, createOrderUpdateHandler } from '../routes/orders.js';

const response = () => ({
  statusCode: 200,
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; },
});
const settingsProvider = () => ({ clientRequiredThreshold: 100 });
const user = { _id: '507f1f77bcf86cd799439099', name: 'Atendente' };

test('create rejects a high-value quote without a registered client before writing', async () => {
  let writes = 0;
  const handler = createOrderCreateHandler({
    OrderModel: { create: async () => { writes += 1; return {}; } },
    ClientModel: { findById: async () => null },
    ProductModel: {},
    settingsProvider,
  });
  const res = response();
  await handler({ body: { items: [{ description: 'Banner', quantity: 1, unitPrice: 101 }] }, user }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /nome e telefone/);
  assert.equal(writes, 0);
});

test('generic order creation cannot use quickOrder to bypass the client rule', async () => {
  let writes = 0;
  const order = { history: [], save: async () => {} };
  const handler = createOrderCreateHandler({
    OrderModel: { create: async () => { writes += 1; return order; } },
    ClientModel: { findById: async () => null },
    ProductModel: {},
    settingsProvider,
  });
  const res = response();
  await handler({ body: { quickOrder: true, items: [{ description: 'Banner', quantity: 1, unitPrice: 101 }] }, user }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /fluxo de venda rápida/);
  assert.equal(writes, 0);
});

test('update rejects special-category quote without a client and does not save', async () => {
  let saves = 0;
  const order = {
    client: null, status: 'pendente', discount: 0,
    items: [{ description: 'Placa', quantity: 1, unitPrice: 1, category: 'fachada' }],
    save: async () => { saves += 1; },
  };
  const handler = createOrderUpdateHandler({
    OrderModel: { findById: async () => order },
    ClientModel: { findById: async () => null },
    ProductModel: {},
    settingsProvider,
  });
  const res = response();
  await handler({ params: { id: 'order-id' }, body: {}, user }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /nome e telefone/);
  assert.equal(saves, 0);
});

test('approved orders remain editable without introducing a client requirement', async () => {
  let saves = 0;
  const order = {
    client: null, status: 'aprovado', discount: 0,
    items: [{ description: 'Placa', quantity: 1, unitPrice: 1, category: 'fachada' }],
    save: async () => { saves += 1; },
    populate: async () => order,
  };
  const handler = createOrderUpdateHandler({
    OrderModel: { findById: async () => order },
    ClientModel: { findById: async () => null },
    ProductModel: {},
    settingsProvider,
  });
  const res = response();
  await handler({ params: { id: 'order-id' }, body: {}, user }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(saves, 1);
});
