import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareUserIndexes } from '../services/userIndexes.js';

test('user indexes replace the legacy email index before creating schema indexes', async () => {
  const operations = [];
  const UserModel = {
    collection: {
      async indexes() {
        operations.push('list');
        return [
          { name: '_id_', key: { _id: 1 } },
          { name: 'email_1', key: { email: 1 }, unique: true },
        ];
      },
      async dropIndex(name) {
        operations.push(`drop:${name}`);
      },
    },
    async createIndexes() {
      operations.push('create');
    },
  };

  await prepareUserIndexes(UserModel);

  assert.deepEqual(operations, ['list', 'drop:email_1', 'create']);
});

test('user indexes are created when the collection has no indexes yet', async () => {
  const operations = [];
  const missingCollection = Object.assign(new Error('namespace missing'), { code: 26 });
  const UserModel = {
    collection: {
      async indexes() { throw missingCollection; },
      async dropIndex() { assert.fail('No index should be dropped'); },
    },
    async createIndexes() { operations.push('create'); },
  };

  await prepareUserIndexes(UserModel);

  assert.deepEqual(operations, ['create']);
});

test('user index migration reports unexpected index listing errors', async () => {
  const failure = new Error('permission denied');
  const UserModel = {
    collection: { async indexes() { throw failure; } },
    async createIndexes() { assert.fail('Indexes should not be created'); },
  };

  await assert.rejects(prepareUserIndexes(UserModel), failure);
});
