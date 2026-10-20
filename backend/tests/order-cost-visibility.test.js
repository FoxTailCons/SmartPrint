import test from 'node:test';
import assert from 'node:assert/strict';
import { hideOrderCosts } from '../services/orderCostVisibility.js';

test('order cost visibility removes nested item costs while preserving other values', () => {
  const paidAt = new Date('2026-10-20T12:00:00Z');
  const result = hideOrderCosts({
    number: '00001',
    items: [{ description: 'Banner', costUnitPrice: 10, unitPrice: 20 }],
    payments: [{ amount: 5, paidAt }],
  });

  assert.deepEqual(result, {
    number: '00001',
    items: [{ description: 'Banner', unitPrice: 20 }],
    payments: [{ amount: 5, paidAt }],
  });
  assert.equal(result.payments[0].paidAt, paidAt);
});
