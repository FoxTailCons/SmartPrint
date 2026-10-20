import { Router } from 'express';
import crypto from 'node:crypto';
import Payable from '../models/Payable.js';
import { protect, adminOnly, allowRoles } from '../middleware/auth.js';
import { buildPage, getEffectivePage, parsePagination } from '../services/pagination.js';

const router = Router();
router.use(protect);
router.use(allowRoles('admin'));

export const createPayableListHandler = ({ PayableModel = Payable } = {}) => async (req, res) => {
  const pagination = parsePagination(req.query);
  if (pagination?.error) return res.status(400).json({ message: pagination.error });

  const { paid } = req.query;
  const filter = {};
  if (paid !== undefined) filter.paid = paid === 'true';
  if (!pagination) return res.json(await PayableModel.find(filter).sort({ dueDate: 1 }));

  const total = await PayableModel.countDocuments(filter);
  const page = getEffectivePage(pagination.page, pagination.pageSize, total);
  const today = new Date();
  const in3days = new Date(today.getTime() + 3 * 86400000);
  const isPaidExpression = { $ifNull: ['$paid', false] };
  const [items, summaryRows] = await Promise.all([
    PayableModel.find(filter)
      .sort({ dueDate: 1 })
      .skip((page - 1) * pagination.pageSize)
      .limit(pagination.pageSize),
    PayableModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalOpen: { $sum: { $cond: [{ $eq: [isPaidExpression, false] }, '$value', 0] } },
          totalPaid: { $sum: { $cond: [{ $eq: [isPaidExpression, true] }, '$value', 0] } },
          totalOverdue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: [isPaidExpression, false] }, { $lt: ['$dueDate', today] }] },
                '$value',
                0,
              ],
            },
          },
          totalDueSoon: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: [isPaidExpression, false] },
                    { $gte: ['$dueDate', today] },
                    { $lte: ['$dueDate', in3days] },
                  ],
                },
                '$value',
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);
  const summary = summaryRows[0] || { totalOpen: 0, totalPaid: 0, totalOverdue: 0, totalDueSoon: 0 };
  return res.json({ ...buildPage(items, page, pagination.pageSize, total), summary });
};

router.get('/', createPayableListHandler());

router.post('/', async (req, res) => {
  try {
    const description = String(req.body?.description || '').trim();
    const value = Number(req.body?.value);
    const dueDate = new Date(req.body?.dueDate);
    if (!description || !Number.isFinite(value) || value <= 0 || Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({ message: 'Informe descrição, valor maior que zero e vencimento válido' });
    }
    const item = await Payable.create({
      ...req.body,
      description,
      value,
      dueDate,
      recurrenceId: req.body.recurring ? crypto.randomUUID() : undefined,
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const changes = { ...req.body };
  if (changes.recurring === true && !changes.recurrenceId) changes.recurrenceId = crypto.randomUUID();
  const item = await Payable.findByIdAndUpdate(req.params.id, changes, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ message: 'Conta não encontrada' });
  res.json(item);
});

// Marcar como paga
router.post('/:id/pay', async (req, res) => {
  try {
    const item = await Payable.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Conta não encontrada' });
    if (item.paid) return res.status(400).json({ message: 'Esta conta já está paga' });
    if (item.recurring && !item.recurrenceId) item.recurrenceId = crypto.randomUUID();

    item.paid = true;
    item.paidAt = req.body?.date || new Date();
    await item.save();

    let next = null;
    if (item.recurring) {
      const nextDueDate = nextMonthlyDate(item.dueDate);
      next = await Payable.findOneAndUpdate(
        { recurrenceId: item.recurrenceId, dueDate: nextDueDate },
        {
          $setOnInsert: {
            description: item.description,
            category: item.category,
            value: item.value,
            dueDate: nextDueDate,
            recurring: true,
            recurrenceId: item.recurrenceId,
            notes: item.notes,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    res.json({ item, next });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

function nextMonthlyDate(date) {
  const current = new Date(date);
  const day = current.getDate();
  const next = new Date(current);
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

router.delete('/:id', adminOnly, async (req, res) => {
  await Payable.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
