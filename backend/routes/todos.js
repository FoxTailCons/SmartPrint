import { Router } from 'express';
import Todo from '../models/Todo.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.get('/', async (_req, res) => {
  const todos = await Todo.find().sort({ createdAt: -1 });
  res.json(todos);
});

router.post('/', async (req, res) => {
  const { activity, description, dueDate, assignee, status } = req.body;
  if (!activity || !String(activity).trim()) {
    return res.status(400).json({ message: 'Informe a atividade' });
  }
  const todo = new Todo({
    activity: String(activity).trim(),
    description: description ? String(description).trim() : '',
    dueDate: dueDate || null,
    assignee: assignee || null,
    status: status || 'pending',
  });
  await todo.save();
  res.status(201).json(todo);
});

router.put('/:id', async (req, res) => {
  const { activity, description, dueDate, assignee, status } = req.body;
  const update = {
    description: description ? String(description).trim() : '',
    dueDate: dueDate || null,
    assignee: assignee || null,
  };
  if (activity !== undefined) update.activity = String(activity).trim();
  if (status !== undefined) update.status = status;
  const todo = await Todo.findByIdAndUpdate(req.params.id, update, {
    new: true,
    runValidators: true,
  });
  if (!todo) return res.status(404).json({ message: 'Todo não encontrado' });
  res.json(todo);
});

router.delete('/:id', async (req, res) => {
  const todo = await Todo.findByIdAndDelete(req.params.id);
  if (!todo) return res.status(404).json({ message: 'Todo não encontrado' });
  res.json({ ok: true });
});

export default router;
