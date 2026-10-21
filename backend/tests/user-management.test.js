import test from 'node:test';
import assert from 'node:assert/strict';
import authRouter, { createUserManagementHandlers } from '../routes/auth.js';
import { adminOnly } from '../middleware/auth.js';

const validId = '507f1f77bcf86cd799439011';

const createResponse = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const createUsers = (initial = []) => {
  const records = initial.map((user) => ({ ...user, async save() { return this; } }));
  class UserModel {
    constructor(values) { Object.assign(this, values); }
    async save() {
      if (records.some((user) => user.email === this.email)) {
        const error = new Error('duplicate');
        error.code = 11000;
        throw error;
      }
      this._id = validId;
      this.save = async function save() { return this; };
      records.push(this);
      return this;
    }
    static find() {
      return { select: async () => records };
    }
    static async findById(id) {
      return records.find((user) => user._id === id) || null;
    }
    static async countDocuments(filter) {
      return records.filter((user) => user.role === filter.role && user.active === filter.active).length;
    }
  }
  return { UserModel, records };
};

test('user management routes are restricted to administrators', () => {
  for (const [method, path] of [
    ['get', '/users'],
    ['post', '/users'],
    ['patch', '/users/:id/active'],
  ]) {
    const route = authRouter.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
    assert.ok(route, `${method.toUpperCase()} ${path} route exists`);
    assert.ok(route.route.stack.some((layer) => layer.handle === adminOnly), `${method.toUpperCase()} ${path} requires Admin`);
  }
});

test('user management lists only safe user fields', async () => {
  const { UserModel } = createUsers([{ _id: validId, name: 'Ana', email: 'ana@example.com', role: 'atendente', active: true, password: 'hash' }]);
  const { listUsers } = createUserManagementHandlers({ UserModel });
  const res = createResponse();

  await listUsers({}, res);

  assert.deepEqual(res.body, [{ _id: validId, name: 'Ana', email: 'ana@example.com', role: 'atendente', active: true }]);
});

test('user management creates only attendant or production accounts with normalized fields', async () => {
  for (const role of ['atendente', 'producao']) {
    const { UserModel, records } = createUsers();
    const { createUser } = createUserManagementHandlers({ UserModel });
    const res = createResponse();

    await createUser({ body: { name: ' Ana ', email: ' ANA@EXAMPLE.COM ', password: 'secure-password-1', role } }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(records[0].name, 'Ana');
    assert.equal(records[0].email, 'ana@example.com');
    assert.equal(records[0].role, role);
    assert.equal(res.body.email, 'ana@example.com');
    assert.equal('password' in res.body, false);
  }
});

test('user management rejects invalid account fields and administrator role assignment', async () => {
  for (const body of [
    { name: '', email: 'ana@example.com', password: 'secure-password-1', role: 'atendente' },
    { name: 'Ana', email: 'not-an-email', password: 'secure-password-1', role: 'atendente' },
    { name: 'Ana', email: 'ana@example.com', password: 'short', role: 'atendente' },
    { name: 'Ana', email: 'ana@example.com', password: 'secure-password-1', role: 'admin' },
  ]) {
    const { UserModel, records } = createUsers();
    const { createUser } = createUserManagementHandlers({ UserModel });
    const res = createResponse();

    await createUser({ body }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(records.length, 0);
  }
});

test('user management maps duplicate account email to conflict', async () => {
  const { UserModel, records } = createUsers([{ email: 'ana@example.com' }]);
  const { createUser } = createUserManagementHandlers({ UserModel });
  const res = createResponse();

  await createUser({ body: { name: 'Ana', email: 'ana@example.com', password: 'secure-password-1', role: 'atendente' } }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(records.length, 1);
});

test('user management activates and deactivates accounts by valid identifier', async () => {
  const { UserModel, records } = createUsers([{ _id: validId, name: 'Ana', email: 'ana@example.com', role: 'atendente', active: false, password: 'hash' }]);
  const { setUserActive } = createUserManagementHandlers({ UserModel });
  const activated = createResponse();

  await setUserActive({ params: { id: validId }, body: { active: true }, user: { _id: 'admin-1', role: 'admin' } }, activated);

  assert.equal(activated.statusCode, 200);
  assert.equal(records[0].active, true);
  assert.equal('password' in activated.body, false);

  const deactivated = createResponse();
  await setUserActive({ params: { id: validId }, body: { active: false }, user: { _id: 'admin-1', role: 'admin' } }, deactivated);
  assert.equal(deactivated.statusCode, 200);
  assert.equal(records[0].active, false);
});

test('user management rejects invalid or missing account identifiers', async () => {
  const { UserModel } = createUsers();
  const { setUserActive } = createUserManagementHandlers({ UserModel });
  const invalid = createResponse();
  await setUserActive({ params: { id: 'invalid' }, body: { active: false }, user: { _id: 'admin-1', role: 'admin' } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const missing = createResponse();
  await setUserActive({ params: { id: validId }, body: { active: false }, user: { _id: 'admin-1', role: 'admin' } }, missing);
  assert.equal(missing.statusCode, 404);
});

test('user management prevents administrators from deactivating themselves or the last active Admin', async () => {
  const self = createUsers([{ _id: validId, name: 'Admin', email: 'admin@example.com', role: 'admin', active: true }]);
  const { setUserActive } = createUserManagementHandlers({ UserModel: self.UserModel });
  const selfResponse = createResponse();
  await setUserActive({ params: { id: validId }, body: { active: false }, user: { _id: validId, role: 'admin' } }, selfResponse);
  assert.equal(selfResponse.statusCode, 400);

  const lastAdmin = createUsers([{ _id: validId, name: 'Admin', email: 'admin@example.com', role: 'admin', active: true }]);
  const lastAdminHandler = createUserManagementHandlers({ UserModel: lastAdmin.UserModel }).setUserActive;
  const lastAdminResponse = createResponse();
  await lastAdminHandler({ params: { id: validId }, body: { active: false }, user: { _id: 'other-admin', role: 'admin' } }, lastAdminResponse);
  assert.equal(lastAdminResponse.statusCode, 409);
  assert.equal(lastAdmin.records[0].active, true);
});
