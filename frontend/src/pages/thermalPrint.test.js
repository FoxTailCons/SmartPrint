import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBalanceThermalHtml,
  buildOrderThermalHtml,
  buildPayableThermalHtml,
  buildPaymentThermalHtml,
} from './thermalPrint.js';

const companyDetails = [
  '30.792.498/0001-33',
  'Rua Doutor Francisco Tozzi, 235',
  'Jardim Redentor',
  'Lindóia-SP',
  '13958-040',
  '(19) 99803-1407',
];

test('thermal quote and order documents include company details and safely render order data', () => {
  const quote = buildOrderThermalHtml({
    number: '00042',
    status: 'pendente',
    client: {
      name: '<Maria>',
      document: '123',
      phone: '19999999999',
      email: 'maria@example.com',
      address: '<Rua A & B, 123>',
    },
    createdAt: '2026-10-20T15:00:00Z',
    items: [{ description: '<Banner>', quantity: 2, unitPrice: 50, total: 100 }],
    totalValue: 100,
    finalValue: 100,
  });

  assert.match(quote, /ORÇAMENTO Nº 00042/);
  assert.match(quote, /&lt;Maria&gt;/);
  assert.match(quote, /CPF\/CNPJ:<\/strong> 123/);
  assert.match(quote, /Telefone:<\/strong> 19999999999/);
  assert.match(quote, /E-mail:<\/strong> maria@example\.com/);
  assert.match(quote, /Endereço:<\/strong> &lt;Rua A &amp; B, 123&gt;/);
  assert.match(quote, /&lt;Banner&gt;/);
  assert.match(quote, /size: 80mm auto/);
  assert.doesNotMatch(quote, /<Maria>|<Banner>/);
  for (const detail of companyDetails) assert.ok(quote.includes(detail), detail);

  const order = buildOrderThermalHtml({ number: '00043', status: 'aprovado', items: [], finalValue: 0 });
  assert.match(order, /PEDIDO Nº 00043/);
});

test('thermal order print preserves the selected delivery calendar date', () => {
  const html = buildOrderThermalHtml({
    number: '00044',
    status: 'aprovado',
    deliveryDate: '2026-10-21T00:00:00.000Z',
    items: [],
  });

  assert.match(html, /<strong>Entrega:<\/strong> 21\/10\/2026/);
});

test('balance document shows open amount and the original installment numbers', () => {
  const html = buildBalanceThermalHtml({
    number: '00042',
    client: { name: 'Maria Silva' },
    finalValue: 300,
    amountPaid: 100,
    installments: [
      { dueDate: '2026-10-01', amount: 100, paid: true },
      { dueDate: '2026-11-01', amount: 100, paid: false },
      { dueDate: '2026-12-01', amount: 100, paid: false },
    ],
  });

  test('thermal order and balance documents subtract payment discounts separately', () => {
    const order = {
      number: '00044',
      status: 'aprovado',
      finalValue: 300,
      amountPaid: 50,
      paymentDiscounts: [{ amount: 20 }],
      items: [],
    };

    const orderHtml = buildOrderThermalHtml(order);
    assert.match(orderHtml, /Descontos no pagamento/);
    assert.match(orderHtml, /Saldo<\/span><span>R\$\s?230,00/);

    const balanceHtml = buildBalanceThermalHtml(order);
    assert.match(balanceHtml, /Descontos aplicados/);
    assert.match(balanceHtml, /Saldo em aberto<\/span><span>R\$\s?230,00/);
  });

  assert.match(html, /PENDÊNCIA · PEDIDO #00042/);
  assert.match(html, /Saldo em aberto/);
  assert.match(html, /R\$\s?200,00/);
  assert.match(html, /Parcela 2/);
  assert.match(html, /Parcela 3/);
  assert.doesNotMatch(html, /Parcela 1/);
  for (const detail of companyDetails) assert.ok(html.includes(detail), detail);
});

test('payable and payment receipt documents include business details and escape user content', () => {
  const payable = buildPayableThermalHtml({
    description: '<Aluguel>',
    category: 'aluguel',
    dueDate: '2026-11-01',
    value: 1250,
    notes: '<pagar até dia 5>',
  });
  assert.match(payable, /&lt;Aluguel&gt;/);
  assert.match(payable, /&lt;pagar até dia 5&gt;/);
  assert.match(payable, /CONTA A PAGAR/);

  const receipt = buildPaymentThermalHtml('*SMART PRINT*\n*RECIBO DE PAGAMENTO*\nCliente: <Maria>\nEntrada recebida: R$ 50,00');
  assert.match(receipt, /RECIBO DE PAGAMENTO/);
  assert.match(receipt, /Cliente: &lt;Maria&gt;/);
  for (const document of [payable, receipt]) {
    for (const detail of companyDetails) assert.ok(document.includes(detail), detail);
  }
});
