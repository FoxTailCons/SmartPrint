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
  payables: ['admin'],
  receivables: ['admin', 'atendente'],
  cash: ['admin', 'atendente'],
});

export const canAccess = (role, permission) => rolePermissions[permission]?.includes(role) || false;
