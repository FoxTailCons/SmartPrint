import { getOrderPaymentStatus } from './orderBalance.js';

export const recalculateUnpaidInstallments = (installments, balance) => {
  const unpaidInstallments = installments.filter((installment) => !installment.paid);
  if (!unpaidInstallments.length) return;

  const balanceCents = Math.max(0, Math.round((Number(balance) || 0) * 100));
  const baseCents = Math.floor(balanceCents / unpaidInstallments.length);

  unpaidInstallments.forEach((installment, index) => {
    const cents = index === unpaidInstallments.length - 1
      ? balanceCents - baseCents * (unpaidInstallments.length - 1)
      : baseCents;
    installment.amount = cents / 100;
  });
};

export const recalculatePaidInstallments = (order) => {
  const installments = order.installments || [];
  const legacyPaidAt = new Map(installments
    .filter((installment) => installment.paid && installment._id && installment.paidAt)
    .map((installment) => [String(installment._id), new Date(installment.paidAt).getTime()]));
  for (const installment of installments) {
    installment.paid = false;
    installment.paidAt = undefined;
  }

  for (const payment of order.payments || []) {
    if (payment.canceledAt || payment.type === 'entrada') continue;
    const linkedInstallmentIds = payment.installmentIds || [];
    if (linkedInstallmentIds.length) {
      for (const installment of installments) {
        if (linkedInstallmentIds.some((id) => String(id) === String(installment._id))) {
          installment.paid = true;
          installment.paidAt = payment.paidAt;
        }
      }
      continue;
    }

    const paymentTime = payment.paidAt ? new Date(payment.paidAt).getTime() : null;
    const legacyInstallments = paymentTime === null ? [] : installments.filter((installment) => (
      !installment.paid && legacyPaidAt.get(String(installment._id)) === paymentTime
    ));
    if (legacyInstallments.length) {
      for (const installment of legacyInstallments) {
        installment.paid = true;
        installment.paidAt = payment.paidAt;
      }
      continue;
    }

    let remaining = Number(payment.amount) || 0;
    for (const installment of installments) {
      if (remaining <= 0) break;
      if (!installment.paid && installment.amount <= remaining) {
        installment.paid = true;
        installment.paidAt = payment.paidAt;
        remaining -= installment.amount;
      }
    }
  }
};

export const receiveDownPayment = (order, receivedAt = new Date()) => {
  const amount = Number(order.downPayment) || 0;
  if (!amount) return;

  order.amountPaid = (order.amountPaid || 0) + amount;
  order.payments.push({ amount, method: order.paymentMethod, type: 'entrada', paidAt: receivedAt });
  const balance = order.finalValue - order.amountPaid;
  order.paymentStatus = getOrderPaymentStatus(order);
  if (balance <= 0.01) order.installments = order.installments.filter((installment) => installment.paid);
  else recalculateUnpaidInstallments(order.installments, balance);
};
