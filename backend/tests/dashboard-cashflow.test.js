import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCashflowTrend } from '../routes/dashboard.js';

test('buildCashflowTrend groups payment entries by day and month', () => {
  const today = new Date();
  const orders = [
    {
      status: 'aprovado',
      payments: [
        { amount: 200, paidAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9) },
        { amount: 150, paidAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 10) },
      ],
    },
    {
      status: 'concluido',
      history: [
        { action: 'pagamento', at: new Date(today.getFullYear(), today.getMonth() - 1, 10, 9), note: 'Recebido R$ 300,00 via pix' },
      ],
    },
  ];

  const trend = buildCashflowTrend(orders);

  assert.equal(trend.last7Days.length, 7);
  assert.equal(trend.last6Months.length, 6);
  assert.ok(trend.last7Days.some((entry) => entry.value >= 200));
  assert.ok(trend.last6Months.some((entry) => entry.value >= 300));
});

test('buildCashflowTrend groups an early UTC payment into its Sao Paulo calendar day', () => {
  const trend = buildCashflowTrend([{
    status: 'aprovado',
    payments: [
      { amount: 37, paidAt: new Date('2026-10-20T02:30:00.000Z') },
      { amount: 900, paidAt: new Date('2026-10-20T02:30:00.000Z'), canceledAt: new Date('2026-10-20T03:00:00.000Z') },
    ],
  }], new Date('2026-10-20T02:30:00.000Z'));

  assert.equal(trend.last7Days.find((entry) => entry.date.toISOString().slice(0, 10) === '2026-10-19').value, 37);
});
