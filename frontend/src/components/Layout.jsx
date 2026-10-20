import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Wallet, TrendingDown, LogOut, Package, Zap, Columns3, Banknote,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import BrandMark from './BrandMark.jsx';
import { canAccess } from '../roleAccess.js';

const menu = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, permission: 'dashboard' },
  { to: '/pedidos', label: 'Pedidos / Orçamentos', icon: ClipboardList, permission: 'orders' },
  { to: '/pedido-rapido', label: 'Pedido rápido · F2', icon: Zap, permission: 'quickOrder' },
  { to: '/producao', label: 'Produção', icon: Columns3, permission: 'production' },
  { to: '/clientes', label: 'Clientes', icon: Users, permission: 'clients' },
  { to: '/produtos', label: 'Produtos', icon: Package, permission: 'products' },
  { to: '/contas-receber', label: 'Contas a Receber', icon: Wallet, permission: 'receivables' },
  { to: '/caixa', label: 'Fechamento de caixa', icon: Banknote, permission: 'cash' },
  { to: '/contas-pagar', label: 'Contas a Pagar', icon: TrendingDown, permission: 'payables' },
];

const roleLabel = { admin: 'Administrador', atendente: 'Atendente', producao: 'Produção' };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const shortcut = (event) => {
      if (event.key !== 'F2' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      navigate('/pedido-rapido');
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [navigate]);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="w-full lg:w-64 bg-brand-900 text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-white/10">
          <BrandMark dark />
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-x-auto">
          {menu.filter((m) => canAccess(user?.role, m.permission)).map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive ? 'bg-brand-500 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <m.icon size={18} />
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="px-2 py-2 text-xs text-white/60">
            <div className="font-semibold text-white text-sm">{user?.name}</div>
            {roleLabel[user?.role]}
          </div>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-red-500/20 hover:text-red-200 transition"
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
