import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Wallet, TrendingDown, LogOut, Package, Zap, Columns3, Banknote, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import BrandMark from './BrandMark.jsx';
import { getVisibleMenu } from '../roleAccess.js';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-brand-900 text-white transition-transform lg:static lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 border-b border-white/10">
          <BrandMark dark />
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
          {getVisibleMenu(menu, user?.role).map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.end}
              onClick={() => setMobileMenuOpen(false)}
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
          </div>
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
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white px-4 py-2 lg:hidden">
          <BrandMark />
          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="rounded-lg border p-2 text-slate-700"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>
        <main className="min-w-0 overflow-x-hidden">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
