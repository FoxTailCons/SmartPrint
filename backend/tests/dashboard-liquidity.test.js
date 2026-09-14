import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCashflowSummary,
  buildClientPerformance,
  buildServicePerformance,
} from '../routes/dashboard.js';

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

test('buildClientPerformance groups revenue by customer and keeps no-client orders', () => {
  const orders = [
    { client: { name: 'Maria' }, finalValue: 1000, amountPaid: 400 },
    { client: { name: 'Maria' }, finalValue: 300, amountPaid: 100 },
    { client: null, finalValue: 500, amountPaid: 0 },
  ];

  const clients = buildClientPerformance(orders);

  assert.deepEqual(clients[0], { name: 'Maria', revenue: 1300, orders: 2, outstanding: 800 });
  assert.deepEqual(clients[1], { name: 'Cliente não cadastrado', revenue: 500, orders: 1, outstanding: 500 });
});

test('buildServicePerformance groups item totals by service type', () => {
  const orders = [
    { items: [{ description: 'Banner grande formato', total: 900 }, { description: 'Adesivo para vidro', total: 300 }] },
    { items: [{ description: 'Papel fotográfico A4', total: 250 }] },
  ];

  const services = buildServicePerformance(orders);

  assert.deepEqual(services[0], { name: 'Banner / sinalização', revenue: 1200, orders: 1 });
  assert.deepEqual(services[1], { name: 'Impressão / papel', revenue: 250, orders: 1 });
});
