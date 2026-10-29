import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';
import authRouter, { createUserManagementHandlers } from '../routes/auth.js';
import { adminOnly } from '../middleware/auth.js';

const validId = '507f1f77bcf86cd799439011';

const createResponse = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const createUsers = (initial = []) => {
  const records = [];
  const duplicateEmail = () => {
    const error = new Error('duplicate');
    error.code = 11000;
    return error;
  };
  records.push(...initial.map((user) => ({
    ...user,
    async save() {
      if (records.some((record) => record !== this && ((this.email && record.email === this.email) || (this.username && record.username === this.username)))) throw duplicateEmail();
      return this;
    },
  })));
  class UserModel {
    constructor(values) { Object.assign(this, values); }
    async save() {
      if (records.some((user) => (this.email && user.email === this.email) || (this.username && user.username === this.username))) {
        throw duplicateEmail();
      }
      this._id = validId;
      this.save = async function save() {
        if (records.some((user) => user !== this && ((this.email && user.email === this.email) || (this.username && user.username === this.username)))) throw duplicateEmail();
        return this;
      };
      records.push(this);
      return this;
    }
    static find(filter = {}) {
      return {
        select: async () => records.filter((user) => (
          !Object.hasOwn(filter, 'archivedAt') || user.archivedAt == null
        )),
      };
    }
    static findOne(filter = {}) {
      return {
        select: async () => records.find((user) => {
          if (filter.$or) return filter.$or.some((condition) => Object.entries(condition).every(([key, value]) => user[key] === value));
          return Object.entries(filter).every(([key, value]) => user[key] === value);
        }) || null,
      };
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
    ['patch', '/users/:id'],
    ['delete', '/users/:id'],
  ]) {
    const route = authRouter.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
    assert.ok(route, `${method.toUpperCase()} ${path} route exists`);
    assert.ok(route.route.stack.some((layer) => layer.handle === adminOnly), `${method.toUpperCase()} ${path} requires Admin`);
  }
});

test('User allows accounts without email and indexes provided emails uniquely', async () => {
  const emailPath = User.schema.path('email');
  const emailIndex = User.schema.indexes().find(([keys]) => keys.email === 1);
  const user = new User({ name: 'Sem e-mail', username: 'sem-email', password: 'abc12345', role: 'atendente' });

  assert.equal(Boolean(emailPath.isRequired), false);
  assert.equal(User.schema.options.autoIndex, false);
  assert.equal(emailIndex[1].unique, true);
  assert.equal(emailIndex[1].sparse, true);
  await user.validate();
  assert.equal(user.email, undefined);
});

test('user management lists only safe user fields', async () => {
  const { UserModel } = createUsers([{ _id: validId, name: 'Ana', username: 'ana', email: 'ana@example.com', role: 'atendente', active: true, password: 'hash' }]);
  const { listUsers } = createUserManagementHandlers({ UserModel });
  const res = createResponse();

  await listUsers({}, res);

  assert.deepEqual(res.body, [{ _id: validId, name: 'Ana', username: 'ana', email: 'ana@example.com', role: 'atendente', active: true }]);
});

test('user management creates only attendant or production accounts with normalized fields', async () => {
  for (const role of ['atendente', 'producao']) {
    const { UserModel, records } = createUsers();
    const { createUser } = createUserManagementHandlers({ UserModel });
    const res = createResponse();

    await createUser({ body: { name: ' Ana ', email: ' ANA@EXAMPLE.COM ', password: 'abc12345', role } }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(records[0].name, 'Ana');
    assert.equal(records[0].username, 'ana');
    assert.equal(records[0].email, 'ana@example.com');
    assert.equal(records[0].role, role);
    assert.equal(res.body.email, 'ana@example.com');
    assert.equal(res.body.username, 'ana');
    assert.equal('password' in res.body, false);
  }
});

test('user management creates accounts without email using a unique username derived from the name', async () => {
  const { UserModel, records } = createUsers([{ username: 'maria-silva' }]);
  const { createUser } = createUserManagementHandlers({ UserModel });
  const res = createResponse();

  await createUser({ body: { name: 'Maria Silva', password: 'abc12345', role: 'atendente' } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(records[1].username, 'maria-silva2');
  assert.equal(records[1].email, undefined);
  assert.equal(res.body.email, '');
});

test('user management rejects invalid account fields and administrator role assignment', async () => {
  for (const body of [
    { name: '', email: 'ana@example.com', password: 'abc12345', role: 'atendente' },
    { name: 'Ana', username: 'x', email: 'ana@example.com', password: 'abc12345', role: 'atendente' },
    { name: 'Ana', email: 'not-an-email', password: 'abc12345', role: 'atendente' },
    { name: 'Ana', email: 42, password: 'abc12345', role: 'atendente' },
    { name: 'Ana', email: 'ana@example.com', password: '12345', role: 'atendente' },
    { name: 'Ana', email: 'ana@example.com', password: '1234567', role: 'atendente' },
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

  await createUser({ body: { name: 'Ana', email: 'ana@example.com', password: 'abc12345', role: 'atendente' } }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /nome de usu[\u00e1a]rio ou e-mail/);
  assert.equal(records.length, 1);
});

test('user management rejects a duplicate explicit username', async () => {
  const { UserModel, records } = createUsers([{
    _id: validId,
    username: 'ana',
    email: 'ana@example.com',
  }]);
  const { createUser } = createUserManagementHandlers({ UserModel });
  const res = createResponse();

  await createUser({
    body: {
      name: 'Bia',
      username: ' ANA ',
      email: 'bia@example.com',
      password: 'abc12345',
      role: 'atendente',
    },
  }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(records.length, 1);
});

test('user management activates and deactivates accounts by valid identifier', async () => {
  const { UserModel, records } = createUsers([{ _id: validId, name: 'Ana', email: 'ana@example.com', role: 'atendente', active: false, password: 'hash' }]);
  const auditEvents = [];
  const { setUserActive } = createUserManagementHandlers({ UserModel, AuditLogModel: { async create(event) { auditEvents.push(event); } } });
  const activated = createResponse();

  await setUserActive({ params: { id: validId }, body: { active: true }, user: { _id: validId, role: 'admin' } }, activated);

  assert.equal(activated.statusCode, 200);
  assert.equal(records[0].active, true);
  assert.equal(auditEvents[0].acao, 'usuario.status_alterado');
  assert.deepEqual(auditEvents[0].detalhes, { usuarioId: validId, ativo: { antes: false, depois: true } });
  assert.equal('password' in activated.body, false);

  const deactivated = createResponse();
  await setUserActive({ params: { id: validId }, body: { active: false }, user: { _id: validId, role: 'admin' } }, deactivated);
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

test('user management edits profile fields, normalizes email, and changes password only when provided', async () => {
  const { UserModel, records } = createUsers([{
    _id: validId, name: 'Ana', username: 'ana', email: 'ana@example.com', role: 'atendente', active: true, password: 'existing-hash',
  }]);
  const auditEvents = [];
  const { updateUser } = createUserManagementHandlers({
    UserModel,
    AuditLogModel: { async create(event) { auditEvents.push(event); } },
  });
  const res = createResponse();

  await updateUser({
    params: { id: validId },
    body: { name: ' Ana Maria ', username: ' Ana.Maria ', email: ' ANA.MARIA@EXAMPLE.COM ', role: 'producao' },
    user: { _id: 'admin-1', role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(records[0].name, 'Ana Maria');
  assert.equal(records[0].username, 'ana.maria');
  assert.equal(records[0].email, 'ana.maria@example.com');
  assert.equal(records[0].role, 'producao');
  assert.equal(records[0].password, 'existing-hash');
  assert.deepEqual(auditEvents[0].detalhes.alteracoes, {
    nome: { antes: 'Ana', depois: 'Ana Maria' },
    nomeUsuario: { antes: 'ana', depois: 'ana.maria' },
    email: { antes: 'ana@example.com', depois: 'ana.maria@example.com' },
    perfil: { antes: 'atendente', depois: 'producao' },
  });
  assert.equal('password' in res.body, false);

  const passwordResponse = createResponse();
  await updateUser({
    params: { id: validId },
    body: { password: '12345678' },
    user: { _id: 'admin-1', role: 'admin' },
  }, passwordResponse);
  assert.equal(records[0].password, '12345678');
  assert.equal('password' in auditEvents[1].detalhes, false);
});

test('user management rejects invalid edits and does not allow editing Admin accounts', async () => {
  const { UserModel, records } = createUsers([
    { _id: validId, name: 'Ana', email: 'ana@example.com', role: 'atendente', active: true },
    { _id: '507f191e810c19729de860ea', name: 'Admin', email: 'admin@example.com', role: 'admin', active: true },
  ]);
  const { updateUser } = createUserManagementHandlers({
    UserModel,
    AuditLogModel: { async create() {} },
  });

  test('user management allows clearing email from non-admin users but keeps Admin email required', async () => {
    const { UserModel, records } = createUsers([
      { _id: validId, name: 'Ana', username: 'ana', email: 'ana@example.com', role: 'atendente', active: true },
      { _id: '507f191e810c19729de860ea', name: 'Admin', username: 'admin', email: 'admin@example.com', role: 'admin', active: true },
    ]);
    const { updateUser } = createUserManagementHandlers({ UserModel, AuditLogModel: { async create() {} } });
    const cleared = createResponse();
    await updateUser({
      params: { id: validId },
      body: { email: '' },
      user: { _id: 'admin-2', role: 'admin' },
    }, cleared);

    assert.equal(cleared.statusCode, 200);
    assert.equal(records[0].email, undefined);

    const adminEmail = createResponse();
    await updateUser({
      params: { id: '507f191e810c19729de860ea' },
      body: { email: '' },
      user: { _id: '507f191e810c19729de860ea', role: 'admin' },
    }, adminEmail);
    assert.equal(adminEmail.statusCode, 400);
    assert.equal(records[1].email, 'admin@example.com');
  });

  for (const body of [
    { name: '   ' },
    { email: 'invalid-email' },
    { password: '12345' },
    { password: '1234567' },
  ]) {
    const res = createResponse();
    await updateUser({ params: { id: validId }, body, user: { _id: 'admin-2', role: 'admin' } }, res);
    assert.equal(res.statusCode, 400);
  }

  const adminResponse = createResponse();
  await updateUser({
    params: { id: '507f191e810c19729de860ea' },
    body: { name: 'Changed Admin' },
    user: { _id: 'admin-2', role: 'admin' },
  }, adminResponse);
  assert.equal(adminResponse.statusCode, 403);
  assert.equal(records[1].name, 'Admin');
});

test('administrator can edit only their own username and email', async () => {
  const { UserModel, records } = createUsers([{
    _id: validId, name: 'Admin', username: 'admin', email: 'admin@example.com', role: 'admin', active: true,
  }]);
  const { updateUser } = createUserManagementHandlers({ UserModel, AuditLogModel: { async create() {} } });
  const res = createResponse();

  await updateUser({
    params: { id: validId },
    body: { username: 'admin.novo', email: 'admin.novo@example.com' },
    user: { _id: validId, role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(records[0].username, 'admin.novo');
  assert.equal(records[0].email, 'admin.novo@example.com');

  const forbidden = createResponse();
  await updateUser({
    params: { id: validId },
    body: { name: 'Novo nome' },
    user: { _id: validId, role: 'admin' },
  }, forbidden);
  assert.equal(forbidden.statusCode, 403);
});

test('user management maps duplicate edit email to conflict', async () => {
  const { UserModel } = createUsers([
    { _id: validId, name: 'Ana', email: 'ana@example.com', role: 'atendente', active: true },
    { _id: '507f191e810c19729de860ea', name: 'Bia', email: 'bia@example.com', role: 'producao', active: true },
  ]);
  const { updateUser } = createUserManagementHandlers({ UserModel });
  const res = createResponse();

  await updateUser({
    params: { id: validId },
    body: { email: 'BIA@example.com' },
    user: { _id: 'admin-2', role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 409);
});

test('deleting a user archives and deactivates it, preserves audit references, and hides it from the active list', async () => {
  const { UserModel, records } = createUsers([{
    _id: validId, name: 'Ana', email: 'ana@example.com', role: 'atendente', active: true,
  }]);
  const auditEvents = [];
  const handlers = createUserManagementHandlers({
    UserModel,
    AuditLogModel: { async create(event) { auditEvents.push(event); } },
  });
  const deleted = createResponse();

  await handlers.deleteUser({ params: { id: validId }, user: { _id: 'admin-1', role: 'admin' } }, deleted);

  assert.equal(deleted.statusCode, 200);
  assert.equal(records[0].active, false);
  assert.ok(records[0].archivedAt instanceof Date);
  assert.ok(User.schema.path('archivedAt'));
  assert.equal(auditEvents[0].acao, 'usuario.arquivado');
  assert.equal(auditEvents[0].detalhes.usuarioId, validId);
  assert.equal('password' in deleted.body, false);

  const listed = createResponse();
  await handlers.listUsers({}, listed);
  assert.deepEqual(listed.body, []);
});

test('user management prevents archiving Admin accounts', async () => {
  const { UserModel, records } = createUsers([{
    _id: validId, name: 'Admin', email: 'admin@example.com', role: 'admin', active: true,
  }]);
  const { deleteUser } = createUserManagementHandlers({ UserModel });
  const res = createResponse();

  await deleteUser({ params: { id: validId }, user: { _id: 'other-admin', role: 'admin' } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(records[0].active, true);
  assert.equal(records[0].archivedAt, undefined);
});

test('archived users cannot be reactivated or edited through user-management routes', async () => {
  const { UserModel, records } = createUsers([{
    _id: validId, name: 'Ana', email: 'ana@example.com', role: 'atendente', active: false, archivedAt: new Date(),
  }]);
  const handlers = createUserManagementHandlers({ UserModel });
  const activateResponse = createResponse();
  await handlers.setUserActive({ params: { id: validId }, body: { active: true } }, activateResponse);
  assert.equal(activateResponse.statusCode, 404);
  assert.equal(records[0].active, false);

  const editResponse = createResponse();
  await handlers.updateUser({ params: { id: validId }, body: { name: 'Renamed' } }, editResponse);
  assert.equal(editResponse.statusCode, 404);
  assert.equal(records[0].name, 'Ana');
});
