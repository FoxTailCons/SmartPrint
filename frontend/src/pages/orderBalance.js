const amount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const getPaymentDiscountTotal = (order) => Array.isArray(order?.paymentDiscounts)
  ? order.paymentDiscounts.reduce((total, discount) => total + Math.max(0, amount(discount?.amount)), 0)
  : 0;

export const getOrderDiscountTotal = getPaymentDiscountTotal;

export const getOrderBalance = (order) => Math.max(
  0,
  amount(order?.finalValue) - amount(order?.amountPaid) - getPaymentDiscountTotal(order),
);
