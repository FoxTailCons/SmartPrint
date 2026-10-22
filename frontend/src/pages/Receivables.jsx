import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmt, fmtCivilDate } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import { printOrderDocument } from '../components/PrintButton.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';
import { getListState } from '../hooks/listState.js';
import { useServerPagination } from '../hooks/useServerPagination.js';
import { buildBalanceReminderUrl } from './printshop.js';
import { useAuth } from '../context/AuthContext.jsx';
import PeriodExport from '../components/PeriodExport.jsx';
import { buildBalanceThermalHtml, printThermalHtml } from './thermalPrint.js';
import { getOrderBalance, getOrderPaymentStatus } from './orderBalance.js';

const DEFAULT_PAGE_SIZE = 20;

export function printReceivableFormat(order, type, printOrder = printOrderDocument, printBalance = printThermalHtml) {
  if (type === 'balance') return printBalance(buildBalanceThermalHtml(order));
  if (type === 'a4' || type === '80mm') return printOrder(order._id, type);
}

export function ReceivablePrintActions({ order }) {
  const selectId = `receivable-print-${order._id}`;
  const handlePrint = (event) => {
    const selectedType = event.target.value;
    event.target.value = '';
    void printReceivableFormat(order, selectedType);
  };

  return (
    <div className="w-full">
      <label htmlFor={selectId} className="sr-only">Tipo de impressão do pedido {order.number}</label>
      <select
        id={selectId}
        defaultValue=""
        onChange={handlePrint}
        className="h-8 w-full min-w-0 rounded-lg border bg-white px-2 py-1 text-xs"
      >
        <option value="">Impressões</option>
        <option value="a4">Pedido A4</option>
        <option value="80mm">Pedido 80 mm</option>
        {order.balance > 0 && <option value="balance">Pendência 80 mm</option>}
      </select>
    </div>
  );
}

export default function Receivables() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('open');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const list = useServerPagination('/api/orders/receivables', `filter=${filter}`, page, pageSize);
  const { items: orders, total, summary, loading, error, retry } = list;
  const listState = getListState({ loading, error, items: orders });

  const withBalance = orders.map((order) => ({ ...order, balance: getOrderBalance(order) }));
  const totalOpen = summary?.totalOpen || 0;
  const totalReceived = summary?.totalReceived || 0;
  const upcoming = summary?.upcoming || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contas a Receber</h1>
          <p className="text-sm text-slate-500">A receber: <strong className="text-orange-600">{fmt(totalOpen)}</strong> · Já recebido: <strong className="text-emerald-600">{fmt(totalReceived)}</strong></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {user?.role === 'admin' && <PeriodExport type="finance" label="Exportar financeiro CSV" />}
        <select value={filter} onChange={(e) => { setPage(1); setFilter(e.target.value); }} className="px-3 py-2 border rounded-lg text-sm bg-white">
          <option value="open">Em aberto</option>
          <option value="paid">Quitados</option>
          <option value="all">Todos</option>
        </select>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h2 className="font-semibold mb-3 text-sm">Próximos vencimentos (parcelas)</h2>
          <div className="flex flex-wrap gap-2">
            {upcoming.slice(0, 8).map((u, i) => (
              <div key={i} className="text-xs bg-slate-50 border rounded-lg px-3 py-2">
                <div className="font-semibold">#{u.order.number} · {u.order.client?.name || 'Cliente não cadastrado'}</div>
                <div className="text-slate-500">{u.parcela}ª · {fmtCivilDate(u.dueDate)} · <strong>{fmt(u.amount)}</strong></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <Pagination page={list.page} pageSize={list.pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPage(1); setPageSize(size); }} />
        <div className="min-w-0">
        <table className="responsive-table text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-center px-5 py-3">Pedido</th>
              <th className="text-center px-5 py-3">Cliente</th>
              <th className="text-center px-5 py-3">Status</th>
              <th className="text-center px-5 py-3">Total</th>
              <th className="text-center px-5 py-3">Recebido</th>
              <th className="text-center px-5 py-3">Saldo</th>
              <th className="text-center px-5 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {listState === 'loading' && <tr><td colSpan="7"><ListSkeleton variant="table" rows={6} /></td></tr>}
            {listState === 'error' && <tr><td colSpan="7" className="py-8 text-center text-sm text-red-700">
              <div role="alert">{error}</div>
              <button type="button" onClick={retry} className="mt-2 rounded-lg border px-3 py-1.5 hover:bg-red-50">Tentar novamente</button>
            </td></tr>}
            {listState === 'empty' && <tr><td colSpan="7" className="text-center py-10 text-slate-400">Nenhum título.</td></tr>}
            {listState === 'ready' && withBalance.map((o) => (
              <tr key={o._id} className="border-t hover:bg-slate-50">
                <td data-label="Pedido" className="px-5 py-3 font-mono font-semibold">#{o.number}</td>
                <td data-label="Cliente" className="px-5 py-3">{o.client?.name || 'Cliente não cadastrado'}</td>
                <td data-label="Status" className="px-5 py-3"><StatusBadge value={getOrderPaymentStatus(o)} /></td>
                <td data-label="Total" className="px-5 py-3 text-right">{fmt(o.finalValue)}</td>
                <td data-label="Recebido" className="px-5 py-3 text-right text-emerald-600">{fmt(o.amountPaid)}</td>
                <td data-label="Saldo" className="px-5 py-3 text-right font-bold text-red-600">{fmt(Math.max(0, o.balance))}</td>
                <td data-label="Ações" className="px-5 py-3">
                  <div className="mx-auto grid w-full max-w-40 grid-cols-2 gap-1.5">
                    <ReceivablePrintActions order={o} />
                    <WhatsAppButton orderId={o._id} iconOnly className="!h-8 !w-full !justify-center !gap-0 !rounded-lg !px-1 !py-1" />
                    {buildBalanceReminderUrl(o) && <a href={buildBalanceReminderUrl(o)} target="_blank" rel="noreferrer" className="inline-flex h-8 w-full items-center justify-center rounded-lg border px-1 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50">Lembrar</a>}
                    <Link to={`/pedidos/${o._id}`} className="inline-flex h-8 w-full items-center justify-center rounded-lg border px-1 py-1 text-[11px] hover:bg-slate-50">Receber</Link>
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
