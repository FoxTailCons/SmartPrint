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
