import { getOrderBalance, getOrderDiscountTotal } from './orderBalance.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const spreadsheetFormulaPrefix = /^\s*[=+\-@]/;

const validCivilDate = (value) => {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const parseExportDateRange = ({ from, to } = {}) => {
  if (!validCivilDate(from) || !validCivilDate(to) || from > to) {
    throw Object.assign(new Error('Informe um período válido: datas no formato AAAA-MM-DD e início anterior ou igual ao fim'), { statusCode: 400 });
  }
  return {
    start: new Date(`${from}T03:00:00.000Z`),
    endExclusive: new Date(new Date(`${to}T03:00:00.000Z`).getTime() + 86400000),
  };
};

export const escapeCsvCell = (value) => {
  const text = typeof value === 'string'
    ? (spreadsheetFormulaPrefix.test(value) ? `'${value}` : value)
    : value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const toCsv = (headers, rows) => [
  headers.map(([, label]) => escapeCsvCell(label)).join(';'),
  ...rows.map((row) => headers.map(([key]) => escapeCsvCell(row[key])).join(';')),
].join('\r\n');

export const toCsvFile = (headers, rows) => `\uFEFF${toCsv(headers, rows)}`;

const isInRange = (date, start, endExclusive) => {
  const at = new Date(date || 0);
  return Number.isFinite(at.getTime()) && at >= start && at < endExclusive;
};

const parseLegacyPaymentAmount = (note) => {
  const match = String(note || '').match(/(?:Recebido|no valor de)\s+(?:R\$\s*)?([\d.,]+)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

export const buildOrderExportRows = (orders) => orders.map((order) => ({
  createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : '',
  number: order.number || '',
  client: order.client?.name || 'Cliente não cadastrado',
  phone: order.client?.phone || '',
  items: (order.items || []).map((item) => `${item.description} (${item.quantity})`).join(' | '),
  total: Number(order.finalValue || 0),
  received: Number(order.amountPaid || 0),
  paymentDiscounts: getOrderDiscountTotal(order),
  balance: getOrderBalance(order),
  status: order.status || '',
  production: order.productionStage || order.production || '',
  deadline: order.deliveryDate || '',
}));

export const buildFinanceExportRows = ({ orders = [], payables = [], sessions = [], from, endExclusive }) => {
  const rows = [];
  for (const order of orders) {
    if (order.status === 'cancelado') continue;
    const payments = Array.isArray(order.payments) && order.payments.length
      ? order.payments
        .filter((payment) => !payment.canceledAt)
        .map((payment) => ({ ...payment.toObject?.() ?? payment, kind: payment.type || 'pagamento' }))
      : (order.history || [])
        .filter((entry) => entry.action === 'pagamento')
        .map((entry) => ({
          amount: parseLegacyPaymentAmount(entry.note),
          method: entry.paymentMethod || order.paymentMethod || '',
          paidAt: entry.at,
        }))
        .filter((payment) => payment.amount !== null);
    for (const payment of payments) {
      if (!isInRange(payment.paidAt, from, endExclusive)) continue;
      rows.push({
        date: new Date(payment.paidAt).toISOString(),
        type: 'Recebimento',
        reference: order.number || '',
        description: `Pedido #${order.number || ''}`,
        method: payment.method || order.paymentMethod || '',
        amount: Number(payment.amount || 0),
      });
    }
  }
  for (const payable of payables) {
    if (!payable.paid || !isInRange(payable.paidAt, from, endExclusive)) continue;
    rows.push({
      date: new Date(payable.paidAt).toISOString(),
      type: 'Conta paga',
      reference: payable._id || '',
      description: payable.description || '',
      method: payable.paymentMethod || '',
      amount: Number(payable.value || 0),
    });
  }
  for (const session of sessions) {
    for (const supply of session.supplies || []) {
      if (!isInRange(supply.createdAt, from, endExclusive)) continue;
      rows.push({
        date: new Date(supply.createdAt).toISOString(),
        type: 'Suprimento',
        reference: session.dateKey || '',
        description: supply.note || '',
        method: 'dinheiro',
        amount: Number(supply.amount || 0),
      });
    }
    for (const withdrawal of session.withdrawals || []) {
      if (!isInRange(withdrawal.createdAt, from, endExclusive)) continue;
      rows.push({
        date: new Date(withdrawal.createdAt).toISOString(),
        type: 'Sangria',
        reference: session.dateKey || '',
        description: withdrawal.note || '',
        method: 'dinheiro',
        amount: Number(withdrawal.amount || 0),
      });
    }
  }
  return rows.sort((left, right) => left.date.localeCompare(right.date));
}
