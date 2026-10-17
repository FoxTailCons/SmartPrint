import test from 'node:test';
import assert from 'node:assert/strict';

import { splitInstallmentAmounts } from './installmentMath.js';

test('splitInstallmentAmounts splits a balance into cent-accurate installments', () => {
  assert.deepEqual(splitInstallmentAmounts(100, 3), [33.33, 33.33, 33.34]);
});

test('splitInstallmentAmounts returns no installments for a zero count', () => {
  assert.deepEqual(splitInstallmentAmounts(100, 0), []);
});
