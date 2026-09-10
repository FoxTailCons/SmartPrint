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
