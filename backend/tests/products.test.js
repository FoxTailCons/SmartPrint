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

test('Product accepts supported categories and leaves legacy categories optional', async () => {
  await new Product({ name: 'Cópia', saleUnit: 'unit', price: 1, category: 'xerox_impressao' }).validate();
  await new Product({ name: 'Legado', saleUnit: 'unit', price: 1 }).validate();
  await assert.rejects(new Product({ name: 'Inválido', saleUnit: 'unit', price: 1, category: 'outros' }).validate());
});

test('Product rejects unsupported sale units and invalid prices', async () => {
  for (const [saleUnit, price] of [['piece', 10], ['unit', -1], ['unit', Infinity], ['unit', NaN]]) {
    const product = new Product({ name: 'Produto', saleUnit, price });
    await assert.rejects(product.validate());
  }
});

test('Product accepts optional nonnegative finite costs and kilometer units', async () => {
  await new Product({ name: 'Deslocamento', saleUnit: 'kilometer', price: 4.5, costPrice: 2 }).validate();
  await new Product({ name: 'Cópia sem custo', saleUnit: 'unit', price: 1 }).validate();
  for (const costPrice of [-1, Infinity, NaN]) {
    await assert.rejects(new Product({ name: 'Inválido', saleUnit: 'unit', price: 1, costPrice }).validate());
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
  const matches = (entry, filter) => Object.entries(filter).every(([field, condition]) => {
    if (field === '$and') return condition.every((part) => matches(entry, part));
    if (field === '$or') return condition.some((part) => matches(entry, part));
    if (condition && typeof condition === 'object' && '$exists' in condition) return (field in entry) === condition.$exists;
    if (condition && typeof condition === 'object' && '$regex' in condition) return new RegExp(condition.$regex, condition.$options).test(String(entry[field] || ''));
    if (condition === null) return entry[field] === null || entry[field] === undefined;
    return entry[field] === condition;
  });

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
      let matching = records.filter((entry) => matches(entry, filter));
      return {
        sort(order) {
          const [[field, direction]] = Object.entries(order);
          matching.sort((left, right) => left[field].localeCompare(right[field]) * direction);
          return this;
        },
        skip(value) { matching = matching.slice(value); return this; },
        limit(value) { matching = matching.slice(0, value); return this; },
        then(resolve, reject) { return Promise.resolve(matching).then(resolve, reject); },
      };
    }

    static countDocuments(filter) {
      return Promise.resolve(records.filter((entry) => matches(entry, filter)).length);
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
    records.push({ _id: '1', name: 'Ativo', code: undefined, saleUnit: 'unit', price: 5, costPrice: 2, active: true });
    records.push({ _id: '2', name: 'Inativo', code: undefined, saleUnit: 'unit', price: 5, active: false });

    const unauthenticated = await fetch(url);
    assert.equal(unauthenticated.status, 401);

    const regular = await fetch(url, { headers: { 'x-test-role': 'atendente' } });
    assert.equal(regular.status, 200);
    assert.deepEqual((await regular.json()).map((product) => product.name), ['Ativo']);
    assert.equal((await (await fetch(url, { headers: { 'x-test-role': 'atendente' } })).json())[0].costPrice, undefined);

    const admin = await fetch(`${url}?includeInactive=true`, { headers: { 'x-test-role': 'admin' } });
    const adminProducts = await admin.json();
    assert.deepEqual(adminProducts.map((product) => product.name), ['Ativo', 'Inativo']);
    assert.equal(adminProducts[0].costPrice, 2);
    const paginatedRegular = await fetch(`${url}?page=1&pageSize=1`, { headers: { 'x-test-role': 'atendente' } });
    assert.equal((await paginatedRegular.json()).items[0].costPrice, undefined);
  });

  test('product route filters before pagination and rejects invalid page values', async (t) => {
    await withApi(t, async (url, records) => {
      records.push(
        { _id: '1', name: 'Adesivo', code: undefined, saleUnit: 'unit', price: 5, active: true },
        { _id: '2', name: 'Banner', code: undefined, saleUnit: 'unit', price: 5, active: true },
        { _id: '3', name: 'Caderno', code: undefined, saleUnit: 'unit', price: 5, active: true }
      );
      const headers = { 'x-test-role': 'admin' };

      const paginated = await fetch(`${url}?q=o&page=2&pageSize=1`, { headers });
      assert.equal(paginated.status, 200);
      assert.deepEqual(await paginated.json(), {
        items: [{ _id: '3', name: 'Caderno', saleUnit: 'unit', price: 5, active: true }],
        page: 2,
        pageSize: 1,
        total: 2,
      });

      const invalid = await fetch(`${url}?page=1.5`, { headers });
      assert.equal(invalid.status, 400);
    });
  });
});

test('product routes filter by category while keeping uncategorized legacy products available', async (t) => {
  await withApi(t, async (url, records) => {
    records.push(
      { _id: '1', name: 'Cópia', category: 'xerox_impressao', saleUnit: 'unit', price: 1, active: true },
      { _id: '2', name: 'Banner', category: 'grande_formato', saleUnit: 'square_meter', price: 50, active: true },
      { _id: '3', name: 'Produto legado', saleUnit: 'unit', price: 2, active: true }
    );
    const headers = { 'x-test-role': 'admin' };

    const category = await fetch(`${url}?category=xerox_impressao`, { headers });
    assert.deepEqual((await category.json()).map(({ name }) => name), ['Cópia']);

    const uncategorized = await fetch(`${url}?category=sem_categoria`, { headers });
    assert.deepEqual((await uncategorized.json()).map(({ name }) => name), ['Produto legado']);

    const combined = await fetch(`${url}?category=xerox_impressao&q=c&page=1&pageSize=1`, { headers });
    assert.equal(combined.status, 200);
    assert.deepEqual((await combined.json()).items.map(({ name }) => name), ['Cópia']);

    const invalid = await fetch(`${url}?category=desconhecida`, { headers });
    assert.equal(invalid.status, 400);
  });
});

test('product routes create and update products only for administrators', async (t) => {
  await withApi(t, async (url) => {
    const payload = { name: '  Banner  ', code: 'BNR-1', saleUnit: 'square_meter', price: 95, costPrice: 40, imageUrl: 'https://example.test/material.jpg', category: 'grande_formato' };
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
    assert.equal(product.costPrice, 40);
    assert.equal(product.imageUrl, 'https://example.test/material.jpg');
    assert.equal(product.category, 'grande_formato');

    const updated = await fetch(`${url}/${product._id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify({ ...payload, name: 'Banner atualizado', price: 105 }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).price, 105);
    assert.equal((await fetch(`${url}/${product._id}`, { headers: { 'x-test-role': 'admin' } }).then((response) => response.json())).costPrice, 40);

    const clearedCost = await fetch(`${url}/${product._id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify({ ...payload, costPrice: null, imageUrl: '', name: 'Banner atualizado', price: 105 }),
    });
    assert.equal(clearedCost.status, 200);
    assert.equal((await clearedCost.json()).costPrice, undefined);

    const uncategorized = await fetch(`${url}/${product._id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify({ ...payload, category: '', name: 'Banner sem categoria' }),
    });
    assert.equal(uncategorized.status, 200);
    assert.equal((await uncategorized.json()).category, undefined);
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
