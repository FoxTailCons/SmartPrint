import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCashReport, getSaoPauloDateKey, getSaoPauloDayRange, isValidDateKey } from '../routes/cash.js';

test('cash report groups actual payments by method, applies opening and sangria to cash', () => {
  const dateKey = '2026-10-20';
  const { start, end } = getSaoPauloDayRange(dateKey);
  const report = buildCashReport({
    openingAmount: 100,
    withdrawals: [{ amount: 20 }],
    counted: { dinheiro: 130, pix: 55, debito: 30, credito: 0, parcelado: 0 },
  }, [{
    payments: [
      { amount: 50, method: 'dinheiro', paidAt: new Date(start.getTime() + 1000) },
      { amount: 50, method: 'pix', paidAt: new Date(start.getTime() + 1000) },
      { amount: 30, method: 'debito', paidAt: new Date(end.getTime() - 1000) },
      { amount: 99, method: 'credito', paidAt: end },
    ],
  }], dateKey);

  assert.deepEqual(report.inflows, { dinheiro: 50, pix: 50, debito: 30, credito: 0, parcelado: 0 });
  assert.equal(report.expected.dinheiro, 130);
  assert.equal(report.expected.pix, 50);
  assert.equal(report.differences.dinheiro, 0);
  assert.equal(report.differences.pix, 5);
  assert.equal(report.differences.debito, 0);
});

test('cash business date follows Sao Paulo time', () => {
  assert.equal(getSaoPauloDateKey(new Date('2026-10-20T02:59:00Z')), '2026-10-19');
  assert.equal(getSaoPauloDateKey(new Date('2026-10-20T03:00:00Z')), '2026-10-20');
  assert.equal(isValidDateKey('2026-02-30'), false);
  assert.equal(isValidDateKey('2026-02-28'), true);
});

test('cash report reads legacy payment events when no payment list exists', () => {
  const dateKey = '2026-10-20';
  const { start } = getSaoPauloDayRange(dateKey);
  const report = buildCashReport({ openingAmount: 0, withdrawals: [] }, [{
    payments: [],
    history: [{ action: 'pagamento', paymentMethod: 'pix', note: 'Recebido R$ 12,50 via pix', at: start }],
  }], dateKey);
  assert.equal(report.inflows.pix, 12.5);
});

test('closing snapshot remains stable after later payments are recorded', () => {
  const dateKey = '2026-10-20';
  const session = {
    status: 'closed',
    openingAmount: 100,
    withdrawals: [],
    inflows: { dinheiro: 20, pix: 5, debito: 0, credito: 0, parcelado: 0 },
    expected: { dinheiro: 120, pix: 5, debito: 0, credito: 0, parcelado: 0 },
    counted: { dinheiro: 120, pix: 5, debito: 0, credito: 0, parcelado: 0 },
    differences: { dinheiro: 0, pix: 0, debito: 0, credito: 0, parcelado: 0 },
  };
  const report = buildCashReport(session, [{ payments: [{ amount: 500, method: 'pix', paidAt: new Date('2026-10-20T15:00:00Z') }] }], dateKey);
  assert.equal(report.inflows.pix, 5);
  assert.equal(report.expected.dinheiro, 120);
});
