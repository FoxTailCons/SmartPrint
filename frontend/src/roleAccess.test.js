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
