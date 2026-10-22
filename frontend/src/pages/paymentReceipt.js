import { getPaymentDiscountTotal } from './orderBalance.js';
import { formatInstantDate } from '../dateUtils.js';

const paymentMethods = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  parcelado: 'Crédito parcelado',
};

const formatMoney = (amount) => Number(amount || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const getPaymentLabel = (payments, paymentIndex) => {
  const payment = payments?.[paymentIndex];
  if (payment?.type === 'entrada') return 'Entrada';
  const installmentNumber = (payments || [])
    .slice(0, paymentIndex + 1)
    .filter((entry) => entry.type !== 'entrada')
    .length;
  return `${installmentNumber}ª parcela`;
};

export const createPaymentReceipt = (order, paymentIndex) => {
  const payment = order.payments?.[paymentIndex];
  const phone = String(order.client?.phone || '').replace(/\D/g, '');
  if (!payment || payment.canceledAt) return null;

  const received = order.payments
    .slice(0, paymentIndex + 1)
    .filter((entry) => !entry.canceledAt)
    .reduce((total, entry) => total + Number(entry.amount || 0), 0);
  const paymentDate = payment.paidAt ? new Date(payment.paidAt) : null;
  const discountsApplied = getPaymentDiscountTotal({
    paymentDiscounts: (order.paymentDiscounts || []).filter((discount) => {
      if (discount.canceledAt) return false;
      if (!paymentDate || !discount.at) return true;
      const discountDate = new Date(discount.at);
      return Number.isFinite(discountDate.getTime()) && discountDate <= paymentDate;
    }),
  });
  const title = `${getPaymentLabel(order.payments, paymentIndex)} recebida`;
  const paidAt = payment.paidAt ? formatInstantDate(payment.paidAt) : '—';
  const text = [
    '*SMART PRINT*',
    '*RECIBO DE PAGAMENTO*',
    `Pedido: #${order.number}`,
    `Cliente: ${order.client?.name || '—'}`,
    `${title}: ${formatMoney(payment.amount)}`,
    `Forma de pagamento: ${paymentMethods[payment.method] || payment.method || '—'}`,
    `Data: ${paidAt}`,
    `Total do pedido: ${formatMoney(order.finalValue)}`,
    `Total recebido: ${formatMoney(received)}`,
    ...(discountsApplied > 0 ? [`Descontos aplicados: ${formatMoney(discountsApplied)}`] : []),
    `Saldo após o recebimento: ${formatMoney(Math.max(0, order.finalValue - received - discountsApplied))}`,
  ].join('\n');

  return {
    text,
    link: phone ? `https://wa.me/55${phone}?text=${encodeURIComponent(text)}` : null,
  };
};
