import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import auditRouter, { createAuditListHandler, createAuditRouter } from '../routes/audit.js';
import { adminOnly } from '../middleware/auth.js';

test('audit listing is protected by authentication and Admin authorization', () => {
  const route = auditRouter.stack.find((layer) => layer.route?.path === '/');
  assert.ok(route);
  assert.ok(auditRouter.stack.some((layer) => layer.handle.name === 'protect'));
  assert.ok(auditRouter.stack.some((layer) => layer.handle === adminOnly));
});

test('audit listing applies validated filters and returns the newest page', async () => {
  const calls = [];
  const AuditLogModel = {
    countDocuments(filter) {
      calls.push(['count', filter]);
      return Promise.resolve(1);
    },
    find(filter) {
      calls.push(['find', filter]);
      const query = {
        sort(value) { calls.push(['sort', value]); return this; },
        skip(value) { calls.push(['skip', value]); return this; },
        limit(value) { calls.push(['limit', value]); return this; },
        populate(path, fields) { calls.push(['populate', path, fields]); return this; },
        lean() { return Promise.resolve([{ acao: 'caixa.fechamento' }]); },
      };
      return query;
    },
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await createAuditListHandler({ AuditLogModel })({
    query: { acao: 'caixa.fechamento', page: '1' },
  }, res, (error) => { throw error; });

  assert.deepEqual(res.body, {
    items: [{ acao: 'caixa.fechamento' }],
    page: 1,
    pageSize: 20,
    total: 1,
  });

  test('audit HTTP endpoint denies anonymous and non-Admin users', async (t) => {
    const app = express();
    const requireTestUser = (req, res, next) => {
      const role = req.get('x-test-role');
      if (!role) return res.status(401).json({ message: 'Não autorizado' });
      req.user = { role };
      return next();
    };
    app.use('/api/audit', createAuditRouter({
      AuditLogModel: {
        countDocuments: async () => 0,
        find: () => ({
          sort() { return this; },
          skip() { return this; },
          limit() { return this; },
          populate() { return this; },
          lean: async () => [],
        }),
      },
      protectMiddleware: requireTestUser,
    }));
    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    const url = `http://127.0.0.1:${server.address().port}/api/audit`;

    const anonymous = await fetch(url);
    assert.equal(anonymous.status, 401);
    const attendant = await fetch(url, { headers: { 'x-test-role': 'atendente' } });
    assert.equal(attendant.status, 403);
  });
  assert.deepEqual(calls.find(([kind]) => kind === 'sort'), ['sort', { data: -1 }]);
});
