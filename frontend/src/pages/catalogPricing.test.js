import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuantityPrice, parsePriceTiers } from './catalogPricing.js';

test('legacy hydrated item with an empty pricing basis retains its saved price', () => {
  assert.equal(getQuantityPrice({ unitPrice: 2, pricingBasis: { priceTiers: [] } }, 10).unitPrice, 2);
});

const product = { price: 1, priceTiers: [{ minQuantity: 301, price: 0.4 }, { minQuantity: 21, price: 0.6 }] };
for (const [quantity, unitPrice, minQuantity] of [[20, 1, null], [21, 0.6, 21], [300, 0.6, 21], [301, 0.4, 301]]) {
  test(`quantity ${quantity} uses its inclusive tier`, () => {
    assert.deepEqual(getQuantityPrice(product, quantity), { unitPrice, minQuantity, total: quantity * unitPrice });
  });
}
test('saved pricing takes precedence and legacy items keep their saved price', () => {
  assert.equal(getQuantityPrice({ ...product, pricingBasis: { basePrice: 2, priceTiers: [{ minQuantity: 21, price: 1.5 }] } }, 21).unitPrice, 1.5);
  assert.equal(getQuantityPrice({ price: 2 }, 30).unitPrice, 2);
  assert.equal(getQuantityPrice({ basePrice: 2, priceTiers: [] }, 1).unitPrice, 2);
});
test('invalid quantities are rejected', () => {
  for (const quantity of [0, -1, NaN, Infinity, '']) assert.throws(() => getQuantityPrice(product, quantity));
});
test('tier form validates finite prices, positive distinct minimums and accepts zero prices', () => {
  assert.deepEqual(parsePriceTiers([{ minQuantity: '21', price: '0' }]), [{ minQuantity: 21, price: 0 }]);
  for (const tiers of [[{ minQuantity: 0, price: 1 }], [{ minQuantity: 21, price: -1 }], [{ minQuantity: 21, price: Infinity }], [{ minQuantity: '', price: 1 }], [{ minQuantity: 21, price: '' }], [{ minQuantity: 21, price: 1 }, { minQuantity: '21', price: 2 }]]) {
    assert.throws(() => parsePriceTiers(tiers));
  }
});
