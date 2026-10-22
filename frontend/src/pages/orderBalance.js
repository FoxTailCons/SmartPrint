const amount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const getPaymentDiscountTotal = (order) => Array.isArray(order?.paymentDiscounts)
  ? order.paymentDiscounts.reduce((total, discount) => total
    + (discount?.canceledAt ? 0 : Math.max(0, amount(discount?.amount))), 0)
  : 0;

export const getOrderDiscountTotal = getPaymentDiscountTotal;

export const getOrderBalance = (order) => Math.max(
  0,
  amount(order?.finalValue) - amount(order?.amountPaid) - getPaymentDiscountTotal(order),
);

export const getOrderPaymentStatus = (order) => {
  if (order?.finalValue === undefined || order?.finalValue === null) return order?.paymentStatus || 'aberto';
  if (getOrderBalance(order) <= 0.01) return 'quitado';
  return amount(order?.amountPaid) > 0 || getPaymentDiscountTotal(order) > 0 ? 'parcial' : 'aberto';
};
