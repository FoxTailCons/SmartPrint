import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import User from '../models/User.js';

const users = [
  { name: 'Administrador', email: 'admin@smartprint.com', password: 'admin123', role: 'admin' },
  { name: 'Atendente', email: 'atendente@smartprint.com', password: 'atend123', role: 'atendente' },
  { name: 'Produção', email: 'producao@smartprint.com', password: 'prod123', role: 'producao' },
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  for (const u of users) {
    const exists = await User.findOne({ email: u.email });
    if (!exists) await User.create(u);
    else console.log(`Já existe: ${u.email}`);
  }
  console.log('Seed concluído. Usuários:');
  users.forEach((u) => console.log(`  ${u.email} / ${u.password} (${u.role})`));
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
