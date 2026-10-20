import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildOrderDocumentLabel, buildOrderPdfBuffer, canReceivePayments, initializeNewOrder } from '../routes/orders.js';

test('paid orders keep the Pedido title instead of becoming receipts', () => {
  assert.equal(buildOrderDocumentLabel({ amountPaid: 25 }), 'Pedido');
});

test('approved orders are labeled Pedido before their first payment', () => {
  assert.equal(buildOrderDocumentLabel({ status: 'aprovado', amountPaid: 0 }), 'Pedido');
});

test('pending unpaid orders keep the Orçamento title', () => {
  assert.equal(buildOrderDocumentLabel({ status: 'pendente', amountPaid: 0 }), 'Orçamento');
});

test('legacy pending orders with payments keep the Pedido title', () => {
  assert.equal(buildOrderDocumentLabel({ status: 'pendente', amountPaid: 25 }), 'Pedido');
});

test('new payments are only allowed after order approval', () => {
  assert.equal(canReceivePayments({ status: 'pendente' }), false);
  assert.equal(canReceivePayments({ status: 'aprovado' }), true);
  assert.equal(canReceivePayments({ status: 'concluido' }), true);
});

test('quick orders without a client are approved immediately and record a configured entry once', () => {
  const order = {
    client: null,
    status: 'pendente',
    downPayment: 5,
    amountPaid: 0,
    finalValue: 11,
    paymentMethod: 'pix',
    payments: [],
    installments: [],
    history: [],
  };

  initializeNewOrder(order, { quickOrder: true, userName: 'Atendente' });

  assert.equal(order.status, 'aprovado');
  assert.equal(order.client, null);
  assert.equal(order.amountPaid, 5);
  assert.equal(order.payments.length, 1);
  assert.equal(order.payments[0].type, 'entrada');
  assert.deepEqual(order.history.map(({ action }) => action), ['criado', 'aprovado', 'pagamento']);
});

test('regular orders stay pending when initialized without quick-order mode', () => {
  const order = { status: 'pendente', history: [] };

  initializeNewOrder(order, { userName: 'Atendente' });

  assert.equal(order.status, 'pendente');
  assert.deepEqual(order.history.map(({ action }) => action), ['criado']);
});

test('buildOrderPdfBuffer should return a PDF buffer for a valid order', async () => {
  const order = {
    number: '00042',
    client: { name: 'Maria Silva', phone: '(11) 99999-9999' },
    items: [
      { description: 'Banner 1x2m', quantity: 2, unitPrice: 120, total: 240 },
      { description: 'Adesivo 20cm', quantity: 10, unitPrice: 8, total: 80 },
    ],
    totalValue: 320,
    discount: 20,
    finalValue: 300,
    paymentMethod: 'pix',
    observations: 'Entrega em 3 dias',
    createdAt: new Date('2026-01-15T12:00:00Z'),
    deliveryDate: new Date('2026-01-18T12:00:00Z'),
    status: 'pendente',
    paymentStatus: 'aberto',
  };

  const buffer = await buildOrderPdfBuffer(order);

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 1000);
  assert.match(buffer.toString('latin1'), /PDF/);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartprint-pdf-'));
  const filePath = path.join(tmpDir, 'test-order.pdf');
  fs.writeFileSync(filePath, buffer);
  assert.ok(fs.existsSync(filePath));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
