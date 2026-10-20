import test from 'node:test';
import assert from 'node:assert/strict';
import { filterQuickOrderProducts, normalizeQuickOrderProducts } from './quickOrderProducts.js';

const products = [
  { _id: '1', name: 'Cópia A4', saleUnit: 'unit', active: true },
  { _id: '2', name: 'Banner', code: 'BAN-01', saleUnit: 'square_meter', active: true },
  { _id: '3', name: 'Foto Cópia', code: 'XER-02', saleUnit: 'unit', active: true },
  { _id: '4', name: 'Cópia inativa', saleUnit: 'unit', active: false },
];

test('quick-order product list accepts both array and paginated API responses', () => {
  assert.deepEqual(normalizeQuickOrderProducts(products), [products[0], products[2]]);
  assert.deepEqual(normalizeQuickOrderProducts({ items: products, page: 1, pageSize: 20, total: 4 }), [products[0], products[2]]);
});

test('quick-order product search matches product names and codes case-insensitively', () => {
  const eligible = normalizeQuickOrderProducts(products);
  assert.deepEqual(filterQuickOrderProducts(eligible, 'foto'), [products[2]]);
  assert.deepEqual(filterQuickOrderProducts(eligible, 'xer-02'), [products[2]]);
  assert.deepEqual(filterQuickOrderProducts(eligible, ''), eligible);
});

test('quick-order product list rejects unrecognized API response shapes', () => {
  assert.throws(() => normalizeQuickOrderProducts({ products }), /lista de produtos inválida/);
});
