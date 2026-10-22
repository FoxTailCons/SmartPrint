import test from 'node:test';
import assert from 'node:assert/strict';

import { recalculatePaidInstallments, recalculateUnpaidInstallments, receiveDownPayment } from '../services/orderInstallments.js';

test('recalculateUnpaidInstallments divides the remaining balance and preserves paid installments', () => {
  const installments = [
    { amount: 20, paid: true },
    { amount: 40, paid: false },
    { amount: 40, paid: false },
  ];

  recalculateUnpaidInstallments(installments, 70);

  assert.deepEqual(installments.map(({ amount }) => amount), [20, 35, 35]);
});

test('recalculateUnpaidInstallments assigns any cent remainder to the last unpaid installment', () => {
  const installments = [{ amount: 0, paid: false }, { amount: 0, paid: false }, { amount: 0, paid: false }];

  recalculateUnpaidInstallments(installments, 100);

  assert.deepEqual(installments.map(({ amount }) => amount), [33.33, 33.33, 33.34]);
});

test('receiveDownPayment records the entry and recalculates the remaining balance', () => {
  const order = {
    downPayment: 30,
    amountPaid: 0,
    finalValue: 100,
    paymentMethod: 'pix',
    payments: [],
    installments: [{ amount: 50, paid: false }, { amount: 50, paid: false }],
  };

  receiveDownPayment(order, new Date('2026-10-17T12:00:00Z'));

  assert.equal(order.amountPaid, 30);
  assert.equal(order.paymentStatus, 'parcial');
  assert.equal(order.payments.length, 1);
  assert.equal(order.payments[0].amount, 30);
  assert.equal(order.payments[0].type, 'entrada');
  assert.deepEqual(order.installments.map(({ amount }) => amount), [35, 35]);
});

test('receiveDownPayment removes installments when the entry pays the full order', () => {
  const order = {
    downPayment: 100,
    amountPaid: 0,
    finalValue: 100,
    paymentMethod: 'pix',
    payments: [],
    installments: [{ amount: 50, paid: false }, { amount: 50, paid: false }],
  };

  receiveDownPayment(order);

  assert.equal(order.paymentStatus, 'quitado');
  assert.deepEqual(order.installments, []);
});

test('recalculatePaidInstallments ignores canceled receipts and preserves entry as a separate payment', () => {
  const order = {
    payments: [
      { amount: 30, type: 'entrada', paidAt: new Date('2026-10-17T12:00:00Z') },
      { amount: 40, installmentIds: ['installment-1'], paidAt: new Date('2026-10-18T12:00:00Z') },
      { amount: 60, canceledAt: new Date('2026-10-19T12:00:00Z') },
    ],
    installments: [
      { _id: 'installment-1', amount: 40, paid: true, paidAt: new Date('2026-10-18T12:00:00Z') },
      { _id: 'installment-2', amount: 60, paid: true, paidAt: new Date('2026-10-19T12:00:00Z') },
    ],
  };

  recalculatePaidInstallments(order);

  assert.deepEqual(order.installments.map(({ paid }) => paid), [true, false]);
});

test('recalculatePaidInstallments preserves legacy installments linked by their received timestamp', () => {
  const firstPaymentAt = new Date('2026-10-18T12:00:00Z');
  const canceledPaymentAt = new Date('2026-10-19T12:00:00Z');
  const order = {
    payments: [
      { amount: 40, paidAt: firstPaymentAt },
      { amount: 60, paidAt: canceledPaymentAt, canceledAt: new Date('2026-10-20T12:00:00Z') },
    ],
    installments: [
      { _id: 'installment-1', amount: 40, paid: true, paidAt: firstPaymentAt },
      { _id: 'installment-2', amount: 60, paid: true, paidAt: canceledPaymentAt },
    ],
  };

  recalculatePaidInstallments(order);

  assert.deepEqual(order.installments.map(({ paid }) => paid), [true, false]);
});
