export const isConfirmedOrder = (order) => (
  ['aprovado', 'concluido'].includes(order?.status) || Number(order?.amountPaid || 0) > 0
);

export const getOrderDocumentLabel = (order) => (isConfirmedOrder(order) ? 'Pedido' : 'Orçamento');

export const roundOrderTotalUp = (itemsTotal, discount = 0) => (
  Math.ceil(Math.round(Math.max(0, itemsTotal - (Number(discount) || 0)) * 100) / 100)
);
