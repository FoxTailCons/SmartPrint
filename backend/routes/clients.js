import { Router } from 'express';
import Client from '../models/Client.js';
import Order from '../models/Order.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { isConfirmedOrder } from '../services/orderStatus.js';

const router = Router();
router.use(protect);

// Listar clientes (com totais de pedidos)
router.get('/', async (req, res) => {
  const q = req.query.q || '';
  const clients = await Client.find({
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ],
  }).sort({ name: 1 });
  const withStats = await Promise.all(
    clients.map(async (c) => {
      const orders = await Order.find({ client: c._id });
      const confirmedOrders = orders.filter(isConfirmedOrder);
      const total = confirmedOrders.reduce((s, o) => s + (o.finalValue || 0), 0);
      const open = confirmedOrders.filter((o) => (o.finalValue || 0) > (o.amountPaid || 0)).length;
      return { ...c.toObject(), ordersCount: confirmedOrders.length, totalSpent: total, openOrders: open };
    })
  );
  res.json(withStats);
});

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
