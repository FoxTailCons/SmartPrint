import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCashflowSummary,
  buildClientPerformance,
  buildServicePerformance,
  buildServiceMargins,
  filterActiveProductionOrders,
  filterOrdersForDashboard,
  buildMonthlyComparison,
  buildDailyUrgencies,
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

test('payment discounts reduce outstanding dashboard balances without increasing received cash', () => {
  const discountedOrder = {
    status: 'aprovado',
    client: { name: 'Maria' },
    finalValue: 100,
    amountPaid: 20,
    paymentDiscounts: [{ amount: 30 }],
  };

  assert.equal(buildCashflowSummary([discountedOrder]).receivables, 50);
  assert.deepEqual(buildClientPerformance([discountedOrder]), [{
    name: 'Maria', revenue: 100, orders: 1, outstanding: 50,
  }]);
});

test('buildCashflowSummary excludes unapproved quotes but preserves legacy received orders', () => {
  const summary = buildCashflowSummary([
    { status: 'pendente', finalValue: 500, amountPaid: 0 },
    { status: 'aprovado', finalValue: 200, amountPaid: 50 },
    { status: 'pendente', finalValue: 100, amountPaid: 30 },
    { status: 'cancelado', finalValue: 100, amountPaid: 30 },
  ]);

  assert.equal(summary.receivables, 220);
});

test('active production counts exclude canceled orders with leftover production state', () => {
  const active = filterActiveProductionOrders([
    { status: 'aprovado', production: 'em_producao' },
    { status: 'aprovado', production: 'pausado' },
    { status: 'cancelado', production: 'em_producao' },
  ]);

  assert.equal(active.inProduction.length, 1);
  assert.equal(active.paused.length, 1);
});

test('buildDailyUrgencies includes due open payables and active approved orders requiring attention', () => {
  const now = new Date('2026-04-17T15:00:00-03:00');
  const { payables, orders } = buildDailyUrgencies([
    { _id: 'overdue', number: 1, status: 'aprovado', deliveryDate: '2026-04-16', priority: 'normal' },
    { _id: 'urgent', number: 2, status: 'aprovado', deliveryDate: '2026-04-20', priority: 'urgente' },
    { _id: 'today', number: 3, status: 'aprovado', deliveryDate: '2026-04-17', priority: 'normal' },
    { _id: 'high', number: 4, status: 'aprovado', priority: 'alta' },
    { _id: 'future', number: 5, status: 'aprovado', deliveryDate: '2026-04-18', priority: 'normal' },
    { _id: 'quote', number: 6, status: 'pendente', priority: 'urgente' },
    { _id: 'completed', number: 7, status: 'concluido', priority: 'urgente' },
    { _id: 'delivered', number: 8, status: 'aprovado', productionStage: 'entregue', priority: 'urgente' },
    { _id: 'quick-sale', number: 9, status: 'aprovado', quickSaleKey: 'sale-1', priority: 'urgente' },
  ], [
    { _id: 'payable-overdue', description: 'Vencida', dueDate: '2026-04-16', value: 10, paid: false },
    { _id: 'payable-today', description: 'Hoje', dueDate: '2026-04-17', value: 20, paid: false },
    { _id: 'payable-future', description: 'Futura', dueDate: '2026-04-18', value: 30, paid: false },
    { _id: 'payable-paid', description: 'Paga', dueDate: '2026-04-16', value: 40, paid: true },
  ], now);

  assert.deepEqual(payables.map((payable) => [payable._id, payable.urgency]), [
    ['payable-overdue', 'overdue'],
    ['payable-today', 'today'],
  ]);
  assert.deepEqual(orders.map((order) => [order._id, order.urgency]), [
    ['overdue', 'overdue'],
    ['urgent', 'urgente'],
    ['today', 'today'],
    ['high', 'alta'],
  ]);
});

test('buildDailyUrgencies keeps a UTC-midnight payable due today out of overdue status', () => {
  const { payables } = buildDailyUrgencies([], [
    { _id: 'due-today', dueDate: new Date('2026-04-17T00:00:00.000Z'), paid: false },
  ], new Date('2026-04-17T15:00:00-03:00'));

  assert.equal(payables[0].urgency, 'today');
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
