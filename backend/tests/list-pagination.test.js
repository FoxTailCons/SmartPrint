import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderListHandler, createReceivablesListHandler } from '../routes/orders.js';
import { createClientListHandler } from '../routes/clients.js';
import { createPayableListHandler } from '../routes/payables.js';

const query = (records) => {
  let result = [...records];
  const pending = {
    populate() { return this; },
    select() { return this; },
    sort(order) {
      const [[key, direction]] = Object.entries(order);
      result.sort((left, right) => String(left[key]).localeCompare(String(right[key])) * direction);
      return this;
    },
    skip(value) { result = result.slice(value); return this; },
    limit(value) { result = result.slice(0, value); return this; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return pending;
};

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('orders list paginates the filtered query and preserves legacy array mode', async () => {
  let receivedFilter;
  const orders = Array.from({ length: 3 }, (_, index) => ({ number: String(index + 1), createdAt: new Date(index) }));
  const OrderModel = {
    countDocuments: async (filter) => { receivedFilter = filter; return 3; },
    find: (filter) => { receivedFilter = filter; return query(orders); },
  };
  const ClientModel = { find: () => ({ select: async () => [] }) };
  const handler = createOrderListHandler({ OrderModel, ClientModel });
  const pagedResponse = response();

  await handler({ query: { status: 'aprovado', page: '2', pageSize: '1' } }, pagedResponse);

  assert.equal(receivedFilter.status, 'aprovado');
  assert.deepEqual(pagedResponse.body, {
    items: [{ number: '2', createdAt: new Date(1) }],
    page: 2,
    pageSize: 1,
    total: 3,
  });

  const legacyResponse = response();
  await handler({ query: {} }, legacyResponse);
  assert.ok(Array.isArray(legacyResponse.body));
});

test('active orders filter includes pending approval and approved execution orders only', async () => {
  let receivedFilter;
  const OrderModel = {
    countDocuments: async (filter) => { receivedFilter = filter; return 2; },
    find: (filter) => { receivedFilter = filter; return query([]); },
  };
  const res = response();

  await createOrderListHandler({ OrderModel })({ query: { status: 'active', page: '1', pageSize: '20' } }, res);

  assert.deepEqual(receivedFilter.status, { $in: ['pendente', 'aprovado'] });
});

test('closed orders filter groups completed and canceled orders', async () => {
  let receivedFilter;
  const OrderModel = {
    countDocuments: async (filter) => { receivedFilter = filter; return 2; },
    find: (filter) => { receivedFilter = filter; return query([]); },
  };
  const res = response();

  await createOrderListHandler({ OrderModel })({ query: { status: 'closed', page: '1', pageSize: '20' } }, res);

  assert.deepEqual(receivedFilter.status, { $in: ['concluido', 'cancelado'] });
});

test('orders list treats fully paid stale records as quitado and filters by calculated balance', async () => {
  let receivedFilter;
  const order = {
    number: '00015',
    finalValue: 100,
    amountPaid: 100,
    paymentStatus: 'aberto',
  };
  const OrderModel = {
    countDocuments: async (filter) => { receivedFilter = filter; return 1; },
    find: (filter) => { receivedFilter = filter; return query([order]); },
  };
  const res = response();

  await createOrderListHandler({ OrderModel })({ query: { paymentStatus: 'quitado', page: '1', pageSize: '10' } }, res);

  assert.ok(receivedFilter.$expr);
  assert.equal(res.body.items[0].paymentStatus, 'quitado');
});

test('client list paginates after search and returns full filtered total', async () => {
  let receivedFilter;
  const clients = [
    { _id: 'c1', name: 'Ana', toObject() { return { _id: this._id, name: this.name }; } },
    { _id: 'c2', name: 'Bia', toObject() { return { _id: this._id, name: this.name }; } },
  ];
  const ClientModel = {
    countDocuments: async (filter) => { receivedFilter = filter; return 11; },
    find: (filter) => { receivedFilter = filter; return query(clients); },
  };
  const OrderModel = { find: () => Promise.resolve([]) };
  const handler = createClientListHandler({ ClientModel, OrderModel });
  const res = response();

  await handler({ query: { q: 'bia', page: '2', pageSize: '1' } }, res);

  assert.ok(receivedFilter.$or.some((item) => item.name.$regex === 'bia'));
  assert.deepEqual(res.body, {
    items: [{ _id: 'c2', name: 'Bia', ordersCount: 0, totalSpent: 0, openOrders: 0, openBalance: 0, paymentPreference: '' }],
    page: 2,
    pageSize: 1,
    total: 11,
  });
});

test('payable list applies the paid filter before pagination', async () => {
  let receivedFilter;
  const PayableModel = {
    countDocuments: async (filter) => { receivedFilter = filter; return 2; },
    find: (filter) => { receivedFilter = filter; return query([{ dueDate: '2026-10-19' }]); },
    aggregate: async () => [{ totalOpen: 30, totalPaid: 10, totalOverdue: 5, totalDueSoon: 15 }],
  };
  const handler = createPayableListHandler({ PayableModel });
  const res = response();

  await handler({ query: { paid: 'true', page: '1', pageSize: '5' } }, res);

  assert.deepEqual(receivedFilter, { paid: true });
  assert.equal(res.body.total, 2);
  assert.equal(res.body.items.length, 1);
  assert.deepEqual(res.body.summary, { totalOpen: 30, totalPaid: 10, totalOverdue: 5, totalDueSoon: 15 });
});

test('receivables page returns full-set totals and upcoming installments', async () => {
  const orders = [{ _id: 'o1', number: '00001', finalValue: 150, amountPaid: 30 }];
  const OrderModel = {
    countDocuments: async () => 2,
    find: () => query(orders),
    aggregate: async (pipeline) => (
      pipeline.some((stage) => '$group' in stage) ? [{ totalOpen: 120, totalReceived: 30 }] : [{
        order: { number: '00001', client: { name: 'Bia' } },
        parcela: 1,
        dueDate: '2026-10-20',
        amount: 40,
      }]
    ),
  };
  const handler = createReceivablesListHandler({ OrderModel });
  const res = response();

  await handler({ query: { filter: 'open', page: '1', pageSize: '1' } }, res);

  assert.deepEqual(res.body.items, orders);
  assert.equal(res.body.total, 2);
  assert.deepEqual(res.body.summary, {
    totalOpen: 120,
    totalReceived: 30,
    upcoming: [{
      order: { number: '00001', client: { name: 'Bia' } },
      parcela: 1,
      dueDate: '2026-10-20',
      amount: 40,
    }],
  });
});

test('receivables filters and summaries include payment discounts in balance calculations', async () => {
  let countFilter;
  let groupedPipeline;
  const OrderModel = {
    countDocuments: async (filter) => { countFilter = filter; return 1; },
    find: () => query([{
      _id: 'o1',
      number: '00001',
      finalValue: 100,
      amountPaid: 20,
      paymentDiscounts: [{ amount: 30 }],
    }]),
    aggregate: async (pipeline) => {
      if (pipeline.some((stage) => '$group' in stage)) {
        groupedPipeline = pipeline;
        return [{ totalOpen: 50, totalReceived: 20 }];
      }
      return [];
    },
  };
  const handler = createReceivablesListHandler({ OrderModel });
  const res = response();

  await handler({ query: { filter: 'open', page: '1', pageSize: '5' } }, res);

  assert.equal(res.body.summary.totalOpen, 50);
  assert.equal(res.body.summary.totalReceived, 20);
  assert.deepEqual(countFilter.$and[0].status, { $ne: 'cancelado' });
  assert.match(JSON.stringify(countFilter), /paymentDiscounts/);
  assert.match(JSON.stringify(groupedPipeline), /paymentDiscounts/);
});

test('client summaries include payment discounts without counting them as receipts', async () => {
  const handler = createClientListHandler({
    ClientModel: {
      find: () => query([{ _id: 'c1', toObject: () => ({ _id: 'c1', name: 'Maria' }) }]),
    },
    OrderModel: {
      find: async () => [{
        status: 'aprovado',
        finalValue: 100,
        amountPaid: 20,
        paymentDiscounts: [{ amount: 30 }],
      }],
    },
  });
  const res = response();

  await handler({ query: {} }, res);

  assert.equal(res.body[0].openOrders, 1);
  assert.equal(res.body[0].openBalance, 50);
});

test('list handlers reject invalid pagination with HTTP 400', async () => {
  const handler = createPayableListHandler();
  const res = response();

  await handler({ query: { page: '0' } }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /page/);
});
