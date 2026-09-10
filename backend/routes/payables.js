import { Router } from 'express';
import Payable from '../models/Payable.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', async (req, res) => {
  const { paid } = req.query;
  const filter = {};
  if (paid !== undefined) filter.paid = paid === 'true';
  const items = await Payable.find(filter).sort({ dueDate: 1 });
  res.json(items);
});

router.post('/', async (req, res) => {
  const item = await Payable.create(req.body);
  res.status(201).json(item);
});

router.put('/:id', async (req, res) => {
  const item = await Payable.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(item);
});

// Marcar como paga
router.post('/:id/pay', async (req, res) => {
  const item = await Payable.findByIdAndUpdate(
    req.params.id,
    { paid: true, paidAt: req.body?.date || new Date() },
    { new: true }
  );
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  await Payable.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
