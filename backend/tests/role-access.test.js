import test from 'node:test';
import assert from 'node:assert/strict';
import * as auth from '../middleware/auth.js';
import ordersRouter from '../routes/orders.js';
import clientsRouter from '../routes/clients.js';
import payablesRouter from '../routes/payables.js';
import dashboardRouter from '../routes/dashboard.js';
import cashRouter from '../routes/cash.js';
import productsRouter from '../routes/products.js';
import exportsRouter from '../routes/exports.js';

const response = () => ({
  statusCode: 200,
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; },
});

test('role guard allows each explicitly assigned profile', () => {
  assert.equal(typeof auth.allowRoles, 'function');
  for (const role of ['admin', 'atendente']) {
    let nextCalls = 0;
    const res = response();
    auth.allowRoles('admin', 'atendente')({ user: { role } }, res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(res.statusCode, 200);
  }
});

test('role guard denies missing or unassigned profile without calling next', () => {
  assert.equal(typeof auth.allowRoles, 'function');
  for (const user of [undefined, {}, { role: 'producao' }]) {
    let nextCalls = 0;
    const res = response();
    auth.allowRoles('admin', 'atendente')({ user }, res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 0);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { message: 'Acesso restrito ao perfil' });
  }
});

const responseForRoute = () => ({
  statusCode: 200,
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; },
});

const assertRouteRoles = (router, method, path, allowedRoles, deniedRoles) => {
  const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  assert.ok(route, `${method.toUpperCase()} ${path} is registered`);
  const guard = route.route.stack.find((layer => ['allowRolesMiddleware', 'adminOnly'].includes(layer.handle.name)))?.handle
    || router.stack.find((layer) => ['allowRolesMiddleware', 'adminOnly'].includes(layer.handle.name))?.handle;
  assert.equal(typeof guard, 'function', `${method.toUpperCase()} ${path} has an explicit role guard`);
  for (const role of allowedRoles) {
    let nextCalls = 0;
    const res = responseForRoute();
    guard({ user: { role } }, res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1, `${role} may access ${method.toUpperCase()} ${path}`);
  }
  for (const role of deniedRoles) {
    let nextCalls = 0;
    const res = responseForRoute();
    guard({ user: { role } }, res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 0, `${role} may not access ${method.toUpperCase()} ${path}`);
    assert.equal(res.statusCode, 403);
  }
};

test('commercial, finance, catalog and production routes enforce the role matrix', () => {
  assertRouteRoles(ordersRouter, 'get', '/', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(ordersRouter, 'post', '/', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(ordersRouter, 'post', '/quick-sale', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(ordersRouter, 'post', '/:id/approve', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(ordersRouter, 'post', '/:id/payments', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(ordersRouter, 'get', '/receivables', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(ordersRouter, 'get', '/production-board', ['admin', 'atendente', 'producao'], []);
  assertRouteRoles(ordersRouter, 'get', '/production-assignees', ['admin', 'atendente', 'producao'], []);
  assertRouteRoles(ordersRouter, 'post', '/:id/production/assignment', ['admin'], ['atendente', 'producao']);
  assertRouteRoles(ordersRouter, 'post', '/:id/production/task', ['admin', 'atendente', 'producao'], []);
  assertRouteRoles(ordersRouter, 'get', '/:id', ['admin', 'atendente', 'producao'], []);
  assertRouteRoles(ordersRouter, 'get', '/:id/pdf', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(ordersRouter, 'get', '/:id/whatsapp', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(ordersRouter, 'delete', '/:id', ['admin'], ['atendente', 'producao']);
  assertRouteRoles(clientsRouter, 'get', '/', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(clientsRouter, 'post', '/', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(clientsRouter, 'put', '/:id', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(clientsRouter, 'delete', '/:id', ['admin'], ['atendente', 'producao']);
  assertRouteRoles(payablesRouter, 'get', '/', ['admin'], ['atendente', 'producao']);
  assertRouteRoles(payablesRouter, 'post', '/', ['admin'], ['atendente', 'producao']);
  assertRouteRoles(dashboardRouter, 'get', '/', ['admin'], ['atendente', 'producao']);
  assertRouteRoles(cashRouter, 'get', '/current', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(productsRouter, 'get', '/', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(productsRouter, 'post', '/', ['admin'], ['atendente', 'producao']);
  assertRouteRoles(productsRouter, 'patch', '/:id/deactivate', ['admin'], ['atendente', 'producao']);
  assertRouteRoles(exportsRouter, 'get', '/orders', ['admin', 'atendente'], ['producao']);
  assertRouteRoles(exportsRouter, 'get', '/finance', ['admin'], ['atendente', 'producao']);
});
