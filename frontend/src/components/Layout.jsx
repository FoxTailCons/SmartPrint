import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Wallet, TrendingDown, LogOut, Printer,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const menu = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pedidos', label: 'Pedidos / Orçamentos', icon: ClipboardList },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/contas-receber', label: 'Contas a Receber', icon: Wallet },
  { to: '/contas-pagar', label: 'Contas a Pagar', icon: TrendingDown },
];

const roleLabel = { admin: 'Administrador', atendente: 'Atendente', producao: 'Produção' };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-brand-900 text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center">
            <Printer size={22} />
          </div>
          <div>
            <div className="font-bold leading-tight">SmartPrint</div>
            <div className="text-xs text-white/60">Lindóia · Gráfica</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {menu.map((m) => (
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
      <main className="flex-1 overflow-x-hidden">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
