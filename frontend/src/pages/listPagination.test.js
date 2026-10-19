import test from 'node:test';
import assert from 'node:assert/strict';
import { getDashboardPage, toggleSelectedOrder } from './listPagination.js';

test('Dashboard page slicing keeps full collection totals for metrics', () => {
  const items = Array.from({ length: 25 }, (_, index) => index);
  const result = getDashboardPage(items, 2, 10);

  assert.equal(result.items.length, 10);
  assert.equal(result.total, 25);
  assert.equal(items.length, 25);
});

test('selected Dashboard orders remain selected when navigating between pages', () => {
  const selected = toggleSelectedOrder([], 'order-11');
  getDashboardPage(Array.from({ length: 25 }, (_, index) => index), 2, 10);

  assert.deepEqual(selected, ['order-11']);
  assert.deepEqual(toggleSelectedOrder(selected, 'order-11'), []);
});
