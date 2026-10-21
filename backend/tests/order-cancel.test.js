import test from 'node:test';
import assert from 'node:assert/strict';
import Order from '../models/Order.js';
import ordersRouter, { createOrderCancelHandler, createOrderUpdateHandler, createPaymentHandler } from '../routes/orders.js';

const id = '507f1f77bcf86cd799439011';
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const createOrder = (values = {}) => ({
  _id: id,
  number: '00014',
  status: 'aprovado',
  amountPaid: 0,
  payments: [],
  history: [],
  async save() { return this; },
  ...values,
});
const admin = { _id: id, name: 'Admin', role: 'admin', active: true };

test('order cancellation is a soft transition, records authorization and reason', async () => {
  const order = createOrder();
  const events = [];
  const handler = createOrderCancelHandler({
    OrderModel: { findById: async () => order },
    AuditLogModel: { async create(event) { events.push(event); } },
  });
  const res = response();

  await handler({ params: { id }, body: { reason: 'Cliente desistiu' }, user: admin, ip: '192.0.2.20' }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(order.status, 'cancelado');
  assert.equal(order.history[0].action, 'cancelado');
  assert.match(order.history[0].note, /Cliente desistiu/);
  assert.equal(events[0].acao, 'autorizacao.cancelamento');
  assert.equal(events[0].sucesso, true);
  assert.equal(events[0].usuarioAutorizou, id);
});

test('Admin can cancel without a confirmation reason and the audit receives a standard reason', async () => {
  const order = createOrder();
  const events = [];
  const handler = createOrderCancelHandler({
    OrderModel: { findById: async () => order },
    AuditLogModel: { async create(event) { events.push(event); } },
  });
  const res = response();

  await handler({ params: { id }, body: {}, user: admin }, res);

  assert.equal(res.statusCode, 200);
  assert.match(order.history[0].note, /Cancelamento realizado diretamente pelo administrador/);
  assert.equal(events[0].detalhes.motivo, 'Cancelamento realizado diretamente pelo administrador.');
});

test('Attendant still needs a cancellation reason and Admin credentials', async () => {
  const order = createOrder();
  const events = [];
  const handler = createOrderCancelHandler({
    OrderModel: { findById: async () => order },
    AuditLogModel: { async create(event) { events.push(event); } },
  });
  const res = response();

  await handler({ params: { id }, body: {}, user: { _id: id, role: 'atendente' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(order.status, 'aprovado');
  assert.equal(events.length, 0);
});

test('failed attendant cancellation authorization is audited without storing credentials', async () => {
  const order = createOrder();
  const events = [];
  const handler = createOrderCancelHandler({
    OrderModel: { findById: async () => order },
    UserModel: { findOne: () => ({ select: async () => null }) },
    AuditLogModel: { async create(event) { events.push(event); } },
  });
  const res = response();
  const password = 'private-admin-password';

  await handler({
    params: { id },
    body: { reason: 'Cliente desistiu', adminAuthorization: { email: 'admin@example.com', password } },
    user: { _id: id, name: 'Atendente', role: 'atendente' },
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(order.status, 'aprovado');
  assert.equal(events[0].sucesso, false);
  assert.equal(JSON.stringify(events).includes(password), false);
});

test('attendant cancellation records the requester separately from the approving administrator', async () => {
  const order = createOrder();
  const events = [];
  const approvingAdmin = { _id: '507f191e810c19729de860ea', name: 'Admin', role: 'admin', active: true, matchPassword: async () => true };
  const requester = { _id: id, name: 'Atendente', role: 'atendente' };
  const handler = createOrderCancelHandler({
    OrderModel: { findById: async () => order },
    UserModel: { findOne: () => ({ select: async () => approvingAdmin }) },
    AuditLogModel: { async create(event) { events.push(event); } },
  });
  const res = response();

  await handler({
    params: { id },
    body: { reason: 'Cliente desistiu', adminAuthorization: { email: 'admin@example.com', password: 'secret' } },
    user: requester,
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(events[0].usuarioSolicitante, requester._id);
  assert.equal(events[0].usuarioAutorizou, approvingAdmin._id);
});

test('orders with any received payment cannot be cancelled and cancelled status is supported', async () => {
  const order = createOrder({ amountPaid: 1 });
  const events = [];
  const handler = createOrderCancelHandler({
    OrderModel: { findById: async () => order },
    AuditLogModel: { async create(event) { events.push(event); } },
  });
  const res = response();

  await handler({ params: { id }, body: { reason: 'Desistência' }, user: admin }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(order.status, 'aprovado');
  assert.equal(events.length, 0);
  assert.ok(Order.schema.path('status').enumValues.includes('cancelado'));
  assert.equal(Order.schema.path('status').options.index, true);
  assert.ok(ordersRouter.stack.some((layer) => layer.route?.path === '/:id/cancel' && layer.route.methods.post));
});

test('any payment record blocks cancellation even when the recorded amount is zero', async () => {
  const order = createOrder({ payments: [{ amount: 0 }] });
  const events = [];
  const handler = createOrderCancelHandler({
    OrderModel: { findById: async () => order },
    AuditLogModel: { async create(event) { events.push(event); } },
  });
  const res = response();

  await handler({ params: { id }, body: { reason: 'Desistência' }, user: admin }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(order.status, 'aprovado');
  assert.equal(events.length, 0);
});

test('cancelled orders reject later edits and payments', async () => {
  const order = createOrder({ status: 'cancelado' });
  const req = { params: { id }, body: { observations: 'alteração' }, user: admin };
  const updateResponse = response();
  await createOrderUpdateHandler({
    OrderModel: { findById: async () => order },
  })(req, updateResponse);
  assert.equal(updateResponse.statusCode, 409);

  const paymentResponse = response();
  await createPaymentHandler({
    OrderModel: { findById: async () => order },
  })({
    params: { id },
    body: { amount: 10 },
    user: admin,
  }, paymentResponse);
  assert.equal(paymentResponse.statusCode, 409);
});
