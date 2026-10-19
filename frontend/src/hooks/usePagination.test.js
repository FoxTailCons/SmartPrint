import test from 'node:test';
import assert from 'node:assert/strict';
import { getPageItems, getPaginationState } from './usePagination.js';

test('getPageItems slices items and clamps the requested page', () => {
  const source = Array.from({ length: 25 }, (_, index) => index + 1);

  assert.deepEqual(getPageItems(source, 2, 10), {
    items: source.slice(10, 20),
    page: 2,
    pageSize: 10,
    total: 25,
  });
  assert.deepEqual(getPageItems(source, 9, 10), {
    items: [21, 22, 23, 24, 25],
    page: 3,
    pageSize: 10,
    total: 25,
  });
});

test('getPageItems returns an empty first page for empty data and invalid sizing', () => {
  assert.deepEqual(getPageItems([], 4, 0), {
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
  });
});

test('getPaginationState exposes accessible navigation bounds and visible range', () => {
  assert.deepEqual(getPaginationState(2, 10, 25), {
    page: 2,
    pageCount: 3,
    firstItem: 11,
    lastItem: 20,
    total: 25,
    canGoPrevious: true,
    canGoNext: true,
  });
  assert.equal(getPaginationState(1, 10, 0).canGoPrevious, false);
  assert.equal(getPaginationState(1, 10, 0).canGoNext, false);
});
