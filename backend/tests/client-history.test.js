import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientDeleteHandler, getPaymentPreference } from '../routes/clients.js';

test('client payment preference uses the latest recorded payment method', () => {
  const orders = [
    { createdAt: new Date('2026-10-19T12:00:00Z'), paymentMethod: 'dinheiro', payments: [] },
    { payments: [{ method: 'pix', paidAt: new Date('2026-10-20T12:00:00Z') }] },
    { payments: [{ method: 'debito', paidAt: new Date('2026-10-20T14:00:00Z') }] },
  ];
  assert.equal(getPaymentPreference(orders), 'debito');
  assert.equal(getPaymentPreference([]), '');
});

test('client deletion rejects invalid and missing identifiers', async () => {
  const handler = createClientDeleteHandler({
    ClientModel: { findById: async () => null, findByIdAndDelete: async () => null },
    OrderModel: { exists: async () => null },
  });
  const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });

  const invalid = response();
  await handler({ params: { id: 'invalid' } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const missing = response();
  await handler({ params: { id: '507f1f77bcf86cd799439011' } }, missing);
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, { message: 'Cliente não encontrado' });
});

test('client deletion preserves clients referenced by existing orders', async () => {
  let deleted = false;
  const handler = createClientDeleteHandler({
    ClientModel: {
      findById: async () => ({ _id: '507f1f77bcf86cd799439011' }),
      findByIdAndDelete: async () => { deleted = true; },
    },
    OrderModel: { exists: async () => ({ _id: 'order-1' }) },
  });
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await handler({ params: { id: '507f1f77bcf86cd799439011' } }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /pedidos ou orçamentos vinculados/);
  assert.equal(deleted, false);
});

test('client deletion succeeds when no orders reference the client', async () => {
  let deletedId;
  const id = '507f1f77bcf86cd799439011';
  const handler = createClientDeleteHandler({
    ClientModel: {
      findById: async () => ({ _id: id }),
      findByIdAndDelete: async (value) => { deletedId = value; return { _id: value }; },
    },
    OrderModel: { exists: async () => null },
  });
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await handler({ params: { id } }, res);

  assert.equal(deletedId, id);
  assert.deepEqual(res.body, { ok: true });
});
