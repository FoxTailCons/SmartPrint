import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('payment discount payload sends Admin credentials only for an attendant discount', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { buildPaymentPayload } = await server.ssrLoadModule('/src/pages/OrderDetail.jsx');

    assert.deepEqual(buildPaymentPayload({
      amount: 10,
      discount: 20,
      paymentMethod: 'pix',
      receiptUrl: '',
      discountReason: 'Ajuste autorizado',
      adminEmail: 'admin@example.com',
      adminPassword: 'temporary-secret',
      role: 'atendente',
    }), {
      amount: 10,
      discount: 20,
      paymentMethod: 'pix',
      receiptUrl: '',
      discountReason: 'Ajuste autorizado',
      adminAuthorization: { email: 'admin@example.com', password: 'temporary-secret' },
    });

    assert.deepEqual(buildPaymentPayload({
      amount: 10,
      discount: 20,
      paymentMethod: 'pix',
      receiptUrl: '',
      discountReason: 'Desconto direto',
      adminEmail: 'ignored@example.com',
      adminPassword: 'ignored-secret',
      role: 'admin',
    }), {
      amount: 10,
      discount: 20,
      paymentMethod: 'pix',
      receiptUrl: '',
      discountReason: 'Desconto direto',
    });
  } finally {
    await server.close();
  }
});

test('cancellation payload omits confirmation details for Admin and keeps attendant authorization', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false } });
  try {
    const { buildCancelPayload } = await server.ssrLoadModule('/src/pages/OrderDetail.jsx');

    assert.deepEqual(buildCancelPayload({ role: 'admin' }), {});
    assert.deepEqual(buildCancelPayload({
      reason: 'Cliente desistiu',
      role: 'atendente',
      adminEmail: 'admin@example.com',
      adminPassword: 'temporary-secret',
    }), {
      reason: 'Cliente desistiu',
      adminAuthorization: { email: 'admin@example.com', password: 'temporary-secret' },
    });
  } finally {
    await server.close();
  }
});
