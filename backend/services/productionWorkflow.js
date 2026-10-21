import { calendarDate } from './calendarDate.js';

export { calendarDate };

export const productionStages = ['arte', 'aprovacao_cliente', 'impressao', 'instalacao', 'entregue'];
export const effectiveStage = (order) => order.productionStage || (order.status === 'concluido' || order.production === 'concluido' ? 'entregue' : ['em_producao', 'pausado'].includes(order.production) ? 'impressao' : 'arte');
export function initialProductionStage(skippedStages = []) {
  if (!Array.isArray(skippedStages) || skippedStages.some(stage => !productionStages.slice(0, -1).includes(stage))) throw new Error('Etapas dispensadas inválidas');
  const stage = productionStages.find(stage => !skippedStages.includes(stage));
  if (stage === 'entregue') throw new Error('Mantenha pelo menos uma etapa de produção');
  return stage;
}
export function nextProductionStage(order, expectedStage, skip = false) {
  const fromStage = effectiveStage(order);
  if (expectedStage !== fromStage) throw Object.assign(new Error('Etapa alterada; atualize o pedido'), { statusCode: 409 });
  if (typeof skip !== 'boolean' || fromStage === 'entregue') throw new Error('Avanço de etapa inválido');
  const skippedStages = [...(order.skippedStages || [])];
  if (skip && !skippedStages.includes(fromStage)) skippedStages.push(fromStage);
  let index = productionStages.indexOf(fromStage) + 1;
  while (skippedStages.includes(productionStages[index])) index++;
  return {fromStage,toStage:productionStages[index],skippedStages};
}
export const orderDeadline = (order) => calendarDate(order.deliveryDate) || (order.items || []).map(item=>item.promisedDate).filter(Boolean).sort()[0] || '';
export function boardOrders(orders, {deadline = 'all', priority} = {}, now = new Date()) {
  if (!['all','today','overdue','upcoming'].includes(deadline) || (priority && !['normal','alta','urgente'].includes(priority))) throw new Error('Filtro de produção inválido');
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const rank = {urgente:0,alta:1,normal:2};
  return orders.filter(order => {
    if (order.quickSaleKey || !['aprovado','concluido'].includes(order.status)) return false;
    if (effectiveStage(order)==='entregue' && (!order.completedAt || new Date(order.completedAt)<new Date(now-7*86400000))) return false;
    if (deadline === 'overdue' && effectiveStage(order) === 'entregue') return false;
    if (priority && (order.priority || 'normal')!==priority) return false;
    const due = orderDeadline(order);
    return deadline==='all' || (due && (deadline==='today' ? due===today : deadline==='overdue' ? due<today : due>today));
  }).map(order=>({...order,productionStage:effectiveStage(order)})).sort((a,b)=>(rank[a.priority || 'normal']-rank[b.priority || 'normal']) || (orderDeadline(a) || '9999').localeCompare(orderDeadline(b) || '9999') || new Date(a.createdAt)-new Date(b.createdAt));
}
export function mergeProductionWorkflow(orders, now = new Date()) {
  if (orders.some(order => order.quickSaleKey)) throw new Error('Vendas de balc\u00e3o possuem recibo individual e n\u00e3o podem ser agregadas');
  const allConcluded = orders.every(order => effectiveStage(order) === 'entregue');
  const productionStage = productionStages[Math.min(...orders.map(order => productionStages.indexOf(effectiveStage(order))))];
  const skippedStages = productionStages.filter(stage => stage !== 'entregue' && orders.every(order => (order.skippedStages || []).includes(stage)));
  const completions = orders.map(order => order.completedAt).filter(Boolean).map(value => new Date(value));
  return {productionStage,skippedStages,...(allConcluded?{completedAt:completions.length?new Date(Math.max(...completions)):now}:{})};
}
