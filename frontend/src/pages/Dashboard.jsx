import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList, Clock, CheckCircle2, Play, Pause, Wallet, TrendingDown,
  AlertTriangle, Bell, Users, Plus, ChevronDown, ChevronUp, Combine,
} from 'lucide-react';
import { api, fmt, fmtCivilDate } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import PrintButton from '../components/PrintButton.jsx';
import Modal from '../components/Modal.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';
import { getListState } from '../hooks/listState.js';
import { usePagination } from '../hooks/usePagination.js';
import { getDeadline, priorityLabels } from './printshop.js';
import OrderForm from './OrderForm.jsx';
import { toggleSelectedOrder } from './listPagination.js';
import { getOrderDocumentLabel } from './orderPresentation.js';
import { getOrderPaymentStatus } from './orderBalance.js';

const DETAIL_PAGE_SIZE = 20;

function Card({ icon: Icon, label, value, color, sub, open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`metric-card bg-white rounded-xl p-4 border border-slate-200 flex items-start gap-4 text-left transition hover:border-brand-300 hover:shadow-sm ${open ? 'border-brand-500 ring-1 ring-brand-200' : ''}`}
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

export function DashboardSection({ title, description, children }) {
  return (
    <details open className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
        <div>
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t p-4 sm:p-5">{children}</div>
    </details>
  );
}

function DetailList({ detail, selectedIds, onToggle }) {
  const [pageSize, setPageSize] = useState(DETAIL_PAGE_SIZE);
  const { items, page, total, setPage } = usePagination(detail.items, pageSize);
  if (!detail.items.length) {
    return <div className="px-5 py-8 text-center text-sm text-slate-400">Nenhum registro encontrado.</div>;
  }

  let content;
  if (detail.kind === 'client') {
    content = (
      <div className="divide-y">
        {items.map((client) => (
          <div key={client._id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-slate-700">{client.name}</span>
            <span className="text-slate-500">{client.phone || client.email || 'Sem contato'}</span>
          </div>
        ))}
      </div>
    );
  }
  else if (detail.kind === 'payable') {
    content = (
      <div className="divide-y">
        {items.map((payable) => (
          <div key={payable._id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
            <div><div className="font-medium text-slate-700">{payable.description}</div><div className="text-xs text-slate-500">Vencimento: {fmtCivilDate(payable.dueDate)}</div></div>
            <span className="font-semibold text-red-600">{fmt(payable.value)}</span>
          </div>
        ))}
      </div>
    );
  } else {
    content = (
      <div className="divide-y">
        {items.map((order) => (
        <div key={order._id} className="px-5 py-3 flex items-center gap-3 text-sm hover:bg-slate-50">
          {onToggle && <input type="checkbox" checked={(selectedIds || []).includes(order._id)} onChange={() => onToggle(order._id)} className="h-4 w-4 accent-brand-600" aria-label={`Selecionar pedido ${order.number}`} />}
          <Link to={`/pedidos/${order._id}`} className="flex-1 flex items-center justify-between gap-4">
            <div><div className="font-medium text-slate-700">{getOrderDocumentLabel(order)} #{order.number} · {order.client?.name || 'Cliente não informado'}</div><div className="text-xs text-slate-500"><StatusBadge value={order.status} /> <StatusBadge value={order.production} /></div></div>
            <span className="font-semibold text-slate-700">{fmt(order.finalValue)}</span>
          </Link>
        </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />
      {content}
    </>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);
  const [activeDetail, setActiveDetail] = useState(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [merging, setMerging] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('all');

  useEffect(() => {
    const currentRequestId = ++requestId.current;
    const query = new URLSearchParams();
    if (selectedClientId && selectedClientId !== 'all') query.set('clientId', selectedClientId);
    if (selectedPeriod && selectedPeriod !== 'all') query.set('period', selectedPeriod);
    setLoading(true);
    setError('');
    api(`/api/dashboard${query.toString() ? `?${query.toString()}` : ''}`)
      .then((result) => {
        if (requestId.current === currentRequestId) setData(result);
      })
      .catch((requestError) => {
        if (requestId.current === currentRequestId) setError(requestError.message);
      })
      .finally(() => {
        if (requestId.current === currentRequestId) setLoading(false);
      });
    return () => {
      if (requestId.current === currentRequestId) requestId.current += 1;
    };
  }, [selectedClientId, selectedPeriod, reloadKey]);

  const initialListState = getListState({
    loading: loading && !data,
    error: !data ? error : '',
    items: data ? [data] : [],
  });
  if (initialListState === 'loading') return <div className="rounded-xl border bg-white"><ListSkeleton variant="list" rows={6} /></div>;
  if (initialListState === 'error') {
    return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
      <p>Não foi possível carregar o dashboard: {error}</p>
      <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-3 rounded-lg border px-3 py-1.5 hover:bg-red-100">Tentar novamente</button>
    </div>;
  }
  if (initialListState === 'empty') return null;

  const { counts, finance, warnings, recentOrders, details, dailyUrgencies } = data;
  const cards = [
    { key: 'orders', icon: ClipboardList, label: 'Total de Pedidos', value: counts.orders, color: 'bg-cyan-50 text-cyan-700', items: details.orders, title: 'Todos os pedidos', kind: 'order' },
    { key: 'pending', icon: Clock, label: 'Orçamentos', value: counts.pending, color: 'bg-yellow-50 text-yellow-700', items: details.pending, title: 'Orçamentos pendentes', kind: 'order' },
    { key: 'inProduction', icon: Play, label: 'Em Produção', value: counts.inProduction + counts.paused, color: 'bg-slate-100 text-slate-700', sub: `Ativos: ${counts.inProduction} · Pausados: ${counts.paused}`, items: [...details.inProduction, ...details.paused], title: 'Pedidos em produção e pausados', kind: 'order' },
    { key: 'concluded', icon: CheckCircle2, label: 'Concluídos', value: counts.concluded, color: 'bg-emerald-50 text-emerald-700', items: details.concluded, title: 'Pedidos concluídos', kind: 'order' },
    { key: 'toReceive', icon: Wallet, label: 'A Receber', value: fmt(finance.toReceive), color: 'bg-orange-50 text-orange-700', sub: `Recebido: ${fmt(finance.totalReceived)}`, items: details.toReceive, title: 'Pedidos com saldo a receber', kind: 'order' },
    { key: 'payables', icon: TrendingDown, label: 'Contas a Pagar', value: fmt(finance.totalPayables), color: 'bg-rose-50 text-rose-700', items: details.payables, title: 'Contas em aberto', kind: 'payable' },
    { key: 'clients', icon: Users, label: 'Clientes', value: counts.clients, color: 'bg-slate-100 text-slate-700', items: details.clients, title: 'Clientes cadastrados', kind: 'client' },
    { key: 'approved', icon: ClipboardList, label: 'Aprovados', value: counts.approved, color: 'bg-cyan-50 text-cyan-700', items: details.approved, title: 'Pedidos aprovados', kind: 'order' },
  ];
  const percent = (value) => `${Number(value || 0).toFixed(1)}%`;
  const selectedDetail = cards.find((card) => card.key === activeDetail);
  const toggleOrder = (id) => setSelectedOrderIds((current) => toggleSelectedOrder(current, id));
  const mergeOrders = async () => {
    if (selectedOrderIds.length < 2) return;
    if (!confirm('Agregar os pedidos selecionados em um único pedido? Os pedidos originais serão removidos.')) return;
    setMerging(true);
    try {
      await api('/api/orders/merge', { method: 'POST', body: { orderIds: selectedOrderIds } });
      setSelectedOrderIds([]);
      setActiveDetail(null);
      setReloadKey((value) => value + 1);
      alert('Pedidos agregados com sucesso.');
    } catch (e) {
      alert(e.message);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Não foi possível atualizar o dashboard: {error}
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="ml-3 underline">Tentar novamente</button>
      </div>}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="border-l-4 border-brand-500 pl-4">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500">Acompanhamento geral dos pedidos e finanças</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedClientId}
            onChange={(event) => setSelectedClientId(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">Todos os clientes</option>
            {data.details?.clients?.map((client) => (
              <option key={client._id} value={client._id}>{client.name}</option>
            ))}
          </select>
          <select
            value={selectedPeriod}
            onChange={(event) => setSelectedPeriod(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">Todo o período</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="12m">Últimos 12 meses</option>
          </select>
          <button type="button" onClick={() => setNewOrderOpen(true)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} /> Novo Orçamento
          </button>
        </div>
      </div>

      {/* Avisos visuais de contas a pagar */}
      {(warnings.payablesOverdue > 0 || warnings.payablesDueSoon > 0) && (
        <DashboardSection title="Avisos financeiros">
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
        </DashboardSection>
      )}

      <DashboardSection
        title="Urgências do dia"
        description="Contas vencidas ou de hoje e pedidos que precisam de atenção."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x">
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-700">Contas a pagar</h3>
              <Link to="/contas-pagar" className="text-xs font-semibold text-brand-600 hover:underline">Ver contas</Link>
            </div>
            {dailyUrgencies?.payables?.length ? (
              <div className="divide-y">
                {dailyUrgencies.payables.map((payable) => (
                  <Link key={payable._id} to="/contas-pagar" className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-slate-50">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-700">{payable.description}</div>
                      <div className={`text-xs ${payable.urgency === 'overdue' ? 'text-red-600' : 'text-amber-600'}`}>
                        {payable.urgency === 'overdue' ? 'Vencida' : 'Vence hoje'} · {fmtCivilDate(payable.dueDate)}
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold text-slate-700">{fmt(payable.value)}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="py-4 text-sm text-slate-400">Nenhuma conta vencida ou com vencimento hoje.</p>}
          </div>
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-700">Pedidos pendentes de execução</h3>
              <Link to="/producao" className="text-xs font-semibold text-brand-600 hover:underline">Ver produção</Link>
            </div>
            {dailyUrgencies?.orders?.length ? (
              <div className="divide-y">
                {dailyUrgencies.orders.map((order) => (
                  <Link key={order._id} to={`/pedidos/${order._id}`} className="block py-3 text-sm hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium text-slate-700">Pedido #{order.number} · {order.client?.name || 'Cliente não informado'}</span>
                      <span className="shrink-0 font-semibold text-slate-700">{fmt(order.finalValue)}</span>
                    </div>
                    <div className={`mt-1 text-xs ${order.urgency === 'overdue' ? 'text-red-600' : order.urgency === 'today' || order.urgency === 'urgente' ? 'text-amber-700' : 'text-slate-500'}`}>
                      {order.urgency === 'overdue' ? 'Prazo atrasado' : order.urgency === 'today' ? 'Entrega hoje' : `Prioridade ${priorityLabels[order.urgency] || 'alta'}`}
                      {' · '}Prazo: {getDeadline(order).label}
                    </div>
                  </Link>
                ))}
              </div>
            ) : <p className="py-4 text-sm text-slate-400">Nenhum pedido urgente pendente de execução.</p>}
          </div>
        </div>
      </DashboardSection>

      <DashboardSection title="Pedidos e produção">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((card) => <Card key={card.key} {...card} open={activeDetail === card.key} onClick={() => setActiveDetail(activeDetail === card.key ? null : card.key)} />)}
        </div>
      </DashboardSection>

      <DashboardSection title="Recebimentos">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card icon={Wallet} label="Recebido Hoje" value={fmt(finance.receivedToday)} color="bg-emerald-100 text-emerald-600" />
          <Card icon={Wallet} label="Recebido na Semana" value={fmt(finance.receivedThisWeek)} color="bg-teal-100 text-teal-600" />
          <Card icon={Wallet} label="Recebido no Mês" value={fmt(finance.receivedThisMonth)} color="bg-cyan-100 text-cyan-600" />
        </div>
      </DashboardSection>

      <DashboardSection title="Liquidez financeira">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Recebíveis</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{fmt(finance.liquidity?.receivables ?? 0)}</div>
          <p className="mt-1 text-xs text-slate-500">Valor a receber dos pedidos em aberto</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Pagáveis</div>
          <div className="mt-2 text-2xl font-bold text-rose-700">{fmt(finance.liquidity?.payables ?? 0)}</div>
          <p className="mt-1 text-xs text-slate-500">Dívidas pendentes do caixa</p>
        </div>
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Saldo líquido</div>
          <div className={`mt-2 text-2xl font-bold ${((finance.liquidity?.netCash ?? 0) >= 0) ? 'text-brand-700' : 'text-red-600'}`}>
            {fmt(finance.liquidity?.netCash ?? 0)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Recebíveis menos pagáveis em aberto</p>
        </div>
        </div>
      </DashboardSection>

      <DashboardSection title="Comparativo de fluxo de caixa">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Semana</h3>
              <span className={`text-sm font-semibold ${finance.cashFlowComparison.weekly.delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {finance.cashFlowComparison.weekly.delta >= 0 ? '+' : ''}{Number(finance.cashFlowComparison.weekly.deltaPct || 0).toFixed(1)}%
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-emerald-700">Semana atual</div>
                <div className="mt-2 text-xl font-bold text-emerald-700">{fmt(finance.cashFlowComparison.weekly.current)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Semana anterior</div>
                <div className="mt-2 text-xl font-bold text-slate-700">{fmt(finance.cashFlowComparison.weekly.previous)}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Variação de {fmt(Math.abs(finance.cashFlowComparison.weekly.delta))} em relação à semana anterior.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Mês</h3>
              <span className={`text-sm font-semibold ${finance.cashFlowComparison.monthly.delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {finance.cashFlowComparison.monthly.delta >= 0 ? '+' : ''}{Number(finance.cashFlowComparison.monthly.deltaPct || 0).toFixed(1)}%
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-cyan-700">Mês atual</div>
                <div className="mt-2 text-xl font-bold text-cyan-700">{fmt(finance.cashFlowComparison.monthly.current)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-[10px] uppercase tracking-[0.12em] text-slate-600">Mês anterior</div>
                <div className="mt-2 text-xl font-bold text-slate-700">{fmt(finance.cashFlowComparison.monthly.previous)}</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-500">
              Variação de {fmt(Math.abs(finance.cashFlowComparison.monthly.delta))} em relação ao mês anterior.
            </p>
          </div>
        </div>
      </DashboardSection>

      <DashboardSection title="Evolução do fluxo de caixa">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-lg font-bold text-slate-800">Últimos 7 dias</h3>
            <div className="mt-4 flex items-end gap-2 h-40">
              {finance.trend.last7Days.map((item) => {
                const height = Math.max(10, (item.value / Math.max(...finance.trend.last7Days.map((entry) => entry.value), 1)) * 100);
                return (
                  <div key={item.label} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex items-end justify-center h-28">
                      <div className="w-full rounded-t-md bg-gradient-to-t from-emerald-500 to-emerald-300" style={{ height: `${height}%` }} title={`${item.label}: ${fmt(item.value)}`} />
                    </div>
                    <span className="text-[10px] text-slate-500">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-lg font-bold text-slate-800">Últimos 6 meses</h3>
            <div className="mt-4 flex items-end gap-2 h-40">
              {finance.trend.last6Months.map((item) => {
                const height = Math.max(10, (item.value / Math.max(...finance.trend.last6Months.map((entry) => entry.value), 1)) * 100);
                return (
                  <div key={item.label} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex items-end justify-center h-28">
                      <div className="w-full rounded-t-md bg-gradient-to-t from-cyan-500 to-cyan-300" style={{ height: `${height}%` }} title={`${item.label}: ${fmt(item.value)}`} />
                    </div>
                    <span className="text-[10px] text-slate-500">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DashboardSection>

      <DashboardSection title="Comparativo mensal" description="Últimos 6 meses">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {data.analytics?.monthlyComparison?.map((month) => (
            <div key={month.monthKey} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{month.label}</div>
              <div className="mt-2 text-sm font-semibold text-slate-800">{fmt(month.revenue)}</div>
              <div className="mt-1 text-[11px] text-emerald-700">Recebido: {fmt(month.received)}</div>
              <div className="text-[11px] text-slate-500">{month.orders} pedido(s)</div>
            </div>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection title="Desempenho por cliente e serviço">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">Top clientes</h3>
            <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Receita</span>
          </div>
          <div className="mt-4 space-y-3">
            {data.analytics?.clients?.slice(0, 5).map((client) => (
              <div key={client.name} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <div>
                  <div className="font-medium text-slate-700">{client.name}</div>
                  <div className="text-xs text-slate-500">{client.orders} pedido(s)</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-800">{fmt(client.revenue)}</div>
                  <div className="text-[11px] text-slate-500">{fmt(client.outstanding)} em aberto</div>
                </div>
              </div>
            )) || <div className="text-sm text-slate-400">Nenhum cliente encontrado.</div>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">Linha de serviço</h3>
            <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Faturamento</span>
          </div>
          <div className="mt-4 space-y-3">
            {data.analytics?.services?.slice(0, 5).map((service) => (
              <div key={service.name} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <div>
                  <div className="font-medium text-slate-700">{service.name}</div>
                  <div className="text-xs text-slate-500">{service.orders} item(ns)</div>
                </div>
                <div className="font-semibold text-slate-800">{fmt(service.revenue)}</div>
              </div>
            )) || <div className="text-sm text-slate-400">Nenhuma linha de serviço encontrada.</div>}
          </div>
        </div>
        </div>
      </DashboardSection>

      {data.analytics?.serviceMargins && (
        <DashboardSection
          title="Margem por linha de serviço"
          description="Calculada com o custo salvo em cada item; pedidos antigos sem snapshot não recebem custo retroativo."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left">Categoria</th>
                  <th className="px-5 py-3 text-right">Receita</th>
                  <th className="px-5 py-3 text-right">Custo</th>
                  <th className="px-5 py-3 text-right">Lucro bruto</th>
                  <th className="px-5 py-3 text-right">Margem</th>
                  <th className="px-5 py-3 text-right">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {data.analytics.serviceMargins.map((row) => (
                  <tr key={row.category} className="border-t">
                    <td className="px-5 py-3 font-medium">{row.name}</td>
                    <td className="px-5 py-3 text-right">{fmt(row.revenue)}</td>
                    <td className="px-5 py-3 text-right">{fmt(row.cost)}</td>
                    <td className="px-5 py-3 text-right">{fmt(row.profit)}</td>
                    <td className="px-5 py-3 text-right">{row.marginPct === null ? 'Incompleta' : `${row.marginPct.toFixed(1).replace('.', ',')}%`}</td>
                    <td className="px-5 py-3 text-right">{row.costCoveragePct.toFixed(0)}% ({row.itemsWithoutCost} sem custo)</td>
                  </tr>
                ))}
                {!data.analytics.serviceMargins.length && <tr><td colSpan="6" className="px-5 py-8 text-center text-slate-400">Sem itens de pedidos confirmados para o período.</td></tr>}
              </tbody>
            </table>
          </div>
        </DashboardSection>
      )}

      <DashboardSection title="DRE / EBITDA e indicadores">
        <div className="grid grid-cols-1 xl:grid-cols-[1.8fr_1fr] gap-4">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 text-white rounded-2xl shadow-sm border border-slate-700 p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-lg font-bold">DRE / EBITDA</h2>
              <p className="text-xs text-slate-300">Resumo financeiro do período atual</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${finance.ebitda >= 0 ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}`}>
              EBITDA {percent(finance.ebitdaMargin)}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-white/5 p-3 border border-white/10">
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Receita Bruta</div>
              <div className="mt-2 text-lg font-bold text-white">{fmt(finance.totalRevenue)}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3 border border-white/10">
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Descontos</div>
              <div className="mt-2 text-lg font-bold text-white">{fmt(finance.totalDiscounts)}</div>
            </div>
            <div className="rounded-xl bg-emerald-500/10 p-3 border border-emerald-400/20">
              <div className="text-[10px] uppercase tracking-[0.12em] text-emerald-200">Lucro Bruto</div>
              <div className="mt-2 text-lg font-bold text-emerald-300">{fmt(finance.grossProfit)}</div>
            </div>
            <div className="rounded-xl bg-cyan-500/10 p-3 border border-cyan-400/20">
              <div className="text-[10px] uppercase tracking-[0.12em] text-cyan-200">EBITDA</div>
              <div className="mt-2 text-lg font-bold text-cyan-300">{fmt(finance.ebitda)}</div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-white/10">
                  <td className="px-4 py-3 text-slate-300">Receita líquida</td>
                  <td className="px-4 py-3 text-right font-semibold text-white">{fmt(finance.netRevenue)}</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="px-4 py-3 text-slate-300">Custos diretos</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-200">{fmt(finance.directCosts)}</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="px-4 py-3 text-slate-300">Margem bruta</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-300">{fmt(finance.grossProfit)}</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="px-4 py-3 text-slate-300">Despesas operacionais</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-200">{fmt(finance.operatingExpenses)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-slate-300">EBITDA</td>
                  <td className={`px-4 py-3 text-right font-bold ${finance.ebitda >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{fmt(finance.ebitda)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h3 className="text-lg font-bold text-slate-800">Indicadores</h3>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-emerald-700">Margem bruta</div>
              <div className="mt-1 text-2xl font-bold text-emerald-700">{percent((finance.netRevenue ? ((finance.grossProfit / finance.netRevenue) * 100) : 0))}</div>
            </div>
            <div className="rounded-xl bg-cyan-50 border border-cyan-200 p-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-cyan-700">Receita líquida</div>
              <div className="mt-1 text-2xl font-bold text-cyan-700">{fmt(finance.netRevenue)}</div>
            </div>
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
              <div className="text-[10px] uppercase tracking-[0.12em] text-rose-700">Contas em aberto</div>
              <div className="mt-1 text-2xl font-bold text-rose-700">{fmt(finance.totalPayables)}</div>
            </div>
          </div>
        </div>
      </div>
      </DashboardSection>

      {selectedDetail && selectedDetail.kind !== 'order' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div><h2 className="font-semibold">{selectedDetail.title}</h2><p className="text-xs text-slate-500 mt-1">{selectedDetail.items.length} registro(s)</p></div>
            <button type="button" onClick={() => setActiveDetail(null)} className="text-sm text-slate-500 hover:text-slate-800">Fechar</button>
          </div>
          <DetailList key={selectedDetail.key} detail={selectedDetail} />
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
              <DetailList key={selectedDetail.key} detail={selectedDetail} selectedIds={selectedOrderIds} onToggle={toggleOrder} />
            </div>
            <p className="text-xs text-slate-500">Os pedidos precisam pertencer ao mesmo cliente. O novo pedido soma os valores e desconta os pagamentos já realizados.</p>
          </div>
        )}
      </Modal>

      <OrderForm modal open={newOrderOpen} onCancel={() => setNewOrderOpen(false)} onSaved={() => { setNewOrderOpen(false); load(); }} />

      {/* Pedidos recentes / produção ativa */}
      <DashboardSection title="Pedidos recentes">
        <div className="mb-4 flex justify-end">
          <Link to="/pedidos" className="text-sm text-brand-600 hover:underline">Ver todos</Link>
        </div>
        <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-5">
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
                  <td className="px-5 py-3">{o.client?.name || 'Cliente não cadastrado'}</td>
                  <td className="px-5 py-3"><StatusBadge value={o.status} /></td>
                  <td className="px-5 py-3"><StatusBadge value={o.production} /></td>
                  <td className="px-5 py-3"><StatusBadge value={getOrderPaymentStatus(o)} /></td>
                  <td className="px-5 py-3 text-right font-semibold">{fmt(o.finalValue)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <PrintButton orderId={o._id} className="!py-1.5 !px-2.5 text-xs" />
                      <PrintButton orderId={o._id} format="80mm" className="!py-1.5 !px-2.5 text-xs" />
                      <WhatsAppButton orderId={o._id} className="!py-1.5 !px-2.5 text-xs" />
                      <Link to={`/pedidos/${o._id}`} className="inline-flex items-center px-2.5 py-1.5 rounded-lg border text-xs hover:bg-slate-50">Abrir</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>
    </div>
  );
}
