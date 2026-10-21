import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeOrderAction, verifyAdminCredentials } from '../services/adminAuthorization.js';
import ordersRouter, { adminAuthorizationLimiter } from '../routes/orders.js';

const createUserModel = (user) => {
  const calls = [];
  return {
    calls,
    findOne(query) {
      calls.push({ query });
      return {
        select(selection) {
          calls.at(-1).selection = selection;
          return Promise.resolve(user);
        },
      };
    },
  };
};

test('Admin credential verification normalizes email and returns only a matching active Admin', async () => {
  const admin = {
    _id: 'admin-id',
    role: 'admin',
    active: true,
    async matchPassword(password) { return password === 'admin-password'; },
  };
  const UserModel = createUserModel(admin);

  const result = await verifyAdminCredentials({ email: ' ADMIN@EXAMPLE.COM ', password: 'admin-password' }, UserModel);

  assert.equal(result, admin);
  assert.deepEqual(UserModel.calls, [{ query: { email: 'admin@example.com' }, selection: '+password' }]);
  assert.equal(JSON.stringify(result).includes('admin-password'), false);
});

test('Admin credential verification rejects missing or malformed credentials without querying', async () => {
  const UserModel = createUserModel(null);

  for (const credentials of [undefined, {}, { email: 'not-an-email', password: 'x' }, { email: 'admin@example.com', password: '' }]) {
    assert.equal(await verifyAdminCredentials(credentials, UserModel), null);
  }
  assert.equal(UserModel.calls.length, 0);
});

test('Admin credential verification rejects wrong password, inactive Admin, and non-Admin accounts', async () => {
  const cases = [
    { role: 'admin', active: true, passwordMatches: false },
    { role: 'admin', active: false, passwordMatches: true },
    { role: 'atendente', active: true, passwordMatches: true },
  ];

  for (const account of cases) {
    const UserModel = createUserModel({
      role: account.role,
      active: account.active,
      async matchPassword() { return account.passwordMatches; },
    });
    assert.equal(await verifyAdminCredentials({ email: 'admin@example.com', password: 'password' }, UserModel), null);
  }
});

test('order action authorization trusts the active requester Admin and verifies attendant credentials', async () => {
  const requesterAdmin = { _id: 'admin-requester', role: 'admin', active: true };
  const admin = {
    _id: 'authorizing-admin',
    role: 'admin',
    active: true,
    async matchPassword() { return true; },
  };
  const AdminModel = createUserModel(admin);
  const adminModelUnused = createUserModel(null);

  assert.equal(await authorizeOrderAction({ requester: requesterAdmin, UserModel: adminModelUnused }), requesterAdmin);
  assert.equal(adminModelUnused.calls.length, 0);
  assert.equal(await authorizeOrderAction({
    requester: { _id: 'attendant', role: 'atendente' },
    adminAuthorization: { email: 'admin@example.com', password: 'admin-password' },
    UserModel: AdminModel,
  }), admin);
});

test('order action authorization rejects invalid Admin credentials and Production requesters', async () => {
  const UserModel = createUserModel(null);

  assert.equal(await authorizeOrderAction({
    requester: { _id: 'attendant', role: 'atendente' },
    adminAuthorization: { email: 'admin@example.com', password: 'wrong' },
    UserModel,
  }), null);
  assert.equal(await authorizeOrderAction({
    requester: { _id: 'production', role: 'producao' },
    adminAuthorization: { email: 'admin@example.com', password: 'admin-password' },
    UserModel,
  }), null);
  assert.equal(UserModel.calls.length, 1);
});

test('payment route limits Admin credential attempts to ten per fifteen minutes', async () => {
  const route = ordersRouter.stack.find((layer) => layer.route?.path === '/:id/payments')?.route;
  assert.ok(route.stack.some((layer) => layer.handle === adminAuthorizationLimiter));

  let passed = 0;
  let blocked = 0;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    const res = {
      statusCode: 200,
      headers: {},
      status(code) { this.statusCode = code; return this; },
      setHeader(name, value) { this.headers[name] = value; },
      getHeader(name) { return this.headers[name]; },
      send() { blocked += 1; return this; },
      json() { blocked += 1; return this; },
    };
    await adminAuthorizationLimiter({
      ip: '192.0.2.151',
      method: 'POST',
      originalUrl: '/api/orders/1/payments',
      headers: {},
      app: { get: () => false },
      user: { role: 'atendente' },
      body: { adminAuthorization: { email: 'admin@example.com', password: 'wrong' } },
    }, res, () => { passed += 1; });
  }

  assert.equal(passed, 10);
  assert.equal(blocked, 1);
});
