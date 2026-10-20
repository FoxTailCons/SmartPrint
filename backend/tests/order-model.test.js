import test from 'node:test';
import assert from 'node:assert/strict';

import Order from '../models/Order.js';

test('Order rejects a down payment greater than the order total', async () => {
  const order = new Order({
    number: '10001',
    items: [{ description: 'Impressão', quantity: 1, unitPrice: 100 }],
    downPayment: 100.01,
  });

  await assert.rejects(order.validate(), /Entrada não pode ser maior que o total do pedido/);
});

test('Order rounds a fractional final value up to the next whole real', async () => {
  const order = new Order({
    number: '10002',
    client: null,
    items: [{ description: 'Foto cópia', quantity: 1, unitPrice: 10.25 }],
  });

  await order.validate();

  assert.equal(order.totalValue, 10.25);
  assert.equal(order.finalValue, 11);
  assert.equal(order.client, null);
});
