import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrderBalance, getOrderPaymentStatus, getPaymentDiscountTotal } from './orderBalance.js';

test('payment discounts reduce the balance without affecting the paid amount', () => {
  const order = {
    finalValue: 100,
    amountPaid: 20,
    paymentDiscounts: [{ amount: 10 }, { amount: 15 }],
  };

  assert.equal(getPaymentDiscountTotal(order), 25);
  assert.equal(getOrderBalance(order), 55);
});

test('payment discount balance handles legacy orders and clamps at zero', () => {
  assert.equal(getOrderBalance({ finalValue: 100, amountPaid: 30 }), 70);
  assert.equal(getOrderBalance({
    finalValue: 100,
    amountPaid: 80,
    paymentDiscounts: [{ amount: 30 }],
  }), 0);
});

test('payment status is quitado at zero balance and never aberto when fully paid', () => {
  assert.equal(getOrderPaymentStatus({ finalValue: 100, amountPaid: 100, paymentStatus: 'aberto' }), 'quitado');
  assert.equal(getOrderPaymentStatus({
    finalValue: 100,
    amountPaid: 80,
    paymentDiscounts: [{ amount: 20 }],
  }), 'quitado');
  assert.equal(getOrderPaymentStatus({ finalValue: 100, amountPaid: 50 }), 'parcial');
  assert.equal(getOrderPaymentStatus({ finalValue: 100, amountPaid: 0 }), 'aberto');
});
