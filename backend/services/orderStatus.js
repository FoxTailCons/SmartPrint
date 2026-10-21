export const isConfirmedOrder = (order) => order?.status !== 'cancelado' && (
  ['aprovado', 'concluido'].includes(order?.status) || Number(order?.amountPaid || 0) > 0
);
