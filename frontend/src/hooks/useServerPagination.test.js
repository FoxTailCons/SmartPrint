import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaginatedUrl, normalizePageResponse } from './serverPagination.js';

test('buildPaginatedUrl preserves filters and encodes page parameters', () => {
  assert.equal(
    buildPaginatedUrl('/api/orders', 'status=aprovado&q=ABC', 2, 20),
    '/api/orders?status=aprovado&q=ABC&page=2&pageSize=20'
  );
});

test('normalizePageResponse supports legacy arrays by slicing locally', () => {
  assert.deepEqual(
    normalizePageResponse(['a', 'b', 'c'], 2, 2),
    { items: ['c'], page: 2, pageSize: 2, total: 3, summary: null }
  );
});

test('normalizePageResponse validates paginated envelope metadata', () => {
  assert.deepEqual(
    normalizePageResponse({ items: ['x'], page: 3, pageSize: 10, total: 21 }, 1, 10),
    { items: ['x'], page: 3, pageSize: 10, total: 21, summary: null }
  );
  assert.throws(() => normalizePageResponse({ items: 'wrong' }, 1, 10), /resposta de paginação inválida/);
});
