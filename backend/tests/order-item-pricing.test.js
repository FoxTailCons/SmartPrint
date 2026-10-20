import test from 'node:test';
import assert from 'node:assert/strict';
import Product from '../models/Product.js';
import { buildOrderItems } from '../routes/orders.js';
import { buildCatalogOrderItem } from '../services/orderItemPricing.js';

const product = (saleUnit, price = 10) => ({
  _id: '507f1f77bcf86cd799439011',
  name: 'Banner',
  saleUnit,
  price,
  active: true,
});

test('catalog unit item uses a whole item count and catalog unit price', () => {
  const item = buildCatalogOrderItem({ product: product('unit', 7.5), quantity: 3 });

  assert.equal(item.quantity, 3);
  assert.equal(item.unitPrice, 7.5);
  assert.equal(item.total, 22.5);
  assert.equal(item.productName, 'Banner');
  assert.equal(item.saleUnit, 'unit');
});

test('catalog linear-meter item converts multiple fractional lengths to total meters', () => {
  const item = buildCatalogOrderItem({
    product: product('linear_meter', 12),
    pieceCount: 2,
    lengthPerPiece: 1.25,
  });

  test('catalog kilometer items accept fractional distances and snapshot cost', () => {
    const item = buildCatalogOrderItem({
      product: { ...product('kilometer', 4), costPrice: 1.5 },
      quantity: 2.5,
    });

    assert.equal(item.quantity, 2.5);
    assert.equal(item.unitPrice, 4);
    assert.equal(item.costUnitPrice, 1.5);
    assert.equal(item.total, 10);
    assert.equal(item.description, 'Banner - 2.5 km');
  });

  assert.equal(item.quantity, 2.5);
  assert.equal(item.unitPrice, 12);
  assert.equal(item.total, 30);
  assert.deepEqual(item.measurements, { pieceCount: 2, lengthPerPiece: 1.25 });
});

test('catalog square-meter item converts centimeters and multiplies by piece count', () => {
  const item = buildCatalogOrderItem({
    product: product('square_meter', 100),
    pieceCount: 2,
    width: 100,
    height: 50,
    dimensionUnit: 'cm',
  });

  assert.equal(item.quantity, 1);
  assert.equal(item.unitPrice, 100);
  assert.equal(item.total, 100);
  assert.deepEqual(item.measurements, {
    pieceCount: 2,
    width: 100,
    height: 50,
    dimensionUnit: 'cm',
    moldEnabled: false,
    moldFactor: undefined,
  });
});

test('catalog square-meter item applies the mold factor only when enabled', () => {
  const item = buildCatalogOrderItem({
    product: product('square_meter', 80),
    pieceCount: 2,
    width: 1,
    height: 0.5,
    dimensionUnit: 'm',
    moldEnabled: true,
    moldFactor: 1.5,
  });

  assert.equal(item.quantity, 1.5);
  assert.equal(item.total, 120);
  assert.equal(item.measurements.moldFactor, 1.5);
});

test('editing a catalog item retains its saved name, sale unit, and price snapshot', () => {
  const item = buildCatalogOrderItem({
    product: { ...product('unit', 50), name: 'Renamed product' },
    quantity: 2,
    pricingSnapshot: { productName: 'Original name', saleUnit: 'linear_meter', unitPrice: 12 },
    pieceCount: 2,
    lengthPerPiece: 1.5,
  });

  test('catalog edits preserve saved costs and do not backfill costs into legacy items', async (t) => {
    const productId = '507f1f77bcf86cd799439011';
    const savedId = '507f191e810c19729de860ea';
    t.mock.method(Product, 'findById', async () => ({ ...product('unit', 100), costPrice: 20 }));
    const existingItems = {
      id: () => ({ _id: savedId, productId, productName: 'Banner', saleUnit: 'unit', unitPrice: 7, costUnitPrice: 2 }),
    };
    const [saved] = await buildOrderItems([{ _id: savedId, productId, quantity: 2 }], existingItems);
    assert.equal(saved.costUnitPrice, 2);

    const legacyItems = { id: () => ({ _id: savedId, productId, productName: 'Banner', saleUnit: 'unit', unitPrice: 7 }) };
    const [legacy] = await buildOrderItems([{ _id: savedId, productId, quantity: 2 }], legacyItems);
    assert.equal(legacy.costUnitPrice, undefined);
  });

  assert.equal(item.productName, 'Original name');
  assert.equal(item.saleUnit, 'linear_meter');
  assert.equal(item.unitPrice, 12);
  assert.equal(item.quantity, 3);
  assert.equal(item.total, 36);
});

test('catalog pricing rejects invalid counts, dimensions, factors, and non-finite totals', () => {
  const invalidInputs = [
    { product: product('unit'), quantity: 0 },
    { product: product('unit'), quantity: 1.5 },
    { product: product('linear_meter'), pieceCount: 2, lengthPerPiece: 0 },
    { product: product('square_meter'), pieceCount: 1, width: 10, height: 10, dimensionUnit: 'inch' },
    { product: product('square_meter'), pieceCount: 1, width: -1, height: 10, dimensionUnit: 'cm' },
    { product: product('square_meter'), pieceCount: 1, width: 10, height: 10, dimensionUnit: 'cm', moldEnabled: true, moldFactor: 0 },
    { product: product('unit', Infinity), quantity: 1 },
    { product: product('unit', 1e308), quantity: 1e308 },
  ];

  for (const input of invalidInputs) {
    assert.throws(() => buildCatalogOrderItem(input));
  }
});

test('order item resolver uses the active catalog price instead of a client-submitted price', async (t) => {
  const id = '507f1f77bcf86cd799439011';
  t.mock.method(Product, 'findById', async () => ({ ...product('linear_meter', 12) }));

  const [item] = await buildOrderItems([{
    productId: id,
    quantity: 999,
    unitPrice: 0.01,
    description: 'Preço manipulado',
    measurements: { pieceCount: 2, lengthPerPiece: 1.25 },
  }]);

  assert.equal(item.quantity, 2.5);
  assert.equal(item.unitPrice, 12);
  assert.equal(item.total, 30);
  assert.equal(item.description, 'Banner - 1.25 m x 2 peça(s)');
});

test('order item resolver preserves a matching saved snapshot even after deactivation or repricing', async (t) => {
  const id = '507f1f77bcf86cd799439011';
  const subdocumentId = '507f191e810c19729de860ea';
  t.mock.method(Product, 'findById', async () => ({ ...product('unit', 100), active: false }));
  const existingItems = {
    id: (itemId) => itemId === subdocumentId ? {
      _id: subdocumentId,
      productId: id,
      productName: 'Nome original',
      saleUnit: 'unit',
      unitPrice: 7,
    } : null,
  };

  const [item] = await buildOrderItems([{
    _id: subdocumentId,
    productId: id,
    quantity: 2,
    measurements: { pieceCount: 2 },
  }], existingItems);

  assert.equal(item._id, subdocumentId);
  assert.equal(item.productName, 'Nome original');
  assert.equal(item.unitPrice, 7);
  assert.equal(item.total, 14);
});

test('order item resolver rejects invalid and inactive new catalog products', async (t) => {
  const id = '507f1f77bcf86cd799439011';
  t.mock.method(Product, 'findById', async () => ({ ...product('unit'), active: false }));

  await assert.rejects(buildOrderItems([{ productId: 'invalid', quantity: 1 }]), /Produto inválido/);
  await assert.rejects(buildOrderItems([{ productId: id, quantity: 1 }]), /Produto não encontrado ou inativo/);
});
