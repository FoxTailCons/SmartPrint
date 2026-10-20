import test from 'node:test';
import assert from 'node:assert/strict';
import * as access from './roleAccess.js';

test('page access follows administrator, attendant and production responsibilities', () => {
  assert.equal(typeof access.canAccess, 'function');
  assert.equal(access.canAccess('admin', 'dashboard'), true);
  assert.equal(access.canAccess('atendente', 'dashboard'), false);
  assert.equal(access.canAccess('atendente', 'orders'), true);
  assert.equal(access.canAccess('producao', 'orders'), false);
  assert.equal(access.canAccess('producao', 'orderDetail'), true);
  assert.equal(access.canAccess('producao', 'production'), true);
  assert.equal(access.canAccess('atendente', 'payables'), false);
  assert.equal(access.canAccess('atendente', 'receivables'), true);
  assert.equal(access.canAccess('producao', 'cash'), false);
  assert.equal(access.canAccess('producao', 'products'), false);
  assert.equal(access.canAccess(undefined, 'orders'), false);
});

test('menu links use the same role permissions as direct routes', () => {
  assert.equal(typeof access.getVisibleMenu, 'function');
  const menu = [
    { to: '/', permission: 'dashboard' },
    { to: '/pedidos', permission: 'orders' },
    { to: '/producao', permission: 'production' },
    { to: '/produtos', permission: 'products' },
    { to: '/caixa', permission: 'cash' },
  ];
  assert.deepEqual(access.getVisibleMenu(menu, 'atendente').map(({ to }) => to), ['/pedidos', '/producao', '/caixa']);
  assert.deepEqual(access.getVisibleMenu(menu, 'producao').map(({ to }) => to), ['/producao']);
});

test('each profile lands on its first operational screen', () => {
  assert.equal(typeof access.getHomePath, 'function');
  assert.equal(access.getHomePath('admin'), '/');
  assert.equal(access.getHomePath('atendente'), '/pedidos');
  assert.equal(access.getHomePath('producao'), '/producao');
});
