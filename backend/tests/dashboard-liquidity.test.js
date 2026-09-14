import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCashflowSummary } from '../routes/dashboard.js';

test('buildCashflowSummary calculates net cash from receivables and payables', () => {
  const orders = [
    { finalValue: 1000, amountPaid: 400 },
    { finalValue: 600, amountPaid: 600 },
  ];
  const payables = [
    { value: 250, paid: false },
    { value: 100, paid: true },
  ];

  const summary = buildCashflowSummary(orders, payables);

  assert.equal(summary.receivables, 600);
  assert.equal(summary.payables, 250);
  assert.equal(summary.netCash, 350);
});
