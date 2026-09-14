import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCashflowSummary,
  buildClientPerformance,
  buildServicePerformance,
  filterOrdersForDashboard,
  buildMonthlyComparison,
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

test('filterOrdersForDashboard supports client and period filtering', () => {
  const today = new Date();
  const older = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 40);
  const recent = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
  const sameClient = { _id: 'c1', name: 'Maria' };
  const anotherClient = { _id: 'c2', name: 'João' };

  const orders = [
    { client: sameClient, finalValue: 100, amountPaid: 10, createdAt: recent },
    { client: sameClient, finalValue: 200, amountPaid: 80, createdAt: older },
    { client: anotherClient, finalValue: 300, amountPaid: 50, createdAt: recent },
  ];

  const filtered = filterOrdersForDashboard(orders, { clientId: 'c1', period: '30d' });

  assert.deepEqual(filtered.map((order) => order.finalValue), [100]);
});

test('buildMonthlyComparison sums revenue and receipts by month for the last six months', () => {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 5);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 12);
  const olderMonth = new Date(now.getFullYear(), now.getMonth() - 2, 15);

  const orders = [
    { createdAt: currentMonth, finalValue: 250, amountPaid: 200 },
    { createdAt: previousMonth, finalValue: 400, amountPaid: 150 },
    { createdAt: olderMonth, finalValue: 500, amountPaid: 500 },
  ];

  const comparison = buildMonthlyComparison(orders);

  assert.equal(comparison.length, 6);
  assert.equal(comparison[comparison.length - 1].revenue, 250);
  assert.equal(comparison[comparison.length - 2].received, 150);
});
