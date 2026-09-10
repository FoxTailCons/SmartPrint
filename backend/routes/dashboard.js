import { Router } from 'express';
import Order from '../models/Order.js';
import Payable from '../models/Payable.js';
import Client from '../models/Client.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', async (req, res) => {
  const orders = await Order.find().populate('client', 'name phone');
  const payables = await Payable.find({ paid: false });
  const clients = await Client.find().sort({ name: 1 });

  const today = new Date();
  const in3days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

  const totalRevenue = orders.reduce((s, o) => s + (o.finalValue || 0), 0);
  const totalReceived = orders.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const toReceive = totalRevenue - totalReceived;

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
      totalReceived,
      toReceive,
      totalPayables,
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
