import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmt, fmtDate } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import PrintButton from '../components/PrintButton.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';
import { getListState } from '../hooks/listState.js';
import { useServerPagination } from '../hooks/useServerPagination.js';
import { buildBalanceReminderUrl } from './printshop.js';
import { useAuth } from '../context/AuthContext.jsx';
import PeriodExport from '../components/PeriodExport.jsx';

const PAGE_SIZE = 20;

export default function Receivables() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('open');
  const [page, setPage] = useState(1);
  const list = useServerPagination('/api/orders/receivables', `filter=${filter}`, page, PAGE_SIZE);
  const { items: orders, total, summary, loading, error, retry } = list;
  const listState = getListState({ loading, error, items: orders });

  const withBalance = orders.map((o) => ({ ...o, balance: (o.finalValue || 0) - (o.amountPaid || 0) }));
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
                <div className="text-slate-500">{u.parcela}ª · {fmtDate(u.dueDate)} · <strong>{fmt(u.amount)}</strong></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3">Pedido</th>
              <th className="text-left px-5 py-3">Cliente</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Total</th>
              <th className="text-right px-5 py-3">Recebido</th>
              <th className="text-right px-5 py-3">Saldo</th>
              <th className="text-right px-5 py-3">Ações</th>
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
                <td className="px-5 py-3 font-mono font-semibold">#{o.number}</td>
                <td className="px-5 py-3">{o.client?.name || 'Cliente não cadastrado'}</td>
                <td className="px-5 py-3"><StatusBadge value={o.paymentStatus} /></td>
                <td className="px-5 py-3 text-right">{fmt(o.finalValue)}</td>
                <td className="px-5 py-3 text-right text-emerald-600">{fmt(o.amountPaid)}</td>
                <td className="px-5 py-3 text-right font-bold text-red-600">{fmt(Math.max(0, o.balance))}</td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <PrintButton orderId={o._id} className="!py-1.5 !px-2.5 text-xs" />
                    <WhatsAppButton orderId={o._id} className="!py-1.5 !px-2.5 text-xs" />
                    {buildBalanceReminderUrl(o) && <a href={buildBalanceReminderUrl(o)} target="_blank" rel="noreferrer" className="rounded border px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50">Lembrar</a>}
                    <Link to={`/pedidos/${o._id}`} className="px-2.5 py-1.5 border rounded text-xs hover:bg-slate-50">Receber</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination page={list.page} pageSize={list.pageSize} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}
