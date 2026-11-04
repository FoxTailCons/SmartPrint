import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { fmt, fmtDate, deleteProposal } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import ProposalWhatsAppButton from '../components/ProposalWhatsAppButton.jsx';
import ProposalPrintButton from '../components/ProposalPrintButton.jsx';
import ListSkeleton from '../components/ListSkeleton.jsx';
import Pagination from '../components/Pagination.jsx';
import { getListState } from '../hooks/listState.js';
import { useServerPagination } from '../hooks/useServerPagination.js';

const PAGE_SIZE = 20;
const statusOptions = ['', 'rascunho', 'enviada', 'aceita', 'rejeitada', 'cancelada'];
const statusLabels = ['Todos', 'Rascunho', 'Enviada', 'Aceita', 'Rejeitada', 'Cancelada'];

export default function Proposals() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (query) params.set('q', query);
  const list = useServerPagination('/api/proposals', params.toString(), page, PAGE_SIZE);
  const { items: proposals, total, loading, error, retry } = list;
  const listState = getListState({ loading, error, items: proposals });
  const remove = async (id) => {
    if (!confirm('Excluir esta proposta?')) return;
    try {
      await deleteProposal(id);
      retry();
    } catch (e) {
      alert(e.message);
    }
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Propostas</h1>
          <p className="text-sm text-slate-500">{total} proposta(s) encontrada(s)</p>
        </div>
        <Link to="/propostas/nova" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> Nova Proposta
        </Link>
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
        <select
          value={status}
          onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        >
          {statusOptions.map((o, i) => <option key={o || 'all'} value={o}>Status: {statusLabels[i]}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-3">Nº</th>
                <th className="text-left px-5 py-3">Cliente</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Validade</th>
                <th className="text-right px-5 py-3">Valor Total</th>
                <th className="text-right px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {listState === 'loading' && (
                <tr><td colSpan="6"><ListSkeleton variant="table" rows={6} /></td></tr>
              )}
              {listState === 'error' && (
                <tr><td colSpan="6" className="py-8 text-center text-sm text-red-700">
                  <div role="alert">{error}</div>
                  <button type="button" onClick={retry} className="mt-2 rounded-lg border px-3 py-1.5 hover:bg-red-50">Tentar novamente</button>
                </td></tr>
              )}
              {listState === 'empty' && (
                <tr><td colSpan="6" className="text-center py-10 text-slate-400">Nenhuma proposta encontrada.</td></tr>
              )}
              {listState === 'ready' && proposals.map((p) => (
                <tr key={p._id} className="border-t hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="font-mono font-semibold">#{p.number}</div>
                    <div className="text-xs text-slate-500">{fmtDate(p.createdAt)}</div>
                  </td>
                  <td className="px-5 py-3">{p.client?.name || p.clientSnapshot?.name || 'Cliente não cadastrado'}</td>
                  <td className="px-5 py-3"><StatusBadge value={p.status} /></td>
                  <td className="px-5 py-3">{fmtDate(p.validityDate)}</td>
                  <td className="px-5 py-3 text-right font-semibold">{fmt(p.totalAmount)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <ProposalPrintButton proposalId={p._id} className="!py-1.5 !px-2.5 text-xs" />
                      <ProposalWhatsAppButton proposalId={p._id} disabled={!(p.client?.phone || p.clientSnapshot?.phone)} className="!py-1.5 !px-2.5 text-xs" />
                      <Link to={`/propostas/${p._id}`} className="inline-flex items-center px-2.5 py-1.5 rounded-lg border text-xs hover:bg-slate-50">Detalhes</Link>
                      <button type="button" onClick={() => remove(p._id)} className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50">Excluir</button>
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
