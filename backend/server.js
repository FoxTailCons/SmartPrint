import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import orderRoutes from './routes/orders.js';
import payableRoutes from './routes/payables.js';
import dashboardRoutes from './routes/dashboard.js';
import productRoutes from './routes/products.js';
import User from './models/User.js';
import { findAvailableUsername, migrateUsernames } from './services/usernames.js';
import { prepareUserIndexes } from './services/userIndexes.js';
import { getOrderSettings } from './config/orderSettings.js';
import cashRoutes from './routes/cash.js';
import exportRoutes from './routes/exports.js';
import auditRoutes from './routes/audit.js';
import todoRoutes from './routes/todos.js';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';

getOrderSettings();
const app = express();
const allowedOrigins = (process.env.CLIENT_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean);
if (!allowedOrigins.length) {
  console.warn('AVISO DE SEGURANÇA: CLIENT_URL não definida — CORS aberto para qualquer origem. Defina CLIENT_URL em produção.');
}
app.use(cors({
  origin: allowedOrigins.length ? (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não autorizada'));
  } : true,
}));
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas requisições. Aguarde um momento e tente novamente.' },
});
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payables', payableRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/audit', auditRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ message: 'Erro interno do servidor' });
});

// Garante que os usuários padrão existam sem sobrescrever senhas existentes.
const seedUsers = async () => {
  const users = [
    { name: 'Administrador', username: 'admin', email: 'admin@smartprint.com', role: 'admin' },
    { name: 'Atendente', username: 'atendente', email: 'atendente@smartprint.com', role: 'atendente' },
    { name: 'Produção', username: 'producao', email: 'producao@smartprint.com', role: 'producao' },
  ];

  for (const user of users) {
    const exists = await User.exists({ email: user.email });
    if (!exists) {
      const username = await findAvailableUsername(user.username, async (value) => (
        Boolean(await User.exists({ username: value }))
      ));
      const tempPassword = crypto.randomBytes(6).toString('hex');
      await User.create({ ...user, username, password: tempPassword, mustChangePassword: true });
      console.warn(`USUARIO INICIAL CRIADO: ${user.email} (${username}) — senha temporaria definida; o usuario deve trocar no primeiro login.`);
      console.log(`Usuário inicial criado: ${user.email} (${username})`);
    }
  }
};

const shouldSeedUsers = process.env.SEED_USERS === 'true' || process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 5000;
connectDB().then(async () => {
  await prepareUserIndexes(User);
  const migrated = await migrateUsernames(User);
  if (migrated) console.log(`Nomes de usuário migrados: ${migrated}`);
  if (shouldSeedUsers) {
    await seedUsers();
  } else {
    console.log('Seed de usuários padrão desativado em produção. Defina SEED_USERS=true para habilitar.');
  }
  app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
}).catch((error) => {
  console.error('Falha ao preparar usuários antes de iniciar a API:', error);
  process.exit(1);
});
