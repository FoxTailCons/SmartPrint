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
import { getOrderSettings } from './config/orderSettings.js';
import cashRoutes from './routes/cash.js';
import exportRoutes from './routes/exports.js';
import auditRoutes from './routes/audit.js';

getOrderSettings();
const app = express();
const allowedOrigins = (process.env.CLIENT_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não autorizada'));
  } : true,
}));
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'SmartPrint PDV' }));

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payables', payableRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/audit', auditRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ message: 'Erro interno do servidor' });
});

// Garante que os usuários padrão existam sem sobrescrever senhas existentes.
const seedUsers = async () => {
  const users = [
    { name: 'Administrador', email: 'admin@smartprint.com', password: 'admin123', role: 'admin' },
    { name: 'Atendente', email: 'atendente@smartprint.com', password: 'atend123', role: 'atendente' },
    { name: 'Produção', email: 'producao@smartprint.com', password: 'prod123', role: 'producao' },
  ];

  for (const user of users) {
    const exists = await User.exists({ email: user.email });
    if (!exists) {
      await User.create(user);
      console.log(`Usuário inicial criado: ${user.email}`);
    }
  }
};

const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  seedUsers().catch(() => {});
  app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
});
