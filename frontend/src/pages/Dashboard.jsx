import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList, Clock, CheckCircle2, Play, Pause, Wallet, TrendingDown,
  AlertTriangle, Bell, Users, Plus,
} from 'lucide-react';
import { api, fmt } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';

function Card({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border flex items-start gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);

  const load = () => api('/api/dashboard').then(setData).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="p-8 text-center text-slate-500">Carregando dashboard...</div>;

  const { counts, finance, warnings, recentOrders } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">Acompanhamento geral dos pedidos e finanças</p>
        </div>
        <Link to="/pedidos/novo" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> Novo Orçamento
        </Link>
      </div>

      {/* Avisos visuais de contas a pagar */}
      {(warnings.payablesOverdue > 0 || warnings.payablesDueSoon > 0) && (
        <div className="space-y-2">
          {warnings.payablesOverdue > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
              <AlertTriangle size={20} className="shrink-0" />
              <div className="flex-1 text-sm">
                <strong>{warnings.payablesOverdue} conta(s) vencida(s)</strong> totalizando {fmt(warnings.payablesOverdueValue)} —
                {' '}{warnings.overdueList.map((p) => p.description).slice(0, 3).join(', ')}
                {warnings.overdueList.length > 3 && '...'}
              </div>
              <Link to="/contas-pagar" className="text-xs font-semibold underline shrink-0">Ver contas</Link>
            </div>
          )}
          {warnings.payablesDueSoon > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3">
              <Bell size={20} className="shrink-0" />
              <div className="flex-1 text-sm">
                <strong>{warnings.payablesDueSoon} conta(s) vencendo em até 3 dias</strong> totalizando {fmt(warnings.payablesDueSoonValue)}
              </div>
              <Link to="/contas-pagar" className="text-xs font-semibold underline shrink-0">Ver contas</Link>
            </div>
          )}
        </div>
      )}

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card icon={ClipboardList} label="Total de Pedidos" value={counts.orders} color="bg-brand-100 text-brand-600" />
        <Card icon={Clock} label="Pendentes" value={counts.pending} color="bg-amber-100 text-amber-600" />
        <Card icon={Play} label="Em Produção" value={counts.inProduction} color="bg-blue-100 text-blue-600" sub={`Pausados: ${counts.paused}`} />
        <Card icon={CheckCircle2} label="Concluídos" value={counts.concluded} color="bg-emerald-100 text-emerald-600" />
        <Card icon={Wallet} label="A Receber" value={fmt(finance.toReceive)} color="bg-orange-100 text-orange-600" sub={`Recebido: ${fmt(finance.totalReceived)}`} />
        <Card icon={TrendingDown} label="Contas a Pagar" value={fmt(finance.totalPayables)} color="bg-red-100 text-red-600" />
        <Card icon={Users} label="Clientes" value={counts.clients} color="bg-purple-100 text-purple-600" />
        <Card icon={ClipboardList} label="Aprovados" value={counts.approved} color="bg-cyan-100 text-cyan-600" />
      </div>

      {/* Pedidos recentes / produção ativa */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Pedidos recentes</h2>
          <Link to="/pedidos" className="text-sm text-brand-600 hover:underline">Ver todos</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-3">Nº</th>
                <th className="text-left px-5 py-3">Cliente</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Produção</th>
                <th className="text-left px-5 py-3">Pagamento</th>
                <th className="text-right px-5 py-3">Valor</th>
                <th className="text-right px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 && (
                <tr><td colSpan="7" className="text-center py-8 text-slate-400">Nenhum pedido ainda. Crie o primeiro orçamento!</td></tr>
              )}
              {recentOrders.map((o) => (
                <tr key={o._id} className="border-t hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono font-semibold">#{o.number}</td>
                  <td className="px-5 py-3">{o.client?.name}</td>
                  <td className="px-5 py-3"><StatusBadge value={o.status} /></td>
                  <td className="px-5 py-3"><StatusBadge value={o.production} /></td>
                  <td className="px-5 py-3"><StatusBadge value={o.paymentStatus} /></td>
                  <td className="px-5 py-3 text-right font-semibold">{fmt(o.finalValue)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <WhatsAppButton orderId={o._id} className="!py-1.5 !px-2.5 text-xs" />
                      <Link to={`/pedidos/${o._id}`} className="inline-flex items-center px-2.5 py-1.5 rounded-lg border text-xs hover:bg-slate-50">Abrir</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
