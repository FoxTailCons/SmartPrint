import test from 'node:test';
import assert from 'node:assert/strict';
import { getPaymentPreference } from '../routes/clients.js';

test('client payment preference uses the latest recorded payment method', () => {
  const orders = [
    { createdAt: new Date('2026-10-19T12:00:00Z'), paymentMethod: 'dinheiro', payments: [] },
    { payments: [{ method: 'pix', paidAt: new Date('2026-10-20T12:00:00Z') }] },
    { payments: [{ method: 'debito', paidAt: new Date('2026-10-20T14:00:00Z') }] },
  ];
  assert.equal(getPaymentPreference(orders), 'debito');
  assert.equal(getPaymentPreference([]), '');
});
