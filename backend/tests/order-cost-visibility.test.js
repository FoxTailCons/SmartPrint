import test from 'node:test';
import assert from 'node:assert/strict';
import * as visibility from '../services/orderCostVisibility.js';
const { hideOrderCosts } = visibility;

test('order cost visibility removes nested item costs while preserving other values', () => {
  const paidAt = new Date('2026-10-20T12:00:00Z');
  const result = hideOrderCosts({
    number: '00001',
    items: [{ description: 'Banner', costUnitPrice: 10, unitPrice: 20 }],
    payments: [{ amount: 5, paidAt }],
  });

  assert.deepEqual(result, {
    number: '00001',
    items: [{ description: 'Banner', unitPrice: 20 }],
    payments: [{ amount: 5, paidAt }],
  });
  assert.equal(result.payments[0].paidAt, paidAt);
});

test('production projection keeps work details but removes commercial and financial fields', () => {
  assert.equal(typeof visibility.projectProductionOrder, 'function');
  const result = visibility.projectProductionOrder({
    _id: 'order-1',
    number: '00001',
    status: 'aprovado',
    production: 'em_producao',
    productionStage: 'instalacao',
    priority: 'alta',
    finalValue: 500,
    totalValue: 520,
    discount: 20,
    amountPaid: 100,
    paymentStatus: 'parcial',
    paymentMethod: 'pix',
    payments: [{ amount: 100, method: 'pix' }],
    installments: [{ amount: 400 }],
    history: [{ action: 'pagamento', note: 'Recebido R$ 100,00' }],
    client: { name: 'Cliente', phone: '11999999999', openBalance: 400, paymentPreference: 'pix' },
    items: [{
      description: 'Banner',
      quantity: 1,
      productName: 'Lona',
      material: 'Vinil laminado',
      artworkUrl: 'https://example.org/arte',
      installationNotes: 'Instalar pela manhã',
      unitPrice: 500,
      total: 500,
      costUnitPrice: 200,
    }],
  });

  assert.deepEqual(result, {
    _id: 'order-1',
    number: '00001',
    status: 'aprovado',
    production: 'em_producao',
    productionStage: 'instalacao',
    priority: 'alta',
    client: { name: 'Cliente', phone: '11999999999' },
    items: [{
      description: 'Banner',
      quantity: 1,
      productName: 'Lona',
      material: 'Vinil laminado',
      artworkUrl: 'https://example.org/arte',
      installationNotes: 'Instalar pela manhã',
    }],
  });
});
