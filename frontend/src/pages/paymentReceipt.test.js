import test from 'node:test';
import assert from 'node:assert/strict';

import { createPaymentReceipt } from './paymentReceipt.js';

test('creates a WhatsApp receipt for a received down payment', () => {
  const receipt = createPaymentReceipt({
    number: '00042',
    client: { name: 'Maria Silva', phone: '(11) 99999-9999' },
    finalValue: 300,
    payments: [{ amount: 50, method: 'pix', type: 'entrada', paidAt: '2026-10-17T12:00:00Z' }],
  }, 0);

  assert.match(receipt.text, /RECIBO DE PAGAMENTO/);
  assert.match(receipt.text, /Entrada recebida: R\$\s?50,00/);
  assert.match(receipt.text, /Saldo após o recebimento: R\$\s?250,00/);
  assert.equal(new URL(receipt.link).hostname, 'wa.me');
  assert.equal(new URL(receipt.link).pathname, '/5511999999999');
});

test('creates receipts with the running balance for each payment', () => {
  const receipt = createPaymentReceipt({
    number: '00042',
    client: { name: 'Maria Silva', phone: '11999999999' },
    finalValue: 300,
    payments: [
      { amount: 50, method: 'pix', type: 'entrada' },
      { amount: 100, method: 'dinheiro' },
    ],
  }, 1);

  assert.match(receipt.text, /1ª parcela recebida: R\$\s?100,00/);
  assert.match(receipt.text, /Total recebido: R\$\s?150,00/);
  assert.match(receipt.text, /Saldo após o recebimento: R\$\s?150,00/);
});

test('creates a printable receipt even when the client has no phone number', () => {
  const receipt = createPaymentReceipt({
    number: '00042',
    client: { name: 'Maria Silva' },
    finalValue: 300,
    payments: [{ amount: 50, method: 'pix', type: 'entrada' }],
  }, 0);

  assert.match(receipt.text, /RECIBO DE PAGAMENTO/);
  assert.match(receipt.text, /Cliente: Maria Silva/);
  assert.equal(receipt.link, null);
});

test('payment receipts show authorized discounts separately from cash received and balance', () => {
  const receipt = createPaymentReceipt({
    number: '00042',
    client: { name: 'Maria Silva' },
    finalValue: 300,
    payments: [{ amount: 50, method: 'pix', paidAt: '2026-10-17T12:00:00Z' }],
    paymentDiscounts: [{ amount: 20, reason: 'Ajuste aprovado', at: '2026-10-17T12:00:00Z' }],
  }, 0);

  assert.match(receipt.text, /Total recebido: R\$\s?50,00/);
  assert.match(receipt.text, /Descontos aplicados: R\$\s?20,00/);
  assert.match(receipt.text, /Saldo após o recebimento: R\$\s?230,00/);
});
