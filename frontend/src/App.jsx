import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Orders from './pages/Orders.jsx';
import OrderForm from './pages/OrderForm.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Clients from './pages/Clients.jsx';
import Payables from './pages/Payables.jsx';
import Receivables from './pages/Receivables.jsx';
import Products from './pages/Products.jsx';
import QuickOrder from './pages/QuickOrder.jsx';
import Production from './pages/Production.jsx';
import CashRegister from './pages/CashRegister.jsx';
import Users from './pages/Users.jsx';
import RoleGuard from './components/RoleGuard.jsx';
import { getHomePath } from './roleAccess.js';

function Protected({ children, permission }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (permission === 'dashboard' && user.role !== 'admin') return <Navigate to={getHomePath(user.role)} replace />;
  return (
    <Layout>
      <RoleGuard role={user.role} permission={permission}>{children}</RoleGuard>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected permission="dashboard"><Dashboard /></Protected>} />
      <Route path="/pedidos" element={<Protected permission="orders"><Orders /></Protected>} />
      <Route path="/pedidos/novo" element={<Protected permission="orderForm"><OrderForm /></Protected>} />
      <Route path="/pedidos/:id" element={<Protected permission="orderDetail"><OrderDetail /></Protected>} />
      <Route path="/pedidos/:id/editar" element={<Protected permission="orderForm"><OrderForm /></Protected>} />
      <Route path="/clientes" element={<Protected permission="clients"><Clients /></Protected>} />
      <Route path="/produtos" element={<Protected permission="products"><Products /></Protected>} />
      <Route path="/pedido-rapido" element={<Protected permission="quickOrder"><QuickOrder /></Protected>} />
      <Route path="/producao" element={<Protected permission="production"><Production /></Protected>} />
      <Route path="/contas-pagar" element={<Protected permission="payables"><Payables /></Protected>} />
      <Route path="/contas-receber" element={<Protected permission="receivables"><Receivables /></Protected>} />
      <Route path="/caixa" element={<Protected permission="cash"><CashRegister /></Protected>} />
      <Route path="/usuarios" element={<Protected permission="users"><Users /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
