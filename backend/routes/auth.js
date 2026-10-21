import { Router } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' });

const safeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
});

export function createUserManagementHandlers({ UserModel = User } = {}) {
  const listUsers = async (_req, res) => {
    const users = await UserModel.find().select('_id name email role active');
    return res.json(users.map(safeUser));
  };

  const createUser = async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const { password, role } = req.body || {};
    if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || typeof password !== 'string' || password.length < 12
      || !['atendente', 'producao'].includes(role)) {
      return res.status(400).json({ message: 'Informe nome, e-mail válido, senha com pelo menos 12 caracteres e perfil permitido' });
    }

    try {
      const user = await new UserModel({ name, email, password, role, active: true }).save();
      return res.status(201).json(safeUser(user));
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ message: 'Já existe um usuário com este e-mail' });
      console.error(error);
      return res.status(500).json({ message: 'Não foi possível criar o usuário' });
    }
  };

  const setUserActive = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Identificador de usuário inválido' });
    }
    if (typeof req.body?.active !== 'boolean') {
      return res.status(400).json({ message: 'Informe um estado ativo válido' });
    }

    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
    if (req.body.active === false && user.role === 'admin' && user.active) {
      if (String(user._id) === String(req.user?._id)) {
        return res.status(400).json({ message: 'Não é possível desativar a própria conta de administrador' });
      }
      if (await UserModel.countDocuments({ role: 'admin', active: true }) <= 1) {
        return res.status(409).json({ message: 'Não é possível desativar o último administrador ativo' });
      }
    }

    user.active = req.body.active;
    await user.save();
    return res.json(safeUser(user));
  };

  return { listUsers, createUser, setUserActive };
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'E-mail ou senha inválidos' });
    }
    if (!user.active) return res.status(403).json({ message: 'Usuário inativo' });
    res.json({
      token: signToken(user._id),
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Não foi possível realizar o login' });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role });
});

const userManagement = createUserManagementHandlers();
router.get('/users', protect, adminOnly, userManagement.listUsers);
router.post('/users', protect, adminOnly, userManagement.createUser);
router.patch('/users/:id/active', protect, adminOnly, userManagement.setUserActive);

export default router;
