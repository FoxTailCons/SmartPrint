import User from '../models/User.js';

const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function verifyAdminCredentials(credentials, UserModel = User) {
  const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : '';
  const password = credentials?.password;
  if (!validEmail.test(email) || typeof password !== 'string' || password.length === 0) return null;

  const user = await UserModel.findOne({ email }).select('+password');
  if (!user || user.role !== 'admin' || user.active !== true) return null;
  return await user.matchPassword(password) ? user : null;
}

export async function authorizeOrderAction({ requester, adminAuthorization, UserModel = User } = {}) {
  if (requester?.role === 'admin' && requester.active === true) return requester;
  if (requester?.role !== 'atendente') return null;
  return verifyAdminCredentials(adminAuthorization, UserModel);
}
