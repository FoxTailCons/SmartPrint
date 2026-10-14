import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import Product from '../models/Product.js';
import { createProductsRouter } from '../routes/products.js';
import { adminOnly } from '../middleware/auth.js';

test('Product trims its name and treats an empty code as absent', async () => {
  const product = new Product({ name: '  Adesivo  ', code: '', saleUnit: 'linear_meter', price: 12.5 });

  await product.validate();

  assert.equal(product.name, 'Adesivo');
  assert.equal(product.code, undefined);
});

test('Product rejects unsupported sale units and invalid prices', async () => {
  for (const [saleUnit, price] of [['piece', 10], ['unit', -1], ['unit', Infinity], ['unit', NaN]]) {
    const product = new Product({ name: 'Produto', saleUnit, price });
    await assert.rejects(product.validate());
  }
});

test('Product declares sparse uniqueness for optional product codes', () => {
  const codeIndex = Product.schema.indexes().find(([fields]) => fields.code === 1);

  assert.ok(codeIndex);
  assert.equal(codeIndex[1].unique, true);
  assert.equal(codeIndex[1].sparse, true);
});

function createApp() {
  const records = [];
  let nextId = 1;

  class MemoryProduct {
    constructor(data) {
      Object.assign(this, { _id: String(nextId++), active: true }, data);
    }

    async save() {
      const duplicate = this.code && records.find((entry) => entry.code === this.code && entry._id !== this._id);
      if (duplicate) {
        const error = new Error('Duplicate code');
        error.code = 11000;
        throw error;
      }
      const index = records.findIndex((entry) => entry._id === this._id);
      if (index < 0) records.push(this);
      else records[index] = this;
      return this;
    }

    static findOne(filter) {
      return Promise.resolve(records.find((entry) => entry.code === filter.code) || null);
    }

    static find(filter) {
      const matching = records.filter((entry) =>
        (!('active' in filter) || entry.active === filter.active)
        && (!filter.$or || filter.$or.some((condition) => {
          const [field, expression] = Object.entries(condition)[0];
          return String(entry[field] || '').toLowerCase().includes(expression.$regex.toLowerCase());
        }))
      );
      return {
        sort: async () => matching.sort((left, right) => left.name.localeCompare(right.name)),
      };
    }

    static findById(id) {
      return Promise.resolve(records.find((entry) => entry._id === id) || null);
    }
  }

  const requireTestRole = (req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) return res.status(401).json({ message: 'Não autorizado' });
    req.user = { role };
    return next();
  };

  const app = express();
  app.use(express.json());
  app.use('/api/products', createProductsRouter({
    ProductModel: MemoryProduct,
    protectMiddleware: requireTestRole,
    adminMiddleware: adminOnly,
  }));
  return { app, records };
}

async function withApi(t, callback) {
  const { app, records } = createApp();
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  await callback(`http://127.0.0.1:${address.port}/api/products`, records);
}

test('product routes require authentication and hide inactive products from regular users', async (t) => {
  await withApi(t, async (url, records) => {
    records.push({ _id: '1', name: 'Ativo', code: undefined, saleUnit: 'unit', price: 5, active: true });
    records.push({ _id: '2', name: 'Inativo', code: undefined, saleUnit: 'unit', price: 5, active: false });

    const unauthenticated = await fetch(url);
    assert.equal(unauthenticated.status, 401);

    const regular = await fetch(url, { headers: { 'x-test-role': 'atendente' } });
    assert.equal(regular.status, 200);
    assert.deepEqual((await regular.json()).map((product) => product.name), ['Ativo']);

    const admin = await fetch(`${url}?includeInactive=true`, { headers: { 'x-test-role': 'admin' } });
    assert.deepEqual((await admin.json()).map((product) => product.name), ['Ativo', 'Inativo']);
  });
});

test('product routes create and update products only for administrators', async (t) => {
  await withApi(t, async (url) => {
    const payload = { name: '  Banner  ', code: 'BNR-1', saleUnit: 'square_meter', price: 95 };
    const forbidden = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-role': 'atendente' },
      body: JSON.stringify(payload),
    });
    assert.equal(forbidden.status, 403);

    const created = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify(payload),
    });
    assert.equal(created.status, 201);
    const product = await created.json();
    assert.equal(product.name, 'Banner');
    assert.equal(product.price, 95);

    const updated = await fetch(`${url}/${product._id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify({ ...payload, name: 'Banner atualizado', price: 105 }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).price, 105);
  });
});

test('product routes reject duplicate codes and deactivate without deleting', async (t) => {
  await withApi(t, async (url, records) => {
    records.push({
      _id: '1',
      name: 'Banner',
      code: 'BNR-1',
      saleUnit: 'unit',
      price: 10,
      active: true,
      async save() { return this; },
    });

    const duplicate = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify({ name: 'Outro', code: 'BNR-1', saleUnit: 'unit', price: 10 }),
    });
    assert.equal(duplicate.status, 409);

    const deactivated = await fetch(`${url}/1/deactivate`, {
      method: 'PATCH',
      headers: { 'x-test-role': 'admin' },
    });
    assert.equal(deactivated.status, 200);
    assert.equal(records[0].active, false);

    const retained = await fetch(`${url}/1`, { headers: { 'x-test-role': 'admin' } });
    assert.equal(retained.status, 200);
  });
});
