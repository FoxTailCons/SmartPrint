import { Router } from 'express';
import mongoose from 'mongoose';
import Todo from '../models/Todo.js';

const router = Router();

router.get('/', async (req, res) => {
  const todos = await Todo.find().sort({ createdAt: -1 });
  res.json(todos);
});

router.post('/', async (req, res) => {
  const { activity, description, dueDate, assignee, status } = req.body;
  const todo = new Todo({ activity, description, dueDate, assignee, status });
  await todo.save();
  res.status(201).json(todo);
});

router.put('/:id', async (req, res) => {
  const { activity, description, dueDate, assignee, status } = req.body;
  const todo = await Todo.findByIdAndUpdate(
    req.params.id,
    { activity, description, dueDate, assignee, status },
    { new: true, runValidators: true }
  );
  if (!todo) return res.status(404).json({ message: 'Todo não encontrado' });
  res.json(todo);
});

router.delete('/:id', async (req, res) => {
  const todo = await Todo.findByIdAndDelete(req.params.id);
  if (!todo) return res.status(404).json({ message: 'Todo não encontrado' });
  res.json({ ok: true });
});

export default router;