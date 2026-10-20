import { Router } from 'express';
import Client from '../models/Client.js';
import Order from '../models/Order.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { isConfirmedOrder } from '../services/orderStatus.js';
import { buildPage, getEffectivePage, parsePagination } from '../services/pagination.js';
import { hideOrderCosts } from '../services/orderCostVisibility.js';
import { initialProductionStage } from '../services/productionWorkflow.js';

const router = Router();
router.use(protect);
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export const createClientListHandler = ({ ClientModel = Client, OrderModel = Order } = {}) => async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination?.error) return res.status(400).json({ message: pagination.error });

  const q = req.query.q || '';
  const filter = {
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ],
  };
  let clientsQuery = ClientModel.find(filter).sort({ name: 1 });
  let total;
  let page = pagination?.page || 1;
  if (pagination) {
    total = await ClientModel.countDocuments(filter);
    page = getEffectivePage(page, pagination.pageSize, total);
    clientsQuery = clientsQuery
      .skip((page - 1) * pagination.pageSize)
      .limit(pagination.pageSize);
  }
  const clients = await clientsQuery;
  const withStats = await Promise.all(
    clients.map(async (c) => {
      const orders = await OrderModel.find({ client: c._id });
      const confirmedOrders = orders.filter(isConfirmedOrder);
      const total = confirmedOrders.reduce((s, o) => s + (o.finalValue || 0), 0);
      const open = confirmedOrders.filter((o) => (o.finalValue || 0) > (o.amountPaid || 0));
      return {
        ...c.toObject(),
        ordersCount: confirmedOrders.length,
        totalSpent: total,
        openOrders: open.length,
        openBalance: open.reduce((sum, order) => sum + Math.max(0, order.finalValue - order.amountPaid), 0),
        paymentPreference: getPaymentPreference(confirmedOrders),
      };
    })
  );
  return res.json(pagination ? buildPage(withStats, page, pagination.pageSize, total) : withStats);
};

router.get('/', createClientListHandler());

router.get('/:id', asyncRoute(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ message: 'Cliente não encontrado' });
  const allOrders = await Order.find({ client: client._id }).sort({ createdAt: -1 });
  const confirmedOrders = allOrders.filter(isConfirmedOrder);
  const openBalance = confirmedOrders.reduce((sum, order) => sum + Math.max(0, order.finalValue - order.amountPaid), 0);
  const orders = allOrders.slice(0, 10);
  res.json({
    ...client.toObject(),
    orders: req.user?.role === 'admin' ? orders : hideOrderCosts(orders),
    openBalance,
    paymentPreference: getPaymentPreference(confirmedOrders),
  });
}));

export const getPaymentPreference = (orders) => {
  const methods = orders.flatMap((order) => order.payments?.length
    ? order.payments.map((payment) => ({ method: payment.method, date: new Date(payment.paidAt || order.createdAt || 0) }))
    : [{ method: order.paymentMethod, date: new Date(order.createdAt || 0) }]);
  methods.sort((a, b) => b.date - a.date);
  return methods.find((payment) => payment.method)?.method || '';
};

router.post('/:id/reorder/:orderId', asyncRoute(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ message: 'Cliente não encontrado' });
  const previous = await Order.findOne({ _id: req.params.orderId, client: client._id });
  if (!previous || !isConfirmedOrder(previous)) return res.status(404).json({ message: 'Pedido anterior não encontrado' });
  const items = previous.items.map((item) => {
    const copy = item.toObject();
    delete copy._id;
    return copy;
  });
  const order = await Order.create({
    client: client._id,
    items,
    discount: previous.discount || 0,
    paymentMethod: previous.paymentMethod || 'pix',
    status: 'pendente',
    paymentStatus: 'aberto',
    production: 'nao_iniciado',
    skippedStages: previous.skippedStages,
    productionStage: initialProductionStage(previous.skippedStages),
    history: [{ action: 'criado', by: req.user.name, note: `Repetido do pedido #${previous.number}` }],
    createdBy: req.user._id,
  });
  return res.status(201).json(req.user?.role === 'admin' ? order : hideOrderCosts(order));
}));

router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    if (!name || !phone) return res.status(400).json({ message: 'Nome e telefone são obrigatórios' });
    const client = await Client.create({ ...req.body, name, phone });
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  if (!name || !phone) return res.status(400).json({ message: 'Nome e telefone são obrigatórios' });
  const client = await Client.findByIdAndUpdate(req.params.id, { ...req.body, name, phone }, { new: true, runValidators: true });
  if (!client) return res.status(404).json({ message: 'Cliente não encontrado' });
  res.json(client);
});

router.delete('/:id', adminOnly, async (req, res) => {
  await Client.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
