import test from 'node:test';
import assert from 'node:assert/strict';
import authRouter, { createLoginHandler, createLogoutHandler } from '../routes/auth.js';

const createResponse = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('login failures and successes create audit records without credentials', async () => {
  const events = [];
  const AuditLogModel = { async create(event) { events.push(event); } };
  const admin = {
    _id: 'admin-id',
    name: 'Admin',
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin',
    active: true,
    async matchPassword(password) { return password === 'right-password'; },
  };
  const lookups = [];
  const UserModel = {
    findOne(query) {
      lookups.push(query);
      return { select: async () => admin };
    },
  };
  const handler = createLoginHandler({
    UserModel,
    AuditLogModel,
    signTokenFn: () => 'jwt',
  });
  const failed = createResponse();
  await handler({
    body: { identifier: 'ADMIN', password: 'wrong-password' },
    ip: '192.0.2.4',
  }, failed);
  assert.equal(failed.statusCode, 401);
  assert.equal(events[0].sucesso, false);
  assert.equal(events[0].usuarioSolicitante, 'admin-id');
  assert.equal(JSON.stringify(events[0]).includes('wrong-password'), false);

  const successful = createResponse();
  await handler({
    body: { identifier: ' ADMIN ', password: 'right-password' },
    ip: '192.0.2.4',
  }, successful);
  assert.equal(successful.body.token, 'jwt');
  assert.equal(events[1].sucesso, true);
  assert.equal(events[1].acao, 'auth.login');
  assert.deepEqual(lookups[0], { $or: [{ username: 'admin' }, { email: 'admin' }] });
  assert.equal(successful.body.user.username, 'admin');

  const legacyEmailLogin = createResponse();
  await handler({ body: { email: 'ADMIN@example.com', password: 'right-password' } }, legacyEmailLogin);
  assert.equal(legacyEmailLogin.body.user.email, 'admin@example.com');
  assert.deepEqual(lookups[2], { $or: [{ username: 'admin@example.com' }, { email: 'admin@example.com' }] });
});

test('login with a missing password is recorded as a failed attempt', async () => {
  const events = [];
  const UserModel = {
    findOne() {
      return {
        select: async () => ({
          _id: '507f1f77bcf86cd799439011',
          active: true,
          async matchPassword() { throw new Error('password must be checked as a string'); },
        }),
      };
    },
  };
  const handler = createLoginHandler({
    UserModel,
    AuditLogModel: { async create(event) { events.push(event); } },
  });
  const res = createResponse();

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await handler({ body: { email: 'ana@example.com' } }, res);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 401);
  assert.equal(events[0].sucesso, false);
});

test('logout records the authenticated user before confirming logout', async () => {
  const events = [];
  const AuditLogModel = { async create(event) { events.push(event); } };
  const logoutRoute = authRouter.stack.find((layer) => layer.route?.path === '/logout');
  assert.ok(logoutRoute);
  const handler = createLogoutHandler({ AuditLogModel });
  const res = createResponse();
  await handler({ user: { _id: 'user-id' }, ip: '192.0.2.5' }, res);
  assert.equal(res.body.ok, true);
  assert.equal(events[0].acao, 'auth.logout');
  assert.equal(events[0].usuarioSolicitante, 'user-id');
});
