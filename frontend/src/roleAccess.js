export const rolePermissions = Object.freeze({
  dashboard: ['admin'],
  orders: ['admin', 'atendente'],
  orderForm: ['admin', 'atendente'],
  orderDetail: ['admin', 'atendente', 'producao'],
  quickOrder: ['admin', 'atendente'],
  production: ['admin', 'atendente', 'producao'],
  productionActions: ['admin', 'producao'],
  clients: ['admin', 'atendente'],
  products: ['admin'],
  users: ['admin'],
  audit: ['admin'],
  payables: ['admin'],
  receivables: ['admin', 'atendente'],
  cash: ['admin', 'atendente'],
});

export const canAccess = (role, permission) => rolePermissions[permission]?.includes(role) || false;

export const getVisibleMenu = (menu, role) => menu.filter((item) => canAccess(role, item.permission));

export const getHomePath = (role) => ({
  admin: '/',
  atendente: '/pedidos',
  producao: '/producao',
}[role] || '/login');
