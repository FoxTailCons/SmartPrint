import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickSaleCheckout, getQuickSaleUserId } from './quickSaleCheckout.js';

const input = { items: [{ product: { _id: 'p1', active: true, saleUnit: 'unit' }, quantity: 21 }], paymentMethod: 'pix' };
test('resolves the authenticated user id returned by the API', () => {
  assert.equal(getQuickSaleUserId({ id: 'user-a' }), 'user-a');
  assert.equal(getQuickSaleUserId({ _id: 'user-b' }), 'user-b');
  assert.equal(getQuickSaleUserId(null), undefined);
});

test('uncertain failure retries the exact same request and next sale gets a fresh key', async () => {
  const bodies = [];
  let sequence = 0;
  const checkout = createQuickSaleCheckout(async (body) => {
    bodies.push(body);
    if (bodies.length === 1) throw new Error('network');
    return { _id: 'order', finalValue: 13, payments: [{ amount: 13 }] };
  }, () => `request-${++sequence}`);
  await assert.rejects(checkout.submit(input), /network/);
  const result = await checkout.submit({ ...input, items: [{ ...input.items[0], quantity: 99 }], paymentMethod: 'credito' });
  assert.strictEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[1], { items: [{ productId: 'p1', quantity: 21 }], paymentMethod: 'pix', requestId: 'request-1' });
  assert.equal(result.finalValue, 13);
  await checkout.submit(input);
  assert.equal(bodies.length, 2);
  checkout.reset();
  await checkout.submit(input);
  assert.equal(bodies[2].requestId, 'request-2');
});
test('concurrent clicks share one submission and cannot reset an in-flight sale', async () => {
  let finish;
  let calls = 0;
  const checkout = createQuickSaleCheckout(() => { calls++; return new Promise((resolve) => { finish = resolve; }); }, () => 'key');
  const first = checkout.submit(input);
  const second = checkout.submit(input);
  assert.strictEqual(first, second);
  assert.throws(() => checkout.reset());
  await Promise.resolve();
  finish({ _id: 'order' });
  await first;
  assert.equal(calls, 1);
});
test('rejects invalid checkout input before posting', async () => {
  const checkout = createQuickSaleCheckout(() => assert.fail('must not post'), () => 'key');
  for (const overrides of [
    { items: [] },
    { items: [{ ...input.items[0], quantity: 0 }] },
    { items: [{ ...input.items[0], quantity: 1.5 }] },
    { items: [{ ...input.items[0], quantity: Infinity }] },
    { paymentMethod: 'parcelado' },
    { items: [{ ...input.items[0], product: { ...input.items[0].product, active: false } }] },
    { items: [{ ...input.items[0], product: { ...input.items[0].product, saleUnit: 'square_meter' } }] },
  ]) {
    assert.throws(() => checkout.submit({ ...input, ...overrides }));
  }
});

test('submits multiple products in a single idempotent checkout', async () => {
  const bodies = [];
  const items = [
    { product: { _id: 'p1', active: true, saleUnit: 'unit' }, quantity: 2 },
    { product: { _id: 'p2', active: true, saleUnit: 'unit' }, quantity: 3 },
  ];
  const checkout = createQuickSaleCheckout(async (body) => { bodies.push(body); throw new Error('network'); }, () => 'multi-key');

  await assert.rejects(checkout.submit({ items, paymentMethod: 'pix' }), /network/);
  await assert.rejects(checkout.submit({ items: [], paymentMethod: 'dinheiro' }), /network/);

  assert.strictEqual(bodies[0], bodies[1]);
  assert.deepEqual(bodies[0].items, [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 3 }]);
  assert.equal(bodies[0].requestId, 'multi-key');
});

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
test('lost response survives checkout recreation and remains isolated by authenticated user', async () => {
  const storage = memoryStorage();
  const bodies = [];
  const first = createQuickSaleCheckout(async (body) => { assert.deepEqual(JSON.parse(storage.getItem('quick:user-a')), body); bodies.push(body); throw new Error('lost response'); }, () => 'original', { storage, storageKey: 'quick:user-a' });
  await assert.rejects(first.submit(input), /lost response/);
  const restored = createQuickSaleCheckout(async (body) => { bodies.push(body); return { _id: 'saved' }; }, () => assert.fail('must reuse key'), { storage, storageKey: 'quick:user-a' });
  const otherUser = createQuickSaleCheckout(async () => {}, () => 'other', { storage, storageKey: 'quick:user-b' });
  assert.equal(otherUser.getPending(), null);
  assert.deepEqual(restored.getPending(), bodies[0]);
  assert.equal((await restored.submit({ ...input, quantity: 3 }))._id, 'saved');
  assert.deepEqual(bodies[1], bodies[0]);
  assert.equal(storage.getItem('quick:user-a'), null);
});
for (const status of [400, 422]) {
  test(`HTTP ${status} rejection clears pending and permits corrected sale with fresh key`, async () => {
    const storage = memoryStorage();
    const bodies = [];
    const checkout = createQuickSaleCheckout(async (body) => { bodies.push(body); if (bodies.length === 1) throw Object.assign(new Error('invalid'), { status }); return { _id: 'saved' }; }, () => `key-${bodies.length}`, { storage, storageKey: 'quick:user' });
    await assert.rejects(checkout.submit(input), /invalid/);
    assert.equal(checkout.getPending(), null);
    assert.equal(storage.getItem('quick:user'), null);
    await checkout.submit({ ...input, items: [{ ...input.items[0], quantity: 2 }] });
    assert.notEqual(bodies[0].requestId, bodies[1].requestId);
    assert.equal(bodies[1].items[0].quantity, 2);
  });
}
test('cannot send if pending sale could not be persisted', () => {
  const checkout = createQuickSaleCheckout(() => assert.fail('must persist before post'), () => 'key', { storage: { getItem: () => null, setItem() { throw new Error('storage unavailable'); } }, storageKey: 'quick:user' });
  assert.throws(() => checkout.submit(input), /storage unavailable/);
});

test('HTTP 500 keeps persisted attempt and prevents starting a new sale', async () => {
  const storage = memoryStorage();
  const checkout = createQuickSaleCheckout(async () => { throw Object.assign(new Error('server uncertain'), { status: 500 }); }, () => 'key', { storage, storageKey: 'quick:user' });
  await assert.rejects(checkout.submit(input), /server uncertain/);
  assert.equal(checkout.getPending().requestId, 'key');
  assert.ok(storage.getItem('quick:user'));
  assert.throws(() => checkout.reset(), /pendente/);
});

test('restores pending checkout with multiple products', () => {
  const storage = memoryStorage();
  const pending = {
    items: [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 3 }],
    paymentMethod: 'pix',
    requestId: 'multi-pending',
  };
  storage.setItem('quick:user', JSON.stringify(pending));
  const checkout = createQuickSaleCheckout(() => assert.fail('must not post during restore'), undefined, { storage, storageKey: 'quick:user' });
  assert.deepEqual(checkout.getPending(), pending);
});
