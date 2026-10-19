import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { api, fmt } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import PrintButton from '../components/PrintButton.jsx';
import OrderForm from './OrderForm.jsx';
import { getOrderDocumentLabel } from './orderPresentation.js';

const filters = [
  { key: 'status', label: 'Status', options: ['', 'pendente', 'aprovado', 'concluido'], labels: ['Todos', 'Orçamento pendente', 'Pedido aprovado', 'Pedido concluído'] },
  { key: 'paymentStatus', label: 'Pagamento', options: ['', 'aberto', 'parcial', 'pago', 'quitado'], labels: ['Todos', 'Aberto', 'Parcial', 'Pago', 'Quitado'] },
  { key: 'production', label: 'Produção', options: ['', 'nao_iniciado', 'em_producao', 'pausado', 'concluido'], labels: ['Todos', 'Não iniciado', 'Em produção', 'Pausado', 'Concluído'] },
];

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState('');
  const [f, setF] = useState({ status: '', paymentStatus: '', production: '' });
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  const load = () => {
    const params = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && params.set(k, v));
    if (query) params.set('q', query);
    api(`/api/orders?${params}`).then(setOrders);
  };
  useEffect(() => { load(); }, [f, query]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pedidos / Orçamentos</h1>
          <p className="text-sm text-slate-500">{orders.length} pedido(s)/orçamento(s) encontrado(s)</p>
        </div>
        <button type="button" onClick={() => setNewOrderOpen(true)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> Novo Orçamento
        </button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por número ou cliente..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        {filters.map((flt) => (
          <select
            key={flt.key}
            value={f[flt.key]}
            onChange={(e) => setF({ ...f, [flt.key]: e.target.value })}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            {flt.options.map((o, i) => <option key={o} value={o}>{flt.label}: {flt.labels[i]}</option>)}
          </select>
        ))}
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
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
              {orders.length === 0 && (
                <tr><td colSpan="8" className="text-center py-10 text-slate-400">Nenhum pedido ou orçamento encontrado.</td></tr>
              )}
              {orders.map((o) => (
                <tr key={o._id} className="border-t hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="text-xs text-slate-500">{getOrderDocumentLabel(o)}</div>
                    <div className="font-mono font-semibold">#{o.number}</div>
                  </td>
                  <td className="px-5 py-3">{o.client?.name || 'Cliente não cadastrado'}</td>
                  <td className="px-5 py-3"><StatusBadge value={o.status} /></td>
                  <td className="px-5 py-3"><StatusBadge value={o.production} /></td>
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
      </div>

      <OrderForm modal open={newOrderOpen} onCancel={() => setNewOrderOpen(false)} onSaved={() => { setNewOrderOpen(false); load(); }} />
    </div>
  );
}
