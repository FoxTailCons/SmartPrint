import test from 'node:test';
import assert from 'node:assert/strict';

import ordersRouter, { createPaymentCancellationHandler } from '../routes/orders.js';

const orderId = '507f1f77bcf86cd799439011';
const firstPaymentId = '507f191e810c19729de860ea';
const secondPaymentId = '507f191e810c19729de860eb';
const firstInstallmentId = '507f191e810c19729de860ec';
const secondInstallmentId = '507f191e810c19729de860ed';
const admin = { _id: orderId, name: 'Admin', role: 'admin', active: true };
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const createOrder = (values = {}) => ({
  _id: orderId,
  number: '00014',
  finalValue: 100,
  amountPaid: 100,
  paymentStatus: 'quitado',
  payments: [{
    _id: firstPaymentId,
    amount: 40,
    method: 'pix',
    paidAt: new Date('2026-10-21T12:00:00Z'),
    installmentIds: [firstInstallmentId],
  }, {
    _id: secondPaymentId,
    amount: 60,
    method: 'dinheiro',
    paidAt: new Date('2026-10-22T12:00:00Z'),
    installmentIds: [secondInstallmentId],
  }],
  installments: [{
    _id: firstInstallmentId,
    amount: 40,
    paid: true,
    paidAt: new Date('2026-10-21T12:00:00Z'),
  }, {
    _id: secondInstallmentId,
    amount: 60,
    paid: true,
    paidAt: new Date('2026-10-22T12:00:00Z'),
  }],
  history: [],
  async save() { return this; },
  ...values,
});

const createHandler = (order, events = []) => createPaymentCancellationHandler({
  OrderModel: { findById: async () => order },
  AuditLogModel: { async create(event) { events.push(event); } },
});

const createRequest = (paymentId, body = {}, user = admin) => ({
  params: { id: orderId, paymentId },
  body: { reason: 'Lançamento incorreto', ...body },
  user,
});

test('estorno keeps payment history, recalculates balance and reopens only its installment', async () => {
  const order = createOrder();
  const events = [];
  const res = response();

  await createHandler(order, events)(createRequest(secondPaymentId), res);

  assert.equal(res.statusCode, 200);
  assert.equal(order.payments[1].canceledBy, 'Admin');
  assert.equal(order.payments[1].cancellationReason, 'Lançamento incorreto');
  assert.ok(order.payments[1].canceledAt instanceof Date);
  assert.equal(order.amountPaid, 40);
  assert.equal(order.paymentStatus, 'parcial');
  assert.deepEqual(order.installments.map(({ amount, paid }) => [amount, paid]), [[40, true], [60, false]]);
  assert.equal(order.history[0].action, 'pagamento_estornado');
  assert.equal(events[0].acao, 'pagamento.estornado');
  assert.equal(events[0].detalhes.valor, 60);
});

test('estornar o recebimento integral volta o pedido a aberto e não apaga o pagamento', async () => {
  const order = createOrder({
    amountPaid: 100,
    payments: [{
      _id: firstPaymentId,
      amount: 100,
      method: 'pix',
      installmentIds: [firstInstallmentId, secondInstallmentId],
    }],
  });
  const res = response();

  await createHandler(order)(createRequest(firstPaymentId), res);

  assert.equal(res.statusCode, 200);
  assert.equal(order.amountPaid, 0);
  assert.equal(order.paymentStatus, 'aberto');
  assert.equal(order.payments.length, 1);
  assert.equal(order.payments[0].canceledBy, 'Admin');
  assert.deepEqual(order.installments.map(({ paid }) => paid), [false, false]);
  assert.deepEqual(order.installments.map(({ amount }) => amount), [50, 50]);
});

test('estornar pagamento também desfaz o desconto aplicado no mesmo recebimento', async () => {
  const order = createOrder({
    finalValue: 100,
    amountPaid: 80,
    paymentStatus: 'quitado',
    payments: [{ _id: firstPaymentId, amount: 80, method: 'pix', installmentIds: [] }],
    paymentDiscounts: [{
      amount: 20,
      paymentId: firstPaymentId,
      authorizedBy: { userId: orderId, name: 'Admin' },
      by: 'Admin',
      reason: 'Ajuste',
    }],
    installments: [],
  });
  const res = response();

  await createHandler(order)(createRequest(firstPaymentId), res);

  assert.equal(res.statusCode, 200);
  assert.equal(order.paymentDiscounts[0].canceledAt, order.payments[0].canceledAt);
  assert.equal(order.paymentStatus, 'aberto');
});

test('estorno requires a reason and rejects a repeated cancellation', async () => {
  const order = createOrder();
  const handler = createHandler(order);
  const missingReason = response();
  await handler(createRequest(secondPaymentId, { reason: ' ' }), missingReason);
  assert.equal(missingReason.statusCode, 400);
  assert.equal(order.amountPaid, 100);

  order.payments[1].canceledAt = new Date();
  const repeated = response();
  await handler(createRequest(secondPaymentId), repeated);
  assert.equal(repeated.statusCode, 409);
  assert.equal(order.amountPaid, 100);
});

test('attendant estorno requires administrator authorization and audits failure', async () => {
  const order = createOrder();
  const events = [];
  const handler = createPaymentCancellationHandler({
    OrderModel: { findById: async () => order },
    UserModel: { findOne: () => ({ select: async () => null }) },
    AuditLogModel: { async create(event) { events.push(event); } },
  });
  const res = response();

  await handler(createRequest(secondPaymentId, {
    adminAuthorization: { email: 'admin@example.com', password: 'wrong' },
  }, { _id: 'attendant-id', name: 'Ana', role: 'atendente' }), res);

  assert.equal(res.statusCode, 401);
  assert.equal(order.amountPaid, 100);
  assert.equal(events[0].acao, 'pagamento.estornado');
  assert.equal(events[0].sucesso, false);
  assert.equal(JSON.stringify(events).includes('wrong'), false);
});

test('orders router exposes the authenticated payment cancellation route', () => {
  const route = ordersRouter.stack.find((layer) => layer.route?.path === '/:id/payments/:paymentId/cancel');
  assert.ok(route);
  assert.equal(route.route.methods.post, true);
  assert.ok(route.route.stack.length > 1);
});
