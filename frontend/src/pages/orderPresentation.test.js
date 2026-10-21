import test from 'node:test';
import assert from 'node:assert/strict';

import { getOrderDocumentLabel, isConfirmedOrder, roundOrderTotalUp } from './orderPresentation.js';

test('pending unpaid records are quotes, while approved records are orders', () => {
  assert.equal(getOrderDocumentLabel({ status: 'pendente', amountPaid: 0 }), 'Orçamento');
  assert.equal(getOrderDocumentLabel({ status: 'aprovado', amountPaid: 0 }), 'Pedido');
  assert.equal(isConfirmedOrder({ status: 'aprovado', amountPaid: 0 }), true);
});

test('legacy pending records with payments remain confirmed orders', () => {
  assert.equal(getOrderDocumentLabel({ status: 'pendente', amountPaid: 25 }), 'Pedido');
});

test('cancelled records are never treated as confirmed orders', () => {
  assert.equal(isConfirmedOrder({ status: 'cancelado', amountPaid: 25 }), false);
  assert.equal(getOrderDocumentLabel({ status: 'cancelado', amountPaid: 0 }), 'Cancelado');
});

test('order total rounds up fractional reais after discount and leaves whole reais unchanged', () => {
  assert.equal(roundOrderTotalUp(10.25), 11);
  assert.equal(roundOrderTotalUp(10.25, 0.25), 10);
  assert.equal(roundOrderTotalUp(10), 10);
  assert.equal(roundOrderTotalUp(0.25, 1), 0);
});
