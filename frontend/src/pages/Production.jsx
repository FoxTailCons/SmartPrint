import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { api } from '../api';
import ProductionProgress from '../components/ProductionProgress.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { canAccess } from '../roleAccess.js';
import { getDeadline, getProductionStage, priorityLabels, productionStages } from './printshop.js';

export function ProductionStagePanel({ stage, title, orders, user, onChanged }) {
  const cards = orders.filter((order) => getProductionStage(order) === stage);
  return (
    <details className="group min-w-0 overflow-hidden rounded-xl border bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 break-words font-semibold">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-slate-500">
          {cards.length} pedido(s)
          <ChevronDown size={18} className="transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-3 border-t bg-slate-100 p-3">
        {!cards.length && <p className="text-sm text-slate-500">Nenhum pedido nesta etapa.</p>}
        {cards.map((order) => {
          const due = getDeadline(order);
          return <article key={order._id} className={`min-w-0 space-y-3 rounded-lg border bg-white p-3 shadow-sm ${due.overdue ? 'border-red-300' : ''}`}>
            <Link to={`/pedidos/${order._id}`} className="block break-words font-semibold text-brand-700 hover:underline">#{order.number} · {order.client?.name || 'Cliente não cadastrado'}</Link>
            <p className="break-words text-xs text-slate-600">{order.items?.map((item) => item.description).join(' · ')}</p>
            <div className={`text-xs ${due.overdue ? 'font-semibold text-red-700' : 'text-slate-600'}`}>{due.label}</div>
            <div className={`text-xs ${order.priority === 'urgente' ? 'font-bold text-red-700' : 'text-slate-600'}`}>Prioridade: {priorityLabels[order.priority || 'normal']}</div>
            <ProductionProgress
              order={order}
              readOnly={!canAccess(user?.role, 'productionActions')}
              onChanged={onChanged}
            />
          </article>;
        })}
      </div>
    </details>
  );
}

export default function Production() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [deadline, setDeadline] = useState('all');
  const [priority, setPriority] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ deadline });
    if (priority) params.set('priority', priority);
    api(`/api/orders/production-board?${params}`).then((data) => { if (active) setOrders(data); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deadline, priority, revision]);

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Produção</h1><p className="text-sm text-slate-500">Prazos, prioridades e etapas · Entregues dos últimos 7 dias</p></div>
        <button type="button" onClick={() => setRevision((value) => value + 1)} className="rounded-lg border bg-white px-4 py-2 text-sm">Atualizar</button>
      </div>
      <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
        <label className="text-sm">Prazo
          <select value={deadline} onChange={(e) => setDeadline(e.target.value)} className="ml-2 rounded-lg border px-3 py-2">
            <option value="all">Todos</option><option value="today">Hoje</option><option value="overdue">Atrasados</option><option value="upcoming">Próximos</option>
          </select>
        </label>
        <label className="text-sm">Prioridade
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="ml-2 rounded-lg border px-3 py-2">
            <option value="">Todas</option>{Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      {loading ? <p role="status">Carregando produção...</p> : error ? <p role="alert" className="text-red-700">{error} Use Atualizar para tentar novamente.</p> : (
        <div className="min-w-0 space-y-3">
          {productionStages.map(([stage, title]) => (
            <ProductionStagePanel
              key={stage}
              stage={stage}
              title={title}
              orders={orders}
              user={user}
              onChanged={() => setRevision((value) => value + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
