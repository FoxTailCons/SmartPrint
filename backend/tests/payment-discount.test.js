import test from 'node:test';
import assert from 'node:assert/strict';
import Order from '../models/Order.js';
import { createPaymentHandler } from '../routes/orders.js';
import { getOrderBalance } from '../services/orderBalance.js';
import { recalculateUnpaidInstallments } from '../services/orderInstallments.js';

const createResponse = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const createOrder = ({ saveError } = {}) => ({
  _id: '507f1f77bcf86cd799439011',
  finalValue: 100,
  amountPaid: 0,
  status: 'aprovado',
  paymentStatus: 'aberto',
  paymentMethod: 'pix',
  payments: [],
  paymentDiscounts: [],
  installments: [],
  history: [],
  async save() {
    if (saveError) throw saveError;
    return this;
  },
});

const createOrderModel = (order) => ({ findById: async () => order });
const activeAdmin = {
  _id: 'admin-id',
  name: 'Admin',
  role: 'admin',
  active: true,
  async matchPassword() { return true; },
};
const attendant = { _id: 'attendant-id', name: 'Ana', role: 'atendente', active: true };
const production = { _id: 'production-id', name: 'Bia', role: 'producao', active: true };

const createAdminModel = (admin) => ({
  findOne() {
    return { select: async () => admin };
  },
});

const createHandler = (options = {}) => createPaymentHandler({
  AuditLogModel: { async create() {} },
  ...options,
});

const createRequest = (user, body = {}) => ({
  params: { id: '507f1f77bcf86cd799439011' },
  body: { amount: 10, ...body },
  user,
});

test('payment discount balance subtracts actual receipts and all recorded discounts without going negative', () => {
  assert.equal(getOrderBalance({ finalValue: 100, amountPaid: 60, paymentDiscounts: [{ amount: 10 }, { amount: 40 }] }), 0);
  assert.equal(getOrderBalance({ finalValue: 100, amountPaid: 60, paymentDiscounts: [{ amount: 40, canceledAt: new Date() }] }), 40);
  assert.equal(getOrderBalance({ finalValue: 100, amountPaid: 35 }), 65);
});

test('payment discount zero preserves the legacy receipt amount and cash balance', async () => {
  const order = createOrder();
  const handler = createHandler({ OrderModel: createOrderModel(order) });
  const res = createResponse();

  await handler(createRequest(activeAdmin, { discount: 0 }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(order.amountPaid, 10);
  assert.deepEqual(order.payments.map(({ amount }) => amount), [10]);
  assert.deepEqual(order.paymentDiscounts, []);
  assert.equal(getOrderBalance(order), 90);
});

test('a payment that brings the remaining balance to zero is marked quitado', async () => {
  const order = createOrder();
  order.amountPaid = 90;
  order.payments.push({ amount: 90, method: 'pix' });
  const handler = createHandler({ OrderModel: createOrderModel(order) });
  const res = createResponse();

  await handler(createRequest(activeAdmin, { amount: 10 }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(order.paymentStatus, 'quitado');
});

test('payment discount by Admin records a separate audited discount and only the received cash', async () => {
  const order = createOrder();
  const auditEvents = [];
  const handler = createHandler({
    OrderModel: createOrderModel(order),
    AuditLogModel: { async create(event) { auditEvents.push(event); } },
  });
  const res = createResponse();

  await handler(createRequest(activeAdmin, { amount: 10, discount: 20, discountReason: 'Ajuste autorizado' }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(order.amountPaid, 10);
  assert.deepEqual(order.payments.map(({ amount }) => amount), [10]);
  assert.equal(order.paymentDiscounts.length, 1);
  assert.equal(order.paymentDiscounts[0].amount, 20);
  assert.equal(order.paymentDiscounts[0].reason, 'Ajuste autorizado');
  assert.equal(order.paymentDiscounts[0].by, 'Admin');
  assert.equal(order.paymentDiscounts[0].authorizedBy.name, 'Admin');
  assert.deepEqual(auditEvents.map(({ acao }) => acao), ['autorizacao.desconto', 'pagamento.desconto_acima_limite']);
  assert.equal(auditEvents[1].detalhes.percentual, 20);
  assert.equal(getOrderBalance(order), 70);
  assert.ok(order.history.some(({ action, note }) => action === 'desconto_pagamento' && note.includes('Ajuste autorizado')));
});

test('payment discount by Attendant requires valid Admin credentials and never stores the password', async () => {
  const order = createOrder();
  const handler = createHandler({
    OrderModel: createOrderModel(order),
    UserModel: createAdminModel(activeAdmin),
  });
  const res = createResponse();
  const password = 'temporary-admin-secret';

  await handler(createRequest(attendant, {
    discount: 20,
    discountReason: 'Cortesia aprovada',
    adminAuthorization: { email: 'admin@example.com', password },
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(order.paymentDiscounts[0].by, 'Ana');
  assert.equal(order.paymentDiscounts[0].authorizedBy.userId, 'admin-id');
  assert.equal(JSON.stringify(order).includes(password), false);
  assert.equal(JSON.stringify(res.body).includes(password), false);
});

test('payment discount rejects invalid authorization, missing reason, invalid amounts, and overspending without mutation', async () => {
  const cases = [
    { user: attendant, body: { discount: 20, discountReason: 'Sem autorização' }, status: 401 },
    { user: activeAdmin, body: { discount: 20, discountReason: '   ' }, status: 400 },
    { user: activeAdmin, body: { discount: -1 }, status: 400 },
    { user: activeAdmin, body: { discount: Infinity }, status: 400 },
    { user: activeAdmin, body: { amount: 0, discount: 20 }, status: 400 },
    { user: activeAdmin, body: { amount: 90, discount: 20 }, status: 400 },
  ];

  for (const { user, body, status } of cases) {
    const order = createOrder();
    const handler = createHandler({ OrderModel: createOrderModel(order) });
    const res = createResponse();

    await handler(createRequest(user, body), res);

    assert.equal(res.statusCode, status);
    assert.equal(order.amountPaid, 0);
    assert.equal(order.payments.length, 0);
    assert.equal(order.paymentDiscounts.length, 0);
    assert.equal(order.history.length, 0);
  }

  const unauthorizedOrder = createOrder();
  const unauthorizedEvents = [];
  const unauthorizedHandler = createHandler({
    OrderModel: createOrderModel(unauthorizedOrder),
    UserModel: createAdminModel({ ...activeAdmin, active: false }),
    AuditLogModel: { async create(event) { unauthorizedEvents.push(event); } },
  });
  const unauthorizedResponse = createResponse();
  await unauthorizedHandler(createRequest(attendant, {
    discount: 20,
    discountReason: 'Sem autorização',
    adminAuthorization: { email: 'admin@example.com', password: 'wrong' },
  }), unauthorizedResponse);
  assert.equal(unauthorizedResponse.statusCode, 401);
  assert.equal(unauthorizedOrder.amountPaid, 0);
  assert.equal(unauthorizedEvents[0].acao, 'autorizacao.desconto');
  assert.equal(unauthorizedEvents[0].sucesso, false);
  assert.equal(JSON.stringify(unauthorizedEvents).includes('wrong'), false);
});

test('ten-percent discount is authorized but is not classified as above the threshold', async () => {
  const order = createOrder();
  const events = [];
  const handler = createHandler({
    OrderModel: createOrderModel(order),
    AuditLogModel: { async create(event) { events.push(event); } },
  });
  const res = createResponse();

  await handler(createRequest(activeAdmin, { amount: 5, discount: 10, discountReason: 'Ajuste' }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(events.map(({ acao }) => acao), ['autorizacao.desconto']);
});

test('payment discount rejects Production, stale concurrent saves, and keeps unpaid installments aligned to balance', async () => {
  const productionOrder = createOrder();
  const productionHandler = createHandler({ OrderModel: createOrderModel(productionOrder) });
  const productionResponse = createResponse();
  await productionHandler(createRequest(production, { discount: 20 }), productionResponse);
  assert.equal(productionResponse.statusCode, 403);
  assert.equal(productionOrder.amountPaid, 0);

  const versionError = Object.assign(new Error('stale order'), { name: 'VersionError' });
  const staleOrder = createOrder({ saveError: versionError });
  const staleHandler = createHandler({ OrderModel: createOrderModel(staleOrder) });
  const staleResponse = createResponse();
  await staleHandler(createRequest(activeAdmin), staleResponse);
  assert.equal(staleResponse.statusCode, 409);

  const installments = [{ amount: 50, paid: false }, { amount: 50, paid: false }];
  recalculateUnpaidInstallments(installments, getOrderBalance({
    finalValue: 100,
    amountPaid: 10,
    paymentDiscounts: [{ amount: 53.21 }],
  }));
  assert.deepEqual(installments.map(({ amount }) => amount), [18.39, 18.4]);
  assert.equal(Order.schema.options.optimisticConcurrency, true);
});
