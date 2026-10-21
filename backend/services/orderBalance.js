const finiteAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

export const getOrderDiscountTotal = (order) => Array.isArray(order?.paymentDiscounts)
  ? order.paymentDiscounts.reduce((total, discount) => total + Math.max(0, finiteAmount(discount?.amount)), 0)
  : 0;

export const getOrderBalance = (order) => Math.max(
  0,
  finiteAmount(order?.finalValue) - finiteAmount(order?.amountPaid) - getOrderDiscountTotal(order),
);
