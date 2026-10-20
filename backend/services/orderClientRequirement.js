const specialCategories = new Set(['fachada', 'veiculos']);

export function calculateOrderFinalValue(items, discount = 0) {
  const parsedDiscount = Number(discount || 0);
  if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0) throw new Error('Desconto inválido');
  const total = items.reduce((sum, item) => (
    sum
      + Number(item.quantity || 0) * Number(item.unitPrice || 0)
      + Number(item.installationFee || 0)
      + Number(item.travelFee || 0)
  ), 0);
  if (!Number.isFinite(total)) throw new Error('Total do pedido inválido');
  return Math.ceil(Math.round(Math.max(0, total - parsedDiscount) * 100) / 100);
}

export function requiresRegisteredClient({ finalValue, items, clientRequiredThreshold }) {
  return finalValue > clientRequiredThreshold || items.some((item) => specialCategories.has(item.category));
}

export function registeredClientError(client) {
  if (!client || !String(client.name || '').trim() || !String(client.phone || '').trim()) {
    return 'Este orçamento exige cliente cadastrado com nome e telefone';
  }
  return null;
}
