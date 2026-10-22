import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Wallet, TrendingDown, LogOut, Package, Zap, Columns3, Banknote, Menu, X, ScrollText, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import BrandMark from './BrandMark.jsx';
import { getVisibleMenu } from '../roleAccess.js';

export const navigationMenu = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, permission: 'dashboard' },
  { to: '/pedidos', label: 'Pedidos / Orçamentos', icon: ClipboardList, permission: 'orders' },
  { to: '/pedido-rapido', label: 'Pedido rápido · F2', icon: Zap, permission: 'quickOrder' },
  { to: '/producao', label: 'Dashboard de Produção', icon: Columns3, permission: 'production' },
  { to: '/clientes', label: 'Clientes', icon: Users, permission: 'clients' },
  { to: '/produtos', label: 'Produtos', icon: Package, permission: 'products' },
  { to: '/usuarios', label: 'Usuários', icon: Users, permission: 'users' },
  { to: '/auditoria', label: 'Auditoria', icon: ScrollText, permission: 'audit' },
  { to: '/contas-receber', label: 'Contas a Receber', icon: Wallet, permission: 'receivables' },
  { to: '/caixa', label: 'Fechamento de caixa', icon: Banknote, permission: 'cash' },
  { to: '/contas-pagar', label: 'Contas a Pagar', icon: TrendingDown, permission: 'payables' },
];

const roleLabel = { admin: 'Administrador', atendente: 'Atendente', producao: 'Produção' };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const handleLogout = async () => {
    setLogoutError('');
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      setLogoutError(error.message);
    }
  };

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
      <aside id="primary-sidebar" className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-brand-900 text-white transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-56'} ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className={`border-b border-white/10 ${sidebarCollapsed ? 'p-2 lg:flex lg:justify-center' : 'p-4'}`}>
          <BrandMark dark compact={sidebarCollapsed} />
          {sidebarCollapsed && <div className="hidden min-w-0 flex-1 lg:block" aria-hidden="true" />}
        </div>
        <nav aria-label="Navegação principal" className={`flex-1 overflow-y-auto ${sidebarCollapsed ? 'p-2 lg:px-1.5' : 'p-3'}`}>
          <div className="space-y-1">
          {getVisibleMenu(navigationMenu, user?.role).map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.end}
              onClick={() => setMobileMenuOpen(false)}
              title={sidebarCollapsed ? m.label : undefined}
              aria-label={sidebarCollapsed ? m.label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-lg text-sm transition ${
                  sidebarCollapsed ? 'justify-center px-2 py-2.5 lg:px-1' : 'gap-3 px-3 py-2.5'
                } ${
                  isActive ? 'bg-brand-500 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <m.icon size={18} className="shrink-0" />
              <span className={`${sidebarCollapsed ? 'lg:hidden' : ''} min-w-0 break-words`}>{m.label}</span>
            </NavLink>
          ))}
          </div>
        </nav>
        <div className={`border-t border-white/10 ${sidebarCollapsed ? 'p-2' : 'p-3'}`}>
          <div className={`${sidebarCollapsed ? 'lg:hidden' : ''} min-w-0 break-words px-2 py-2 text-xs text-white/60`}>
            <div className="break-words text-sm font-semibold text-white">{user?.name}</div>
            {roleLabel[user?.role]}
          </div>
          {logoutError && <p role="alert" className="px-2 text-xs text-red-300">{logoutError}</p>}
          <button
            onClick={handleLogout}
            aria-label="Sair"
            title={sidebarCollapsed ? 'Sair' : undefined}
            className={`mt-2 flex w-full items-center rounded-lg text-sm text-white/70 transition hover:bg-red-500/20 hover:text-red-200 ${sidebarCollapsed ? 'justify-center px-2 py-2 lg:mx-auto lg:w-auto' : 'gap-2 px-3 py-2'}`}
          >
            <LogOut size={16} className="shrink-0" /> <span className={sidebarCollapsed ? 'lg:hidden' : ''}>Sair</span>
          </button>
        </div>
        <button
          type="button"
          aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          aria-expanded={!sidebarCollapsed}
          aria-controls="primary-sidebar"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          className="absolute right-0 top-1/2 z-50 hidden h-10 w-5 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-md hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 lg:flex"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
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
          <div className="w-full min-w-0 p-3 sm:p-5 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
