import test from 'node:test';
import assert from 'node:assert/strict';
import { getListState } from './listState.js';

test('list state distinguishes loading, error, empty, and ready in priority order', () => {
  assert.equal(getListState({ loading: true, error: 'failed', items: [1] }), 'loading');
  assert.equal(getListState({ loading: false, error: 'failed', items: [] }), 'error');
  assert.equal(getListState({ loading: false, error: '', items: [] }), 'empty');
  assert.equal(getListState({ loading: false, error: '', items: [1] }), 'ready');
});
