import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import orderRoutes from './routes/orders.js';
import payableRoutes from './routes/payables.js';
import dashboardRoutes from './routes/dashboard.js';
import User from './models/User.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'SmartPrint PDV' }));

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payables', payableRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Seed automático dos 3 usuários no primeiro boot
const seedUsers = async () => {
  const count = await User.countDocuments();
  if (count === 0) {
    const users = [
      { name: 'Administrador', email: 'admin@smartprint.com', password: 'admin123', role: 'admin' },
      { name: 'Atendente', email: 'atendente@smartprint.com', password: 'atend123', role: 'atendente' },
      { name: 'Produção', email: 'producao@smartprint.com', password: 'prod123', role: 'producao' },
    ];
    await User.create(users);
    console.log('Usuários iniciais criados (troque a senha no primeiro acesso):');
    users.forEach((u) => console.log(`  ${u.email} / ${u.password}`));
  }
};

const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  seedUsers().catch(() => {});
  app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));
});
