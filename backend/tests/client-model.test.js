import test from 'node:test';
import assert from 'node:assert/strict';
import Client from '../models/Client.js';

test('Client stores structured address and registration details while retaining legacy address support', async () => {
  const client = new Client({
    name: 'Maria',
    phone: '11999999999',
    address: 'Rua dos Pinheiros',
    addressNumber: '123',
    addressComplement: 'Sala 4',
    neighborhood: 'Pinheiros',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '05422-000',
    stateRegistration: '123.456.789.112',
    contact: 'João',
  });

  await client.validate();

  assert.equal(client.address, 'Rua dos Pinheiros');
  assert.equal(client.addressNumber, '123');
  assert.equal(client.addressComplement, 'Sala 4');
  assert.equal(client.neighborhood, 'Pinheiros');
  assert.equal(client.city, 'São Paulo');
  assert.equal(client.state, 'SP');
  assert.equal(client.zipCode, '05422-000');
  assert.equal(client.stateRegistration, '123.456.789.112');
  assert.equal(client.contact, 'João');

  const legacyClient = new Client({ name: 'Legado', phone: '11999999999', address: 'Rua inteira, 123, Centro' });
  await legacyClient.validate();
  assert.equal(legacyClient.address, 'Rua inteira, 123, Centro');
  assert.equal(legacyClient.neighborhood, '');
});
