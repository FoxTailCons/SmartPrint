import { Router } from 'express';
import Client from '../models/Client.js';
import Order from '../models/Order.js';
import { protect } from '../middleware/auth.js';

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
      const total = orders.reduce((s, o) => s + (o.finalValue || 0), 0);
      const open = orders.filter((o) => !['pago', 'quitado'].includes(o.paymentStatus)).length;
      return { ...c.toObject(), ordersCount: orders.length, totalSpent: total, openOrders: open };
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
  const client = await Client.create(req.body);
  res.status(201).json(client);
});

router.put('/:id', async (req, res) => {
  const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(client);
});

router.delete('/:id', async (req, res) => {
  await Client.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
