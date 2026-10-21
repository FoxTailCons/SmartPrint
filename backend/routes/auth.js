import { Router } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { recordAuditEvent } from '../services/auditLog.js';

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

export function createUserManagementHandlers({ UserModel = User, AuditLogModel = AuditLog } = {}) {
  const listUsers = async (_req, res) => {
    const users = await UserModel.find({ archivedAt: null }).select('_id name email role active');
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
    if (user.archivedAt) return res.status(404).json({ message: 'Usuário não encontrado' });
    if (req.body.active === false && user.role === 'admin' && user.active) {
      if (String(user._id) === String(req.user?._id)) {
        return res.status(400).json({ message: 'Não é possível desativar a própria conta de administrador' });
      }
      if (await UserModel.countDocuments({ role: 'admin', active: true }) <= 1) {
        return res.status(409).json({ message: 'Não é possível desativar o último administrador ativo' });
      }
    }

    const wasActive = user.active;
    user.active = req.body.active;
    await user.save();
    if (wasActive === user.active) return res.json(safeUser(user));
    try {
      await recordAuditEvent({
        AuditLogModel,
        req,
        action: 'usuario.status_alterado',
        details: { usuarioId: String(user._id), ativo: { antes: wasActive, depois: user.active } },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'O acesso foi alterado, mas não foi possível registrar a auditoria' });
    }
    return res.json(safeUser(user));
  };

  const updateUser = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Identificador de usuário inválido' });
    }
    const body = req.body || {};
    const fields = ['name', 'email', 'role', 'password'].filter((field) => Object.hasOwn(body, field));
    if (!fields.length) return res.status(400).json({ message: 'Informe ao menos um campo para alterar' });
    if ('name' in body && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120)) {
      return res.status(400).json({ message: 'Informe um nome com até 120 caracteres' });
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if ('email' in body && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Informe um e-mail válido' });
    }
    if ('role' in body && !['atendente', 'producao'].includes(body.role)) {
      return res.status(400).json({ message: 'O perfil deve ser Atendente ou Produção' });
    }
    if ('password' in body && (typeof body.password !== 'string' || body.password.length < 12)) {
      return res.status(400).json({ message: 'A nova senha deve ter pelo menos 12 caracteres' });
    }

    const user = await UserModel.findById(req.params.id);
    if (!user || user.archivedAt) return res.status(404).json({ message: 'Usuário não encontrado' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Contas de administrador não podem ser alteradas por esta tela' });

    const changes = {};
    if ('name' in body && user.name !== body.name.trim()) {
      changes.nome = { antes: user.name, depois: body.name.trim() };
      user.name = body.name.trim();
    }
    if ('email' in body && user.email !== email) {
      changes.email = { antes: user.email, depois: email };
      user.email = email;
    }
    if ('role' in body && user.role !== body.role) {
      changes.perfil = { antes: user.role, depois: body.role };
      user.role = body.role;
    }
    if ('password' in body) {
      changes.senha = { alterada: true };
      user.password = body.password;
    }
    if (!Object.keys(changes).length) return res.json(safeUser(user));

    try {
      await user.save();
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ message: 'Já existe um usuário com este e-mail' });
      if (error?.name === 'VersionError') return res.status(409).json({ message: 'O usuário foi alterado por outra operação; atualize e tente novamente' });
      console.error(error);
      return res.status(500).json({ message: 'Não foi possível alterar o usuário' });
    }
    try {
      await recordAuditEvent({
        AuditLogModel,
        req,
        action: 'usuario.alterado',
        details: { usuarioId: String(user._id), alteracoes: changes },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'O usuário foi alterado, mas não foi possível registrar a auditoria' });
    }
    return res.json(safeUser(user));
  };

  const deleteUser = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Identificador de usuário inválido' });
    }
    const user = await UserModel.findById(req.params.id);
    if (!user || user.archivedAt) return res.status(404).json({ message: 'Usuário não encontrado' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Contas de administrador não podem ser excluídas por esta tela' });

    user.active = false;
    user.archivedAt = new Date();
    try {
      await user.save();
    } catch (error) {
      if (error?.name === 'VersionError') return res.status(409).json({ message: 'O usuário foi alterado por outra operação; atualize e tente novamente' });
      console.error(error);
      return res.status(500).json({ message: 'Não foi possível excluir o usuário' });
    }
    try {
      await recordAuditEvent({
        AuditLogModel,
        req,
        action: 'usuario.arquivado',
        details: { usuarioId: String(user._id), email: user.email, perfil: user.role },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'O usuário foi excluído, mas não foi possível registrar a auditoria' });
    }
    return res.json(safeUser(user));
  };

  return { listUsers, createUser, setUserActive, updateUser, deleteUser };
}

export function createLoginHandler({
  UserModel = User,
  AuditLogModel = AuditLog,
  signTokenFn = signToken,
} = {}) {
  return async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const user = await UserModel.findOne({ email: normalizedEmail }).select('+password');
      if (!user || typeof password !== 'string' || !password || !(await user.matchPassword(password))) {
        await recordAuditEvent({
          AuditLogModel,
          req,
          requester: user,
          action: 'auth.login',
          details: { email: normalizedEmail },
          success: false,
        });
        return res.status(401).json({ message: 'E-mail ou senha inválidos' });
      }
      if (!user.active) {
        await recordAuditEvent({
          AuditLogModel,
          req,
          requester: user,
          action: 'auth.login',
          details: { email: normalizedEmail, motivo: 'usuario_inativo' },
          success: false,
        });
        return res.status(403).json({ message: 'Usuário inativo' });
      }
      await recordAuditEvent({
        AuditLogModel,
        req,
        requester: user,
        action: 'auth.login',
        details: { email: user.email },
      });
      return res.json({
        token: signTokenFn(user._id),
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Não foi possível realizar o login' });
    }
  };
}

export function createLogoutHandler({ AuditLogModel = AuditLog } = {}) {
  return async (req, res) => {
    try {
      await recordAuditEvent({ AuditLogModel, req, action: 'auth.logout' });
      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Não foi possível registrar a auditoria do logout' });
    }
  };
}

router.post('/login', loginLimiter, createLoginHandler());
router.post('/logout', protect, createLogoutHandler());

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role });
});

const userManagement = createUserManagementHandlers();
router.get('/users', protect, adminOnly, userManagement.listUsers);
router.post('/users', protect, adminOnly, userManagement.createUser);
router.patch('/users/:id/active', protect, adminOnly, userManagement.setUserActive);
router.patch('/users/:id', protect, adminOnly, userManagement.updateUser);
router.delete('/users/:id', protect, adminOnly, userManagement.deleteUser);

export default router;
