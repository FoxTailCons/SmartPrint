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

export const createPaymentReceipt = (order, paymentIndex) => {
  const payment = order.payments?.[paymentIndex];
  const phone = String(order.client?.phone || '').replace(/\D/g, '');
  if (!payment || !phone) return null;

  const received = order.payments
    .slice(0, paymentIndex + 1)
    .reduce((total, entry) => total + Number(entry.amount || 0), 0);
  const title = payment.type === 'entrada' ? 'Entrada recebida' : 'Pagamento recebido';
  const paidAt = payment.paidAt ? new Date(payment.paidAt).toLocaleDateString('pt-BR') : '—';
  const text = [
    '*SMART PRINT*',
    '*RECIBO DE PAGAMENTO*',
    `Pedido: #${order.number}`,
    `Cliente: ${order.client.name}`,
    `${title}: ${formatMoney(payment.amount)}`,
    `Forma de pagamento: ${paymentMethods[payment.method] || payment.method || '—'}`,
    `Data: ${paidAt}`,
    `Total do pedido: ${formatMoney(order.finalValue)}`,
    `Total recebido: ${formatMoney(received)}`,
    `Saldo após o recebimento: ${formatMoney(Math.max(0, order.finalValue - received))}`,
  ].join('\n');

  return {
    text,
    link: `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`,
  };
};
