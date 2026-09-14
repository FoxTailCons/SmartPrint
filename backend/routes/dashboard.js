import { Router } from 'express';
import Order from '../models/Order.js';
import Payable from '../models/Payable.js';
import Client from '../models/Client.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

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

  orders.forEach((order) => {
    addPayments(paymentEntries(order), { last7Days, last6Months });
  });

  return {
    last7Days,
    last6Months,
  };
};

router.get('/', async (req, res) => {
  const orders = await Order.find().populate('client', 'name phone');
  const allPayables = await Payable.find();
  const payables = allPayables.filter((p) => !p.paid);
  const clients = await Client.find().sort({ name: 1 });

  const today = new Date();
  const in3days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

  const totalRevenue = orders.reduce((s, o) => s + (o.finalValue || 0), 0);
  const totalDiscounts = orders.reduce((s, o) => s + (o.discount || 0), 0);
  const totalReceived = orders.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const toReceive = totalRevenue - totalReceived;
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

  const pending = orders.filter((o) => o.status === 'pendente').length;
  const approved = orders.filter((o) => o.status === 'aprovado').length;
  const concluded = orders.filter((o) => o.status === 'concluido').length;
  const inProduction = orders.filter((o) => o.production === 'em_producao').length;
  const paused = orders.filter((o) => o.production === 'pausado').length;

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
  const receivedBetween = (start, end) => orders.reduce(
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

  const cashflowTrend = buildCashflowTrend(orders);

  // Últimos pedidos para o feed do dashboard
  const recent = orders.slice(0, 10);

  res.json({
    counts: {
      orders: orders.length,
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
    warnings: {
      payablesOverdue: payablesOverdue.length,
      payablesOverdueValue: payablesOverdue.reduce((s, p) => s + p.value, 0),
      payablesDueSoon: payablesDueSoon.length,
      payablesDueSoonValue: payablesDueSoon.reduce((s, p) => s + p.value, 0),
      overdueList: payablesOverdue,
      dueSoonList: payablesDueSoon,
    },
    details: {
      orders,
      pending: orders.filter((o) => o.status === 'pendente'),
      inProduction: orders.filter((o) => o.production === 'em_producao'),
      paused: orders.filter((o) => o.production === 'pausado'),
      concluded: orders.filter((o) => o.status === 'concluido'),
      toReceive: orders.filter((o) => (o.finalValue || 0) > (o.amountPaid || 0)),
      payables,
      clients,
      approved: orders.filter((o) => o.status === 'aprovado'),
    },
    recentOrders: recent,
  });
});

export default router;
