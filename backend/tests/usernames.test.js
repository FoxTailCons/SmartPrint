import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findAvailableUsername,
  isValidUsername,
  migrateUsernames,
  normalizeUsername,
  usernameFromEmail,
} from '../services/usernames.js';

test('username normalization and validation are stable and restrictive', () => {
  assert.equal(normalizeUsername('  Ana.Silva '), 'ana.silva');
  assert.equal(isValidUsername('ana.silva-2'), true);
  assert.equal(isValidUsername('ab'), false);
  assert.equal(isValidUsername('nome com espaço'), false);
});

test('legacy email prefixes become readable usernames and collisions get suffixes', async () => {
  assert.equal(usernameFromEmail('João.Silva@example.com'), 'joao.silva');
  assert.equal(usernameFromEmail('a@example.com'), 'a-user');
  assert.equal(await findAvailableUsername('ana', async (value) => value === 'ana'), 'ana2');
});

test('username migration fills legacy users deterministically and preserves existing usernames', async () => {
  const records = [
    { _id: '1', email: 'ana@example.com' },
    { _id: '2', email: 'ana.2@example.com', username: 'chosen-name' },
    { _id: '3', email: 'ana@example.org' },
  ];
  const UserModel = {
    find: () => ({
      select: () => ({
        sort: async () => records,
      }),
    }),
    findOne: ({ username, _id }) => ({
      select: async () => records.find((user) => user.username === username && user._id !== _id.$ne) || null,
    }),
  };
  records.forEach((record) => {
    record.save = async () => record;
  });

  assert.equal(await migrateUsernames(UserModel), 2);
  assert.deepEqual(records.map(({ username }) => username), ['ana', 'chosen-name', 'ana2']);
});
