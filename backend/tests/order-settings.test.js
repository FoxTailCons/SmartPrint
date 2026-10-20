import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrderSettings } from '../config/orderSettings.js';
import { calculateOrderFinalValue, registeredClientError, requiresRegisteredClient } from '../services/orderClientRequirement.js';

test('order settings provide documented defaults and reject invalid numeric values', () => {
  assert.deepEqual(getOrderSettings({}), {
    quoteValidityDays: 7,
    clientRequiredThreshold: 100,
    businessAddress: '',
    businessPhone: '',
    businessPixKey: '',
    businessInstagram: '@smartprint.lindoia',
  });
  assert.equal(getOrderSettings({ QUOTE_VALIDITY_DAYS: '14', ORDER_CLIENT_REQUIRED_THRESHOLD: '250' }).quoteValidityDays, 14);
  assert.throws(() => getOrderSettings({ QUOTE_VALIDITY_DAYS: '0' }), /QUOTE_VALIDITY_DAYS/);
  assert.throws(() => getOrderSettings({ ORDER_CLIENT_REQUIRED_THRESHOLD: 'NaN' }), /ORDER_CLIENT_REQUIRED_THRESHOLD/);
  assert.throws(() => getOrderSettings({ ORDER_CLIENT_REQUIRED_THRESHOLD: '' }), /ORDER_CLIENT_REQUIRED_THRESHOLD/);
});

test('client requirement uses final rounded total and special categories', () => {
  const settings = { clientRequiredThreshold: 100 };
  assert.equal(calculateOrderFinalValue([{ quantity: 1, unitPrice: 99.2 }], 0), 100);
  assert.throws(() => calculateOrderFinalValue([{ quantity: 1, unitPrice: 101 }], Infinity), /Desconto/);
  assert.throws(() => calculateOrderFinalValue([{ quantity: 1, unitPrice: Infinity }], 0), /Total/);
  assert.equal(requiresRegisteredClient({ finalValue: 100, items: [], ...settings }), false);
  assert.equal(requiresRegisteredClient({ finalValue: 101, items: [], ...settings }), true);
  assert.equal(requiresRegisteredClient({ finalValue: 1, items: [{ category: 'fachada' }], ...settings }), true);
  assert.equal(requiresRegisteredClient({ finalValue: 1, items: [{ category: 'veiculos' }], ...settings }), true);
  assert.match(registeredClientError(null), /nome e telefone/);
  assert.match(registeredClientError({ name: 'Cliente' }), /nome e telefone/);
  assert.equal(registeredClientError({ name: 'Cliente', phone: '51999999999' }), null);
});
