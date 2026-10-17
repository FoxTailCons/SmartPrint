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

export const receiveDownPayment = (order, receivedAt = new Date()) => {
  const amount = Number(order.downPayment) || 0;
  if (!amount) return;

  order.amountPaid = (order.amountPaid || 0) + amount;
  order.payments.push({ amount, method: order.paymentMethod, type: 'entrada', paidAt: receivedAt });
  const balance = order.finalValue - order.amountPaid;
  order.paymentStatus = balance <= 0.01 ? 'quitado' : 'parcial';
  if (balance <= 0.01) order.installments = order.installments.filter((installment) => installment.paid);
  else recalculateUnpaidInstallments(order.installments, balance);
};
