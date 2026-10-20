import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, UserPlus, Phone, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { api, fmt } from '../api';
import Modal from '../components/Modal.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';
import { StatusBadge } from '../components/Badges.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import PrintButton from '../components/PrintButton.jsx';
import { getListState } from '../hooks/listState.js';
import { useServerPagination } from '../hooks/useServerPagination.js';
import { getOrderDocumentLabel } from './orderPresentation.js';

const PAGE_SIZE = 20;

export default function Clients() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', document: '', address: '' });
  const list = useServerPagination('/api/clients', query ? `q=${encodeURIComponent(query)}` : '', page, PAGE_SIZE);
  const { items: clients, total, loading, error, retry } = list;
  const listState = getListState({ loading, error, items: clients });

  const toggle = async (c) => {
    if (expanded === c._id) return setExpanded(null);
    setExpanded(c._id);
    const d = await api(`/api/clients/${c._id}`);
    setDetail({ ...detail, [c._id]: d });
  };

  const create = async () => {
    if (!form.name.trim()) return alert('Informe o nome');
    if (!form.phone.trim()) return alert('Informe o telefone');
    try {
      await api('/api/clients', { method: 'POST', body: { ...form, name: form.name.trim(), phone: form.phone.trim() } });
      setShowNew(false);
      setForm({ name: '', phone: '', email: '', document: '', address: '' });
      retry();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-slate-500">{total} cliente(s) · pedidos e orçamentos agrupados por cliente</p>
        </div>
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <UserPlus size={16} /> Novo Cliente
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} placeholder="Buscar cliente..." className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      <div className="bg-white rounded-xl border shadow-sm divide-y">
        {listState === 'loading' && <ListSkeleton variant="list" rows={6} />}
        {listState === 'error' && <div role="alert" className="p-8 text-center text-sm text-red-700">
          <p>{error}</p>
          <button type="button" onClick={retry} className="mt-2 rounded-lg border px-3 py-1.5 hover:bg-red-50">Tentar novamente</button>
        </div>}
        {listState === 'empty' && <div className="p-8 text-center text-slate-400">Nenhum cliente encontrado.</div>}
        {listState === 'ready' && clients.map((c) => (
          <div key={c._id}>
            <button onClick={() => toggle(c)} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 text-left">
              <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold shrink-0">
                {c.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-xs text-slate-500 flex gap-3 flex-wrap">
                  {c.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {c.phone}</span>}
                  {c.email && <span className="inline-flex items-center gap-1"><Mail size={11} /> {c.email}</span>}
                </div>
              </div>
              <div className="text-right text-sm shrink-0">
                <div><strong>{c.ordersCount}</strong> pedido(s)</div>
                <div className="text-xs text-slate-500">{c.openOrders} em aberto · {fmt(c.totalSpent)}</div>
              </div>
              {expanded === c._id ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
            </button>
            {expanded === c._id && detail?.[c._id] && (
              <div className="bg-slate-50 px-5 py-4 border-t">
                <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Pedidos e orçamentos do cliente</div>
                {detail[c._id].orders.length === 0 && <p className="text-sm text-slate-400">Sem pedidos.</p>}
                <div className="space-y-2">
                  {detail[c._id].orders.map((o) => (
                    <div key={o._id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-sm border">
                      <span><span className="block text-xs text-slate-500">{getOrderDocumentLabel(o)}</span><span className="font-mono font-semibold">#{o.number}</span></span>
                      <StatusBadge value={o.status} />
                      <StatusBadge value={o.paymentStatus} />
                      <span className="flex-1 text-right font-medium">{fmt(o.finalValue)}</span>
                      <div className="inline-flex gap-2">
                        <PrintButton orderId={o._id} className="!py-1 !px-2 text-xs" />
                        <WhatsAppButton orderId={o._id} className="!py-1 !px-2 text-xs" />
                      </div>
                      <Link to={`/pedidos/${o._id}`} className="px-2 py-1 border rounded text-xs hover:bg-slate-50">Abrir</Link>
                    </div>
                  ))}
                </div>
                <Pagination page={list.page} pageSize={list.pageSize} total={total} onPageChange={setPage} />
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Novo Cliente">
        <div className="space-y-3">
          <input required placeholder="Nome *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input required placeholder="Telefone/WhatsApp (com DDD) *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="CPF/CNPJ" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="Endereço" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <button onClick={create} className="w-full py-2.5 bg-brand-600 text-white rounded-lg font-medium inline-flex items-center justify-center gap-2">
            <Plus size={16} /> Cadastrar
          </button>
        </div>
      </Modal>
    </div>
  );
}
