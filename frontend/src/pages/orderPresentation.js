export const isConfirmedOrder = (order) => order?.status !== 'cancelado' && (
  ['aprovado', 'concluido'].includes(order?.status) || Number(order?.amountPaid || 0) > 0
);

export const getOrderDocumentLabel = (order) => (
  order?.status === 'cancelado' ? 'Cancelado' : isConfirmedOrder(order) ? 'Pedido' : 'Orçamento'
);

export const roundOrderTotalUp = (itemsTotal, discount = 0) => (
  Math.ceil(Math.round(Math.max(0, itemsTotal - (Number(discount) || 0)) * 100) / 100)
);
