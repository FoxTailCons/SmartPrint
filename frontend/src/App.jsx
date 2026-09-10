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

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/pedidos" element={<Protected><Orders /></Protected>} />
      <Route path="/pedidos/novo" element={<Protected><OrderForm /></Protected>} />
      <Route path="/pedidos/:id" element={<Protected><OrderDetail /></Protected>} />
      <Route path="/pedidos/:id/editar" element={<Protected><OrderForm /></Protected>} />
      <Route path="/clientes" element={<Protected><Clients /></Protected>} />
      <Route path="/contas-pagar" element={<Protected><Payables /></Protected>} />
      <Route path="/contas-receber" element={<Protected><Receivables /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
