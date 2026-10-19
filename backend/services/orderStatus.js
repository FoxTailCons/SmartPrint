export const isConfirmedOrder = (order) => (
  ['aprovado', 'concluido'].includes(order?.status) || Number(order?.amountPaid || 0) > 0
);
