import test from 'node:test';
import assert from 'node:assert/strict';

import { getOrderDocumentLabel, isConfirmedOrder } from './orderPresentation.js';

test('pending unpaid records are quotes, while approved records are orders', () => {
  assert.equal(getOrderDocumentLabel({ status: 'pendente', amountPaid: 0 }), 'Orçamento');
  assert.equal(getOrderDocumentLabel({ status: 'aprovado', amountPaid: 0 }), 'Pedido');
  assert.equal(isConfirmedOrder({ status: 'aprovado', amountPaid: 0 }), true);
});

test('legacy pending records with payments remain confirmed orders', () => {
  assert.equal(getOrderDocumentLabel({ status: 'pendente', amountPaid: 25 }), 'Pedido');
});
