import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPage, getEffectivePage, parsePagination } from '../services/pagination.js';

test('legacy queries omit pagination', () => {
  assert.equal(parsePagination({}), null);
});

test('page-only and page-size-only queries use default values for missing parameters', () => {
  assert.deepEqual(parsePagination({ page: '3' }), { page: 3, pageSize: 20, skip: 40 });
  assert.deepEqual(parsePagination({ pageSize: '10' }), { page: 1, pageSize: 10, skip: 0 });
});

test('pagination rejects non-positive, fractional, and non-numeric values', () => {
  for (const query of [
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: 'abc' },
    { pageSize: '0' },
    { pageSize: '-5' },
    { pageSize: '1.5' },
    { pageSize: 'abc' },
  ]) {
    assert.ok(parsePagination(query).error, JSON.stringify(query));
  }
});

test('pagination caps page size at the configured maximum', () => {
  assert.deepEqual(
    parsePagination({ page: '2', pageSize: '500' }, { defaultPageSize: 20, maxPageSize: 100 }),
    { page: 2, pageSize: 100, skip: 100 }
  );
});

test('effective page is bounded to available results and empty sets use page one', () => {
  assert.equal(getEffectivePage(4, 20, 41), 3);
  assert.equal(getEffectivePage(5, 20, 0), 1);
  assert.equal(getEffectivePage(2, 20, 41), 2);
});

test('page envelope includes items and pagination metadata', () => {
  assert.deepEqual(buildPage(['a', 'b'], 2, 10, 12), {
    items: ['a', 'b'],
    page: 2,
    pageSize: 10,
    total: 12,
  });
});
