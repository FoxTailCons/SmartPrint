import test from 'node:test';
import assert from 'node:assert/strict';
import { itemTotal, getProductionStage, getDeadline, graphicDate, itemMetadata, serializeOrderItems } from './printshop.js';

test('item totals charge installation and travel once per item', () => {
  assert.equal(itemTotal({ quantity: 2, unitPrice: 50, installationFee: 30, travelFee: 10 }), 140);
  assert.equal(itemTotal({ quantity: '3', unitPrice: '0.25' }), 0.75);
});

test('legacy production maps without changing financial or commercial status', () => {
  assert.equal(getProductionStage({ production: 'pausado', status: 'aprovado' }), 'impressao');
  assert.equal(getProductionStage({ production: 'concluido' }), 'entregue');
  assert.equal(getProductionStage({ production: 'nao_iniciado' }), 'arte');
  assert.equal(getProductionStage({ productionStage: 'instalacao', production: 'em_producao' }), 'instalacao');
});

test('deadline preserves civil dates and uses Sao Paulo today, with per-item fallback', () => {
  const now = new Date('2026-10-21T01:30:00Z');
  assert.equal(graphicDate('2026-10-20T00:00:00.000Z'), '20/10/2026');
  assert.equal(getDeadline({ deliveryDate: '2026-10-20T00:00:00Z' }, now).today, true);
  assert.equal(getDeadline({ items: [{ promisedDate: '2026-10-19' }, { promisedDate: '2026-10-22' }] }, now).overdue, true);
  assert.equal(getDeadline({ status: 'concluido', deliveryDate: '2026-10-19' }, now).overdue, false);
  assert.equal(getDeadline({}, now).label, 'Sem prazo');
});

test('only populated metadata appears with readable date and fee labels', () => {
  assert.deepEqual(itemMetadata({ material: 'Vinil', promisedDate: '2026-10-20', installationFee: 30 }), [
    ['Material', 'Vinil'], ['Prazo combinado', '20/10/2026'], ['Instalação', 'R$ 30,00'],
  ]);
  assert.deepEqual(itemMetadata({}), []);
});

test('order serialization preserves graphic fields and converts typed amounts for the API', () => {
  const items = serializeOrderItems([
    { description: 'Banner', quantity: '2', unitPrice: '50', installationFee: '30', travelFee: '', artworkUrl: 'https://example.com/arte' },
    { productId: 'vinil', quantity: '3', unitPrice: 999, material: 'Vinil', measurements: { pieceCount: 3 }, installationFee: '10' },
    { description: ' ', quantity: 1, unitPrice: 0 },
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].unitPrice, 50);
  assert.equal(items[0].installationFee, 30);
  assert.equal(items[0].travelFee, 0);
  assert.equal(items[0].artworkUrl, 'https://example.com/arte');
  assert.equal(items[1].quantity, 3);
  assert.equal(items[1].installationFee, 10);
  assert.equal(items[1].unitPrice, undefined);
  assert.equal(items[1].material, 'Vinil');
});
