import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList, Clock, CheckCircle2, Play, Pause, Wallet, TrendingDown,
  AlertTriangle, Bell, Users, Plus, ChevronDown, ChevronUp, Combine,
} from 'lucide-react';
import { api, fmt, fmtDate } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import Modal from '../components/Modal.jsx';
import OrderForm from './OrderForm.jsx';

function Card({ icon: Icon, label, value, color, sub, open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`bg-white rounded-xl p-5 shadow-sm border flex items-start gap-4 text-left transition hover:border-brand-300 hover:shadow-md ${open ? 'border-brand-500 ring-1 ring-brand-200' : ''}`}
    >
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
      {open ? <ChevronUp size={18} className="text-brand-600 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
    </button>
  );
}

function DetailList({ detail, selectedIds, onToggle }) {
  if (!detail.items.length) {
    return <div className="px-5 py-8 text-center text-sm text-slate-400">Nenhum registro encontrado.</div>;
  }

  if (detail.kind === 'client') {
    return (
      <div className="divide-y">
        {detail.items.map((client) => (
          <div key={client._id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-slate-700">{client.name}</span>
            <span className="text-slate-500">{client.phone || client.email || 'Sem contato'}</span>
          </div>
        ))}
      </div>
    );
  }

  if (detail.kind === 'payable') {
    return (
      <div className="divide-y">
        {detail.items.map((payable) => (
          <div key={payable._id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
            <div><div className="font-medium text-slate-700">{payable.description}</div><div className="text-xs text-slate-500">Vencimento: {fmtDate(payable.dueDate)}</div></div>
            <span className="font-semibold text-red-600">{fmt(payable.value)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y">
      {detail.items.map((order) => (
        <div key={order._id} className="px-5 py-3 flex items-center gap-3 text-sm hover:bg-slate-50">
          {onToggle && <input type="checkbox" checked={selectedIds.includes(order._id)} onChange={() => onToggle(order._id)} className="h-4 w-4 accent-brand-600" aria-label={`Selecionar pedido ${order.number}`} />}
          <Link to={`/pedidos/${order._id}`} className="flex-1 flex items-center justify-between gap-4">
            <div><div className="font-medium text-slate-700">Pedido #{order.number} · {order.client?.name || 'Cliente não informado'}</div><div className="text-xs text-slate-500"><StatusBadge value={order.status} /> <StatusBadge value={order.production} /></div></div>
            <span className="font-semibold text-slate-700">{fmt(order.finalValue)}</span>
          </Link>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [activeDetail, setActiveDetail] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [merging, setMerging] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  const load = () => api('/api/dashboard').then(setData).catch((e) => alert(e.message));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="p-8 text-center text-slate-500">Carregando dashboard...</div>;

  const { counts, finance, warnings, recentOrders, details } = data;
  const cards = [
    { key: 'orders', icon: ClipboardList, label: 'Total de Pedidos', value: counts.orders, color: 'bg-brand-100 text-brand-600', items: details.orders, title: 'Todos os pedidos', kind: 'order' },
    { key: 'pending', icon: Clock, label: 'Pendentes', value: counts.pending, color: 'bg-amber-100 text-amber-600', items: details.pending, title: 'Pedidos pendentes', kind: 'order' },
    { key: 'inProduction', icon: Play, label: 'Em Produção', value: counts.inProduction + counts.paused, color: 'bg-blue-100 text-blue-600', sub: `Ativos: ${counts.inProduction} · Pausados: ${counts.paused}`, items: [...details.inProduction, ...details.paused], title: 'Pedidos em produção e pausados', kind: 'order' },
    { key: 'concluded', icon: CheckCircle2, label: 'Concluídos', value: counts.concluded, color: 'bg-emerald-100 text-emerald-600', items: details.concluded, title: 'Pedidos concluídos', kind: 'order' },
    { key: 'toReceive', icon: Wallet, label: 'A Receber', value: fmt(finance.toReceive), color: 'bg-orange-100 text-orange-600', sub: `Recebido: ${fmt(finance.totalReceived)}`, items: details.toReceive, title: 'Pedidos com saldo a receber', kind: 'order' },
    { key: 'payables', icon: TrendingDown, label: 'Contas a Pagar', value: fmt(finance.totalPayables), color: 'bg-red-100 text-red-600', items: details.payables, title: 'Contas em aberto', kind: 'payable' },
    { key: 'clients', icon: Users, label: 'Clientes', value: counts.clients, color: 'bg-purple-100 text-purple-600', items: details.clients, title: 'Clientes cadastrados', kind: 'client' },
    { key: 'approved', icon: ClipboardList, label: 'Aprovados', value: counts.approved, color: 'bg-cyan-100 text-cyan-600', items: details.approved, title: 'Pedidos aprovados', kind: 'order' },
  ];
  const selectedDetail = cards.find((card) => card.key === activeDetail);
  const toggleOrder = (id) => setSelectedOrderIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const mergeOrders = async () => {
    if (selectedOrderIds.length < 2) return;
    if (!confirm('Agregar os pedidos selecionados em um único pedido? Os pedidos originais serão removidos.')) return;
    setMerging(true);
    try {
      await api('/api/orders/merge', { method: 'POST', body: { orderIds: selectedOrderIds } });
      setSelectedOrderIds([]);
      setActiveDetail(null);
      await load();
      alert('Pedidos agregados com sucesso.');
    } catch (e) {
      alert(e.message);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">Acompanhamento geral dos pedidos e finanças</p>
        </div>
        <button type="button" onClick={() => setNewOrderOpen(true)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> Novo Orçamento
        </button>
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
        {cards.map((card) => <Card key={card.key} {...card} open={activeDetail === card.key} onClick={() => setActiveDetail(activeDetail === card.key ? null : card.key)} />)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card icon={Wallet} label="Recebido Hoje" value={fmt(finance.receivedToday)} color="bg-emerald-100 text-emerald-600" />
        <Card icon={Wallet} label="Recebido na Semana" value={fmt(finance.receivedThisWeek)} color="bg-teal-100 text-teal-600" />
        <Card icon={Wallet} label="Recebido no Mês" value={fmt(finance.receivedThisMonth)} color="bg-cyan-100 text-cyan-600" />
      </div>

      {selectedDetail && selectedDetail.kind !== 'order' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div><h2 className="font-semibold">{selectedDetail.title}</h2><p className="text-xs text-slate-500 mt-1">{selectedDetail.items.length} registro(s)</p></div>
            <button type="button" onClick={() => setActiveDetail(null)} className="text-sm text-slate-500 hover:text-slate-800">Fechar</button>
          </div>
          <DetailList detail={selectedDetail} />
        </div>
      )}

      <Modal open={Boolean(selectedDetail?.kind === 'order')} onClose={() => { setActiveDetail(null); setSelectedOrderIds([]); }} title={selectedDetail?.title || 'Pedidos'} wide>
        {selectedDetail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500">{selectedDetail.items.length} registro(s)</span>
              <button type="button" disabled={selectedOrderIds.length < 2 || merging} onClick={mergeOrders} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                <Combine size={16} /> {merging ? 'Agregando...' : `Agregar selecionados (${selectedOrderIds.length})`}
              </button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <DetailList detail={selectedDetail} selectedIds={selectedOrderIds} onToggle={toggleOrder} />
            </div>
            <p className="text-xs text-slate-500">Os pedidos precisam pertencer ao mesmo cliente. O novo pedido soma os valores e desconta os pagamentos já realizados.</p>
          </div>
        )}
      </Modal>

      <OrderForm modal open={newOrderOpen} onCancel={() => setNewOrderOpen(false)} onSaved={() => { setNewOrderOpen(false); load(); }} />

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
