import test from 'node:test';
import assert from 'node:assert/strict';
import * as csv from '../services/csvExport.js';
import exportsRouter from '../routes/exports.js';

test('export date range uses inclusive Sao Paulo civil dates and exclusive next-day bound', () => {
  assert.equal(typeof csv.parseExportDateRange, 'function');
  const range = csv.parseExportDateRange({ from: '2026-10-20', to: '2026-10-20' });
  assert.equal(range.start.toISOString(), '2026-10-20T03:00:00.000Z');
  assert.equal(range.endExclusive.toISOString(), '2026-10-21T03:00:00.000Z');
});

test('export date range rejects missing, impossible, or reversed dates', () => {
  assert.equal(typeof csv.parseExportDateRange, 'function');
  for (const query of [
    { from: '2026-10-20' },
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '0000-00-00', to: '0000-01-01' },
    { from: '2026-10-21', to: '2026-10-20' },
  ]) {
    assert.throws(() => csv.parseExportDateRange(query), (error) => error.statusCode === 400);
  }
});

test('CSV cells quote delimiters and neutralize formula-leading text', () => {
  assert.equal(typeof csv.escapeCsvCell, 'function');
  assert.equal(csv.escapeCsvCell('=1+1'), '"\'=1+1"');
  assert.equal(csv.escapeCsvCell(' \t=1+1'), '"\' \t=1+1"');
  assert.equal(csv.escapeCsvCell('a;b "c"\nç'), '"a;b ""c""\nç"');
  assert.equal(csv.escapeCsvCell(-12.5), '"-12.5"');
  assert.ok(csv.toCsvFile([['name', 'Nome']], [{ name: 'João' }]).startsWith('\uFEFF'));
});

test('financial movements include payment records, legacy payments, paid bills and withdrawals', () => {
  assert.equal(typeof csv.buildFinanceExportRows, 'function');
  const rows = csv.buildFinanceExportRows({
    from: new Date('2026-10-20T03:00:00.000Z'),
    endExclusive: new Date('2026-10-21T03:00:00.000Z'),
    orders: [
      {
        number: '00001',
        paymentMethod: 'pix',
        payments: [
          { amount: 50, method: 'pix', paidAt: new Date('2026-10-20T12:00:00Z') },
          { amount: 900, method: 'pix', paidAt: new Date('2026-10-20T12:00:00Z'), canceledAt: new Date('2026-10-20T12:05:00Z') },
        ],
      },
      {
        number: '00002',
        paymentMethod: 'dinheiro',
        payments: [],
        history: [{ action: 'pagamento', paymentMethod: 'dinheiro', note: 'Recebido R$ 15,00', at: new Date('2026-10-20T13:00:00Z') }],
      },
      {
        number: '00003',
        status: 'cancelado',
        payments: [{ amount: 100, method: 'pix', paidAt: new Date('2026-10-20T13:30:00Z') }],
      },
    ],
    payables: [{ description: 'Insumo', value: 20, category: 'insumo', paid: true, paidAt: new Date('2026-10-20T14:00:00Z') }],
    sessions: [{
      dateKey: '2026-10-20',
      supplies: [{ amount: 10, note: 'Troco', createdAt: new Date('2026-10-20T14:30:00Z') }],
      withdrawals: [{ amount: 5, note: 'Compra urgente', createdAt: new Date('2026-10-20T15:00:00Z') }],
    }],
  });
  assert.deepEqual(rows.map((row) => [row.type, row.amount, row.method]), [
    ['Recebimento', 50, 'pix'],
    ['Recebimento', 15, 'dinheiro'],
    ['Conta paga', 20, ''],
    ['Suprimento', 10, 'dinheiro'],
    ['Sangria', 5, 'dinheiro'],
  ]);
});

test('order export rows summarize commercial fields without any cost fields', () => {
  assert.equal(typeof csv.buildOrderExportRows, 'function');
  const [row] = csv.buildOrderExportRows([{
    number: '00003',
    createdAt: new Date('2026-10-20T12:00:00Z'),
    client: { name: '=cliente', phone: '11999999999' },
    items: [{ description: 'Banner', quantity: 2, unitPrice: 25, costUnitPrice: 10 }],
    finalValue: 50,
    amountPaid: 20,
    status: 'aprovado',
    production: 'em_producao',
    productionStage: 'impressao',
    deliveryDate: '2026-10-25',
    costUnitPrice: 10,
  }]);
  assert.equal(row.client, '=cliente');
  assert.equal(row.items, 'Banner (2)');
  assert.equal(row.balance, 30);
  assert.equal('costUnitPrice' in row, false);
});

test('payment discounts reduce exported balance while remaining separate from receipts', () => {
  const [row] = csv.buildOrderExportRows([{
    number: '00004',
    finalValue: 100,
    amountPaid: 20,
    paymentDiscounts: [{ amount: 30 }],
  }]);

  assert.equal(row.received, 20);
  assert.equal(row.paymentDiscounts, 30);
  assert.equal(row.balance, 50);
});

test('exports router defines authenticated order and finance downloads', () => {
  assert.ok(exportsRouter.stack.some((layer) => layer.route?.path === '/orders' && layer.route.methods.get));
  assert.ok(exportsRouter.stack.some((layer) => layer.route?.path === '/finance' && layer.route.methods.get));
});
