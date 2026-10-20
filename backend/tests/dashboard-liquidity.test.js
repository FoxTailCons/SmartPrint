import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCashflowSummary,
  buildClientPerformance,
  buildServicePerformance,
  buildServiceMargins,
  filterOrdersForDashboard,
  buildMonthlyComparison,
} from '../routes/dashboard.js';

test('buildCashflowSummary calculates net cash from receivables and payables', () => {
  const orders = [
    { status: 'aprovado', finalValue: 1000, amountPaid: 400 },
    { status: 'concluido', finalValue: 600, amountPaid: 600 },
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

test('buildCashflowSummary excludes unapproved quotes but preserves legacy received orders', () => {
  const summary = buildCashflowSummary([
    { status: 'pendente', finalValue: 500, amountPaid: 0 },
    { status: 'aprovado', finalValue: 200, amountPaid: 50 },
    { status: 'pendente', finalValue: 100, amountPaid: 30 },
  ]);

  assert.equal(summary.receivables, 220);
});

test('buildClientPerformance groups revenue by customer and keeps no-client orders', () => {
  const orders = [
    { status: 'aprovado', client: { name: 'Maria' }, finalValue: 1000, amountPaid: 400 },
    { status: 'concluido', client: { name: 'Maria' }, finalValue: 300, amountPaid: 100 },
    { status: 'aprovado', client: null, finalValue: 500, amountPaid: 0 },
    { status: 'pendente', client: { name: 'Pedro' }, finalValue: 900, amountPaid: 0 },
  ];

  const clients = buildClientPerformance(orders);

  assert.deepEqual(clients[0], { name: 'Maria', revenue: 1300, orders: 2, outstanding: 800 });
  assert.deepEqual(clients[1], { name: 'Cliente não cadastrado', revenue: 500, orders: 1, outstanding: 500 });
});

test('buildServicePerformance groups item totals by service type', () => {
  const orders = [
    { status: 'aprovado', items: [{ description: 'Banner grande formato', total: 900 }, { description: 'Adesivo para vidro', total: 300 }] },
    { status: 'concluido', items: [{ description: 'Papel fotográfico A4', total: 250 }] },
    { status: 'pendente', items: [{ description: 'Banner aguardando aprovação', total: 1200 }] },
  ];

  const services = buildServicePerformance(orders);

  assert.deepEqual(services[0], { name: 'Banner / sinalização', revenue: 1200, orders: 1 });
  assert.deepEqual(services[1], { name: 'Impressão / papel', revenue: 250, orders: 1 });
});

test('buildServiceMargins uses saved item costs, allocates discounts, and flags missing costs', () => {
  const margins = buildServiceMargins([
    {
      status: 'aprovado',
      finalValue: 90,
      items: [
        { category: 'grande_formato', total: 100, quantity: 2, costUnitPrice: 20 },
        { category: 'grande_formato', total: 50, quantity: 1 },
      ],
    },
    {
      status: 'pendente',
      finalValue: 200,
      items: [{ category: 'grande_formato', total: 200, quantity: 1, costUnitPrice: 50 }],
    },
  ]);

  assert.deepEqual(margins, [{
    category: 'grande_formato',
    name: 'Grande formato',
    revenue: 90,
    cost: 40,
    profit: 50,
    marginPct: null,
    items: 2,
    itemsWithoutCost: 1,
    costCoveragePct: 50,
  }]);
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
    { status: 'aprovado', createdAt: currentMonth, finalValue: 250, amountPaid: 200 },
    { status: 'aprovado', createdAt: previousMonth, finalValue: 400, amountPaid: 150 },
    { status: 'concluido', createdAt: olderMonth, finalValue: 500, amountPaid: 500 },
    { status: 'pendente', createdAt: currentMonth, finalValue: 1000, amountPaid: 0 },
  ];

  const comparison = buildMonthlyComparison(orders);

  assert.equal(comparison.length, 6);
  assert.equal(comparison[comparison.length - 1].revenue, 250);
  assert.equal(comparison[comparison.length - 2].received, 150);
});
