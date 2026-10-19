import { Router } from 'express';
import Client from '../models/Client.js';
import Order from '../models/Order.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { isConfirmedOrder } from '../services/orderStatus.js';
import { buildPage, getEffectivePage, parsePagination } from '../services/pagination.js';

const router = Router();
router.use(protect);

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
      const open = confirmedOrders.filter((o) => (o.finalValue || 0) > (o.amountPaid || 0)).length;
      return { ...c.toObject(), ordersCount: confirmedOrders.length, totalSpent: total, openOrders: open };
    })
  );
  return res.json(pagination ? buildPage(withStats, page, pagination.pageSize, total) : withStats);
};

router.get('/', createClientListHandler());

router.get('/:id', async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ message: 'Cliente não encontrado' });
  const orders = await Order.find({ client: client._id }).sort({ createdAt: -1 });
  res.json({ ...client.toObject(), orders });
});

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
