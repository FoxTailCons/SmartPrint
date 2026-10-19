import { Router } from 'express';
import Order from '../models/Order.js';
import Payable from '../models/Payable.js';
import Client from '../models/Client.js';
import { protect } from '../middleware/auth.js';
import { isConfirmedOrder } from '../services/orderStatus.js';

const router = Router();
router.use(protect);

export const filterOrdersForDashboard = (orders = [], filters = {}) => {
  const { clientId, period } = filters;
  const now = new Date();
  const fromDate = new Date(now);

  if (period === '7d') fromDate.setDate(now.getDate() - 7);
  else if (period === '30d') fromDate.setDate(now.getDate() - 30);
  else if (period === '90d') fromDate.setDate(now.getDate() - 90);
  else if (period === '12m') fromDate.setMonth(now.getMonth() - 12);

  return orders.filter((order) => {
    const orderClientId = order?.client?._id ? String(order.client._id) : order?.client ? String(order.client) : null;
    if (clientId && clientId !== 'all' && orderClientId !== String(clientId)) return false;

    if (!period || period === 'all') return true;

    const createdAt = new Date(order.createdAt || Date.now());
    return createdAt >= fromDate;
  });
};

export const buildCashflowSummary = (orders = [], payables = []) => {
  const receivables = orders.filter(isConfirmedOrder).reduce((sum, order) => {
    const finalValue = Number(order.finalValue || 0);
    const amountPaid = Number(order.amountPaid || 0);
    return sum + Math.max(0, finalValue - amountPaid);
  }, 0);

  const openPayables = payables.filter((p) => !p.paid).reduce((sum, payable) => sum + Number(payable.value || 0), 0);

  return {
    receivables,
    payables: openPayables,
    netCash: receivables - openPayables,
  };
};

export const buildClientPerformance = (orders = []) => {
  const map = new Map();

  orders.filter(isConfirmedOrder).forEach((order) => {
    const name = order?.client?.name || 'Cliente não cadastrado';
    const current = map.get(name) || { name, revenue: 0, orders: 0, outstanding: 0 };
    const finalValue = Number(order.finalValue || 0);
    const amountPaid = Number(order.amountPaid || 0);

    current.revenue += finalValue;
    current.orders += 1;
    current.outstanding += Math.max(0, finalValue - amountPaid);
    map.set(name, current);
  });

  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
};

export const buildServicePerformance = (orders = []) => {
  const rules = [
    { name: 'Banner / sinalização', regex: /(banner|faixa|sinal|outdoor|vinil|adesivo|letreiro|placa|pvc|sinaliza)/i },
    { name: 'Impressão / papel', regex: /(papel|fotograf|a4|a3|impress|offset|digital|cópia|copia)/i },
    { name: 'Personalização / corte', regex: /(corte|recorte|plotter|personaliz|grava|laser|vinil cort)/i },
    { name: 'Embalagem / etiqueta', regex: /(embalagem|etiqueta|caixa|rótulo|rotulo)/i },
  ];

  const map = new Map();

  orders.filter(isConfirmedOrder).forEach((order) => {
    const seenByService = new Set();

    (order.items || []).forEach((item) => {
      const description = String(item.description || '').trim();
      if (!description) return;

      const match = rules.find((rule) => rule.regex.test(description));
      const name = match ? match.name : 'Outros';
      const current = map.get(name) || { name, revenue: 0, orders: 0 };

      current.revenue += Number(item.total || 0);
      if (!seenByService.has(name)) {
        current.orders += 1;
        seenByService.add(name);
      }
      map.set(name, current);
    });
  });

  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
};

export const buildMonthlyComparison = (orders = []) => {
  const today = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
    return {
      label: date.toLocaleDateString('pt-BR', { month: 'short' }),
      monthKey: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
      revenue: 0,
      received: 0,
      orders: 0,
    };
  });

  orders.filter(isConfirmedOrder).forEach((order) => {
    const date = new Date(order.createdAt || Date.now());
    const monthKey = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    const month = months.find((item) => item.monthKey === monthKey);
    if (!month) return;

    month.revenue += Number(order.finalValue || 0);
    month.received += Number(order.amountPaid || 0);
    month.orders += 1;
  });

  return months;
};

export const buildCashflowTrend = (orders) => {
  const today = new Date();
  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - index));
    return { label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), value: 0, date };
  });

  const last6Months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
    return { label: date.toLocaleDateString('pt-BR', { month: 'short' }), value: 0, date };
  });

  const addPayments = (entries, target) => {
    entries.forEach((entry) => {
      const paidAt = new Date(entry.paidAt || entry.at || entry.date || Date.now());
      const dayKey = new Date(paidAt.getFullYear(), paidAt.getMonth(), paidAt.getDate()).getTime();
      const monthKey = new Date(paidAt.getFullYear(), paidAt.getMonth(), 1).getTime();

      const dayMatch = target.last7Days.find((item) => item.date.getTime() === dayKey);
      if (dayMatch) dayMatch.value += Number(entry.amount || 0);

      const monthMatch = target.last6Months.find((item) => item.date.getTime() === monthKey);
      if (monthMatch) monthMatch.value += Number(entry.amount || 0);
    });
  };

  const paymentEntries = (order) => {
    if (Array.isArray(order.payments) && order.payments.length) {
      return order.payments.map((payment) => ({ amount: payment.amount || 0, paidAt: payment.paidAt || new Date() }));
    }

    return (order.history || [])
      .filter((entry) => entry.action === 'pagamento')
      .map((entry) => {
        const match = entry.note?.match(/Recebido\s+R\$\s*([\d.,]+)/i);
        if (!match) return null;
        const amount = Number(match[1].replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(amount) ? { amount, paidAt: entry.at || new Date() } : null;
      })
      .filter(Boolean);
  };

  orders.filter(isConfirmedOrder).forEach((order) => {
    addPayments(paymentEntries(order), { last7Days, last6Months });
  });

  return {
    last7Days,
    last6Months,
  };
};

router.get('/', async (req, res) => {
  const { clientId, period } = req.query;
  const orders = await Order.find().populate('client', 'name phone');
  const allPayables = await Payable.find();
  const clients = await Client.find().sort({ name: 1 });
  const filteredOrders = filterOrdersForDashboard(orders, { clientId, period });
  const salesOrders = filteredOrders.filter(isConfirmedOrder);
  const payables = allPayables.filter((p) => !p.paid);

  const today = new Date();
  const in3days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

  const totalRevenue = salesOrders.reduce((s, o) => s + (o.finalValue || 0), 0);
  const totalDiscounts = salesOrders.reduce((s, o) => s + (o.discount || 0), 0);
  const totalReceived = salesOrders.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const toReceive = totalRevenue - totalReceived;
  const liquidity = buildCashflowSummary(filteredOrders, allPayables);
  const netRevenue = Math.max(0, totalRevenue - totalDiscounts);
  const directCosts = allPayables
    .filter((p) => ['consumo', 'insumo'].includes(p.category))
    .reduce((s, p) => s + (p.value || 0), 0);
  const operatingExpenses = allPayables
    .filter((p) => ['aluguel', 'funcionario', 'imposto', 'outro'].includes(p.category))
    .reduce((s, p) => s + (p.value || 0), 0);
  const grossProfit = netRevenue - directCosts;
  const ebitda = grossProfit - operatingExpenses;
  const ebitdaMargin = netRevenue > 0 ? (ebitda / netRevenue) * 100 : 0;

  const pending = filteredOrders.filter((o) => o.status === 'pendente' && !isConfirmedOrder(o)).length;
  const approved = filteredOrders.filter((o) => o.status === 'aprovado').length;
  const concluded = filteredOrders.filter((o) => o.status === 'concluido').length;
  const inProduction = filteredOrders.filter((o) => o.production === 'em_producao').length;
  const paused = filteredOrders.filter((o) => o.production === 'pausado').length;

  const payablesOverdue = payables.filter((p) => new Date(p.dueDate) < today);
  const payablesDueSoon = payables.filter(
    (p) => new Date(p.dueDate) >= today && new Date(p.dueDate) <= in3days
  );
  const totalPayables = payables.reduce((s, p) => s + p.value, 0);

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousWeekStart = new Date(startOfWeek);
  previousWeekStart.setDate(startOfWeek.getDate() - 7);
  const previousWeekEnd = new Date(startOfWeek);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const paymentEntries = (order) => {
    if (order.payments?.length) return order.payments;
    return (order.history || [])
      .filter((entry) => entry.action === 'pagamento')
      .map((entry) => {
        const match = entry.note?.match(/Recebido\s+R\$\s*([\d.,]+)/i);
        if (!match) return null;
        const amount = Number(match[1].replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(amount) ? { amount, paidAt: entry.at } : null;
      })
      .filter(Boolean);
  };
  const receivedBetween = (start, end) => salesOrders.reduce(
    (sum, order) => sum + paymentEntries(order)
      .filter((payment) => {
        const paidAt = new Date(payment.paidAt);
        return paidAt >= start && paidAt < end;
      })
      .reduce((total, payment) => total + payment.amount, 0),
    0
  );

  const currentWeekValue = receivedBetween(startOfWeek, endOfToday);
  const previousWeekValue = receivedBetween(previousWeekStart, startOfWeek);
  const currentMonthValue = receivedBetween(startOfMonth, endOfToday);
  const previousMonthValue = receivedBetween(previousMonthStart, previousMonthEnd);
  const deltaPercent = (current, previous) => {
    if (!previous) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const cashflowTrend = buildCashflowTrend(salesOrders);
  const clientPerformance = buildClientPerformance(salesOrders);
  const servicePerformance = buildServicePerformance(salesOrders);
  const monthlyComparison = buildMonthlyComparison(salesOrders);

  // Últimos pedidos para o feed do dashboard
  const recent = filteredOrders.slice(0, 10);

  res.json({
    counts: {
      orders: salesOrders.length,
      pending,
      approved,
      concluded,
      inProduction,
      paused,
      clients: clients.length,
    },
    finance: {
      totalRevenue,
      totalDiscounts,
      netRevenue,
      totalReceived,
      toReceive,
      liquidity,
      totalPayables,
      directCosts,
      operatingExpenses,
      grossProfit,
      ebitda,
      ebitdaMargin,
      receivedToday: receivedBetween(startOfToday, endOfToday),
      receivedThisWeek: currentWeekValue,
      receivedThisMonth: currentMonthValue,
      cashFlowComparison: {
        weekly: {
          current: currentWeekValue,
          previous: previousWeekValue,
          delta: currentWeekValue - previousWeekValue,
          deltaPct: deltaPercent(currentWeekValue, previousWeekValue),
        },
        monthly: {
          current: currentMonthValue,
          previous: previousMonthValue,
          delta: currentMonthValue - previousMonthValue,
          deltaPct: deltaPercent(currentMonthValue, previousMonthValue),
        },
      },
      trend: cashflowTrend,
    },
    analytics: {
      clients: clientPerformance,
      services: servicePerformance,
      monthlyComparison,
    },
    warnings: {
      payablesOverdue: payablesOverdue.length,
      payablesOverdueValue: payablesOverdue.reduce((s, p) => s + p.value, 0),
      payablesDueSoon: payablesDueSoon.length,
      payablesDueSoonValue: payablesDueSoon.reduce((s, p) => s + p.value, 0),
      overdueList: payablesOverdue,
      dueSoonList: payablesDueSoon,
    },
    details: {
      orders: salesOrders,
      pending: filteredOrders.filter((o) => o.status === 'pendente' && !isConfirmedOrder(o)),
      inProduction: filteredOrders.filter((o) => o.production === 'em_producao'),
      paused: filteredOrders.filter((o) => o.production === 'pausado'),
      concluded: filteredOrders.filter((o) => o.status === 'concluido'),
      toReceive: salesOrders.filter((o) => (o.finalValue || 0) > (o.amountPaid || 0)),
      payables,
      clients,
      approved: filteredOrders.filter((o) => o.status === 'aprovado'),
    },
    recentOrders: recent,
  });
});

export default router;
