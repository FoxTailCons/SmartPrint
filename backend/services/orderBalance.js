const finiteAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

export const getOrderDiscountTotal = (order) => Array.isArray(order?.paymentDiscounts)
  ? order.paymentDiscounts.reduce((total, discount) => total
    + (discount?.canceledAt ? 0 : Math.max(0, finiteAmount(discount?.amount))), 0)
  : 0;

export const getOrderBalance = (order) => Math.max(
  0,
  finiteAmount(order?.finalValue) - finiteAmount(order?.amountPaid) - getOrderDiscountTotal(order),
);

export const getOrderPaymentStatus = (order) => {
  if (order?.finalValue === undefined || order?.finalValue === null) return order?.paymentStatus || 'aberto';
  if (getOrderBalance(order) <= 0.01) return 'quitado';
  return finiteAmount(order?.amountPaid) > 0 || getOrderDiscountTotal(order) > 0 ? 'parcial' : 'aberto';
};
