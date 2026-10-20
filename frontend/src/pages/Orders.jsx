import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { fmt } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import PrintButton from '../components/PrintButton.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';
import { getListState } from '../hooks/listState.js';
import { useServerPagination } from '../hooks/useServerPagination.js';
import OrderForm from './OrderForm.jsx';
import { getOrderDocumentLabel } from './orderPresentation.js';
import { getDeadline, getProductionStage, productionStages } from './printshop.js';
import PeriodExport from '../components/PeriodExport.jsx';

const PAGE_SIZE = 20;
const orderTabs = [
  { status: 'pendente', label: 'Pendente aprovação' },
  { status: 'aprovado', label: 'Pendente execução' },
  { status: 'concluido', label: 'Concluído' },
];
const filters = [
  { key: 'paymentStatus', label: 'Pagamento', options: ['', 'aberto', 'parcial', 'pago', 'quitado'], labels: ['Todos', 'Aberto', 'Parcial', 'Pago', 'Quitado'] },
  { key: 'production', label: 'Produção', options: ['', 'nao_iniciado', 'em_producao', 'pausado', 'concluido'], labels: ['Todos', 'Não iniciado', 'Em produção', 'Pausado', 'Concluído'] },
];

export default function Orders() {
  const [query, setQuery] = useState('');
  const [f, setF] = useState({ paymentStatus: '', production: '' });
  const [activeTab, setActiveTab] = useState('pendente');
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [page, setPage] = useState(1);
  const params = new URLSearchParams();
  params.set('status', activeTab);
  Object.entries(f).forEach(([key, value]) => value && params.set(key, value));
  if (query) params.set('q', query);
  const list = useServerPagination('/api/orders', params.toString(), page, PAGE_SIZE);
  const { items: orders, total, loading, error, retry } = list;
  const listState = getListState({ loading, error, items: orders });

  const updateFilter = (key, value) => {
    setPage(1);
    setF((current) => ({ ...current, [key]: value }));
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

      <div role="tablist" aria-label="Etapa dos pedidos" className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1">
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
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => { setPage(1); setQuery(e.target.value); }}
            placeholder="Buscar por número ou cliente..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-3">Nº</th>
                <th className="text-left px-5 py-3">Cliente</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Produção</th>
                <th className="text-left px-5 py-3">Pagamento</th>
                <th className="text-right px-5 py-3">Pago</th>
                <th className="text-right px-5 py-3">Valor</th>
                <th className="text-right px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {listState === 'loading' && (
                <tr><td colSpan="8"><ListSkeleton variant="table" rows={6} /></td></tr>
              )}
              {listState === 'error' && (
                <tr><td colSpan="8" className="py-8 text-center text-sm text-red-700">
                  <div role="alert">{error}</div>
                  <button type="button" onClick={retry} className="mt-2 rounded-lg border px-3 py-1.5 hover:bg-red-50">Tentar novamente</button>
                </td></tr>
              )}
              {listState === 'empty' && (
                <tr><td colSpan="8" className="text-center py-10 text-slate-400">Nenhum pedido ou orçamento encontrado.</td></tr>
              )}
              {listState === 'ready' && orders.map((o) => (
                <tr key={o._id} className="border-t hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="text-xs text-slate-500">{getOrderDocumentLabel(o)}</div>
                    <div className="font-mono font-semibold">#{o.number}</div>
                  </td>
                  <td className="px-5 py-3">{o.client?.name || 'Cliente não cadastrado'}</td>
                  <td className="px-5 py-3"><StatusBadge value={o.status} /></td>
                  <td className="px-5 py-3"><StatusBadge value={o.production} />
                    <div className="mt-1 text-xs text-slate-500">{productionStages.find(([key]) => key === getProductionStage(o))?.[1]}</div>
                    <div className={`mt-1 text-xs ${getDeadline(o).overdue ? 'font-semibold text-red-700' : 'text-slate-500'}`}>{getDeadline(o).label}</div>
                  </td>
                  <td className="px-5 py-3"><StatusBadge value={o.paymentStatus} /></td>
                  <td className="px-5 py-3 text-right">{fmt(o.amountPaid)}</td>
                  <td className="px-5 py-3 text-right font-semibold">{fmt(o.finalValue)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <PrintButton orderId={o._id} className="!py-1.5 !px-2.5 text-xs" />
                      <WhatsAppButton orderId={o._id} className="!py-1.5 !px-2.5 text-xs" />
                      <Link to={`/pedidos/${o._id}`} className="inline-flex items-center px-2.5 py-1.5 rounded-lg border text-xs hover:bg-slate-50">Detalhes</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={list.page} pageSize={list.pageSize} total={total} onPageChange={setPage} />
      </div>

      <OrderForm modal open={newOrderOpen} onCancel={() => setNewOrderOpen(false)} onSaved={() => { setNewOrderOpen(false); retry(); }} />
    </div>
  );
}
