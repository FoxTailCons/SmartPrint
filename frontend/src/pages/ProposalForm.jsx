import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Plus, Trash2, Save, UserPlus, Send } from 'lucide-react';
import { api, fmt, createProposal, updateProposal, getProposalWhatsApp } from '../api';
import Modal from '../components/Modal.jsx';
import { roundProposalTotalUp } from './proposalPresentation.js';

const emptyItem = { description: '', quantity: 1, unit: 'un', unitPrice: 0, total: 0 };

export default function ProposalForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [validityDate, setValidityDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [projectTitle, projectDescription, areasContemplated, executionProcess, specialCourtesy, deliveryTime, setDeliveryTime] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [areasContemplated, setAreasContemplated] = useState('');
  const [executionProcess, setExecutionProcess] = useState('');
  const [specialCourtesy, setSpecialCourtesy] = useState('');
  const [observations, setObservations] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/api/clients').then(setClients);
    if (isEdit) {
      api(`/api/proposals/${id}`).then((p) => {
        setClientId(p.client?._id || p.client || '');
        setItems(p.items?.length ? p.items.map((it) => ({ ...emptyItem, ...it })) : [{ ...emptyItem }]);
        setValidityDate(p.validityDate ? new Date(p.validityDate).toISOString().slice(0, 10) : '');
        setPaymentTerms(p.paymentTerms || '');
        setDeliveryTime(p.deliveryTime || '');
        setProjectTitle(p.projectTitle || '');
        setProjectDescription(p.projectDescription || '');
        setAreasContemplated(p.areasContemplated || '');
        setExecutionProcess(p.executionProcess || '');
        setSpecialCourtesy(p.specialCourtesy || '');
        setObservations(p.observations || '');
      });
    }
  }, [id]);

  const itemsTotal = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unitPrice) || 0), 0);
  const totalAmount = roundProposalTotalUp(itemsTotal);

  const updateItem = (idx, field, val) => {
    const next = [...items];
    next[idx][field] = val;
    next[idx].total = Number(next[idx].quantity) * Number(next[idx].unitPrice) || 0;
    setItems(next);
  };

  const buildBody = (status) => ({
    client: clientId || null,
    items: items.filter((i) => i.description?.trim()),
    status,
    validityDate: validityDate || undefined,
    paymentTerms,
    deliveryTime,
    observations,
  });

  const save = async (status) => {
    setSaving(true);
    try {
      const body = buildBody(status);
      if (!body.items.length) {
        setSaving(false);
        return alert('Informe pelo menos um item da proposta');
      }
      const saved = isEdit
        ? await updateProposal(id, body)
        : await createProposal(body);
      return saved;
    } catch (err) {
      alert(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async (e) => {
    e.preventDefault();
    const saved = await save('rascunho');
    if (saved) navigate(`/propostas/${saved._id}`);
  };

  const handleSaveAndSend = async () => {
    const saved = await save('enviada');
    if (!saved) return;
    try {
      const wa = await getProposalWhatsApp(saved._id);
      if (wa?.link) window.open(wa.link, '_blank');
      navigate(`/propostas/${saved._id}`);
    } catch (e) {
      alert(`${e.message} — proposta salva como enviada.`);
      navigate(`/propostas/${saved._id}`);
    }
  };

  const createClient = async () => {
    if (!newClient.name.trim()) return alert('Informe o nome do cliente');
    if (!newClient.phone.trim()) return alert('Informe o telefone do cliente');
    try {
      const c = await api('/api/clients', { method: 'POST', body: { ...newClient, name: newClient.name.trim(), phone: newClient.phone.trim() } });
      setClients([...clients, c]);
      setClientId(c._id);
      setShowNewClient(false);
      setNewClient({ name: '', phone: '', email: '' });
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? 'Editar Proposta' : 'Nova Proposta'}</h1>
          <p className="text-sm text-slate-500">Orçamento comercial · SmartPrint Lindóia</p>
        </div>
        <Link to="/propostas" className="text-sm text-slate-500 hover:underline">← Voltar</Link>
      </div>
      <form onSubmit={handleSaveDraft} className="space-y-5">
        {/* Detalhes do Projeto / Proposta Técnica */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">Estrutura da Proposta Técnica & Comercial</h2>
          <label className="block text-sm">
            Título do Projeto (ex: Renovação e Restauração da Comunicação Visual em Vidros)
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="Ex: Renovação e Restauração da Comunicação Visual..."
              className="mt-1 block w-full px-3 py-2 border rounded-lg text-sm bg-white"
            />
          </label>
          <label className="block text-sm">
            1. Descrição do Projeto
            <textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              rows="3"
              placeholder="Descreva o escopo geral do projeto, tecnologias e acabamentos..."
              className="mt-1 block w-full px-3 py-2 border rounded-lg text-sm"
            />
          </label>
          <label className="block text-sm">
            2. Áreas Contempladas
            <textarea
              value={areasContemplated}
              onChange={(e) => setAreasContemplated(e.target.value)}
              rows="2"
              placeholder="Ex: Fachada Frontal Fixa: 02 vidros; Porta de Acesso: 04 painéis..."
              className="mt-1 block w-full px-3 py-2 border rounded-lg text-sm"
            />
          </label>
          <label className="block text-sm">
            3. Processo de Execução Técnica
            <textarea
              value={executionProcess}
              onChange={(e) => setExecutionProcess(e.target.value)}
              rows="2"
              placeholder="Ex: Remoção, limpeza, preparação com álcool isopropálico, aplicação..."
              className="mt-1 block w-full px-3 py-2 border rounded-lg text-sm"
            />
          </label>
          <label className="block text-sm">
            Cortesia Especial Smartprint (Opcional)
            <input
              type="text"
              value={specialCourtesy}
              onChange={(e) => setSpecialCourtesy(e.target.value)}
              placeholder="Ex: Fechando a aprovação, executaremos sem custo adicional a limpeza da placa..."
              className="mt-1 block w-full px-3 py-2 border rounded-lg text-sm bg-white"
            />
          </label>
        </div>

        {/* Cliente */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h2 className="font-semibold">Cliente</h2>
          <div className="flex gap-2">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="flex-1 px-3 py-2.5 border rounded-lg text-sm bg-white"
            >
              <option value="">Sem cliente cadastrado</option>
              {clients.map((c) => <option key={c._id} value={c._id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
            </select>
            <button type="button" onClick={() => setShowNewClient(true)} className="inline-flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm hover:bg-slate-50">
              <UserPlus size={16} /> Novo
            </button>
          </div>
        </div>
        {/* Itens */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Itens / Serviços</h2>
            <button type="button" onClick={() => setItems([...items, { ...emptyItem }])} className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
              <Plus size={14} /> Adicionar item
            </button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 items-center gap-2">
                <input
                  className="col-span-6 rounded-lg border px-3 py-2 text-sm"
                  placeholder="Descrição (ex: Banner 2x1m, Adesivo 100un...)"
                  value={it.description}
                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                />
                <input
                  type="number" min="0" step="any"
                  className="col-span-2 rounded-lg border px-3 py-2 text-sm"
                  placeholder="Qtd"
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                />
                <input
                  className="col-span-1 rounded-lg border px-3 py-2 text-sm"
                  placeholder="Un."
                  value={it.unit}
                  onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                />
                <input
                  type="number" min="0" step="any"
                  className="col-span-2 rounded-lg border px-3 py-2 text-sm"
                  placeholder="Preço unit. (R$)"
                  value={it.unitPrice}
                  onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                />
                <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="col-span-1 text-red-500 hover:bg-red-50 p-2 rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-3 border-t text-lg">
            Total: <strong className="text-brand-600 ml-2">{fmt(totalAmount)}</strong>
          </div>
        </div>
        {/* Validade, pagamento, entrega e observações */}
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
          <h2 className="font-semibold">Condições da Proposta</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm">
              Validade da proposta
              <input type="date" value={validityDate} onChange={(e) => setValidityDate(e.target.value)} className="mt-1 block w-full px-3 py-2 border rounded-lg text-sm" />
            </label>
            <label className="text-sm">
              Prazo de entrega
              <input type="text" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} placeholder="Ex: 10 dias úteis" className="mt-1 block w-full px-3 py-2 border rounded-lg text-sm" />
            </label>
            <label className="text-sm">
              Condições de pagamento
              <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Ex: 50% entrada + 50% na entrega" className="mt-1 block w-full px-3 py-2 border rounded-lg text-sm" />
            </label>
          </div>
          <label className="block text-sm">
            Observações
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows="3" className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" placeholder="Instruções, material, acabamento..." />
          </label>
        </div>
        <div className="flex justify-end gap-3 pb-6">
          <button type="button" onClick={() => navigate(-1)} className="px-5 py-2.5 border rounded-lg hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 border border-brand-600 text-brand-700 rounded-lg font-medium hover:bg-brand-50 disabled:opacity-50">
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar rascunho'}
          </button>
          <button type="button" onClick={handleSaveAndSend} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:opacity-50">
            <Send size={16} /> Salvar e enviar WhatsApp
          </button>
        </div>
      </form>
      <Modal open={showNewClient} onClose={() => setShowNewClient(false)} title="Cadastrar cliente rápido">
        <div className="space-y-3">
          <input required placeholder="Nome *" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input required placeholder="Telefone/WhatsApp (com DDD) *" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <input placeholder="E-mail" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <button onClick={createClient} className="w-full py-2.5 bg-brand-600 text-white rounded-lg font-medium">Cadastrar e selecionar</button>
        </div>
      </Modal>
    </div>
  );
}
