import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMeasuredItem } from './measurements.js';

test('measured catalog material includes dimensions, tier, pieces and fixed installation fees', () => {
  const item = buildMeasuredItem({ width: 2, height: 1, pieces: 2, unit: 'm', product: { _id: 'vinil', name: 'Vinil laminado', price: 50, priceTiers: [{ minQuantity: 4, price: 40 }] }, description: 'Banner', installationFee: 30, travelFee: 10 });
  assert.equal(item.quantity, 4);
  assert.equal(item.unitPrice, 40);
  assert.equal(item.total, 200);
  assert.equal(item.description, 'Banner 2,00x1,00m — Vinil laminado');
  assert.equal(item.productId, 'vinil');
  assert.equal(item.measurements.pieceCount, 2);
});

test('calculator retains cm conversion and manual by-unit sale mode', () => {
  const item = buildMeasuredItem({ width: 200, height: 100, pieces: 3, unit: 'cm', saleMode: 'unit', pricePerSquareMeter: 10 });
  assert.equal(item.quantity, 3);
  assert.equal(item.unitPrice, 20);
  assert.equal(item.total, 60);
});

test('calculator rejects invalid dimensions, fractional pieces and negative fees', () => {
  for (const input of [{ width: 0 }, { pieces: 1.2 }, { installationFee: -1 }, { travelFee: Infinity }]) {
    assert.throws(() => buildMeasuredItem({ width: 2, height: 1, pieces: 1, pricePerSquareMeter: 10, ...input }));
  }
});
