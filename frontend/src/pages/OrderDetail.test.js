import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createPaymentReceipt, getPaymentLabel } from './paymentReceipt.js';

test('payment labels identify the entry and start installment numbering after it', () => {
  const payments = [{ type: 'entrada' }, { type: 'pagamento' }, { type: 'pagamento' }];
  assert.equal(getPaymentLabel(payments, 0), 'Entrada');
  assert.equal(getPaymentLabel(payments, 1), '1ª parcela');
  assert.equal(getPaymentLabel(payments, 2), '2ª parcela');
});

test('canceled payments no longer produce receipts or count toward received totals', () => {
  const order = {
    number: '00001',
    finalValue: 100,
    client: { name: 'Cliente' },
    payments: [
      { type: 'entrada', amount: 20, method: 'pix', paidAt: '2026-10-20T12:00:00Z' },
      { type: 'pagamento', amount: 30, method: 'pix', paidAt: '2026-10-20T13:00:00Z', canceledAt: '2026-10-20T14:00:00Z' },
      { type: 'pagamento', amount: 10, method: 'dinheiro', paidAt: '2026-10-20T15:00:00Z' },
    ],
  };

  assert.equal(createPaymentReceipt(order, 1), null);
  assert.match(createPaymentReceipt(order, 2).text, /Total recebido: R\$ 30,00/);
});

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
