// Equivalente a orderPresentation.js (mesmo local: src/pages/), para o módulo de Propostas.
// Mesma regra de arredondamento para cima do total final, idêntica a roundOrderTotalUp.
export const roundProposalTotalUp = (itemsTotal) => (
  Math.ceil(Math.round(Math.max(0, Number(itemsTotal) || 0) * 100) / 100)
);

export const PROPOSAL_STATUSES = ['rascunho', 'enviada', 'aceita', 'rejeitada', 'cancelada'];

export const proposalStatusLabels = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aceita: 'Aceita',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
};
