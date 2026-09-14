import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt, fmtDate } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';

export default function Receivables() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('open');

  useEffect(() => {
    api('/api/orders').then(setOrders);
  }, []);

  const withBalance = orders
    .map((o) => ({ ...o, balance: (o.finalValue || 0) - (o.amountPaid || 0) }))
    .filter((o) => {
      if (filter === 'open') return o.balance > 0.01;
      if (filter === 'paid') return o.balance <= 0.01;
      return true;
    });

  const totalOpen = withBalance.filter((o) => o.balance > 0.01).reduce((s, o) => s + o.balance, 0);
  const totalReceived = orders.reduce((s, o) => s + (o.amountPaid || 0), 0);

  // Próximos vencimentos das parcelas em aberto
  const upcoming = [];
  orders.forEach((o) => {
    (o.installments || []).forEach((p, i) => {
      if (!p.paid) upcoming.push({ order: o, parcela: i + 1, dueDate: p.dueDate, amount: p.amount });
    });
  });
  upcoming.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contas a Receber</h1>
          <p className="text-sm text-slate-500">A receber: <strong className="text-orange-600">{fmt(totalOpen)}</strong> · Já recebido: <strong className="text-emerald-600">{fmt(totalReceived)}</strong></p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-white">
          <option value="open">Em aberto</option>
          <option value="paid">Quitados</option>
          <option value="all">Todos</option>
        </select>
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
            {withBalance.length === 0 && <tr><td colSpan="7" className="text-center py-10 text-slate-400">Nenhum título.</td></tr>}
            {withBalance.map((o) => (
              <tr key={o._id} className="border-t hover:bg-slate-50">
                <td className="px-5 py-3 font-mono font-semibold">#{o.number}</td>
                <td className="px-5 py-3">{o.client?.name || 'Cliente não cadastrado'}</td>
                <td className="px-5 py-3"><StatusBadge value={o.paymentStatus} /></td>
                <td className="px-5 py-3 text-right">{fmt(o.finalValue)}</td>
                <td className="px-5 py-3 text-right text-emerald-600">{fmt(o.amountPaid)}</td>
                <td className="px-5 py-3 text-right font-bold text-red-600">{fmt(Math.max(0, o.balance))}</td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <WhatsAppButton orderId={o._id} className="!py-1.5 !px-2.5 text-xs" />
                    <Link to={`/pedidos/${o._id}`} className="px-2.5 py-1.5 border rounded text-xs hover:bg-slate-50">Receber</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
