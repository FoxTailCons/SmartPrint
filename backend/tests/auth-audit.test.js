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
    email: 'admin@example.com',
    role: 'admin',
    active: true,
    async matchPassword(password) { return password === 'right-password'; },
  };
  const UserModel = {
    findOne() {
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
    body: { email: 'admin@example.com', password: 'wrong-password' },
    ip: '192.0.2.4',
  }, failed);
  assert.equal(failed.statusCode, 401);
  assert.equal(events[0].sucesso, false);
  assert.equal(events[0].usuarioSolicitante, 'admin-id');
  assert.equal(JSON.stringify(events[0]).includes('wrong-password'), false);

  const successful = createResponse();
  await handler({
    body: { email: 'admin@example.com', password: 'right-password' },
    ip: '192.0.2.4',
  }, successful);
  assert.equal(successful.body.token, 'jwt');
  assert.equal(events[1].sucesso, true);
  assert.equal(events[1].acao, 'auth.login');
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
