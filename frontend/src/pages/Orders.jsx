import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Plus, Search } from 'lucide-react';
import { api, fmt } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import PrintButton from '../components/PrintButton.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';
import { getListState } from '../hooks/listState.js';
import { useServerPagination } from '../hooks/useServerPagination.js';
import OrderForm from './OrderForm.jsx';
import { getOrderDocumentLabel } from './orderPresentation.js';
import { getDeadline, getProductionStage, normalizeSkippedStages, productionStages } from './printshop.js';
import { getOrderBalance, getOrderPaymentStatus } from './orderBalance.js';
import PeriodExport from '../components/PeriodExport.jsx';

const DEFAULT_PAGE_SIZE = 20;
export function ProductionStatus({ value, order }) {
  const skippedStages = normalizeSkippedStages(order?.skippedStages || []);
  const initialStage = productionStages.find(([key]) => key !== 'entregue' && !skippedStages.includes(key))?.[0];
  const stageAdvanced = order && getProductionStage(order) !== initialStage;
  const started = order?.productionStartedAt
    || stageAdvanced
    || order?.history?.some((entry) => ['producao_iniciada', 'retomado', 'etapa_concluida', 'etapa_avancada', 'etapa_dispensada'].includes(entry?.action));
  return value === 'em_producao' || (value === 'nao_iniciado' && started) ? null : <StatusBadge value={value} />;
}

export function ProductionStageTracker({ order, onAdvance, busy = false }) {
  const currentStage = getProductionStage(order);
  const currentIndex = productionStages.findIndex(([key]) => key === currentStage);
  const skippedStages = normalizeSkippedStages(order.skippedStages || []);
  const requiredStages = productionStages.filter(([key]) => !skippedStages.includes(key));
  const nextStage = productionStages.find(([key], index) => index > currentIndex && !skippedStages.includes(key))?.[0];
  const completedCount = currentStage === 'entregue'
    ? requiredStages.length
    : requiredStages.filter(([key]) => productionStages.findIndex(([stage]) => stage === key) < currentIndex).length;
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Progresso das etapas de produção"
        aria-valuemin={0}
        aria-valuemax={requiredStages.length}
        aria-valuenow={completedCount}
        aria-valuetext={`${completedCount} de ${requiredStages.length} etapas concluídas${currentStage !== 'entregue' ? `; etapa atual: ${productionStages[currentIndex]?.[1] || currentStage}` : '; pedido entregue'}`}
        className="flex min-w-0 gap-1"
      >
        {productionStages.map(([key, label], index) => {
          const skipped = skippedStages.includes(key);
          const completed = !skipped && (index < currentIndex || currentStage === 'entregue');
          const current = !skipped && index === currentIndex && currentStage !== 'entregue';
          return (
            <span
              key={key}
              title={`${label}: ${skipped ? 'dispensada' : completed ? 'concluída' : current ? 'atual' : 'pendente'}`}
              className={`h-2 flex-1 rounded-full ${skipped ? 'bg-slate-200' : completed ? 'bg-emerald-500' : current ? 'bg-amber-400' : 'bg-slate-200'}`}
            />
          );
        })}
      </div>
      <ol aria-label="Etapas de produção" className="mt-1 flex min-w-0 gap-1">
      {productionStages.map(([key, label], index) => {
        const skipped = skippedStages.includes(key);
        const state = skipped ? 'dispensada' : index < currentIndex || currentStage === 'entregue' ? 'concluída' : index === currentIndex ? 'atual' : 'pendente';
        return (
          <li key={key} title={`${label}: ${state}`} className={`min-w-0 flex-1 break-words rounded-md text-[10px] leading-tight ${state === 'concluída' ? 'bg-emerald-50 text-emerald-700' : state === 'atual' ? 'bg-amber-100 font-semibold text-amber-900' : state === 'dispensada' ? 'bg-slate-100 text-slate-400 line-through' : 'bg-slate-50 text-slate-500'}`}>
            <button
              type="button"
              disabled={key !== nextStage || order.status !== 'aprovado' || order.production === 'pausado' || busy}
              onClick={() => onAdvance?.(order)}
              aria-label={`Avançar para ${label}`}
              aria-current={key === currentStage ? 'step' : undefined}
              className={`w-full rounded-md px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-default ${key === nextStage && order.status === 'aprovado' && order.production !== 'pausado' ? 'cursor-pointer hover:bg-amber-50' : ''}`}
            >
              {label}
            </button>
          </li>
        );
      })}
      </ol>
    </div>
  );
}

export function OrderActions({ order }) {
  return (
    <div className="mx-auto grid w-full max-w-40 grid-cols-2 gap-1.5">
      {order.status !== 'cancelado' && <>
        <PrintButton orderId={order._id} label="A4" className="!h-8 !w-full !justify-center !gap-1 !rounded-lg !px-1 !py-1 text-[11px]" />
        <PrintButton orderId={order._id} format="80mm" label="80 mm" className="!h-8 !w-full !justify-center !gap-1 !rounded-lg !px-1 !py-1 text-[11px]" />
        <WhatsAppButton orderId={order._id} iconOnly className="!h-8 !w-full !justify-center !gap-0 !rounded-lg !px-1 !py-1" />
      </>}
      <Link to={`/pedidos/${order._id}`} aria-label={`Abrir pedido ${order.number}`} className="inline-flex h-8 w-full items-center justify-center rounded-lg border px-1 py-1 text-[11px] hover:bg-slate-50">Abrir</Link>
    </div>
  );
}

const orderTabs = [
  { status: 'active', label: 'Orçamentos/Pedidos' },
  { status: 'closed', label: 'Concluídos/Cancelados' },
];
const filters = [
  { key: 'paymentStatus', label: 'Pagamento', options: ['', 'aberto', 'parcial', 'pago', 'quitado'], labels: ['Todos', 'Aberto', 'Parcial', 'Pago', 'Quitado'] },
  { key: 'production', label: 'Produção', options: ['', 'nao_iniciado', 'em_producao', 'pausado'], labels: ['Todos', 'Não iniciado', 'Em produção', 'Pausado'] },
];

export default function Orders() {
  const [query, setQuery] = useState('');
  const [f, setF] = useState({ paymentStatus: '', production: '' });
  const [activeTab, setActiveTab] = useState('active');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [approvingId, setApprovingId] = useState('');
  const [approvalMessage, setApprovalMessage] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [advancingId, setAdvancingId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const params = new URLSearchParams();
  params.set('status', activeTab);
  Object.entries(f).forEach(([key, value]) => value && params.set(key, value));
  if (query) params.set('q', query);
  const list = useServerPagination('/api/orders', params.toString(), page, pageSize);
  const { items: orders, total, loading, error, retry } = list;
  const listState = getListState({ loading, error, items: orders });

  const updateFilter = (key, value) => {
    setPage(1);
    setF((current) => ({ ...current, [key]: value }));
  };
  const approveQuote = async (order) => {
    setApprovingId(order._id);
    setApprovalMessage('');
    setApprovalError('');
    try {
      await api(`/api/orders/${order._id}/approve`, { method: 'POST' });
      setApprovalMessage(`Orçamento #${order.number} aprovado e convertido em pedido.`);
      retry();
    } catch (err) {
      setApprovalError(err.message);
    } finally {
      setApprovingId('');
    }
  };
  const advanceStage = async (order) => {
    const currentStage = getProductionStage(order);
    const currentIndex = productionStages.findIndex(([key]) => key === currentStage);
    const skippedStages = normalizeSkippedStages(order.skippedStages || []);
    const nextStage = productionStages.find(([key], index) => index > currentIndex && !skippedStages.includes(key));
    if (!nextStage) return;
    const confirmation = nextStage[0] === 'entregue'
      ? `Confirmar a entrega do pedido #${order.number}? O pedido será concluído.`
      : `Avançar o pedido #${order.number} para ${nextStage[1]}?`;
    if (!window.confirm(confirmation)) return;
    setAdvancingId(order._id);
    setApprovalError('');
    try {
      await api(`/api/orders/${order._id}/production/advance`, {
        method: 'POST',
        body: { expectedStage: currentStage },
      });
      retry();
    } catch (err) {
      setApprovalError(err.message);
    } finally {
      setAdvancingId('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pedidos / Orçamentos</h1>
          <p className="text-sm text-slate-500">{total} pedido(s)/orçamento(s) nesta aba</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodExport type="orders" label="Exportar pedidos CSV" />
          <Link to="/pedido-rapido" className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">Pedido rápido · F2</Link>
          <button type="button" onClick={() => setNewOrderOpen(true)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} /> Novo Orçamento
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Etapa dos pedidos" className="flex flex-wrap gap-1 rounded-xl border bg-white p-1">
        {orderTabs.map((tab) => (
          <button
            key={tab.status}
            type="button"
            id={`order-tab-${tab.status}`}
            role="tab"
            aria-selected={activeTab === tab.status}
            aria-controls="orders-panel"
            onClick={() => { setPage(1); setActiveTab(tab.status); }}
            className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium transition ${activeTab === tab.status ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => { setPage(1); setQuery(e.target.value); }}
            placeholder="Buscar por número ou cliente..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        {approvalMessage && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{approvalMessage}</p>}
        {approvalError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{approvalError}</p>}
        {filters.map((flt) => (
          <select
            key={flt.key}
            value={f[flt.key]}
            onChange={(e) => updateFilter(flt.key, e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            {flt.options.map((o, i) => <option key={o} value={o}>{flt.label}: {flt.labels[i]}</option>)}
          </select>
        ))}
      </div>

      <div id="orders-panel" role="tabpanel" aria-labelledby={`order-tab-${activeTab}`} tabIndex={0} className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <Pagination page={list.page} pageSize={list.pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />
        <div className="min-w-0">
          <table className="responsive-table text-sm">
            <colgroup>
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-center px-2 py-3">Nº</th>
                <th className="text-center px-2 py-3">Cliente</th>
                <th className="text-center px-2 py-3">Status</th>
                <th className="text-center px-2 py-3">Produção</th>
                <th className="text-center px-2 py-3">Data de entrega</th>
                <th className="text-center px-2 py-3">Pagamento</th>
                <th className="text-center px-2 py-3">Pago</th>
                <th className="text-center px-2 py-3">A PAGAR</th>
                <th className="text-center px-2 py-3">TOTAL</th>
                <th className="text-center px-2 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {listState === 'loading' && (
                <tr><td colSpan="10"><ListSkeleton variant="table" rows={6} /></td></tr>
              )}
              {listState === 'error' && (
                <tr><td colSpan="10" className="py-8 text-center text-sm text-red-700">
                  <div role="alert">{error}</div>
                  <button type="button" onClick={retry} className="mt-2 rounded-lg border px-3 py-1.5 hover:bg-red-50">Tentar novamente</button>
                </td></tr>
              )}
              {listState === 'empty' && (
                <tr><td colSpan="10" className="text-center py-10 text-slate-400">Nenhum pedido ou orçamento encontrado.</td></tr>
              )}
              {listState === 'ready' && orders.map((o) => (
                <tr key={o._id} className="border-t hover:bg-slate-50">
                  <td data-label="Nº" className="px-2 py-3">
                    <div className="text-xs text-slate-500">{getOrderDocumentLabel(o)}</div>
                    <div className="font-mono font-semibold">#{o.number}</div>
                  </td>
                  <td data-label="Cliente" className="px-2 py-3">{o.client?.name || 'Cliente não cadastrado'}</td>
                  <td data-label="Status" className="px-2 py-3">
                    <StatusBadge value={o.status} />
                    {o.status === 'pendente' && <button type="button" disabled={Boolean(approvingId) || Boolean(advancingId)} onClick={() => approveQuote(o)} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                      <CheckCircle2 size={14} /> {approvingId === o._id ? 'Aprovando...' : 'Aprovar'}
                    </button>}
                  </td>
                  <td data-label="Produção" className="px-2 py-3">
                    {o.status === 'pendente' ? <span className="text-xs text-slate-500">Aguardando aprovação</span> : o.status === 'cancelado' ? <StatusBadge value="cancelado" /> : <>
                      <ProductionStatus value={o.production} order={o} />
                      <div className="mt-2"><ProductionStageTracker order={o} onAdvance={advanceStage} busy={advancingId === o._id} /></div>
                    </>}
                  </td>
                  <td data-label="Data de entrega" className={`px-2 py-3 text-xs ${getDeadline(o).overdue ? 'font-semibold text-red-700' : 'text-slate-500'}`}>{getDeadline(o).label}</td>
                  <td data-label="Pagamento" className="px-2 py-3"><StatusBadge value={getOrderPaymentStatus(o)} /></td>
                  <td data-label="Pago" className="whitespace-nowrap px-2 py-3 text-right text-xs">{fmt(o.amountPaid)}</td>
                  <td data-label="A PAGAR" className="whitespace-nowrap px-2 py-3 text-right text-xs">{fmt(getOrderBalance(o))}</td>
                  <td data-label="TOTAL" className="whitespace-nowrap px-2 py-3 text-right text-xs font-semibold">{fmt(o.finalValue)}</td>
                  <td data-label="Ações" className="px-2 py-3 text-right">
                    <OrderActions order={o} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <OrderForm modal open={newOrderOpen} onCancel={() => setNewOrderOpen(false)} onSaved={() => { setNewOrderOpen(false); retry(); }} />
    </div>
  );
}
