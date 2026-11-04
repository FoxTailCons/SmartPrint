import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Pencil, Trash2, RefreshCw } from 'lucide-react';
import { api, fmt, fmtDate, updateProposalStatus, deleteProposal } from '../api';
import { StatusBadge } from '../components/Badges.jsx';
import ProposalWhatsAppButton from '../components/ProposalWhatsAppButton.jsx';
import ProposalPrintButton from '../components/ProposalPrintButton.jsx';
import { PROPOSAL_STATUSES, proposalStatusLabels } from './proposalPresentation.js';

export default function ProposalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [proposal, setProposal] = useState(null);
  const [statusDraft, setStatusDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => api(`/api/proposals/${id}`).then((p) => { setProposal(p); setStatusDraft(p.status); setLoading(false); });
  useEffect(() => { load(); }, [id]);
  if (loading) return <div className="p-8 text-center">Carregando...</div>;
  if (!proposal) return <div className="p-8 text-center">Proposta não encontrada.</div>;
  const clientName = proposal.client?.name || proposal.clientSnapshot?.name || 'Cliente não cadastrado';
  const clientPhone = proposal.client?.phone || proposal.clientSnapshot?.phone || '';
  const changeStatus = async () => {
    if (statusDraft === proposal.status) return;
    try {
      const p = await updateProposalStatus(id, statusDraft);
      setProposal(p);
    } catch (e) { alert(e.message); setStatusDraft(proposal.status); }
  };
  const remove = async () => {
    if (!confirm('Excluir esta proposta?')) return;
    try {
      await deleteProposal(id);
      navigate('/propostas');
    } catch (e) { alert(e.message); }
  };
  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/propostas" className="text-sm text-slate-500 hover:underline">← Propostas</Link>
          <h1 className="text-2xl font-bold mt-1">Proposta #{proposal.number}</h1>
          <p className="text-sm text-slate-500">{clientName} · Criada em {fmtDate(proposal.createdAt)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ProposalPrintButton proposalId={proposal._id} className="px-3 py-2" />
          <ProposalWhatsAppButton proposalId={proposal._id} disabled={!clientPhone} />
          <Link to={`/propostas/${proposal._id}/editar`} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-slate-50">
            <Pencil size={16} /> Editar
          </Link>
          <button onClick={remove} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">
            <Trash2 size={16} /> Excluir
          </button>
        </div>
      </div>
      {/* Status + alteração */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 uppercase">Status da proposta</div>
            <div className="mt-2"><StatusBadge value={proposal.status} /></div>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-sm">
              Alterar status
              <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)} className="mt-1 block px-3 py-2 border rounded-lg text-sm bg-white">
                {PROPOSAL_STATUSES.map((s) => <option key={s} value={s}>{proposalStatusLabels[s]}</option>)}
              </select>
            </label>
            <button onClick={changeStatus} disabled={statusDraft === proposal.status} className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-40">
              <RefreshCw size={16} /> Aplicar
            </button>
          </div>
        </div>
      </div>
      {/* Dados da proposta */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-xs text-slate-500 uppercase">Validade</div>
          <div className="mt-1 font-medium">{fmtDate(proposal.validityDate)}</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-xs text-slate-500 uppercase">Prazo de entrega</div>
          <div className="mt-1 font-medium">{proposal.deliveryTime || '—'}</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="text-xs text-slate-500 uppercase">Pagamento</div>
          <div className="mt-1 font-medium">{proposal.paymentTerms || '—'}</div>
        </div>
      </div>
      {/* Itens e valores */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-semibold mb-3">Itens</h2>
        <div className="space-y-2 text-sm">
          {proposal.items?.map((it, i) => (
            <div key={i} className="flex justify-between border-b pb-2">
              <span>{it.description} <span className="text-slate-400">({it.quantity} {it.unit} x {fmt(it.unitPrice)})</span></span>
              <span className="font-medium">{fmt(it.total)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-lg font-bold pt-2 border-t">
          <span>Valor Total</span>
          <span className="text-brand-600">{fmt(proposal.totalAmount)}</span>
        </div>
        {proposal.observations && <p className="mt-3 text-xs text-slate-500 bg-slate-50 p-2 rounded">Obs: {proposal.observations}</p>}
      </div>
      {/* Dados do cliente (snapshot) */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="font-semibold mb-3">Cliente</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div><span className="text-slate-500">Nome:</span> <strong>{clientName}</strong></div>
          <div><span className="text-slate-500">Telefone:</span> {clientPhone || '—'}</div>
          <div><span className="text-slate-500">E-mail:</span> {proposal.client?.email || proposal.clientSnapshot?.email || '—'}</div>
        </div>
      </div>
    </div>
  );
}
