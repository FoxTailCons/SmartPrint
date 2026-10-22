export const productionStages = [
  ['arte', 'Arte'], ['impressao', 'Impressão'], ['acabamento', 'Acabamento'], ['entregue', 'Entregue'],
];

const legacyStageAliases = { aprovacao_cliente: 'impressao', instalacao: 'acabamento' };

export function normalizeSkippedStages(skippedStages = []) {
  return [...new Set(skippedStages
    .map((stage) => stage === 'instalacao' ? 'acabamento' : stage)
    .filter((stage) => productionStages.some(([key]) => key !== 'entregue' && key === stage)))];
}

export function updateSkippedStagesForRequirement(skippedStages, stage, required) {
  skippedStages = normalizeSkippedStages(skippedStages);
  return required
    ? skippedStages.filter((skippedStage) => skippedStage !== stage)
    : skippedStages.includes(stage) ? skippedStages : [...skippedStages, stage];
}

export const priorityLabels = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
export const productCategories = [
  { value: 'xerox_impressao', label: 'Xerox/Impressão' },
  { value: 'adesivos', label: 'Adesivos' },
  { value: 'grande_formato', label: 'Grande formato' },
  { value: 'fachada', label: 'Fachada' },
  { value: 'veiculos', label: 'Veículos' },
  { value: 'papelaria', label: 'Papelaria' },
  { value: 'servicos_instalacao', label: 'Serviços (instalação)' },
];

export function getCategoryLabel(value) {
  return productCategories.find((category) => category.value === value)?.label || 'Sem categoria';
}

export function requiresQuoteClient(finalValue, items, threshold = 100) {
  return finalValue > threshold || items.some((item) => ['fachada', 'veiculos'].includes(item.category));
}

export function buildBalanceReminderUrl(order) {
  const phone = String(order?.client?.phone || '').replace(/\D/g, '');
  const internationalPhone = /^55\d{10,11}$/.test(phone) ? phone : /^\d{10,11}$/.test(phone) ? `55${phone}` : '';
  const balance = Math.max(0, Number(order?.finalValue || 0) - Number(order?.amountPaid || 0));
  if (!internationalPhone || !Number.isFinite(balance) || balance <= 0) return '';
  const amount = balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const message = `Olá, ${order.client.name || 'tudo bem'}! Passando para lembrar que o pedido #${order.number} tem saldo em aberto de ${amount}. Em caso de pagamento já realizado, por favor desconsidere. Obrigado!`;
  return `https://wa.me/${internationalPhone}?text=${encodeURIComponent(message)}`;
}

export function itemTotal(item) {
  return Number(item.quantity || 0) * Number(item.unitPrice || 0)
    + Number(item.installationFee || 0) + Number(item.travelFee || 0);
}

export function serializeOrderItems(items) {
  return items.filter((item) => item.productId || item.description?.trim()).map((item) => {
    const metadata = Object.fromEntries(['serviceName', 'material', 'finishing', 'applicationLocation', 'promisedDate', 'artworkUrl', 'installationNotes'].map((field) => [field, item[field]]));
    const amounts = { quantity: Number(item.quantity), installationFee: Number(item.installationFee || 0), travelFee: Number(item.travelFee || 0) };
    return item.productId
      ? { ...(item._id ? { _id: item._id } : {}), productId: item.productId, measurements: item.measurements, ...metadata, ...amounts }
      : { ...item, ...amounts, unitPrice: Number(item.unitPrice) };
  });
}

export function getProductionStage(order) {
  if (order.production === 'concluido' || order.status === 'concluido') return 'entregue';
  if (order.productionStage) return legacyStageAliases[order.productionStage] || order.productionStage;
  return ['em_producao', 'pausado'].includes(order.production) ? 'impressao' : 'arte';
}

export function graphicDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : 'Sem prazo';
}

export function getDeadline(order, now = new Date()) {
  const date = String(order.deliveryDate || (order.items || []).map((item) => item.promisedDate).filter(Boolean).sort()[0] || '').slice(0, 10);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const overdue = Boolean(date && date < today && getProductionStage(order) !== 'entregue');
  return { date, today: date === today, overdue, label: date ? `${graphicDate(date)}${overdue ? ' · Atrasado' : date === today ? ' · Hoje' : ''}` : 'Sem prazo' };
}

export function itemMetadata(item) {
  const fields = [
    ['Categoria', item.category && getCategoryLabel(item.category)],
    ['Material', item.material], ['Acabamento', item.finishing], ['Aplicação', item.applicationLocation],
    ['Prazo combinado', item.promisedDate && graphicDate(item.promisedDate)],
    ['Arte', item.artworkUrl], ['Instalação / observações', item.installationNotes],
  ];
  for (const [label, field] of [['Instalação', 'installationFee'], ['Deslocamento', 'travelFee']]) {
    if (Number(item[field]) > 0) fields.push([label, Number(item[field]).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })]);
  }
  return fields.filter(([, value]) => value);
}
